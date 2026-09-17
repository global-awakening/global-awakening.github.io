# SP1 — Moderazione: segnalazione contenuti e blocco utenti · Design

Data: 2026-09-17
Stato: in revisione
Contesto: sotto-progetto 1 di `2026-09-17-distribuzione-play-store-roadmap.md`

## Obiettivo

Dotare Global Awakening dei due meccanismi che Google Play richiede a ogni app con
contenuti generati dagli utenti e interazione fra utenti:

1. **Segnalare** un contenuto o un utente, dall'interno dell'app;
2. **Bloccare** un altro utente, con effetto immediato su ciò che si vede e si riceve.

Più il contorno che rende la cosa credibile in fase di revisione: un regolamento
contenuti pubblico e un canale che porti le segnalazioni sotto gli occhi di chi
gestisce l'app.

Senza questo, la pubblicazione viene rifiutata: è uno dei motivi di rifiuto più
frequenti per le app sociali.

## Contesto / modello dati esistente

L'identità logica dell'utente è il **`nickname`** (testo), usato come chiave in
tutte le tabelle di contenuto. Gli **ospiti non hanno riga `profiles`**, quindi non
hanno credenziale: la moderazione è riservata agli **account registrati**,
coerentemente con Step B dei messaggi privati e con le RPC GDPR.

Credenziale: `profiles.password_hash` (PBKDF2 `pbkdf2$iter$salt$hash`, con path legacy
SHA-256 migrato al login). Il client tiene `passwordHash` in state + `localStorage.ga_pwhash`
e lo passa alle RPC come `p_password_hash`. Stesso meccanismo di `get_my_messages`,
`export_my_account`, `delete_my_account`.

Superfici UGC da coprire:

| Superficie | Tabella | Lettura | Scrittura |
|---|---|---|---|
| Feed coscienza — post | `consciousness_posts` | SELECT diretta | INSERT diretta |
| Feed coscienza — commenti | `consciousness_comments` | SELECT diretta | INSERT diretta |
| Rituali | `rituals` | SELECT diretta | RPC `create_ritual` |
| Commenti rituali | `ritual_comments` | SELECT diretta | RPC `create_ritual_comment` |
| Messaggi privati | `private_messages` | RPC `get_my_messages` | RPC `send_private_message` (5 param) |
| Chat telepatia | `telepathy_chat` | SELECT diretta | INSERT diretta (effimera: cancellata a fine match) |
| Profilo (nickname, bio) | `profiles` | SELECT diretta | UPDATE diretta |

## Principio di progetto: due livelli di forza, dichiarati

Il blocco ha due nature diverse a seconda della superficie, e la spec lo rende esplicito
invece di far finta che sia tutto uguale:

- **Blocco lato server (vincolante).** Dove il flusso passa da una RPC
  `SECURITY DEFINER`, il blocco è una barriera vera: l'utente bloccato **non riesce**
  a raggiungerti. Vale per i **messaggi privati**.
- **Blocco lato client (di visibilità).** Dove la lettura è una SELECT pubblica
  diretta, il filtro è nel client: il contenuto del bloccato **non ti viene mostrato**.
  Non è una barriera crittografica e non pretende di esserlo — è la semantica "mute"
  dei social. Vale per feed, commenti, rituali, chat telepatia e inviti.

La distinzione è intenzionale: chiudere le SELECT pubbliche del feed è un progetto a sé
(lo stesso percorso Step A/B già fatto sui messaggi) e **non è in scope qui**. Il
comportamento osservabile dall'utente e da chi revisiona Play è comunque corretto.

## Componenti

### 1. Schema — `supabase/sql/16_moderazione.sql`

Nuovo file SQL idempotente, stesso stile dei precedenti (`CREATE OR REPLACE`,
`CREATE TABLE IF NOT EXISTS`, blocchi commentati per la verifica post-apply).

```sql
user_blocks (
  id                uuid primary key default gen_random_uuid(),
  blocker_nickname  text not null,
  blocked_nickname  text not null,
  created_at        timestamptz not null default now(),
  unique (blocker_nickname, blocked_nickname)
)

content_reports (
  id                uuid primary key default gen_random_uuid(),
  reporter_nickname text not null,
  target_nickname   text,           -- autore del contenuto segnalato (null se ignoto)
  content_type      text not null,  -- vincolato da CHECK
  content_id        text,           -- id del contenuto; null se la segnalazione è sull'utente
  content_snapshot  text,           -- copia del testo segnalato al momento della segnalazione
  reason            text not null,  -- vincolato da CHECK
  details           text,           -- testo libero, max 1000 char
  status            text not null default 'open',  -- open | reviewed | actioned | dismissed
  created_at        timestamptz not null default now()
)
```

`content_type` ∈ `post`, `post_comment`, `ritual`, `ritual_comment`, `private_message`,
`telepathy_chat`, `profile`.

`reason` ∈ `spam`, `harassment`, `hate`, `sexual`, `violence`, `self_harm`, `other`.
Categorie esplicite perché Google chiede che la segnalazione sia tipizzata, non un
campo libero.

RLS **ON** su entrambe, **nessuna policy** → nessun accesso diretto anon in lettura o
scrittura. Si passa solo dalle RPC. In particolare `content_reports` non deve essere
leggibile: contiene chi ha segnalato chi.

`content_snapshot` non è ridondanza: la chat telepatia viene **cancellata a fine match**
e qualunque contenuto può essere rimosso dall'autore. Senza la copia del testo, una
segnalazione arriverebbe a moderazione puntando al nulla. Massimo 2000 caratteri,
troncata dalla RPC.

### 2. RPC (`SECURITY DEFINER SET search_path = public`, `GRANT EXECUTE ... TO anon`)

Tutte autenticano `(p_nickname, p_password_hash)` contro `profiles`, altrimenti
`RAISE EXCEPTION 'Auth failed'`.

| RPC | Firma | Comportamento |
|---|---|---|
| `block_user` | `(p_nickname, p_password_hash, p_blocked_nickname)` | INSERT idempotente (`ON CONFLICT DO NOTHING`). Rifiuta l'auto-blocco e il nickname inesistente. |
| `unblock_user` | `(p_nickname, p_password_hash, p_blocked_nickname)` | DELETE della coppia. |
| `get_my_blocks` | `(p_nickname, p_password_hash)` | `SETOF text`: i nickname che ho bloccato. |
| `report_content` | `(p_reporter_nickname, p_password_hash, p_target_nickname, p_content_type, p_content_id, p_content_snapshot, p_reason, p_details)` | Valida i domini di `content_type` e `reason`, tronca `details` a 1000 e `content_snapshot` a 2000 caratteri, INSERT. **Rate limit**: max 20 segnalazioni per `reporter_nickname` nelle ultime 24h, altrimenti `RAISE EXCEPTION 'rate_limited'` (stessa stringa usata da B9). |

Il rate limit riusa **esattamente** il pattern di `13_rate_limit.sql` (B9): nessuna
tabella nuova, si contano le righe già scritte nella finestra usando `created_at`, il
controllo sta **dopo** auth e validazioni (input malformati non consumano budget) e
**prima** dell'INSERT. Serve l'indice `idx_content_reports_reporter_created
(reporter_nickname, created_at)`, coerente con gli altri indici introdotti da B9.

### 3. Blocco applicato lato server (messaggi privati)

Modifica di **due RPC esistenti** dentro `16_moderazione.sql` (`CREATE OR REPLACE`,
nessuna firma cambiata → non breaking):

- `send_private_message` (overload 5 parametri): dopo l'auth del mittente, se esiste
  `user_blocks(blocker = p_receiver_name, blocked = p_sender_name)` →
  `RAISE EXCEPTION 'Blocked by recipient'`. Simmetricamente, se è il mittente ad aver
  bloccato il destinatario → stessa eccezione (non si scrive a chi si è bloccato).
- `get_my_messages`: esclude dall'inbox i messaggi il cui `sender_name` è fra i miei
  bloccati. Lo storico resta nel DB (non si cancella nulla), semplicemente non viene servito.

L'overload 4 parametri di Step A non viene toccato: è legacy e destinato al drop.

> ⚠️ **Trappola da evitare.** La versione a 5 parametri di `send_private_message` in
> produzione **non** è quella di `05_messaggi_step_b.sql`: è stata riscritta da
> `13_rate_limit.sql` (B9), che le ha aggiunto il limite di 20 messaggi al minuto per
> mittente. Il `CREATE OR REPLACE` di `16_` deve partire **dal corpo di `13_`**, non da
> quello di `05_`, altrimenti il rate limit sparisce senza che nessun test lo segnali.
> Stessa cautela per `create_ritual` e `create_ritual_comment` se mai venissero toccate.
> Un test di non-regressione sul rate limit dei messaggi è nella lista sotto (punto 15).

### 4. Blocco applicato lato client

Stato nuovo in `GlobalAwakeningPlatform`: `blockedUsers` (array di nickname), caricato
via `get_my_blocks` al login e dopo ogni blocco/sblocco, con cache in
`localStorage.ga_blocked` per evitare uno sfarfallio al primo render.

Punti di filtro (tutti in lettura, subito dopo il fetch):

- `consciousness_posts` (≈riga 1157) e `consciousness_comments` (≈1161, 2872)
- `rituals` (≈1144) e `ritual_comments` (≈1165, 2814)
- `telepathy_chat` (≈2072)
- inviti telepatia `telepathy_invites` e coda `telepathy_queue`: un invito da un
  bloccato non viene mostrato; in coda, un match proposto con un bloccato viene scartato
  e si torna in attesa.

Per gli ospiti (`isGuest`) `blockedUsers` resta vuoto: nessun filtro, nessun crash.

### 5. UI

**Menu azioni sul contenuto.** Su ogni post, commento, rituale, commento a rituale,
messaggio privato e riga di chat telepatia di **un altro utente**, un pulsante discreto
`⋯` apre un menu con `Segnala` e `Blocca <nickname>`. Mai sui propri contenuti. Per gli
ospiti il menu non compare e al tocco si mostra l'invito a registrarsi (pattern già
usato per i messaggi privati).

**Segnalazione del profilo.** Sulla scheda profilo di un altro utente le stesse due
azioni compaiono come voci esplicite (`Segnala utente`, `Blocca utente`): coprono
nickname e `bio`, che sono UGC a tutti gli effetti e non hanno una riga di contenuto su
cui appoggiare il menu `⋯`. Corrisponde a `content_type = 'profile'`.

**Dialog di segnalazione.** Scelta della motivazione fra le sette categorie (radio),
campo note facoltativo, invio. Alla conferma, messaggio di esito che dice anche cosa
succede dopo ("la segnalazione verrà esaminata entro 48 ore"). Nessun contatore
pubblico, nessuna notifica all'utente segnalato.

**Conferma di blocco.** Dialog che spiega l'effetto in una riga ("non vedrai più i suoi
contenuti e non potrà scriverti"), con azione reversibile.

**Schermata "Utenti bloccati"** dentro il profilo, accanto alle voci GDPR esistenti:
elenco dei bloccati con pulsante Sblocca.

**Link al regolamento** (`regole.html`, SP2) dal dialog di segnalazione e dal profilo.

Tutte le stringhe passano dall'oggetto `translations` esistente, **IT ed EN**.

### 6. Canale di moderazione

> **Aggiornato in implementazione (2026-09-17).** L'ipotesi iniziale — una Edge Function
> che manda l'email — si è rivelata la strada sbagliata: il client Supabase fatto in casa
> non ha `functions.invoke`, nessuna Edge Function viene oggi invocata dal client, e il
> token di automazione è volutamente limitato al solo permesso `Database`, quindi non può
> pubblicarne una. Costruito invece `scripts/segnalazioni.js`: elenca le segnalazioni
> aperte, ne mostra testo e contesto e permette di chiuderle
> (`--chiudi <id> actioned|dismissed|reviewed`). Usa lo stesso token di `apply-sql.js`,
> quindi **nessuna infrastruttura e nessun segreto in più**. Verificato end-to-end.
>
> La **notifica push via email resta possibile senza Edge Function**: EmailJS è già
> caricato nel client e la CSP consente `api.emailjs.com` (lo usano reset password e magic
> link). Serve solo un template nuovo nella dashboard EmailJS — un passo manuale di Irene.
> Non implementato ora per non lasciare in codice un percorso che punta a un template
> inesistente.

Ipotesi originale, conservata come traccia: ogni `report_content` andato a buon fine
invia una notifica email a `global.awakening.app@gmail.com`, con oggetto tipizzato e corpo
contenente tipo, motivazione, id del contenuto e autore.

Scelta deliberata: **nessun pannello admin web**. Una pagina di amministrazione
significa autenticazione privilegiata, una superficie d'attacco nuova e codice da
mantenere, per un volume di segnalazioni che oggi sarà vicino a zero. L'email arriva
subito e la tabella `content_reports` resta la fonte di verità interrogabile. Se il
volume crescerà, il pannello sarà un progetto a sé.

Se l'invio email fallisce, la segnalazione resta comunque salvata: l'email è
best-effort e non deve far fallire la RPC.

## Test

Nuovo `test-moderazione.js`, stile e helper dei test esistenti (`test-helpers.js`),
eseguito contro il progetto Supabase reale come gli altri:

1. `block_user` con hash errato → `Auth failed`
2. `block_user` di sé stessi → errore
3. `block_user` due volte → idempotente, una sola riga
4. `get_my_blocks` ritorna solo i propri blocchi
5. `unblock_user` rimuove la riga
6. `send_private_message` da utente bloccato → `Blocked by recipient`
7. `send_private_message` dopo `unblock_user` → riesce di nuovo
8. `get_my_messages` non restituisce i messaggi di un bloccato
9. `report_content` con `content_type` fuori dominio → errore
10. `report_content` con `reason` fuori dominio → errore
11. `report_content` valida → riga creata con `status = 'open'`
12. 21 segnalazioni in 24h → `rate_limited` alla ventunesima
13. SELECT diretta anon su `content_reports` → 0 righe (RLS senza policy)
14. SELECT diretta anon su `user_blocks` → 0 righe
15. **Non-regressione B9**: 21 messaggi privati in un minuto → `rate_limited` alla
    ventunesima, a conferma che il `CREATE OR REPLACE` di `16_` non ha perso il corpo
    di `13_rate_limit.sql`

I test girano contro il DB reale, quindi ognuno crea i propri account usa-e-getta con
nickname prefissato (`_test_mod_<timestamp>`) e li elimina in coda via
`delete_my_account`, come fanno i test esistenti. Il punto 12 lascia 21 righe in
`content_reports`: vanno rimosse nella pulizia finale, altrimenti inquinano il canale
di moderazione vero.

Più verifica manuale in UI del filtraggio del feed dopo un blocco.

## Criteri di "fatto" (rubric verificabile)

- [ ] `16_moderazione.sql` applicato sul progetto `vxzxdkcluyrcftsnxxza`, rieseguibile senza errori
- [ ] `node build.js` produce `app.js` senza errori
- [ ] `node test-moderazione.js` → 15/15 verdi, output allegato
- [ ] La suite preesistente resta verde (nessuna regressione, in particolare `test-messaggi.js`)
- [ ] Segnalazione e blocco raggiungibili da tutte e sei le superfici (post, commento,
      rituale, commento a rituale, messaggio privato, chat telepatia) più la scheda
      profilo, e assenti sui propri contenuti
- [ ] `content_reports` non contiene righe residue dei test
- [ ] Le stringhe nuove esistono in IT e in EN
- [ ] Review di un sub-agente indipendente sull'intero branch: nessun rilievo aperto
- [ ] Nessuna segnalazione o blocco leggibile via REST anon

## Esito della review indipendente (2026-09-17)

La review ha prodotto otto rilievi. Correzioni applicate in `18_moderazione_review.sql`
e nel client:

| Rilievo | Esito |
|---|---|
| Matchmaking telepatia non escludeva i bloccati (il piano lo chiedeva) | **Corretto.** Sia la coda sia il ramo «qualcuno mi ha già matchato»; in quest'ultimo il match viene chiuso, altrimenti il polling lo riproporrebbe a ogni tick. |
| Conferma di blocco assente, `blockTitle`/`blockConfirm` stringhe morte | **Corretto.** Dialog di conferma prima di bloccare, da menu e da profilo. |
| Menu tagliato dagli `overflow` delle due chat | **Corretto**, e con una causa più profonda di quella segnalata: dentro la card il dropdown restava confinato nel contesto di impilamento della card e finiva **sotto le card successive**. Ora è uno solo, a livello radice, in `position: fixed` con coordinate misurate e ribaltamento verso l'alto a fine schermo. Si chiude con Esc e con un click fuori. |
| Ospiti senza spiegazione | **Corretto.** Il menu compare anche agli ospiti e al tocco mostra l'invito a registrarsi. |
| `block_user` senza rate limit | **Corretto.** 50 blocchi / 24h, pattern B9. |
| `delete_my_account` cancellava i blocchi **subiti** | **Corretto**, ed era il rilievo più importante dopo il primo: cancellarsi e ri-registrarsi con lo stesso nickname era una via d'uscita dal blocco altrui. Ora spariscono solo i blocchi impostati da chi si cancella. |
| Pulizia dei test silenziosamente saltata senza chiave privilegiata | **Corretto.** Ora il test fallisce invece di restare verde lasciando 21 segnalazioni nel DB. |
| `markOneNotifRead` leggeva `private_messages` con una SELECT diretta | **Corretto.** Passa da `get_my_messages`, l'unica via che applica il filtro dei bloccati. |

### Scostamenti deliberati, rispetto a quanto scritto sopra

- **`block_user` NON verifica che il nickname esista in `profiles`**, benché questa spec
  lo chiedesse. Gli **ospiti non hanno riga `profiles` ma possono pubblicare nel feed**
  (`createPost` non ha alcun gate su `isGuest`): quel controllo renderebbe impossibile
  bloccare un ospite molesto, cioè toglierebbe protezione proprio nel caso che ne ha più
  bisogno. Il prezzo è che si può bloccare un nickname scritto male.
- **`get_my_messages` nasconde l'intera conversazione**, non solo i messaggi ricevuti dal
  bloccato. È la semantica di blocco dei social ed è reversibile (lo sblocco fa
  riapparire tutto, nulla viene cancellato), ma va detto: **si perde temporaneamente
  anche il proprio storico** verso quella persona.

### Debito noto, non risolto qui

- Il **pannello notifiche** non filtra i bloccati: il nickname è annegato nel testo
  libero di `notifications.message`, quindi filtrarlo richiede un cambio di schema.
  Effetto: un bloccato che commenta un tuo post genera ancora la riga «Tizio ha
  commentato il tuo post».
- La **lista presenze** (`online_users`) mostra i bloccati come online.
- `test-inviti-telepatia.js` ha **un rosso preesistente** («B non ha ricevuto il secondo
  invito nella campanella»), verificato identico sul client di `main`: **non introdotto da
  questo branch**, da indagare a parte.

## Fuori scope — cosa NON fare

- **Nessun refactor** di `src/app.jsx` (4705 righe monolitiche): si tocca solo il necessario.
- Nessuna chiusura delle SELECT pubbliche di `consciousness_posts` / `rituals` (progetto
  Step A/B a sé, citato nella roadmap ma non qui).
- Nessuna moderazione automatica, filtro parolacce o classificatore.
- Nessun pannello admin web.
- Nessuna moderazione per gli ospiti (serve un account).
- Nessun intervento su assetlinks, privacy policy, TWA o Play Console: sono SP2 e SP3.
- Nessuna notifica all'utente segnalato o bloccato.
