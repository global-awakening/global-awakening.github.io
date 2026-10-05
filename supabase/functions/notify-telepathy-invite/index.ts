/**
 * notify-telepathy-invite — le push degli inviti a un training telepatico.
 *
 * Due strade (spec 2026-09-25 §4.2):
 *   - {invito, tipo}: la chiamano le RPC della 32a con pg_net, SOLO dopo aver scritto l'invito
 *     o la risposta. tipo ∈ invito | accettato | rifiutato.
 *   - {tipo:'scadenze'}: la chiama ogni minuto il job pg_cron `notify-ritual-start` (ridefinito
 *     nella 32a con una seconda chiamata). Segna scaduti gli inviti e avvisa i mittenti di
 *     quelli da 10 minuti.
 *
 * NON si fida di chi la chiama: rilegge l'invito e manda solo ciò che lo stato giustifica
 * (decisioni.mjs). Risponde 200 anche quando non c'è niente da fare, 500 solo per un guasto
 * vero: la sentinella alert-cron conta ogni risposta non 2xx, e un 4xx a una chiamata a caso
 * farebbe partire l'email per niente.
 *
 * Dedup come notify-ritual-start: si PRENOTA su telepathy_invite_pushes prima di spedire e si
 * libera solo su un «non consegnato» esplicito. Una doppia vibrazione costa più di una
 * notifica persa.
 */
// Versioni fissate, le stesse di notify-ritual-start (lezione del 22/09: senza versione la
// funzione si è rotta da sola alla prima ripubblicazione).
import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import webpush from 'npm:web-push@3.6.7';
import { decidiDopoErrore } from '../_shared/esito.mjs';
import { leggiRichiesta, decidiPush, prenotazioneSaltata } from './decisioni.mjs';

const COLONNE = 'id, from_id, from_name, to_id, to_name, status, created_at, expires_at, match_id, con_push, via_diretta';

Deno.serve(async (req) => {
  let corpo: unknown = null;
  try { corpo = await req.json(); } catch (_) { corpo = null; }
  const richiesta = leggiRichiesta(corpo);
  if (!richiesta) return Response.json({ ignorato: true });

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  webpush.setVapidDetails(
    Deno.env.get('VAPID_SUBJECT')!,
    Deno.env.get('VAPID_PUBLIC_KEY')!,
    Deno.env.get('VAPID_PRIVATE_KEY')!
  );

  // Quali (invito, tipo) guardare in questo giro.
  const lavori: Array<{ invito: Record<string, any>; tipo: string }> = [];
  if (richiesta.tipo === 'scadenze') {
    const { data, error } = await supabase.rpc('expire_telepathy_invites');
    if (error) return Response.json({ errore: 'scadenze: ' + error.message }, { status: 500 });
    const ids = (data || []).map((r: { invito_id: string }) => r.invito_id);
    if (ids.length > 0) {
      const { data: inviti, error: e2 } = await supabase.from('telepathy_invites').select(COLONNE).in('id', ids);
      if (e2) return Response.json({ errore: 'lettura scaduti: ' + e2.message }, { status: 500 });
      for (const inv of inviti || []) lavori.push({ invito: inv, tipo: 'scaduto' });
    }
  } else {
    const { data, error } = await supabase.from('telepathy_invites').select(COLONNE).eq('id', richiesta.invito).maybeSingle();
    if (error) return Response.json({ errore: 'lettura invito: ' + error.message }, { status: 500 });
    if (!data) return Response.json({ ignorato: true });
    lavori.push({ invito: data, tipo: richiesta.tipo });
  }

  let inviate = 0, errori = 0, saltate = 0, perse = 0;
  const guasti: string[] = [];

  for (const { invito, tipo } of lavori) {
    // Terzo giro della spec (§7): la push d'invito parte solo se il destinatario ha una riga di
    // disponibilità rinnovata negli ultimi 14 giorni. Copre la riga sparita fra l'invio e la
    // push, e qualunque invito arrivato qui senza passare dai controlli della RPC. Per le altre
    // push (dirette al mittente) il dato non serve e non si legge.
    let disponibile = false;
    if (tipo === 'invito') {
      const soglia = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString();
      const { data: riga, error } = await supabase.from('telepathy_availability').select('id')
        .eq('session_id', invito.to_id).gte('rinnovata_il', soglia).maybeSingle();
      if (error) { guasti.push(`disponibilità ${invito.id}: ${error.message}`); continue; }
      disponibile = !!riga;
    }
    const decisione = decidiPush(tipo, invito, Date.now(), disponibile);
    if (!decisione) continue;

    const destinatario = decisione.a === 'destinatario' ? invito.to_id : invito.from_id;
    const { data: abbonamenti, error: eAb } = await supabase
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth, locale, failure_count')
      .eq('session_id', destinatario);
    if (eAb) { guasti.push(`abbonamenti ${invito.id}: ${eAb.message}`); continue; }

    for (const ab of abbonamenti || []) {
      // 1. Prenotazione.
      const { error: eDedup } = await supabase
        .from('telepathy_invite_pushes')
        .insert({ invite_id: invito.id, subscription_id: ab.id, kind: decisione.kind });
      if (eDedup) {
        // 23505 doppione, 23503 invito o abbonamento spariti nel frattempo (account cancellato,
        // app vecchie che cancellano, abbonamento morto tolto da notify-ritual-start): niente da
        // fare, non un guasto. Vedi prenotazioneSaltata in decisioni.mjs.
        if (prenotazioneSaltata((eDedup as { code?: string }).code)) saltate++;
        else guasti.push(`prenotazione ${invito.id}: ${eDedup.message}`);
        continue;
      }

      // 2. Invio.
      const lingua = ['it', 'en', 'es', 'fr'].includes(ab.locale) ? ab.locale : 'en';
      try {
        await webpush.sendNotification(
          { endpoint: ab.endpoint, keys: { p256dh: ab.p256dh, auth: ab.auth } },
          JSON.stringify({ tipo: decisione.kind, invito: invito.id, nome: decisione.nome, locale: lingua }),
          { TTL: decisione.ttl, urgency: decisione.urgency }
        );
        inviate++;
        await supabase.from('push_subscriptions')
          .update((ab.failure_count ?? 0) > 0
            ? { failure_count: 0, last_seen_at: new Date().toISOString() }
            : { last_seen_at: new Date().toISOString() })
          .eq('id', ab.id);
      } catch (e) {
        errori++;
        const stato = (e as { statusCode?: number }).statusCode;
        switch (decidiDopoErrore(stato)) {
          case 'cancella':
            await supabase.from('push_subscriptions').delete().eq('id', ab.id);
            break;
          case 'rilascia':
            await supabase.from('telepathy_invite_pushes').delete()
              .eq('invite_id', invito.id).eq('subscription_id', ab.id).eq('kind', decisione.kind);
            break;
          case 'trattieni':
            perse++;
            break;
        }
        if (decidiDopoErrore(stato) !== 'cancella') {
          await supabase.from('push_subscriptions').update({ failure_count: (ab.failure_count ?? 0) + 1 }).eq('id', ab.id);
        }
      }
    }
  }

  if (guasti.length > 0) return Response.json({ inviate, errori, saltate, perse, guasti }, { status: 500 });
  return Response.json({ inviate, errori, saltate, perse });
});
