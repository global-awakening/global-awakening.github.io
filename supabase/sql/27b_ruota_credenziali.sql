-- ============================================================================
-- Rotazione delle credenziali — APPLICATA il 29/09/2026 insieme alla 27_, con il via di Irene.
-- Gli iscritti veri erano 3 e sono stati avvisati di persona.
--
-- Spec: docs/superpowers/specs/2026-09-25-account-lato-server-design.md §6 e §8
--
-- Perché: fino alla 27_ la colonna profiles.password_hash era leggibile da chiunque con la chiave
-- pubblica. Quell'hash non è un'impronta da cui risalire alla password: È la credenziale, perché
-- l'app lo manda così com'è alle RPC (messaggi, profilo, cambio password). Chi l'ha copiato prima
-- della chiusura può continuare a usarlo anche dopo. Per gli account vecchi (SHA-256) è peggio:
-- chi conosce quell'SHA-256 può fare il login e scegliersi l'hash PBKDF2 con cui l'account viene
-- migrato. La 27_ chiude la porta; questa migration cambia la serratura.
--
-- Effetto per gli utenti: la password di prima non funziona più. Si rientra con «entra con un
-- link» (l'email crea una credenziale nuova e casuale), poi si sceglie una password nuova con
-- «password dimenticata». I dati del profilo, i messaggi e i punteggi non si toccano.
--
-- Cosa fa: azzera password_hash di ogni profilo con un'email (gli ospiti non ne hanno) e
-- cancella tutti i link d'accesso e di reset in giro, che potrebbero essere stati scritti o letti
-- da chiunque.
--
-- Idempotente: si può rieseguire (la seconda volta non trova niente da cambiare).
-- ============================================================================

BEGIN;

UPDATE profiles
   SET password_hash = NULL, updated_at = now()
 WHERE email IS NOT NULL AND password_hash IS NOT NULL;

DELETE FROM magic_links;
DELETE FROM password_resets;

COMMIT;
