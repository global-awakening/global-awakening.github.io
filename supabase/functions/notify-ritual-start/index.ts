/**
 * notify-ritual-start — manda le notifiche push di promemoria e di avvio dei rituali.
 *
 * Svegliata ogni minuto dal cron pg_cron (vedi 23_cron_push.sql).
 *
 * Si REGISTRA l'invio PRIMA di spedirlo, sfruttando la chiave primaria composta
 * (rituale, telefono, tipo) di `ritual_notifications_sent`: se l'INSERT va in conflitto,
 * un'altra esecuzione ha già preso quella notifica e si salta.
 *
 * La prenotazione si libera SOLO quando abbiamo una risposta esplicita che dice «non
 * consegnato» (vedi esito.mjs). Su un timeout non si libera: una consegna riuscita la cui
 * risposta si è persa verrebbe ripetuta, e col cron al minuto e la finestra del promemoria a
 * quindici la stessa persona sentirebbe fino a quindici vibrazioni identiche.
 *
 * Il rischio è asimmetrico e detta tutto il resto: perdere una notifica è spiacevole,
 * bombardare qualcuno gli fa spegnere le push per sempre, e il permesso non torna.
 */
// npm: e non esm.sh, e con la versione FISSATA. Il 22/09/2026 questa riga, che diceva
// `https://esm.sh/@supabase/supabase-js@2`, ha impedito ogni pubblicazione: senza versione
// prendeva l'ultima, e esm.sh non aveva pubblicato bene una dipendenza di quella
// (`auth-js@2.117.0` -> Module not found). La funzione si e' rotta da sola, senza che nessuno
// la toccasse, e se ne e' accorto solo il primo che ha provato a ripubblicarla.
import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import webpush from 'npm:web-push@3.6.7';
import { classifica, istanteInizio } from './finestre.mjs';
import { decidiDopoErrore } from './esito.mjs';

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

// `.in()` finisce nella query string: con qualche centinaio di partecipanti l'URL supera i
// limiti dei proxy e la richiesta muore con un 414, in silenzio, proprio sui rituali più
// partecipati. Si interroga a blocchi.
const BLOCCO_PARTECIPANTI = 60;

function aBlocchi<T>(elenco: T[], quanti: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < elenco.length; i += quanti) out.push(elenco.slice(i, i + quanti));
  return out;
}

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

  // Solo i rituali di ieri/oggi/domani: senza questo filtro, fra un anno questa query
  // leggerebbe l'intera tabella ogni minuto, per sempre.
  const giorno = 86400000;
  const soloData = (t: number) => new Date(t).toISOString().slice(0, 10);

  const { data: rituali, error: erroreRituali } = await supabase
    .from('rituals')
    .select('id, name, date, time, duration, participants')
    .gte('date', soloData(adesso - giorno))
    .lte('date', soloData(adesso + giorno));

  if (erroreRituali) {
    // Uno stato 500 qui è quello che rende visibile il guasto: il controllo sulle risposte
    // di pg_net (23_cron_push.sql) lo intercetta e fa partire l'allarme.
    return Response.json({ errore: 'lettura rituali: ' + erroreRituali.message }, { status: 500 });
  }
  if (!rituali || rituali.length === 0) {
    return Response.json({ inviate: 0, errori: 0, saltate: 0, perse: 0 });
  }

  let inviate = 0;
  let errori = 0;
  let saltate = 0;
  let perse = 0;
  const guasti: string[] = [];

  for (const rituale of rituali) {
    const inizio = istanteInizio(rituale.date, rituale.time);
    // La durata serve a non recuperare una notifica di avvio quando il rituale e' gia'
    // finito: con i rituali brevi la rete di sicurezza da cinque minuti li supera.
    const durata = Number.isFinite(rituale.duration) ? rituale.duration * 60000 : undefined;
    const tipo = classifica(adesso, inizio, durata) as Tipo | null;
    if (!tipo) continue;

    // Chi partecipa si legge ADESSO, non al momento dell'iscrizione: chi ha lasciato il
    // rituale non riceve niente, e non serve nessun codice dedicato per ottenerlo.
    const partecipanti: string[] = Array.isArray(rituale.participants) ? rituale.participants : [];
    if (partecipanti.length === 0) continue;

    const abbonamenti: Array<Record<string, any>> = [];
    for (const blocco of aBlocchi(partecipanti, BLOCCO_PARTECIPANTI)) {
      const { data, error } = await supabase
        .from('push_subscriptions')
        .select('id, endpoint, p256dh, auth, locale, failure_count')
        .in('session_id', blocco);

      if (error) {
        // Senza questo controllo un guasto qui diventerebbe «nessun abbonamento» e il
        // rituale passerebbe in silenzio, con un rassicurante inviate: 0.
        guasti.push(`lettura abbonamenti rituale ${rituale.id}: ${error.message}`);
        continue;
      }
      if (data) abbonamenti.push(...data);
    }

    if (abbonamenti.length === 0) continue;

    for (const ab of abbonamenti) {
      // 1. Prenotazione.
      const { error: erroreDedup } = await supabase
        .from('ritual_notifications_sent')
        .insert({ ritual_id: rituale.id, subscription_id: ab.id, kind: tipo });

      if (erroreDedup) {
        // 23505 = conflitto sulla chiave primaria: già presa da un'altra esecuzione, è il
        // funzionamento normale. Qualunque altro codice è un guasto e va detto, non contato
        // come «saltata».
        if ((erroreDedup as { code?: string }).code === '23505') { saltate++; }
        else { guasti.push(`prenotazione rituale ${rituale.id}: ${erroreDedup.message}`); }
        continue;
      }

      // 2. Invio.
      const lingua = TESTI[ab.locale] ? ab.locale : 'en';
      const t = TESTI[lingua][tipo](rituale.name);

      try {
        await webpush.sendNotification(
          { endpoint: ab.endpoint, keys: { p256dh: ab.p256dh, auth: ab.auth } },
          JSON.stringify({ tipo, rituale: rituale.name, ritualeId: rituale.id, locale: lingua }),
          // TTL: una notifica di avvio che arriva mezz'ora dopo è rumore, non un servizio.
          { TTL: tipo === 'start' ? 300 : 900, urgency: 'high' }
        );
        inviate++;

        if ((ab.failure_count ?? 0) > 0) {
          await supabase.from('push_subscriptions')
            .update({ failure_count: 0, last_seen_at: new Date().toISOString() })
            .eq('id', ab.id);
        } else {
          await supabase.from('push_subscriptions')
            .update({ last_seen_at: new Date().toISOString() })
            .eq('id', ab.id);
        }
      } catch (e) {
        errori++;
        const stato = (e as { statusCode?: number }).statusCode;

        switch (decidiDopoErrore(stato)) {
          case 'cancella':
            // Il servizio push dichiara morto l'abbonamento: telefono pulito, app
            // disinstallata, browser che ha dimenticato. È l'UNICO caso in cui si cancella.
            await supabase.from('push_subscriptions').delete().eq('id', ab.id);
            break;

          case 'rilascia':
            // Risposta esplicita di non consegna: si libera la prenotazione e il giro dopo
            // riprova. È la soglia larga della finestra a dare il tempo di riuscire.
            await supabase.from('ritual_notifications_sent')
              .delete()
              .eq('ritual_id', rituale.id)
              .eq('subscription_id', ab.id)
              .eq('kind', tipo);
            break;

          case 'trattieni':
            // Non sappiamo se è arrivata. La prenotazione resta presa e la notifica si perde:
            // è il prezzo per non ripetere una consegna riuscita fino a quindici volte.
            perse++;
            break;
        }

        // Il contatore serve solo a rendere visibile un abbonamento che fallisce sempre.
        // NON cancella più niente da solo: la vecchia soglia a 10 trasformava dieci minuti di
        // disservizio del fornitore nella cancellazione di massa di abbonamenti vivi, perché
        // il cron gira ogni minuto e la finestra del promemoria dura quindici.
        if (decidiDopoErrore(stato) !== 'cancella') {
          await supabase.from('push_subscriptions')
            .update({ failure_count: (ab.failure_count ?? 0) + 1 })
            .eq('id', ab.id);
        }
      }
    }
  }

  // I guasti fanno rispondere 500: è così che l'allarme sui cron se ne accorge. Con un 200
  // resterebbero invisibili esattamente come i 33.615 fallimenti di aprile.
  if (guasti.length > 0) {
    return Response.json({ inviate, errori, saltate, perse, guasti }, { status: 500 });
  }
  return Response.json({ inviate, errori, saltate, perse });
});
