-- ============================================================================
-- Chiusura delle tabelle account — APPLICATA il 29/09/2026 con il via di Irene, il giorno
-- dopo la pubblicazione dell'app nuova (PR #15).
--
-- Spec: docs/superpowers/specs/2026-09-25-account-lato-server-design.md §4.4
-- Verifica: node test-account-rpc.js (le verifiche negative girano sempre).
--
-- Idempotente: si può rieseguire. Tutto in una transazione: o si chiude tutto o niente (il
-- NOTIFY finale parte al COMMIT).
-- ============================================================================

BEGIN;

-- ── profiles: solo lettura, solo colonne pubbliche ─────────────────────────
DROP POLICY IF EXISTS "Allow all" ON profiles;
DROP POLICY IF EXISTS profiles_lettura_pubblica ON profiles;
CREATE POLICY profiles_lettura_pubblica ON profiles FOR SELECT USING (true);
REVOKE ALL ON profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT (session_id, nickname, bio, starseed_type, avatar, country, interests,
              experience_level, telepathy_score, telepathy_best, show_telepathy_score,
              created_at, updated_at)
  ON profiles TO anon, authenticated;

-- ── magic_links, password_resets: chiuse del tutto ─────────────────────────
ALTER TABLE magic_links     ENABLE ROW LEVEL SECURITY;
ALTER TABLE password_resets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON magic_links     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON password_resets FROM PUBLIC, anon, authenticated;
-- Ogni token creato finora può essere stato scritto o letto da chiunque.
DELETE FROM magic_links;
DELETE FROM password_resets;

-- ── telepathy_scores: via user_id (per gli iscritti è l'email) ─────────────
-- Le scritture passano già da RPC SECURITY DEFINER; le uniche policy sono di SELECT
-- (verificato dal catalogo il 28/09), e i privilegi di scrittura di anon si tolgono qui.
REVOKE ALL ON telepathy_scores FROM PUBLIC, anon, authenticated;
GRANT SELECT (nickname, sessions_count, matches_count, rounds_count, updated_at)
  ON telepathy_scores TO anon, authenticated;

-- ── Tabelle private della 26_: ribadito ────────────────────────────────────
REVOKE ALL ON login_attempts    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON app_secrets       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON account_email_log FROM PUBLIC, anon, authenticated;

-- ── Fusione senza credenziale: via ─────────────────────────────────────────
DROP FUNCTION IF EXISTS merge_telepathy_scores(text, text, text);

NOTIFY pgrst, 'reload schema';

COMMIT;
