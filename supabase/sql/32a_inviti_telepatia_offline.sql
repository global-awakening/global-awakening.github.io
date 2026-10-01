-- ============================================================================
-- 32a_inviti_telepatia_offline.sql — inviti a un training anche a chi non è collegato (1 di 2)
-- Segue: 31_account_cancellato_rituali.sql.
-- Spec: docs/superpowers/specs/2026-09-25-inviti-telepatia-offline-design.md (§4.1, §8 passo 2)
--
-- Perché: oggi si invita solo chi è online e l'invito dura 45 s. Qui nasce il necessario per
-- invitare anche chi ha scelto di essere raggiungibile con l'app chiusa: disponibilità, blocchi
-- per session_id, RPC con identità, blocchi e tetti controllati dal server, push dalla RPC.
--
-- È la metà ADDITIVA del rilascio in due tempi: le policy aperte di telepathy_invites restano
-- (le app vecchie in cache continuano a mandare e accettare inviti); le chiude la 32b almeno un
-- giorno dopo il rilascio dell'app. Nella finestra il trigger di guardia (sezione A) riduce ogni
-- scrittura diretta a un invito da 45 s, senza push e senza match_id.
--
-- ⚠️ PREREQUISITO: la Edge Function notify-telepathy-invite deve essere GIÀ pubblicata. Questa
--    migration ridefinisce il job pg_cron che la chiama ogni minuto: senza, ogni minuto un 404 e
--    la sentinella scatta.
-- ⚠️ Se si rilancia la 30_ o la 31_, rilanciare subito dopo anche la 32a: rimettono la
--    delete_my_account senza il blocco «NUOVO (32)».
-- ⚠️ Se si rilancia la 23_, rilanciare subito dopo anche la 32a: la 23_ rimette il job con una
--    sola chiamata, e le push «scaduto» smettono di partire senza nessun errore.
-- Ritorno indietro: 32a_ritorno.sql (indici unici, CHECK, trigger di guardia) + rilancio della
-- 23_ (il job). Tabelle, colonne e RPC nuove restano: senza l'app nuova sono inerti.
--
-- Idempotente, in una transazione. Nessun \r nel blob git (git show HEAD:<file> | grep -c $'\r' → 0).
-- ============================================================================

BEGIN;

-- ════ A. Tabelle e colonne ═══════════════════════════════════════════════════

-- ── telepathy_matches: l'attività ────────────────────────────────────────────
ALTER TABLE telepathy_matches ADD COLUMN IF NOT EXISTS ultima_attivita timestamptz NOT NULL DEFAULT now();
-- da_invito: la scrive true solo l'app nuova, creando il match da un invito accettato. Serve a
-- findPartner per saltare gli orfani d'invito senza saltare i match casuali appena nati.
ALTER TABLE telepathy_matches ADD COLUMN IF NOT EXISTS da_invito boolean NOT NULL DEFAULT false;
-- giocato: le righe già presenti sono sessioni vere, non orfani, e nascono true; poi il default
-- diventa false. Solo alla prima applicazione: un rilancio non deve segnare giocati gli orfani.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'telepathy_matches' AND column_name = 'giocato') THEN
    ALTER TABLE telepathy_matches ADD COLUMN giocato boolean NOT NULL DEFAULT true;
    ALTER TABLE telepathy_matches ALTER COLUMN giocato SET DEFAULT false;
  END IF;
END $$;

-- Il trigger vede l'attività anche dalle app vecchie: ogni simbolo, risposta, cambio livello e
-- fine round è già un update del match. Dall'app (anon/authenticated) ultima_attivita non si
-- sposta indietro e giocato non si toglie; migration, RPC e ruolo di servizio possono scriverli
-- esplicitamente (serve ai test per simulare un match fermo da dieci minuti).
-- Non è SECURITY DEFINER: deve vedere chi scrive davvero (current_user).
CREATE OR REPLACE FUNCTION public.telepathy_matches_attivita()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE v_app boolean := current_user IN ('anon', 'authenticated');
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.ultima_attivita := now();
    NEW.giocato := false;
    RETURN NEW;
  END IF;
  IF v_app OR NEW.ultima_attivita IS NOT DISTINCT FROM OLD.ultima_attivita THEN
    NEW.ultima_attivita := now();
  END IF;
  IF v_app OR NEW.giocato IS NOT DISTINCT FROM OLD.giocato THEN
    NEW.giocato := true;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS telepathy_matches_attivita ON telepathy_matches;
CREATE TRIGGER telepathy_matches_attivita BEFORE INSERT OR UPDATE ON telepathy_matches
  FOR EACH ROW EXECUTE FUNCTION public.telepathy_matches_attivita();

-- ── telepathy_invites: entra nelle migration ─────────────────────────────────
-- Era nata dallo Studio (spec §3). Il valore vero di expires_at lo scrive sempre la RPC; il
-- default serve agli insert delle app vecchie durante la tenuta.
ALTER TABLE telepathy_invites
  ADD COLUMN IF NOT EXISTS expires_at   timestamptz NOT NULL DEFAULT now() + interval '45 seconds',
  ADD COLUMN IF NOT EXISTS match_id     uuid,
  ADD COLUMN IF NOT EXISTS push_saltata boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS con_push     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS responded_at timestamptz,
  ADD COLUMN IF NOT EXISTS via_diretta  boolean NOT NULL DEFAULT false;

-- Prima degli indici unici. Alla prima applicazione TUTTI i pending diventano expired: due
-- pending per lo stesso destinatario farebbero fallire l'indice e con lui tutta la migration.
-- A un rilancio (indice già presente) solo quelli già scaduti: gli inviti vivi restano vivi.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes
                  WHERE schemaname = 'public' AND indexname = 'telepathy_invites_un_pending_destinatario') THEN
    -- Le righe già presenti hanno preso dal DEFAULT «migrazione + 45 s», mentre il loro created_at
    -- può risalire a giorni fa: expires_at - created_at sembrerebbe un invito da 10 minuti, e la
    -- normalizzazione qui sotto manderebbe ai mittenti vere push «scaduto» per inviti vecchi.
    -- Si riportano tutti a «created_at + 45 s» (invito da 45 s, che non genera push di ritorno).
    UPDATE telepathy_invites SET expires_at = coalesce(created_at, now()) + interval '45 seconds';
    UPDATE telepathy_invites SET status = 'expired', responded_at = coalesce(responded_at, now())
     WHERE status = 'pending';
  ELSE
    UPDATE telepathy_invites SET status = 'expired', responded_at = coalesce(responded_at, now())
     WHERE status = 'pending' AND expires_at <= now();
  END IF;
  UPDATE telepathy_invites SET status = 'expired', responded_at = coalesce(responded_at, now())
   WHERE status IS NULL OR status NOT IN ('pending', 'accepted', 'declined', 'cancelled', 'expired');
END $$;

-- Gli stati che scrivono le app vecchie (pending, accepted, declined) sono tutti ammessi.
ALTER TABLE telepathy_invites DROP CONSTRAINT IF EXISTS telepathy_invites_stato_valido;
ALTER TABLE telepathy_invites ADD CONSTRAINT telepathy_invites_stato_valido
  CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled', 'expired'));

-- Un invito aperto per mittente e uno per destinatario. now() non può stare nel predicato: le
-- RPC segnano expired gli scaduti delle persone coinvolte prima di scrivere.
CREATE UNIQUE INDEX IF NOT EXISTS telepathy_invites_un_pending_mittente
  ON telepathy_invites (from_id) WHERE status = 'pending';
CREATE UNIQUE INDEX IF NOT EXISTS telepathy_invites_un_pending_destinatario
  ON telepathy_invites (to_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS telepathy_invites_to_status    ON telepathy_invites (to_id, status);
CREATE INDEX IF NOT EXISTS telepathy_invites_from_created ON telepathy_invites (from_id, created_at);
CREATE INDEX IF NOT EXISTS telepathy_invites_match        ON telepathy_invites (match_id);

-- ── Il trigger di guardia (terzo giro della spec) ────────────────────────────
-- Con le policy ancora aperte chiunque, con la chiave pubblica, potrebbe scrivere le colonne
-- nuove: un invito con con_push = true seguito da una chiamata alla Edge Function (una push che
-- salta blocchi, tetti e consenso), un accepted con un match_id inventato, un pending che scade
-- fra un anno e blocca qualcuno con «gia_invitato». Chi scrive si riconosce da current_user:
-- dentro le RPC SECURITY DEFINER è il proprietario delle funzioni; una scrittura diretta da
-- PostgREST è anon o authenticated. Non è SECURITY DEFINER, per lo stesso motivo.
CREATE OR REPLACE FUNCTION public.telepathy_invites_guardia()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN
    -- RPC, migration, ruolo di servizio: si scrive quello che scrivono. Unico ripiego:
    -- responded_at, se una RPC lo dimentica uscendo da pending.
    IF TG_OP = 'UPDATE' AND OLD.status = 'pending' AND NEW.status <> 'pending' AND NEW.responded_at IS NULL THEN
      NEW.responded_at := now();
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.status       := 'pending';
    NEW.created_at   := now();
    NEW.expires_at   := now() + interval '45 seconds';
    NEW.con_push     := false;
    NEW.push_saltata := false;
    NEW.match_id     := NULL;
    NEW.responded_at := NULL;
  ELSE
    -- Un update diretto cambia solo lo stato: tutto il resto torna com'era.
    NEW.id           := OLD.id;
    NEW.created_at   := OLD.created_at;
    NEW.from_id      := OLD.from_id;
    NEW.from_name    := OLD.from_name;
    NEW.to_id        := OLD.to_id;
    NEW.to_name      := OLD.to_name;
    NEW.expires_at   := OLD.expires_at;
    NEW.con_push     := OLD.con_push;
    NEW.push_saltata := OLD.push_saltata;
    NEW.match_id     := OLD.match_id;
    NEW.responded_at := CASE WHEN OLD.status = 'pending' AND NEW.status IS DISTINCT FROM 'pending'
                             THEN now() ELSE OLD.responded_at END;
  END IF;
  -- Il segno che qualcuno scrive ancora senza passare dalle RPC: finché ce ne sono nelle ultime
  -- 24 ore, la 32b non si applica (spec §8 passo 4).
  NEW.via_diretta := true;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS telepathy_invites_guardia ON telepathy_invites;
CREATE TRIGGER telepathy_invites_guardia BEFORE INSERT OR UPDATE ON telepathy_invites
  FOR EACH ROW EXECUTE FUNCTION public.telepathy_invites_guardia();

-- ── Tabelle nuove: RLS senza policy, nessun privilegio all'app ────────────────
-- Ci si arriva solo dalle RPC. La Edge Function usa il ruolo di servizio, che le legge.
CREATE TABLE IF NOT EXISTS public.telepathy_availability (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),  -- l'identificativo opaco che vede l'app
  session_id   text        NOT NULL UNIQUE,
  nickname     text        NOT NULL,                               -- già passato da nome_pubblico
  enabled_at   timestamptz NOT NULL DEFAULT now(),
  rinnovata_il timestamptz NOT NULL DEFAULT now()                  -- fuori lista dopo 14 giorni, cancellata dopo 90
);
ALTER TABLE public.telepathy_availability ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.telepathy_availability FROM PUBLIC, anon, authenticated;

-- «Non voglio più inviti da questa persona»: per session_id, vale nei due sensi.
CREATE TABLE IF NOT EXISTS public.telepathy_invite_blocks (
  blocker_session text        NOT NULL,
  blocked_session text        NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_session, blocked_session)
);
CREATE INDEX IF NOT EXISTS telepathy_invite_blocks_blocked ON public.telepathy_invite_blocks (blocked_session);
ALTER TABLE public.telepathy_invite_blocks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.telepathy_invite_blocks FROM PUBLIC, anon, authenticated;

-- Dedup delle push d'invito, stesso schema di ritual_notifications_sent.
CREATE TABLE IF NOT EXISTS public.telepathy_invite_pushes (
  invite_id       uuid        NOT NULL REFERENCES public.telepathy_invites(id) ON DELETE CASCADE,
  subscription_id uuid        NOT NULL REFERENCES public.push_subscriptions(id) ON DELETE CASCADE,
  kind            text        NOT NULL CHECK (kind IN ('invito', 'accettato', 'rifiutato', 'scaduto')),
  sent_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (invite_id, subscription_id, kind)
);
ALTER TABLE public.telepathy_invite_pushes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.telepathy_invite_pushes FROM PUBLIC, anon, authenticated;

-- ════ B. Funzioni interne condivise ══════════════════════════════════════════
-- Una sola definizione di ogni regola, usata da tutte le RPC. Nessun privilegio per l'app:
-- le chiamano solo le RPC SECURITY DEFINER.

-- Stesso cancello di leave_ritual e toggle_ritual_candle (30_): per un iscritto (profilo con
-- email) serve la sua credenziale; per un ospite il session_id resta l'unica prova (rischio
-- accettato, spec §6).
CREATE OR REPLACE FUNCTION public.telepatia_verifica_identita(p_session_id text, p_password_hash text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF p_session_id IS NULL OR p_session_id = '' THEN RAISE EXCEPTION 'session_required'; END IF;
  IF length(p_session_id) > 255 THEN RAISE EXCEPTION 'session_id_too_long'; END IF;
  IF EXISTS (SELECT 1 FROM profiles WHERE session_id = p_session_id AND email IS NOT NULL)
     AND NOT EXISTS (SELECT 1 FROM profiles WHERE session_id = p_session_id AND password_hash = p_password_hash) THEN
    RAISE EXCEPTION 'Auth failed';
  END IF;
END $$;

-- La pulizia del nome della 30_ (toggle_ritual_candle), con la stessa classe di caratteri scritta
-- con gli escape \uXXXX (invisibili e di direzione del testo non sopravvivono a un copia-incolla).
-- toggle_ritual_candle NON si ridefinisce per usarla (spec §9): le due copie le tiene uguali il
-- test B2 di test-inviti-offline-sql.js.
CREATE OR REPLACE FUNCTION public.nome_pubblico(p_session_id text, p_nome text)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_nome text;
BEGIN
  SELECT nullif(btrim(nickname), '') INTO v_nome FROM profiles WHERE session_id = p_session_id;
  IF v_nome IS NULL THEN
    v_nome := regexp_replace(normalize(coalesce(p_nome, ''), NFKC),
                '[[:cntrl:]\u00AD\u034F\u061C\u115F\u1160\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\u3164\uFEFF\uFFA0]',
                '', 'g');
    v_nome := regexp_replace(v_nome, '[[:space:]\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]+', ' ', 'g');
    v_nome := nullif(btrim(left(btrim(v_nome), 50)), '');
    IF v_nome IS NOT NULL AND EXISTS (SELECT 1 FROM profiles
                                        WHERE lower(btrim(nickname)) = lower(btrim(v_nome))
                                          AND session_id <> p_session_id) THEN
      v_nome := NULL;
    END IF;
  END IF;
  RETURN coalesce(v_nome, 'Anonymous');
END $$;

-- «Visto online negli ultimi 30 s». Il cast regge sia timestamptz sia testo ISO.
CREATE OR REPLACE FUNCTION public.telepatia_online(p_session_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM online_users
                  WHERE id = p_session_id AND last_seen::timestamptz > now() - interval '30 seconds');
$$;

-- «Sta già facendo un training»: un match senza ended_at, aggiornato negli ultimi 10 minuti, e
-- già giocato oppure legato a un invito accettato. Un orfano appena inserito non tiene nessuno
-- occupato. p_escludi: il match appena creato da chi accetta.
CREATE OR REPLACE FUNCTION public.telepatia_in_training(p_session_id text, p_escludi uuid DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM telepathy_matches m
     WHERE (m.user1_id = p_session_id OR m.user2_id = p_session_id)
       AND m.ended_at IS NULL
       AND m.ultima_attivita > now() - interval '10 minutes'
       AND (p_escludi IS NULL OR m.id <> p_escludi)
       AND (m.giocato OR EXISTS (SELECT 1 FROM telepathy_invites i WHERE i.match_id = m.id AND i.status = 'accepted')));
$$;

-- «C'è un blocco fra i due», in un senso o nell'altro: user_blocks sui nomi (quelli dati dal
-- server), telepathy_invite_blocks sui session_id. Si legge senza contare su una PK dei nomi.
CREATE OR REPLACE FUNCTION public.telepatia_bloccati(p_sid_a text, p_nome_a text, p_sid_b text, p_nome_b text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM user_blocks
                  WHERE (blocker_nickname = p_nome_a AND blocked_nickname = p_nome_b)
                     OR (blocker_nickname = p_nome_b AND blocked_nickname = p_nome_a))
      OR EXISTS (SELECT 1 FROM telepathy_invite_blocks
                  WHERE (blocker_session = p_sid_a AND blocked_session = p_sid_b)
                     OR (blocker_session = p_sid_b AND blocked_session = p_sid_a));
$$;

-- Un invito da 45 s dura 45 s, uno da 10 minuti 600: la soglia a 60 s li separa.
CREATE OR REPLACE FUNCTION public.telepatia_era_da_dieci(p_creato timestamptz, p_scade timestamptz)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT p_scade - p_creato > interval '60 seconds';
$$;

-- «Disponibile» (spec §4.1 punto 7): riga di disponibilità rinnovata negli ultimi 14 giorni con
-- almeno un abbonamento, oppure visto online negli ultimi 30 s; e non già in un training.
CREATE OR REPLACE FUNCTION public.telepatia_disponibile(p_session_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT NOT telepatia_in_training(p_session_id)
     AND (telepatia_online(p_session_id)
          OR EXISTS (SELECT 1 FROM telepathy_availability a
                      WHERE a.session_id = p_session_id AND a.rinnovata_il > now() - interval '14 days'
                        AND EXISTS (SELECT 1 FROM push_subscriptions s WHERE s.session_id = p_session_id)));
$$;

-- Chi è la persona indicata dall'app: dall'identificativo opaco della lista, oppure dal
-- session_id della lista Online (valido solo se visto negli ultimi 30 s). Il nome sempre dal
-- server: profilo, se c'è; altrimenti quello della riga, ripulito. NULL se non si trova.
CREATE OR REPLACE FUNCTION public.telepatia_risolvi(p_disponibilita_id uuid, p_session_online text,
                                                    OUT o_sid text, OUT o_nome text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF p_disponibilita_id IS NOT NULL THEN
    SELECT a.session_id, nome_pubblico(a.session_id, a.nickname) INTO o_sid, o_nome
      FROM telepathy_availability a WHERE a.id = p_disponibilita_id;
  ELSIF p_session_online IS NOT NULL AND length(p_session_online) <= 255 AND telepatia_online(p_session_online) THEN
    SELECT u.id, nome_pubblico(u.id, u.nickname) INTO o_sid, o_nome
      FROM online_users u WHERE u.id = p_session_online ORDER BY u.last_seen::timestamptz DESC LIMIT 1;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.telepatia_motivo_stato(p_status text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT CASE p_status WHEN 'accepted' THEN 'gia_accettato' WHEN 'declined' THEN 'rifiutato'
                       WHEN 'cancelled' THEN 'annullato' ELSE 'scaduto' END;
$$;

-- La chiamata alla Edge Function. net.http_post è transazionale (parte solo al commit) e non
-- aspetta la risposta: un errore della funzione lo vede la sentinella alert-cron. Solo la chiave
-- pubblica, come nella 23_: la funzione era già invocabile da chiunque.
-- Il corpo lo legge leggiRichiesta (decisioni.mjs): {"tipo":"scadenze"} oppure
-- {"tipo":"invito|accettato|rifiutato|scaduto","invito":"<uuid>"}; qui passa com'è.
CREATE OR REPLACE FUNCTION public.telepatia_chiama_motore(p_corpo jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM net.http_post(
    url     := 'https://vxzxdkcluyrcftsnxxza.supabase.co/functions/v1/notify-telepathy-invite',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4enhka2NsdXlyY2Z0c254eHphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzMzcyMTcsImV4cCI6MjA4NjkxMzIxN30.m_mzWHH1-ajVqeSFvuJAm8t5Kz7I7umcEKBrRPr5JXM'
               ),
    body    := p_corpo
  );
END $$;

REVOKE ALL ON FUNCTION public.telepatia_verifica_identita(text, text)          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.nome_pubblico(text, text)                        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.telepatia_online(text)                           FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.telepatia_in_training(text, uuid)                FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.telepatia_bloccati(text, text, text, text)       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.telepatia_era_da_dieci(timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.telepatia_disponibile(text)                      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.telepatia_risolvi(uuid, text)                    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.telepatia_motivo_stato(text)                     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.telepatia_chiama_motore(jsonb)                   FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
