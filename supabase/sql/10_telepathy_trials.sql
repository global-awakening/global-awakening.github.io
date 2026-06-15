-- ============================================================================
-- Telepatia — raccolta dati per l'indagine (Fase 2) — 2026-06-15
-- Riferimento: docs/superpowers/specs/2026-06-15-telepatia-simboli-livelli-indagine-design.md
--
-- Tabella APPEND-ONLY `telepathy_trials`: registra ogni singolo tentativo
-- (target, risposta, esito, e soprattutto N = numero di card) prima che il
-- match venga cancellato. Mai cancellata/purgata: è il dato grezzo per
-- calcolare in seguito la significatività statistica (la % di match batte il
-- caso 1/N?). In app NON si legge: l'analisi si fa da Studio.
--
-- Sicurezza (coerente con messaggi/rituali Step B):
--   - inserimento SOLO via RPC SECURITY DEFINER `log_telepathy_trial` (l'app non
--     scrive in tabella direttamente);
--   - RLS attiva, NESSUNA policy → anon non può SELECT/UPDATE/DELETE; la RPC
--     bypassa RLS ed è l'unica via di scrittura (solo INSERT);
--   - identità: `sender_id`/`receiver_id` = email (iscritti) o session_id/codice
--     ospite. Il "guest vs iscritto" si deduce in analisi (presenza di '@').
--     Loggato dal lato RICEVENTE: `receiver_id` è l'identità affidabile del
--     percipiente; `sender_id` è il session_id del partner (presenza).
-- Additivo, non-breaking, idempotente.
-- ============================================================================

CREATE TABLE IF NOT EXISTS telepathy_trials (
  id            bigserial PRIMARY KEY,
  created_at    timestamptz NOT NULL DEFAULT now(),
  match_id      text,
  round_number  int,                  -- 0-based: indice del round risolto nel match
  sender_id     text,                 -- session_id del partner (etichetta di coppia, NON identità affidabile)
  receiver_id   text,                 -- identità affidabile del percipiente (email se iscritto, altrimenti session_id)
  mode          text,                 -- 'lvl3'|'lvl5'|'lvl7'|'lvl9'|'numbers'|'words'
  card_count    int NOT NULL,         -- N: alternative tra cui scegliere (prob. caso = 1/N). Raggruppare per QUESTO, non per mode.
  target_symbol text NOT NULL,
  guess_symbol  text NOT NULL,
  is_hit        boolean NOT NULL,
  -- Idempotenza forte del dataset (mai purgato): un round è registrato una sola
  -- volta dal percipiente, anche con re-invii del client. Il client già protegge,
  -- ma il vincolo blinda i dati anche da futuri riusi/race.
  CONSTRAINT uq_telepathy_trial UNIQUE (match_id, round_number, receiver_id)
);

-- Indici utili per l'analisi futura (per coppia/sessione e per livello).
CREATE INDEX IF NOT EXISTS idx_telepathy_trials_match ON telepathy_trials (match_id);
CREATE INDEX IF NOT EXISTS idx_telepathy_trials_mode  ON telepathy_trials (mode);

-- RLS attiva senza policy: i client (anon) non possono leggere né scrivere
-- direttamente. L'unica scrittura passa dalla RPC SECURITY DEFINER sotto.
ALTER TABLE telepathy_trials ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION log_telepathy_trial(
  p_match_id     text,
  p_round        int,
  p_sender_id    text,
  p_receiver_id  text,
  p_mode         text,
  p_card_count   int,
  p_target       text,
  p_guess        text,
  p_is_hit       boolean
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Validazione minima: senza target/guess/N il tentativo non è analizzabile.
  IF p_target IS NULL OR p_target = '' OR p_guess IS NULL OR p_guess = '' THEN
    RAISE EXCEPTION 'symbols_required';
  END IF;
  IF p_card_count IS NULL OR p_card_count < 2 OR p_card_count > 50 THEN
    RAISE EXCEPTION 'invalid_card_count';
  END IF;

  INSERT INTO telepathy_trials (
    match_id, round_number, sender_id, receiver_id,
    mode, card_count, target_symbol, guess_symbol, is_hit
  ) VALUES (
    p_match_id, p_round, p_sender_id, p_receiver_id,
    p_mode, p_card_count, p_target, p_guess,
    coalesce(p_is_hit, p_target = p_guess)
  )
  ON CONFLICT ON CONSTRAINT uq_telepathy_trial DO NOTHING;
END;
$$;
GRANT EXECUTE ON FUNCTION log_telepathy_trial(text,int,text,text,text,int,text,text,boolean) TO anon;

-- Verifica post-apply (da REST anon):
--   POST /rpc/log_telepathy_trial {p_match_id:'m1',p_round:0,p_sender_id:'s',
--     p_receiver_id:'r',p_mode:'lvl3',p_card_count:3,p_target:'star',
--     p_guess:'star',p_is_hit:true} -> 204 (inserito)
--   GET /telepathy_trials -> [] (anon NON legge: RLS senza policy)  ✓ atteso
--   POST con p_card_count:1 -> errore 'invalid_card_count'          ✓ atteso
