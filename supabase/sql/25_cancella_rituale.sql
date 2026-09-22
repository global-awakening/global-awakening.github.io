-- ============================================================================
-- Cancellazione di un rituale da parte di chi l'ha creato — 22/09/2026
--
-- Perché serve una funzione e non una DELETE dal client: le autorizzazioni dirette sulla
-- tabella `rituals` sono state tolte con rituali_step_a_02_drop_policies.sql. Si passa solo
-- da funzioni, che è anche l'unico posto dove si può verificare *chi* sta cancellando.
--
-- Tre cancelli, in quest'ordine:
--   1. il rituale esiste;
--   2. chi cancella è chi l'ha creato (creator_id = il proprio sessionId);
--   3. il rituale NON è ancora iniziato.
--
-- Il terzo è una scelta, non un vincolo tecnico: un rituale è un appuntamento, e chi si è
-- collegato e sta meditando non deve vederselo sparire sotto gli occhi. Prima dell'inizio
-- invece nessuno ha ancora investito niente, e chi l'ha creato può disdire.
--
-- Anti-impersonazione condizionale, identica a create_ritual (07_rituali_step_b.sql): un
-- sessionId sta in chiaro nel browser e si può copiare, una password no. Se il creatore è un
-- nickname registrato, l'hash deve combaciare. Per gli ospiti resta il solo creator_id — che
-- è esattamente la stessa protezione che hanno sulla creazione, né più né meno.
--
-- Idempotente: si può rieseguire.
-- ============================================================================

CREATE OR REPLACE FUNCTION delete_ritual(
  p_ritual_id     bigint,
  p_session_id    text,
  p_password_hash text
)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rituale rituals%ROWTYPE;
  v_inizio  timestamptz;
BEGIN
  SELECT * INTO v_rituale FROM rituals WHERE id = p_ritual_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ritual_not_found';
  END IF;

  IF coalesce(v_rituale.creator_id, '') IS DISTINCT FROM coalesce(p_session_id, '') THEN
    RAISE EXCEPTION 'not_creator';
  END IF;

  IF EXISTS (SELECT 1 FROM profiles WHERE nickname = v_rituale.creator) THEN
    IF NOT EXISTS (
      SELECT 1 FROM profiles
       WHERE nickname = v_rituale.creator
         AND password_hash = p_password_hash
    ) THEN
      RAISE EXCEPTION 'Auth failed';
    END IF;
  END IF;

  -- `date` e `time` sono TESTO, non tipi data: il database li tiene così da sempre (lo dice
  -- anche finestre.mjs). Quindi niente `date + time`, che su due testi non esiste: si
  -- concatena e si converte. Il `::text` esplicito regge anche se un domani le colonne
  -- diventassero tipi veri.
  --
  -- E sono in UTC (PR #4 del 18/09: la conversione di fuso sta sul contorno, il database resta
  -- in UTC). Senza `AT TIME ZONE 'UTC'` il confronto userebbe il fuso del server, e il cancello
  -- si aprirebbe o chiuderebbe nell'ora sbagliata — di due ore, d'estate, in Italia.
  v_inizio := ((v_rituale.date::text || ' ' || v_rituale.time::text)::timestamp) AT TIME ZONE 'UTC';
  IF now() >= v_inizio THEN
    RAISE EXCEPTION 'already_started';
  END IF;

  -- ritual_notifications_sent ha ON DELETE CASCADE (19_push_notifiche_rituali.sql:63) e si
  -- pulisce da sola. ritual_comments NO: senza questa riga resterebbero commenti appesi a un
  -- rituale che non esiste più, invisibili a tutti e impossibili da ritrovare.
  -- Le candele non hanno una tabella: sono una colonna di `rituals` (09_ritual_candles.sql).
  DELETE FROM ritual_comments WHERE ritual_id = p_ritual_id;
  DELETE FROM rituals WHERE id = p_ritual_id;

  RETURN p_ritual_id;
END;
$$;

GRANT EXECUTE ON FUNCTION delete_ritual(bigint, text, text) TO anon;

-- Verifica a mano (sostituire <ID> e <SESSION>):
--   POST /rpc/delete_ritual {p_ritual_id:<ID>, p_session_id:'<SESSION>', p_password_hash:''}
--   -> l'id cancellato, oppure uno fra: ritual_not_found | not_creator | already_started |
--      Auth failed
