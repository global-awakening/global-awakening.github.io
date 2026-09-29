# Account lato server — chiudere profili, link d'accesso e reset password

**Data:** 2026-09-25
**Stato:** spec scritta + review indipendente (§0); rilievi accolti riportati nel corpo il 28/09. Pronta per il piano. Irene ha scelto il «rimedio completo» senza chiusura d'emergenza
**Ramo:** `fix/account-lato-server`
**Priorità:** sopra gli inviti offline (`2026-09-25-inviti-telepatia-offline-design.md`, in pausa)

---

## 0. Esito della review indipendente (25/09)

Un agente che non aveva scritto la spec l'ha riletta contro il codice. Undici rilievi: dieci
accolti e riportati nel testo sotto (28/09), uno scartato.

| # | Rilievo | Esito |
|---|---|---|
| 1 | **Le email escono anche da `telepathy_scores`**: per gli iscritti `user_id` è l'email, e la classifica fa `select('*')` (`src/app.jsx:961`). Ogni visitatore scarica le email dei primi dieci. | **Verificato e accolto.** La tabella entra nello scope (§4.4). |
| 2 | `change_password` con vecchio hash nullo si apriva a chiunque conoscesse il nickname: per quegli account `consume_magic_link` non restituisce nessuna credenziale. | Accolto: il link d'accesso **crea** una credenziale casuale se manca (§4.1). |
| 3 | Il tetto dei tentativi si annullava da solo: un `RAISE` fa rollback anche dell'insert in `login_attempts`. | Accolto: il rifiuto è un valore di ritorno, non un'eccezione. Aggiunto un tetto per IP e uno globale. |
| 4 | EmailJS permette già a chiunque di spedire email «ufficiali» con link propri: chiave pubblica e template sono nel codice, e i template ricevono l'URL intero. | Accolto: i template ricevono solo il token e l'URL è scritto nel template; chiave privata obbligatoria. Sono **passi di Irene sulla dashboard EmailJS** (§6). |
| 5 | Enumerazione: `{schema:'legacy'}` rivela chi esiste; segreto dell'HMAC non specificato; `email_in_uso` rivela comunque chi è iscritto. | Accolto: una sola forma di risposta e segreto in tabella privata. `email_in_uso` dichiarato **rischio accettato**. |
| 6 | Dopo la chiusura, le PWA vecchie falliscono **in silenzio** (il cambio password mostra «fatto» anche se il server rifiuta, e da lì la credenziale diverge). | Accolto: più giorni tra rilascio e chiusura, e il caso è descritto per com'è (§5, §6). |
| 7 | Funzioni o viste fuori dal repo potrebbero rompersi. | **Verificato dal catalogo: nessuna funzione `SECURITY INVOKER` e nessuna vista in `public` legge `profiles`.** `merge_telepathy_scores`, `increment_telepathy_score` e `get_my_messages` sono `SECURITY DEFINER`. |
| 8 | `login_attempts` va chiusa con un `REVOKE` esplicito: i privilegi di default di Supabase la darebbero ad `anon`. | Accolto. |
| 9 | La stima «15 file di test» è imprecisa: 5 creano utenti con insert diretti, gli altri fanno letture o DELETE dirette che si romperanno lo stesso; `getServiceKey` può tornare `null`. | Accolto (§7). |
| 10 | Una riga della tabella §4.3 metteva insieme due flussi. | Accolto: separati. |
| 11 | Il token del link resta nella cronologia del browser. | **Scartato:** `app.jsx:1050-1053` fa già `history.replaceState` appena legge `magic`, e lo stesso per `reset`. |

---

## 1. Il problema

Scoperto il 25/09 mentre si scriveva la spec degli inviti. **Chiunque abbia la chiave pubblica
dell'app, che ogni visitatore ha nel browser, può prendersi qualunque account.**

Verificato dal catalogo del database e dalla dashboard (Irene, 25/09). **Non** con una lettura di
dati reali: il sistema di permessi l'ha bloccata, e fa bene.

| Tabella | RLS | Policy | Permessi di `anon` |
|---|---|---|---|
| `profiles` | attiva | `Allow all` — ALL, `true`, `public` | SELECT, INSERT, UPDATE, DELETE |
| `magic_links` | **spenta** | — | SELECT, INSERT, UPDATE, DELETE |
| `password_resets` | **spenta** | — | SELECT, INSERT, UPDATE, DELETE |

Cosa si può fare con questi permessi, in ordine di gravità:

1. **Entrare nell'account di chiunque, senza password.** Si inserisce in `magic_links` una riga
   con l'email della vittima e un token scelto da sé, poi si apre `app.html?magic=<token>`. L'app
   carica il profilo **e il suo `password_hash`**, che è la credenziale di tutte le RPC
   (messaggi, blocchi, export, eliminazione dell'account).
2. **Rubare le credenziali in blocco.** `select=email,password_hash` su `profiles`. Lo fa già
   l'app, senza volerlo: `openProfile` scarica `select('*')` della persona che guardi, hash
   compreso, nel browser di chi guarda.
3. **Sostituire la password di un altro**: `UPDATE profiles SET password_hash = …`.
4. **Cancellare o riscrivere i profili**, e leggere tutte le email (dato personale).
5. **Entrare con una password qualunque negli account senza hash** (3 al 28/09, conteggio dal
   catalogo): `handleLogin` rifiuta solo `if (existing.password_hash && !verify.ok)`
   (`src/app.jsx:1736`), quindi senza hash salvato ogni password è buona. Lo chiude
   `login_with_password`, che rifiuta sempre un account senza hash.

**Causa di fondo:** login, registrazione, reset e link d'accesso sono fatti **nel browser**.
Il browser legge l'hash e lo confronta da sé; genera da sé il token del link e lo spedisce da sé
via EmailJS. Il server si fida di tutto. Le RPC `SECURITY DEFINER` costruite da maggio in poi
(messaggi, GDPR, moderazione) sono corrette, ma poggiano su una credenziale che chiunque può
leggere.

## 2. Obiettivo e criteri di «fatto»

Nessuna operazione sugli account è possibile con la sola chiave pubblica, senza conoscere la
password o senza avere accesso alla casella email. Per chi usa l'app **non cambia niente**:
stessi schermi, stessi passaggi.

Fatto quando, contro il database vero:
- `anon` non legge `password_hash` né `email` di `profiles`, e non scrive `profiles` direttamente;
- `anon` non legge né scrive `magic_links` e `password_resets`;
- `anon` non legge `telepathy_scores.user_id` (per gli iscritti è l'email): la classifica esce da
  una RPC che non la contiene;
- `anon` non legge `login_attempts` né `app_secrets`;
- `merge_telepathy_scores` rifiuta una fusione verso un account di cui non si ha la credenziale;
- con la chiave pubblica e il template EmailJS non si spedisce un'email con un link scelto da sé;
- login con password, registrazione, «password dimenticata», «entra con un link», cambio password,
  modifica del profilo e apertura del profilo altrui funzionano;
- un account con hash **vecchio** (SHA-256 senza sale) entra ancora e viene migrato;
- l'intera suite di regressione è verde, o i rossi sono preesistenti e misurati prima.

## 3. Decisioni

| Tema | Scelta | Perché |
|---|---|---|
| Modello di credenziale | **Resta** `password_hash` come credenziale delle RPC. | Cambiarlo vuol dire riscrivere ogni RPC esistente. Il difetto non è il modello, è che la credenziale era leggibile. Chiuderne la lettura basta. |
| Dove si calcola l'hash | **Resta nel browser** (PBKDF2, 100k iterazioni). Il server riceve l'hash e lo confronta. | Postgres non ha PBKDF2 nativo; rifarlo in plpgsql costerebbe secondi a login. L'hash senza la password non si ottiene più: il server dà solo il sale. |
| Chi crea e spedisce i link | **Il server**: una Edge Function genera il token e manda l'email con la chiave privata di EmailJS, già nei segreti (`EMAILJS_PRIVATE_KEY`, usata da `alert-cron`). | Finché il token nasce nel browser, chi lo genera lo conosce. Non c'è rimedio lato client. |
| Risposta a «password dimenticata» / «link» | **Sempre la stessa**: «Se l'indirizzo è registrato, ti abbiamo scritto». | Oggi l'app dice «email non trovata»: rivela chi è iscritto. Piccolo cambio di testo, unico visibile. |
| Chiusura d'emergenza | **No** (Irene, 25/09). Tutto il rimedio insieme. | — |
| Colonne pubbliche di `profiles` | Lettura aperta per `session_id`, `nickname`, `bio`, `starseed_type`, `avatar`, `country`, `interests`, `experience_level`, `telepathy_score`, `telepathy_best`, `show_telepathy_score`, `created_at`, `updated_at` (tutte le colonne della tabella lette dal catalogo il 25/09, tranne le due chiuse). **Chiuse:** `email`, `password_hash`. | Sono i dati che l'app mostra già a tutti. `session_id` resta pubblico: è già pubblico in `rituals.participants`, e non è una credenziale per gli account registrati. |

## 4. Architettura

### 4.1 Migration `26_account_lato_server.sql` — RPC nuove (additiva)

Aggiunge soltanto, non chiude niente: l'app pubblicata continua a funzionare. Tutte
`SECURITY DEFINER`, `SET search_path = public, pg_temp`, input validati come in 21_/24_,
`GRANT EXECUTE … TO anon, authenticated`, email sempre `lower(btrim())`.

| RPC | Cosa fa |
|---|---|
| `get_login_params(p_email)` | Torna **sempre e solo** `{iter, salt}`, per qualunque email. Account PBKDF2 → i valori letti dall'hash salvato. Account con hash vecchio (SHA-256) **o** email sconosciuta → `iter` di default e un sale deterministico `HMAC(email, segreto)`, con il segreto nella tabella privata `app_secrets` (RLS senza policy, `REVOKE ALL` da `anon`/`authenticated`, generato una volta dalla migration). Nessun campo `schema`: la forma della risposta non rivela né se l'account esiste né che tipo di hash ha. |
| `login_with_password(p_email, p_hash, p_legacy_hash)` | **Unica RPC di login.** Il browser manda sempre sia l'hash PBKDF2 calcolato con il sale ricevuto sia l'hash SHA-256 vecchio. Account PBKDF2 → confronta `p_hash`. Account vecchio → confronta `p_legacy_hash` e, se combacia, salva `p_hash` (che è già un `pbkdf2$…` valido, con il sale HMAC) come nuovo hash: migrazione trasparente. Riuscita → profilo **senza** `password_hash` (con `session_id`, nickname, campi pubblici, email). Rifiuto → **valore di ritorno** `{ok:false, motivo:'credenziali_non_valide'\|'troppi_tentativi'}`, **mai `RAISE`**: un'eccezione farebbe rollback anche della riga scritta in `login_attempts` e il tetto non conterebbe niente. **Tetti** (tabella `login_attempts`, RLS senza policy, `REVOKE ALL` esplicito da `anon`/`authenticated` perché i privilegi di default di Supabase gliela darebbero): 10 falliti per email in 15 min; 30 falliti per IP in 15 min (IP dall'header `cf-connecting-ip` di PostgREST. **Verificato il 28/09 con una sonda temporanea:** il primo valore di `x-forwarded-for` lo sceglie il chiamante e non va usato, mentre un `CF-Connecting-IP` mandato dal client viene rifiutato da Cloudflare, errore 1000); tetto globale di 300 falliti in 15 min, che scatta **solo quando l'IP del chiamante è ignoto** (manca `cf-connecting-ip`). *Decisione del 28/09:* con un IP affidabile un tetto globale sarebbe un interruttore che chiunque può girare, perché bastano una decina di IP per esaurirlo e bloccare i login di tutti; il singolo bersaglio lo protegge già il tetto per email, il singolo attaccante quello per IP. Il prezzo, accettato: chi prova poche password su molte email da molti IP non incontra un tetto complessivo. Pulizia delle righe più vecchie di un giorno a ogni chiamata. Un login riuscito cancella i falliti di quell'email, così chi sbaglia due volte e poi entra non resta a metà del tetto. |
| `register_account(p_session_id, p_nickname, p_email, p_hash)` | Unicità di email e nickname **sul server**, formato `pbkdf2$…` obbligatorio, insert. Errori distinti `email_in_uso` / `nickname_in_uso`, come oggi. `email_in_uso` rivela chi è iscritto: **rischio accettato** (senza, chi sbaglia email non capirebbe perché non riesce a registrarsi); mitigato dal tetto per IP, lo stesso di `login_attempts`. |
| `consume_magic_link(p_token)` | Token valido e non scaduto → lo cancella e torna profilo **più** `password_hash`: a chi ha aperto il link dalla propria email serve la credenziale per le RPC, come oggi. Uso singolo. Se l'account **non ha** `password_hash` (creato da flussi vecchi), ne crea uno casuale (`pbkdf2$…` da 32 byte di `gen_random_bytes`), lo salva e lo restituisce: chi entra col link ha così sempre una credenziale, e da lì può impostare una password vera con «password dimenticata». |
| `reset_password(p_token, p_new_hash)` | Token valido → nuovo hash (formato `pbkdf2$…` obbligatorio), token cancellato. |
| `change_password(p_nickname, p_old_hash, p_new_hash)` | Esige **sempre** la vecchia credenziale: un `p_old_hash` nullo è sempre rifiutato. Oggi il cambio password dal profilo fa `upsert` senza chiedere la vecchia: un `session_id` bastava a sovrascrivere l'hash di un altro. Una credenziale sbagliata **conta come un login fallito** (per l'email del profilo con quel nickname e per l'IP) e oltre il tetto si risponde `troppi_tentativi` prima ancora di confrontare: senza, la funzione sarebbe un modo per provare password senza limiti (decisione del 28/09). |
| `update_my_profile(p_nickname, p_password_hash, p_fields jsonb)` | Modifica solo i campi pubblici elencati sopra (whitelist), mai email, hash, nickname o `session_id`. Sostituisce `saveProfile`, l'update di `show_telepathy_score` e gli update di `telepathy_score/best` dopo training e fusione ospite. Credenziale sbagliata: stesso conteggio e stesso tetto di `change_password`. |
| `get_telepathy_leaderboard(p_limit)` | Primi N (massimo 50) per `matches_count`: nickname, `rounds_count`, `matches_count`. **Niente `user_id`**, che per gli iscritti è l'email. Sostituisce il `select('*')` della classifica (`src/app.jsx:961`). |
| `get_my_telepathy_totals(p_user_id, p_password_hash)` | `rounds_count`, `matches_count` di una riga. Se `p_user_id` è l'email di un account registrato serve la sua credenziale; per gli ospiti (`user_id` = `session_id`) basta l'id, come oggi. Sostituisce le letture dirette `eq('user_id', …)` (`src/app.jsx:1333`, `2788`). |
| `merge_telepathy_scores(p_old_user_id, p_new_user_id, p_nickname, p_password_hash)` | **Ridefinita**: la definizione in uso esiste solo nel catalogo, va ripresa da lì nella migration e le si aggiunge la verifica che `p_password_hash` sia la credenziale dell'account `p_new_user_id`, e che `p_old_user_id` **non** sia l'email di un account registrato (si fondono solo righe d'ospite). Il nickname scritto è quello del profilo, non quello passato. Oggi chiunque può riversare punteggi su qualunque email, o svuotare la riga di un altro usandola come «vecchia». La firma vecchia si toglie nella 27. |

Gli **ospiti non hanno riga in `profiles`** e non chiamano le RPC d'account.

### 4.2 Edge Function `send-account-email`

- Input `{tipo:'reset'|'magic', email, locale}`. **Nessun `appUrl` dal chiamante**: il link punta
  sempre a `https://global-awakening.github.io/app.html`. Un `appUrl` libero trasformerebbe la
  funzione in una macchina da phishing con token veri.
- Genera il token con `crypto.randomUUID()` sul server, lo salva con la chiave di servizio
  (15 minuti di validità, come oggi) e manda l'email via EmailJS REST (`accessToken` =
  `EMAILJS_PRIVATE_KEY`), con gli **stessi template** di oggi, `template_i5i06pl` (reset) e
  `template_gy8gdkg` (link d'accesso), e l'URL costruito **dalla funzione** sulla base fissa.
  Oggi chiave pubblica e id dei template sono nel codice: chiunque può già spedire email
  «ufficiali» dell'app con un link proprio. **Rimedio: obbligo della chiave privata** sull'account
  EmailJS (passo di Irene, §6). Da quel momento accetta solo chiamate firmate, e le fanno soltanto
  le nostre funzioni. *Modifica del 28/09 al rilievo 4:* i template **non** si cambiano per
  ricevere il solo token, perché `template_gy8gdkg` è condiviso con `alert-cron`, che ci mette il
  link alla dashboard. Con la chiave privata obbligatoria il template con URL libero non è più
  raggiungibile da fuori.
- La creazione del token e i tetti stanno in una RPC `crea_token_account(p_tipo, p_email)`
  eseguibile **solo** dal ruolo di servizio (`REVOKE` da `PUBLIC`, `anon`, `authenticated`), con lo
  storico in `account_email_log` (RLS senza policy). La funzione Edge resta sottile.
- Email non registrata → stessa risposta, nessuna email.
- **Tetti**: per email 1 richiesta al minuto, 5 all'ora e **3 al giorno**; globali 30 all'ora e
  **40 al giorno**. Proteggono chi riceve (nessun bombardamento di email) e la quota di EmailJS.
  *Aggiunta del 28/09, i tetti giornalieri:* la quota gratuita di EmailJS è piccola (da verificare
  con Irene), e siccome la registrazione non verifica l'email chiunque può iscrivere indirizzi di
  sconosciuti e farci spedire posta a loro. Il tetto orario da solo lascerebbe passare 120 email al
  giorno per indirizzo. Lo storico si tiene due giorni, così la pulizia non tocca righe ancora
  contate. Se i tetti si rivelano stretti si alzano con una riga.
- Versioni `npm:` fissate.

### 4.3 App (`src/app.jsx`)

Ogni punto che tocca le tre tabelle passa dalla RPC corrispondente:

| Punto (oggi) | Diventa |
|---|---|
| `handleLogin` (~r. 1714): `select('*')` per email + confronto nel browser | `get_login_params` → hash PBKDF2 con quel sale **e** hash SHA-256 vecchio → `login_with_password` con entrambi |
| `handleRegister` (~r. 1818–1849): controlli e insert diretti | `register_account` |
| `handleSendResetEmail` (~r. 1905): token nel browser + EmailJS | `send-account-email` tipo `reset` |
| `handleSetNewPassword` (~r. 1931): lettura token + update hash | `reset_password` |
| `handleSendMagicLink` (~r. 1978): controllo email + token + EmailJS | `send-account-email` tipo `magic` |
| `loginWithMagicToken` (~r. 2014): lettura token + profilo con hash | `consume_magic_link` |
| `loadProfile` (~r. 2680), `openProfile` (~r. 2845): `select('*')` | `select` con le **sole colonne pubbliche** |
| `saveProfile` (~r. 2725), `show_telepathy_score` (~r. 4843) | `update_my_profile` |
| Stats dopo training e fusione ospite (~r. 1787, 1888, 2056, 2796) | `update_my_profile` |
| Classifica (r. 961): `telepathy_scores.select('*')` | `get_telepathy_leaderboard` |
| Totali propri (r. 1333, 2788): `telepathy_scores` per `user_id` | `get_my_telepathy_totals` |
| `mergeGuestTelepathyData` (r. 1675) | `merge_telepathy_scores` con la credenziale |
| Cambio password dal profilo (~r. 5001) | `change_password` |

Nessun `RAISE` da interpretare lato app per il login: l'app legge `ok`/`motivo` e mostra
«credenziali non valide» o «troppi tentativi, riprova tra qualche minuto».

Il client EmailJS resta caricato nell'app solo se serve ad altro; se non serve più si toglie dalla
CSP e dal precache del service worker.

### 4.4 Migration `27_chiudi_tabelle_account.sql` — la chiusura

Si applica **solo dopo** che l'app nuova è pubblicata (§6).

- `profiles`: `DROP POLICY "Allow all"`; policy di sola `SELECT` `USING (true)`;
  `REVOKE ALL … FROM PUBLIC, anon, authenticated`; `GRANT SELECT (<colonne pubbliche>) … TO anon, authenticated`.
- `magic_links`, `password_resets`: `ENABLE ROW LEVEL SECURITY`, nessuna policy,
  `REVOKE ALL … FROM PUBLIC, anon, authenticated`.
- Si svuotano `magic_links` e `password_resets`: ogni token creato finora può essere stato scritto
  o letto da chiunque.
- `telepathy_scores`: `REVOKE SELECT` da `anon`/`authenticated` e `GRANT SELECT` sulle sole
  colonne senza `user_id` (le scritture passano già da RPC `SECURITY DEFINER`; le policy di
  scrittura esistenti vanno lette dal catalogo in fase di piano e chiuse se aperte).
- `login_attempts`, `app_secrets`: si ribadisce `REVOKE ALL` (già nella 26).
- `DROP FUNCTION` della vecchia firma di `merge_telepathy_scores` (senza credenziale).
- `NOTIFY pgrst, 'reload schema'`.
- Tutto dentro `BEGIN; … COMMIT;`: o si chiude tutto o niente (il `NOTIFY` parte al commit).

Il keepalive (`.github/workflows/keep-supabase-awake.yml`) legge `profiles?select=session_id`:
colonna pubblica, continua a funzionare. Va verificato dopo la chiusura.

### 4.5 Pulizia

- Le Edge Function `send-reset-email` e `send-magic-link` non sono chiamate dall'app (usano Resend
  e accettano un `appUrl` dal chiamante). Se sono pubblicate su Supabase sono un rischio di phishing
  a sé: **si verifica se lo sono e si tolgono**, dal progetto e dal repo. *Stato al 28/09:* sono
  pubblicate; tolte dal repo (cartelle e sezione di `supabase/config.toml`). Dal progetto Supabase
  le toglie solo il via di Irene, prima della 27 (§6).
- Nessuna chiave Resend va lasciata nei segreti se non la usa più nessuno.

## 5. Casi limite

| Caso | Comportamento |
|---|---|
| Account con hash SHA-256 vecchio | Entra con `login_with_password` (confronto su `p_legacy_hash`), esce migrato a PBKDF2. |
| Account senza `password_hash` (creato da flussi vecchi) | Non può entrare con password. Col link via email `consume_magic_link` gli crea una credenziale casuale, quindi da lì resta dentro; per avere una password vera usa «password dimenticata». Quanti sono: conteggio dal catalogo in fase di piano, non dati. |
| Troppi tentativi di login (per email, per IP o globali) | «Troppi tentativi, riprova tra qualche minuto». |
| PWA vecchia in cache dopo la chiusura | Fallisce **in silenzio** in più punti, non solo al login: il login dà errore; il cambio password e il salvataggio del profilo mostrano «fatto» perché l'app vecchia non controlla l'errore dell'update, ma il server non ha scritto niente; la classifica resta vuota. Chi è **già** dentro resta dentro: la credenziale è in `localStorage` e le RPC esistenti la accettano. Il rischio vero è il cambio password «fantasma»: la persona crede di avere la password nuova e ha ancora la vecchia. Per questo tra rilascio dell'app e chiusura passano **più giorni** (§6), non dieci minuti. |
| Token di link creato prima del rilascio | Svuotato dalla 27: si richiede un link nuovo. |
| Email non registrata su «link» / «reset» | Stesso messaggio di successo, nessuna email. |

## 6. Rilascio, in quest'ordine

*Riscritto il 28/09 dopo la review finale del ramo.*

1. Applicare **26** (additiva) e pubblicare `send-account-email`. *Fatto il 28/09.*
2. Test RPC contro il database vero.
3. **Passo di Irene su EmailJS** (guidato un gesto alla volta): in Account → Security attivare
   l'obbligo della chiave privata per le chiamate API. Da fare **subito dopo** il deploy del
   punto 4: da quel momento l'app vecchia non spedisce più email (nessun danno: le sue email
   avrebbero un link che la 27 invaliderà comunque). Subito dopo si riprova `alert-cron` e un
   «password dimenticata» vero.
4. PR, merge (lo lancia Irene), deploy di GitHub Pages.
5. Aspettare il `max-age=600` e provare login, registrazione, link e reset **su Chrome**, non
   sulla PWA installata (lezione del 22/09).
6. **Breve attesa, indicativamente 24 ore; decide Irene.** Basta poco: il service worker serve
   `app.html` e `app.js` dalla rete prima che dalla cache, quindi una PWA installata prende la
   versione nuova al primo caricamento vero; e gli account iscritti da avvisare sono solo 5. Il buco
   resta aperto in quelle ore.
7. **Prima della 27, con il via di Irene:** togliere dal progetto Supabase le funzioni morte
   `send-magic-link` e `send-reset-email` (§4.5). Sono ancora pubblicate e scrivono in
   `magic_links`/`password_resets` con la chiave di servizio: lasciate lì aggirerebbero la chiusura.
8. **Con il via di Irene:** applicare **27** (chiusura) e **27b** (rotazione delle credenziali,
   §8) insieme, e scrivere agli iscritti: la password di prima non funziona più, si rientra con
   «entra con un link» e se ne sceglie una nuova con «password dimenticata». Poi ripetere le prove,
   più le verifiche negative con la chiave pubblica (`node test-account-rpc.js --dopo-chiusura`).
9. Controllare il keepalive e la chiave Resend nei segreti (§4.5).

## 7. Test

- **`test-account-rpc.js`** (database vero, dati di test ripuliti): ogni RPC nei casi validi e in
  quelli di rifiuto (hash sbagliato, token scaduto, token riusato, email in uso, nickname in uso,
  formato hash errato, tetto per email, per IP e globale — e che il tetto **conti davvero** dopo
  un rifiuto, cioè che la riga in `login_attempts` sopravviva —, campi fuori whitelist in
  `update_my_profile`, `change_password` con vecchio hash nullo, `merge_telepathy_scores` con
  credenziale sbagliata); `get_login_params` identico nella forma per account PBKDF2, account
  vecchio ed email sconosciuta, e stabile tra due chiamate; migrazione legacy; link d'accesso su
  account senza hash che restituisce una credenziale; classifica senza `user_id`.
- **Verifiche negative dopo la 27**, nello stesso file ma dietro un flag, perché prima della
  chiusura falliscono per costruzione: con la chiave pubblica `password_hash`/`email` non si
  leggono, `profiles`/`magic_links`/`password_resets` non si scrivono.
- **Fixture dei test**: 5 file creano utenti con insert diretti in `profiles`; altri fanno letture
  di `email`/`password_hash`, o `DELETE` dirette di pulizia, che dopo la 27 si rompono lo stesso.
  L'elenco esatto si fa con una ricerca nel piano. Si aggiunge a `test-helpers.js` un
  `createTestAccount` / `deleteTestAccount` che usa la chiave di servizio, e tutti passano da lì.
  `getServiceKey` può tornare `null`: in quel caso i test **si fermano subito con un errore
  esplicito**, non passano per assenza di controlli.
- **Regressione**: `test-auth.js`, `test-magic-link-bug.js`, `test-reset-password*.js`,
  `test-merge-guest.js`, `test-messaggi.js`, `test-moderazione*.js`, `test-account-gdpr.js`,
  `test-telepathy-stats.js`, `test-ospite-identita.js`, e il resto della suite. **Baseline misurata
  prima di toccare il codice.**
- **Non automatizzabile**: l'arrivo vero delle email. Si prova dal vivo (§6.4).

## 8. Da decidere fuori dal codice

**Le email di tutti gli iscritti sono state leggibili da chiunque**, e con loro gli hash delle
password, da quando esiste la policy `Allow all`. Non sappiamo se qualcuno le abbia lette: i log
di Supabase del piano gratuito non vanno abbastanza indietro per dirlo. Se una violazione di dati
personali va notificata al Garante, di norma entro 72 ore dalla scoperta, è una valutazione da
fare con chi se ne occupa: **non la decide questo lavoro**, ma la data della scoperta è questa,
25/09/2026 (le 72 ore sono scadute il 28/09; segnalato a Irene lo stesso giorno).

Consigliabile, a rimedio pubblicato: chiedere a chi ha un account di **cambiare la password**,
e a chi la usa anche altrove di cambiarla anche lì.

**Gli hash già esposti restano validi finché non si ruotano.** La 27 impedisce di leggerli da ora
in poi, ma l'hash è la credenziale: chi l'ha copiato prima continua a entrare nelle RPC. Per gli
account vecchi (SHA-256) conoscere quell'hash basta anche per fare il login e scegliersi l'hash
nuovo. Per questo c'è `27b_ruota_credenziali.sql` (non applicata): azzera la credenziale di tutti
gli iscritti e svuota i link in giro. Si applica solo con il via di Irene, insieme alla 27 o subito
dopo, e dopo aver scritto agli iscritti (§6 punto 8).

## 9. Fuori scope

- Il modello d'identità degli ospiti (un `session_id` non è un segreto): già scritto nelle spec del
  21/09 e degli inviti.
- Le altre tabelle aperte (`notifications`, `online_users`, `telepathy_matches`,
  `telepathy_invites`): dopo. `telepathy_invites` la chiude la spec degli inviti.
- Sostituire la credenziale `password_hash` con token di sessione veri (Supabase Auth): è la
  soluzione a lungo termine, non l'intervento di oggi.
- La credenziale in `localStorage` (esposta in caso di XSS, mitigato dalla CSP stretta).
- **Rischio accettato (28/09): le RPC più vecchie verificano la credenziale senza tetto.** Quelle
  di messaggi e GDPR (05_/06_) e `merge_telepathy_scores` confrontano l'hash ma non contano i
  falliti. Chi conosce email e nickname di qualcuno ha anche il sale (`get_login_params` lo dà a
  tutti), quindi può provare password contro quelle RPC frenato solo dal costo di PBKDF2 (100k
  iterazioni per tentativo, sul suo computer). `change_password` e `update_my_profile` invece ora
  contano i falliti (§4.1). Estendere il tetto alle RPC vecchie vuol dire riscriverle: dopo.
