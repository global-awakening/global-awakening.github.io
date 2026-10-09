# Notifiche chiuse — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** la tabella `notifications` è accessibile solo tramite funzioni server. Queste verificano chi
chiama, creano le notifiche solo da fatti veri e rispettano i blocchi in tutti e due i sensi. Mappa
e Community nascondono chi ho bloccato.

**Architecture:** due migration, come 32a/32b:
- `35a_notifiche_server.sql` (additiva, compatibile con l'app vecchia): colonne nuove, tabella
  privata degli autori dei post, RPC nuove e ridefinizione degli scrittori server già esistenti;
- `35b_chiudi_notifiche.sql`: toglie la policy `allow all` e i privilegi ad anon.

L'app (`src/app.jsx` → `node build.js` → `app.js`) passa alle RPC. Ordine di rilascio: 35a →
merge/deploy → ~10 min → 35b.

**Tech Stack:** Postgres/Supabase (plpgsql SECURITY DEFINER), PGlite per le prove locali
(`scripts/pg-locale.js`), React senza bundler (`build.js`), Playwright per le prove UI.

**Spec:** `docs/superpowers/specs/2026-10-08-notifiche-chiuse-design.md`. Leggila intera prima di
ogni compito: questo piano dà obiettivi e criteri, la specifica dà le regole.

## Global Constraints

- Tutte le funzioni nuove: `SECURITY DEFINER SET search_path = public, pg_temp`. `REVOKE ALL …
  FROM PUBLIC` e `GRANT EXECUTE … TO anon, authenticated` solo per le pubbliche:
  - `get_my_notifications`
  - `mark_my_notification_read`
  - `notify_event`
  - `register_my_post`

  L'helper `notifica_chi_sono` è revocato a tutti.
- Identità: si riusano `telepatia_verifica_identita` e `nome_pubblico` (32a). La regola non si copia.
- Le funzioni esistenti che si ridefiniscono si copiano dalla versione **applicata sul DB**, con
  `pg_get_functiondef` via `node scripts/apply-sql.js <file.sql>`, non dal file del repo. Le
  versioni di 33_ possono averle cambiate.
- Testi delle notifiche identici a quelli di oggi (italiano):
  - `X si è unito/a al tuo rituale "N"`
  - `X ha commentato il tuo rituale "N"`
  - `X ha commentato il tuo post`
- Finestra anti-raffica e «fatto recente»: 10 minuti. Finestra di `register_my_post`: 5 minuti.
  Limite lettura: 100.
- File SQL senza `\r` (controllo: `tr -d -c '\r' < file | wc -c` → 0).
- Ogni test va lanciato con `NODE_OPTIONS="--require ./scripts/test-silenzioso.js"`.
- Nei worktree non c'è `.env`. Per i test che toccano il DB vero si carica
  `require('../global-awakening/test-helpers').loadTestEnv()` in memoria; copiare `.env` è vietato.
- Niente refactor adiacenti, niente file extra oltre a quelli elencati. Non toccare
  `online_users` lato server.

## Review Focus

1. **Ospite con lo stesso nickname di un altro ospite:** non deve vedere le notifiche dell'altro.
   Per gli ospiti conta solo `recipient_session_id`, mai il nickname. Test in Task 1.
2. **Registrato che passa il `session_id` giusto ma l'hash sbagliato:** respinto con `Auth failed`,
   niente righe. Test in Task 1.
3. **Blocco arrivato DOPO la notifica:** la notifica sparisce dalla lettura e riappare allo
   sblocco. Test in Task 1.
4. **Notifiche vecchie di un registrato** (`recipient_session_id` null, `user_nickname` = suo):
   restano visibili. Quelle vecchie di un ospite no. Test in Task 1.
5. **Cancellazione account:** non lascia righe in `consciousness_post_autori` né notifiche per
   `recipient_session_id`. Test in Task 3.

---

### Task 1: 35a — schema, identità, lettura e «segna letta»

**Files:**
- Create: `supabase/sql/35a_notifiche_server.sql`, `supabase/sql/35a_ritorno.sql`, `test-notifiche-chiuse-sql.js`
- Modify: `scripts/pg-locale.js` (solo se lo schema locale di `notifications` / `consciousness_posts` va allineato; aggiungi una costante `F35A` e l'opzione `con35a` a `creaDbTelepatia`)

**Interfaces:**
- Produces:
  - colonne `notifications.recipient_session_id`, `sender_session_id`, `sender_nickname` (text, nullable);
  - tabella `consciousness_post_autori(post_id uuid PK, session_id text NOT NULL, created_at timestamptz default now())`;
  - `notifica_chi_sono(p_session_id text, p_password_hash text, p_nickname text) RETURNS text`
    (nickname effettivo; solleva `Auth failed` / `session_required`);
  - `notifica_bloccata(sid_a text, nick_a text, sid_b text, nick_b text) RETURNS boolean`
    (bidirezionale: `user_blocks` per nickname + `telepathy_invite_blocks` per session; null-safe;
    può riusare `telepatia_bloccati` se la sua firma basta);
  - `get_my_notifications(p_session_id text, p_password_hash text, p_nickname text) RETURNS SETOF notifications`;
  - `mark_my_notification_read(p_id uuid, p_session_id text, p_password_hash text, p_nickname text) RETURNS boolean`.

**Criteri (test in `test-notifiche-chiuse-sql.js`, sezione «lettura»; ogni sezione su un DB nuovo):**
- [ ] Prima scrivi i test e lanciali: devono fallire (le funzioni non esistono).
- [ ] Ospite A legge solo le righe con `recipient_session_id` = il suo sid. Un ospite B con lo
  **stesso nickname** non le vede (Review Focus 1).
- [ ] Registrato: con l'hash giusto vede le sue, comprese quelle vecchie per `user_nickname` con
  `recipient_session_id` null. Con l'hash sbagliato riceve `Auth failed` (Review Focus 2 e 4).
- [ ] Le righe vecchie per nickname di un ospite (senza profilo) non sono restituite (Review Focus 4).
- [ ] Il mittente bloccato da me, o che mi ha bloccato, è escluso. Dopo lo sblocco la riga
  ricompare, e nessuna riga viene cancellata (Review Focus 3).
- [ ] Solo `read = false`, ordine `created_at desc`, al massimo 100.
- [ ] `mark_my_notification_read` sulla propria riga → true e `read` diventa true. Sulla riga di un
  altro → false e la riga resta intatta.
- [ ] Come anon (`comeAnon`) `notifica_chi_sono` e `notifica_bloccata` non sono eseguibili.
- [ ] 35a applicata due volte non dà errori. `35a_ritorno.sql` toglie funzioni, tabella e colonne
  e lascia `notifications` usabile come prima.
- [ ] Lancia `node test-notifiche-chiuse-sql.js` (verde) e `node test-inviti-offline-sql.js`
  (ancora verde).
- [ ] Commit: `feat(notifiche): 35a lettura e segna-letta lato server`.

### Task 2: 35a — creazione da fatti verificati

**Files:**
- Modify: `supabase/sql/35a_notifiche_server.sql`, `supabase/sql/35a_ritorno.sql`, `test-notifiche-chiuse-sql.js`

**Interfaces:**
- Consumes: `notifica_chi_sono`, `notifica_bloccata` (Task 1).
- Produces:
  - `notify_event(p_session_id text, p_password_hash text, p_nickname text, p_tipo text, p_oggetto uuid) RETURNS jsonb`
    → `{ok bool, inviata bool, motivo text|null}`. `p_tipo` è uno di `ritual_join`,
    `ritual_comment`, `comment`. Motivi:
    - `tipo_sconosciuto`
    - `non_trovato`
    - `fatto_non_verificato`
    - `a_me_stesso`
    - `bloccato`
    - `gia_inviata`
  - `register_my_post(p_post_id uuid, p_session_id text, p_password_hash text, p_nickname text) RETURNS boolean`.

**Criteri (sezione «creazione»):**
- [ ] Prima i test, rossi.
- [ ] Per ciascun tipo, fatto vero → una riga con `user_nickname`, `recipient_session_id`,
  `sender_session_id`, `sender_nickname` e testo esatto (Global Constraints).
- [ ] Per ciascun tipo, fatto falso → `fatto_non_verificato`, nessuna riga:
  - `ritual_join`: sid non in `participants`;
  - `ritual_comment` / `comment`: nessun commento mio negli ultimi 10 minuti.
- [ ] Rituale o post inesistente → `non_trovato`. Destinatario = me → `a_me_stesso`.
- [ ] Blocco in un senso e nell'altro → `bloccato`, nessuna riga.
- [ ] Seconda chiamata identica entro 10 minuti → `gia_inviata`. Dopo 11 minuti (sposta
  `created_at` indietro) si invia di nuovo.
- [ ] `comment` su un post di un ospite: telefono da `consciousness_post_autori`. Su un post di un
  registrato: dal profilo. Post di un ospite senza autore registrato → la riga nasce con
  `recipient_session_id` null (non leggibile da nessun ospite) oppure non nasce. Scegli la seconda
  e restituisci `non_trovato`.
- [ ] `register_my_post`:
  - post mio e recente → true;
  - post di un altro nickname → false;
  - post più vecchio di 5 minuti → false;
  - seconda registrazione → false, e l'autore resta il primo.
- [ ] Il testo usa il nickname effettivo (`notifica_chi_sono`), non quello passato da un
  registrato.
- [ ] Ritorno e idempotenza ancora verdi. Commit: `feat(notifiche): notify_event e autori dei post`.

### Task 3: 35a — scrittori server esistenti, cancellazione ed export

**Files:**
- Create: `docs/superpowers/plans/catalogo-notifiche-35.txt` (dump `pg_get_functiondef` dal DB vero
  delle funzioni sotto, che serve al ritorno)
- Modify: `supabase/sql/35a_notifiche_server.sql`, `supabase/sql/35a_ritorno.sql`, `test-notifiche-chiuse-sql.js`

**Interfaces:**
- Consumes: `notifica_bloccata` (Task 1).
- Ridefinisce, a partire dal DB vero:
  - `send_private_message`
  - `send_telepathy_invite`
  - `respond_telepathy_invite`
  - `delete_my_account`
  - `export_my_account`

  Firme e risultati restano identici. `35a_ritorno.sql` ripristina il testo del catalogo.

**Criteri (sezione «scrittori esistenti»):**
- [ ] Prima i test, rossi.
- [ ] Messaggio privato e invito: la notifica ha `recipient_session_id` (destinatario) e il
  mittente. Per i messaggi il sid del destinatario viene dal profilo.
- [ ] Rifiuto di un invito: se l'invitante e chi rifiuta sono bloccati (in un senso o nell'altro)
  non nasce la notifica `telepathy_declined`, ma il rifiuto va comunque a buon fine. Senza blocco
  nasce, con le colonne nuove.
- [ ] `delete_my_account`:
  - cancella anche le notifiche con `recipient_session_id` = mio sid;
  - cancella le righe di `consciousness_post_autori` del mio sid;
  - tutto il resto si comporta come prima (Review Focus 5).
- [ ] `export_my_account` include anche le notifiche per `recipient_session_id`.
- [ ] `node test-inviti-offline-sql.js` è ancora verde, con le stesse prove di prima.
- [ ] Ritorno: dopo `35a_ritorno.sql`, `pg_get_functiondef` delle cinque funzioni è uguale al
  catalogo.
- [ ] Commit: `feat(notifiche): scrittori server riempiono mittente e destinatario`.

### Task 4: 35b — chiusura

**Files:**
- Create: `supabase/sql/35b_chiudi_notifiche.sql`, `supabase/sql/35b_ritorno.sql`
- Modify: `test-notifiche-chiuse-sql.js`

**Criteri (sezione «chiusura»):**
- [ ] Prima i test, rossi.
- [ ] Dopo 35b, come anon: SELECT, INSERT, UPDATE e DELETE su `notifications` danno errore di
  permesso. Le quattro RPC pubbliche funzionano ancora.
- [ ] Il nome reale della policy da togliere si legge dal DB vero (oggi `"allow all"`). Usare
  `DROP POLICY IF EXISTS`.
- [ ] `35b_ritorno.sql` rimette la policy `allow all` e i privilegi di prima, come da catalogo.
  Con anon il SELECT torna a funzionare.
- [ ] Commit: `feat(notifiche): 35b chiude la tabella`.

### Task 5: App e prove che usano la chiave anon

**Files:**
- Modify: `src/app.jsx` (vicino a `:4279`, `:4290`, `:4661`, `:4953`, `:5006-5020`, al punto
  dove si crea un post, `:5922`, `:5952`), `app.js` (rigenerato con `node build.js`, mai a mano)
- Modify: `test-account-gdpr.js:64`, `test-moderazione.js:68-69`, `test-inviti-telepatia.js:75-76,367`.
  Passano a `purge()` di `test-helpers.js` o alla chiave di servizio, che è già usata lì.

**Interfaces:**
- Consumes: le quattro RPC pubbliche (Task 1-2). Il chiamante passa `sessionId`, `passwordHash`
  (null per gli ospiti) e `nickname`, come nelle chiamate RPC esistenti di `app.jsx`.

**Criteri:**
- [ ] Il polling usa `rpc('get_my_notifications', …)`. Se c'è un errore la lista resta com'era: non
  si svuota e non compare nessun toast.
- [ ] «Segna letta» usa `rpc('mark_my_notification_read', …)`. Il resto del flusso (inviti, tab)
  resta invariato.
- [ ] I tre insert diventano `rpc('notify_event', { …, p_tipo, p_oggetto })`. Un risultato
  `inviata:false` o un errore vengono ignorati in silenzio.
- [ ] Dopo l'insert riuscito di un post, `rpc('register_my_post', …)` con l'id del post creato.
  Se l'insert oggi non restituisce l'id, aggiungi `.select('id').single()`.
- [ ] Mappa e lista Community filtrate con `isBlocked`. Il contatore resta il totale.
- [ ] Nessun riferimento rimasto a `from('notifications')` o `/rest/v1/notifications` in `src/app.jsx`.
- [ ] `node build.js` va a buon fine. Commit `src/app.jsx`, `app.js` e i test:
  `feat(notifiche): l'app passa dal server`.

### Task 6: Rilascio e verifica (controller, non sub-agente)

- [ ] Revisione indipendente dell'intero ramo (sub-agente separato), con tutti i rilievi chiusi.
- [ ] Applica 35a sul DB vero con `node scripts/apply-sql.js`. Ricontrolla le cinque funzioni
  ridefinite e lancia le prove UI contro il ramo servito in locale:
  - `test-inviti-telepatia.js`
  - `test-moderazione-ui.js`
  - le prove dei rituali e dei commenti

  Prima di lanciarle, verificare "Accepting connections at …:4321".
- [ ] Push del ramo, PR, merge (comando singolo).
- [ ] Attendi il deploy (~10 minuti), poi applica 35b.
- [ ] Prova REST con la chiave anon: SELECT, INSERT, PATCH e DELETE sono respinti.
- [ ] Prova sul sito vero con due account di prova: un commento a un rituale fa comparire la
  notifica nella campanella, e un blocco la fa sparire.
- [ ] Handoff, update e memoria.
