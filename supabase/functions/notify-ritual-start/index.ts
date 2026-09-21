/**
 * notify-ritual-start — manda le notifiche push di promemoria e di avvio dei rituali.
 *
 * Svegliata ogni minuto dal cron pg_cron (vedi 23_cron_push.sql).
 *
 * L'ordine delle operazioni non è negoziabile: si REGISTRA l'invio PRIMA di spedirlo,
 * sfruttando la chiave primaria composta (rituale, telefono, tipo) di
 * `ritual_notifications_sent`. Se l'INSERT va in conflitto, un'altra esecuzione ha già preso
 * quella notifica e si salta. Così un doppio invio è impossibile per costruzione, non per
 * attenzione di chi scrive.
 *
 * Il rischio qui è asimmetrico. Perdere una notifica è spiacevole; bombardare qualcuno di
 * sessanta notifiche uguali — il cron gira ogni minuto e la finestra è larga apposta — gli fa
 * spegnere le push per sempre, e il permesso non torna. Nel dubbio si perde la notifica.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';
import { classifica, istanteInizio } from './finestre.mjs';

type Tipo = 'reminder' | 'start';

const TESTI: Record<string, Record<Tipo, (n: string) => { titolo: string; corpo: string }>> = {
  it: {
    reminder: (n) => ({ titolo: `${n} sta per iniziare`, corpo: 'Preparati: il rituale sta per cominciare.' }),
    start:    (n) => ({ titolo: `${n} sta iniziando ora`, corpo: 'Il rituale è iniziato. Unisciti adesso.' })
  },
  en: {
    reminder: (n) => ({ titolo: `${n} is about to begin`, corpo: 'Get ready: the ritual is about to start.' }),
    start:    (n) => ({ titolo: `${n} is starting now`,   corpo: 'The ritual has begun. Join now.' })
  }
};

const SOGLIA_FALLIMENTI = 10;

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  webpush.setVapidDetails(
    Deno.env.get('VAPID_SUBJECT')!,
    Deno.env.get('VAPID_PUBLIC_KEY')!,
    Deno.env.get('VAPID_PRIVATE_KEY')!
  );

  const adesso = Date.now();

  // Solo i rituali di ieri/oggi/domani. Senza questo filtro, fra un anno questa query
  // leggerebbe l'intera tabella ogni minuto, per sempre.
  const giorno = 86400000;
  const soloData = (t: number) => new Date(t).toISOString().slice(0, 10);

  const { data: rituali, error: erroreRituali } = await supabase
    .from('rituals')
    .select('id, name, date, time, participants')
    .gte('date', soloData(adesso - giorno))
    .lte('date', soloData(adesso + giorno));

  if (erroreRituali) {
    return Response.json({ errore: erroreRituali.message }, { status: 500 });
  }
  if (!rituali || rituali.length === 0) {
    return Response.json({ inviate: 0, errori: 0, saltate: 0 });
  }

  let inviate = 0;
  let errori = 0;
  let saltate = 0;

  for (const rituale of rituali) {
    const inizio = istanteInizio(rituale.date, rituale.time);
    const tipo = classifica(adesso, inizio) as Tipo | null;
    if (!tipo) continue;

    // Chi partecipa si legge ADESSO, non al momento dell'iscrizione: chi ha lasciato il
    // rituale non riceve niente, e non serve nessun codice dedicato per ottenerlo.
    const partecipanti: string[] = Array.isArray(rituale.participants) ? rituale.participants : [];
    if (partecipanti.length === 0) continue;

    const { data: abbonamenti } = await supabase
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth, locale, failure_count')
      .in('session_id', partecipanti);

    if (!abbonamenti || abbonamenti.length === 0) continue;

    for (const ab of abbonamenti) {
      // 1. Prenotazione. Se qualcun altro ha già preso questa notifica l'INSERT va in
      //    conflitto sulla chiave primaria e si passa oltre senza spedire nulla.
      const { error: erroreDedup } = await supabase
        .from('ritual_notifications_sent')
        .insert({ ritual_id: rituale.id, subscription_id: ab.id, kind: tipo });

      if (erroreDedup) { saltate++; continue; }

      // 2. Invio.
      const lingua = TESTI[ab.locale] ? ab.locale : 'en';
      const t = TESTI[lingua][tipo](rituale.name);

      try {
        await webpush.sendNotification(
          { endpoint: ab.endpoint, keys: { p256dh: ab.p256dh, auth: ab.auth } },
          JSON.stringify({ tipo, rituale: rituale.name, ritualeId: rituale.id, locale: lingua }),
          // TTL: una notifica di avvio che arriva mezz'ora dopo è rumore, non un servizio.
          // Il promemoria può aspettare un po' di più, ma non oltre l'inizio del rituale.
          { TTL: tipo === 'start' ? 300 : 900, urgency: 'high' }
        );
        inviate++;

        await supabase.from('push_subscriptions')
          .update({ failure_count: 0, last_seen_at: new Date().toISOString() })
          .eq('id', ab.id);
      } catch (e) {
        errori++;
        const stato = (e as { statusCode?: number }).statusCode;

        if (stato === 404 || stato === 410) {
          // Abbonamento morto: telefono pulito, app disinstallata, browser che ha dimenticato.
          // Si cancella; la riga di prenotazione sparisce in cascata.
          await supabase.from('push_subscriptions').delete().eq('id', ab.id);
        } else {
          // Guasto temporaneo: si libera la prenotazione, così il giro dopo riprova. È la
          // soglia larga della finestra a dare il tempo di riuscire.
          await supabase.from('ritual_notifications_sent')
            .delete()
            .eq('ritual_id', rituale.id)
            .eq('subscription_id', ab.id)
            .eq('kind', tipo);

          const falliti = (ab.failure_count ?? 0) + 1;
          if (falliti >= SOGLIA_FALLIMENTI) {
            // Dieci fallimenti di fila non sono più un guasto temporaneo: è un indirizzo morto
            // che il servizio push non ha la cortesia di dichiarare tale.
            await supabase.from('push_subscriptions').delete().eq('id', ab.id);
          } else {
            await supabase.from('push_subscriptions')
              .update({ failure_count: falliti })
              .eq('id', ab.id);
          }
        }
      }
    }
  }

  return Response.json({ inviate, errori, saltate });
});
