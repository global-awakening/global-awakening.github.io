-- 19_push_notifiche_rituali.sql
--
-- Le due tabelle su cui poggiano le notifiche push di avvio rituale.
--
-- Contesto: oggi l'app non ha NESSUNA push. Le notifiche esistenti sono righe in
-- `notifications` lette con un poll ogni 10 secondi mentre l'app e' aperta, quindi
-- chi ha l'app chiusa non viene avvisato di niente. Per un prodotto costruito su
-- rituali *sincroni* e' il buco piu' grosso rimasto.
--
-- Decisioni di progetto gia' prese (Irene, 21/09):
--   - ricevono TUTTI, ospiti compresi: l'abbonamento si lega al telefono, non alla persona;
--   - due notifiche per rituale: promemoria in anticipo + avvio;
--   - solo a chi ha fatto "partecipa", non a tutti gli utenti;
--   - il permesso si chiede al momento del "partecipa", preceduto da una nostra domanda.
--
-- NOTA sul perche' questo file esiste invece di un giro nello Studio: il cron
-- `notify-ritual-participants` (jobid 1) e' stato creato a mano ad aprile, e' fallito
-- 33.615 volte di fila senza che nessuno se ne accorgesse, e non era visibile nel
-- repo. Ogni pezzo di stato del database vive qui dentro, versionato.

-- ---------------------------------------------------------------------------
-- 1. push_subscriptions — chi ha accettato le notifiche, e su quale telefono
-- ---------------------------------------------------------------------------
-- Una riga per telefono/browser, non per persona: la stessa persona su cellulare e
-- computer ha due righe e viene avvisata su entrambi. `endpoint` e' l'indirizzo che
-- il servizio push del browser ci consegna; `p256dh` e `auth` sono le chiavi con cui
-- si cifra il messaggio per quel destinatario.

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    text        NOT NULL,
  endpoint      text        NOT NULL UNIQUE,
  p256dh        text        NOT NULL,
  auth          text        NOT NULL,
  locale        text        NOT NULL DEFAULT 'en',
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  failure_count integer     NOT NULL DEFAULT 0
);

-- Il motore parte dai sessionId dei partecipanti e cerca i loro abbonamenti.
CREATE INDEX IF NOT EXISTS push_subscriptions_session_id_idx
  ON public.push_subscriptions (session_id);

-- SICUREZZA: chiunque legga endpoint + chiavi puo' mandare notifiche a quel telefono.
-- RLS attiva e NESSUNA policy = anon e authenticated non leggono e non scrivono nulla.
-- Ci arrivano solo la Edge Function (con la chiave di servizio, che scavalca RLS) e la RPC
-- SECURITY DEFINER di registrazione, che arrivera' col flusso lato app.
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 2. ritual_notifications_sent — cosa e' gia' partito
-- ---------------------------------------------------------------------------
-- Fa due lavori. Il primo: tenere separati 'reminder' e 'start', perche' con un
-- semplice "notificato si'/no" il promemoria zittirebbe l'avvio (e' il bug della
-- vecchia ritual_participants.notified).
-- Il secondo, meno ovvio e piu' importante: il cron gira ogni minuto, quindi lo
-- stesso rituale ricade nella finestra decine di volte. Senza questa tabella la
-- stessa persona riceverebbe la stessa notifica sessanta volte di fila. La chiave
-- primaria composta e' la protezione contro il bombardamento, non contabilita'.

CREATE TABLE IF NOT EXISTS public.ritual_notifications_sent (
  ritual_id       bigint      NOT NULL REFERENCES public.rituals(id) ON DELETE CASCADE,
  subscription_id uuid        NOT NULL REFERENCES public.push_subscriptions(id) ON DELETE CASCADE,
  kind            text        NOT NULL CHECK (kind IN ('reminder', 'start')),
  sent_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ritual_id, subscription_id, kind)
);

ALTER TABLE public.ritual_notifications_sent ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- DEBITO NOTO, da chiudere nello stesso lavoro
-- ---------------------------------------------------------------------------
-- `delete_my_account` (17_fix_delete_account.sql) non conosce ancora queste tabelle:
-- va aggiunto  DELETE FROM push_subscriptions WHERE session_id = v_sid;
-- (ritual_notifications_sent segue in cascata). Non e' fatto qui perche' richiede di
-- riscrivere per intero una funzione SECURITY DEFINER: si fa a vista, con i test.
-- E' esattamente la classe di bug che a settembre aveva lasciato "Elimina account"
-- rotta da giugno.
