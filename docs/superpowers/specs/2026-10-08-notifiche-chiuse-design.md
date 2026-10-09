# Notifiche chiuse — design

Data: 2026-10-08 · Ramo: `feat/notifiche-chiuse` · Migration: `35a_notifiche_server.sql` (additiva) e `35b_chiudi_notifiche.sql` (chiusura), ognuna col suo `_ritorno`
Scelta di Irene (08/10): «chiudere bene» invece del solo filtro lato client.

## Problema

- `notifications` ha RLS accesa ma una policy `allow all` (`true`/`true`) e tutti i privilegi a `anon`.
  Con la chiave pubblica, che è dentro `app.js`, chiunque può:
  - leggere le notifiche di chiunque;
  - crearne con testo libero a nome di chiunque;
  - segnarle come lette o cancellarle.
- Tre notifiche nascono dal telefono, con un insert diretto e un testo scritto dal client:
  - `ritual_join` (`app.jsx:4661`)
  - `ritual_comment` (`:4953`)
  - `comment` (`:5015`)
- La notifica non registra chi l'ha mandata, quindi i blocchi non si possono applicare. Solo
  `private_message` e `telepathy_invite` passano dal controllo blocchi; `telepathy_declined` (32a:628) no.
- Mappa e lista Community (`app.jsx:5922`, `:5952`) mostrano anche le persone bloccate.

## Obiettivo

1. Nessuno legge, crea, modifica o cancella notifiche altrui senza passare dal server.
2. Ogni notifica nasce sul server, da un fatto verificato, con un testo scritto dal server.
3. Una notifica fra due persone non arriva se una delle due ha bloccato l'altra (in tutti e due i
   sensi), anche se il blocco è venuto dopo.
4. Mappa e Community nascondono chi ho bloccato, come la telepatia.

## Identità (regola unica)

Il chiamante passa `(p_session_id, p_password_hash, p_nickname)`.

- **Registrato:** esiste `profiles` con `session_id = p_session_id`. Serve
  `password_hash = p_password_hash`; il nickname «mio» è `profiles.nickname`, mai quello passato.
- **Ospite:** non ha profilo. Vale `telepatia_verifica_identita`: il `session_id` è l'unica prova
  (rischio accettato, stesso di 32a §6). Il nickname «mio» è `nome_pubblico(sid, p_nickname)`.
- Nuovo helper `notifica_chi_sono(sid, hash, nick) RETURNS text` (nickname effettivo), revocato ad
  anon. Riusa `telepatia_verifica_identita` e `nome_pubblico`: niente copie della regola.

## Dati

`notifications`, colonne nuove (nullable, i dati esistenti restano). Solo dati che non sono
credenziali:

- `sender_nickname text`: il nome di chi la manda (null per le notifiche di sistema);
- `oggetto text`: l'id del rituale o del post, serve solo all'anti-raffica di `notify_event`.

Indice su `(user_nickname) WHERE read = false`.

**I `session_id` non stanno mai in `notifications`.** Per un ospite il `session_id` è l'unica
credenziale, e `notifications` resta leggibile da chiunque fino alla 35b (e di nuovo con
`35b_ritorno`). I telefoni stanno nella tabella privata nuova, creata già nella 35a:

`notifiche_instradamento(notifica_id uuid PK → notifications(id) ON DELETE CASCADE,
recipient_session_id text, sender_session_id text)`: il telefono destinatario e quello di chi
la manda. RLS accesa, nessuna policy, nessun privilegio a `PUBLIC`, `anon`, `authenticated`.
Indice su `(recipient_session_id)`. Le notifiche vecchie, solo per nickname, non hanno righe qui.
La leggono e la scrivono solo le funzioni `SECURITY DEFINER` sotto.

Tabella nuova `consciousness_post_autori(post_id uuid PK → consciousness_posts ON DELETE CASCADE,
session_id text NOT NULL, created_at)`. RLS accesa, nessuna policy, nessun privilegio ad anon.
Serve solo a sapere a quale telefono notificare i commenti ai post degli ospiti (oggi tutti i 14
post sono di ospiti). Il `session_id` non deve finire in una tabella leggibile:
`consciousness_posts` lo è.

## Chiusura (solo in 35b)

Ordine di rilascio, come 32a/32b: 35a si applica prima ed è compatibile con l'app vecchia; poi merge e deploy dell'app; dopo ~10 minuti (cache `max-age=600`) si applica 35b.

- `DROP POLICY "allow all" ON notifications`;
- `REVOKE ALL ON notifications FROM anon, authenticated`.

L'unico accesso è dalle funzioni `SECURITY DEFINER` sotto.

## Funzioni (tutte SECURITY DEFINER, `search_path = public, pg_temp`, GRANT ad anon solo le pubbliche)

**Lettura — `get_my_notifications(sid, hash, nick) RETURNS TABLE(id, user_nickname, type, message, read, created_at, sender_nickname)`**
- Colonne elencate una per una, non `notifications.*`: nessun `session_id` né `oggetto` esce,
  nemmeno se un domani la tabella cresce.
- Restituisce le notifiche non lette il cui instradamento ha `recipient_session_id = sid`, più
  (solo per i registrati) quelle senza telefono destinatario con `user_nickname = <nickname del
  profilo>`, per le notifiche vecchie.
- Esclude quelle il cui mittente è bloccato in uno dei due sensi: `user_blocks` per nickname e
  `telepathy_invite_blocks` per session.
- Le esclude soltanto: non le cancella, così uno sblocco le fa ricomparire, come in `get_my_messages`.
- Ordinate per `created_at desc`, limite 100.

**Segna letta — `mark_my_notification_read(id, sid, hash, nick) RETURNS boolean`**
- `UPDATE … SET read = true` solo se la riga appartiene al chiamante, con lo stesso criterio della
  lettura.

**Creazione da fatto verificato — `notify_event(sid, hash, nick, p_tipo text, p_oggetto uuid) RETURNS jsonb`**

Il server trova il destinatario, controlla il fatto, scrive il testo (stessi testi italiani di oggi).

| `p_tipo` | fatto verificato | destinatario |
|---|---|---|
| `ritual_join` | `sid` in `rituals.participants` del rituale | `rituals.creator` / `creator_id` |
| `ritual_comment` | esiste un `ritual_comments` del mio nickname su quel rituale, negli ultimi 10 min | creatore del rituale |
| `comment` | esiste un `consciousness_comments` del mio nickname su quel post, negli ultimi 10 min | `author_nickname` del post; telefono da `consciousness_post_autori`, o dal profilo se è registrato |

Regole comuni:
- niente notifica a me stesso;
- niente notifica se uno dei due ha bloccato l'altro;
- al massimo una notifica identica (tipo + oggetto + mittente → destinatario) ogni 10 minuti,
  così rientrare e uscire più volte da un rituale non manda raffiche. «Stesso mittente» vuol dire
  stesso nickname effettivo oppure stesso `session_id` (letto da `notifiche_instradamento`);
- al massimo 3 notifiche in 10 minuti per destinatario + tipo + oggetto, da chiunque.

Restituisce `{ok, inviata, motivo}`. Un rifiuto non è un errore per l'app: lo ignora.

**Autore del post — `register_my_post(post_id, sid, hash, nick) RETURNS boolean`**
- Inserisce in `consciousness_post_autori` solo se il post ha `author_nickname` = il mio nickname
  effettivo, è stato creato negli ultimi 5 minuti e non ha già un autore.
- L'app la chiama subito dopo l'insert del post.

**Funzioni server già esistenti che scrivono notifiche**
- `send_private_message`, `send_telepathy_invite` e `respond_telepathy_invite`: ridefinite per
  riempire `sender_nickname` e scrivere la riga di `notifiche_instradamento` con i due telefoni.
- `respond_telepathy_invite` (declined) non crea la notifica se c'è un blocco.

Ridefinirle vuol dire copiarle per intero dall'ultima versione applicata: va presa dal DB con
`pg_get_functiondef`, non dal file più recente.

**Cancellazione ed export account**
- `delete_my_account` cancella le notifiche ricevute (per nickname e per `recipient_session_id`)
  e anche quelle **mandate** (per `sender_session_id` o `sender_nickname`): non le anonimizza,
  perché un mittente anonimizzato non è più riconoscibile come bloccato e a chi lo aveva bloccato
  ricomparirebbero le notifiche che il blocco nascondeva. Cancella anche le righe di
  `consciousness_post_autori` del proprio `session_id`. L'instradamento va via a cascata.
- `export_my_account` esporta anche le notifiche per `recipient_session_id` (letto da
  `notifiche_instradamento`); l'export non contiene `session_id` altrui.

## App (`src/app.jsx` → `node build.js`)

- Il polling delle notifiche (`:4279`) passa a `get_my_notifications`.
- Il PATCH di «segna letta» (`:4290`) passa a `mark_my_notification_read`.
- I tre insert diretti diventano `notify_event`. L'errore va ignorato in silenzio, come oggi.
- Dopo l'insert di un post l'app chiama `register_my_post`.
- `onlineUsers` filtrati con `isBlocked` per la mappa (`:5922`) e la lista Community (`:5952`).
  Il contatore (`:5514`) resta il totale: è un numero, non mostra persone.

## Prove

- **SQL locale (PGlite, `scripts/pg-locale.js`)**, nuovo `test-notifiche-chiuse-sql.js`:
  - anon non può fare SELECT, INSERT, UPDATE o DELETE su `notifications`;
  - ognuno legge e segna solo le proprie (registrato con hash giusto e sbagliato, ospite con il suo
    sid e con quello di un altro);
  - `notify_event`, per ciascun tipo: fatto vero → inviata; fatto falso → rifiutata; autonotifica;
    blocco in un senso e nell'altro; raffica entro 10 min;
  - `register_my_post` rifiuta i post altrui o vecchi;
  - declined con blocco → niente notifica;
  - 35a e 35b sono idempotenti e i due `_ritorno` riportano a prima.
- **DB vero**, dopo l'applicazione: lo stesso controllo dei privilegi via REST con la chiave anon,
  che dev'essere respinto.
- **UI**: `test-inviti-telepatia.js` (campanella, rifiuto), `test-moderazione-ui.js` e i test
  rituali e commenti, tutti verdi.
- **Test che oggi usano la chiave anon su `notifications`** e vanno portati a `purge()` o alla
  chiave di servizio: `test-account-gdpr.js:64`, `test-moderazione.js:68-69`,
  `test-inviti-telepatia.js:75-76,367`.
- **Revisione indipendente** prima del merge.

## Criteri di «fatto»

1. 35a e 35b applicate. Con la chiave anon, SELECT, INSERT, PATCH e DELETE su `/rest/v1/notifications`
   sono respinti.
2. `test-notifiche-chiuse-sql.js` è verde.
3. Le prove UI sopra sono verdi, contro il ramo servito in locale.
4. Il sito pubblicato (`app.js` = main) mostra la campanella che funziona, provata con due account
   di prova sul sito vero.
5. Revisione indipendente senza rilievi aperti.

## Fuori scope (di proposito)

- **Scritture false nelle presenze (`online_users`, anch'essa `allow all`).** È un lavoro a parte.
- **Gli identificativi dei telefoni pubblici in `rituals.creator_id` e `rituals.participants`.**
  Per un ospite che crea un rituale o vi partecipa, il `session_id` è leggibile da chiunque, e con
  esso le sue notifiche. Il limite c'era già prima (vale anche per gli inviti di telepatia): va
  chiuso in un lavoro successivo. Qui lo dichiariamo e basta.
- Il modo in cui entrano gli ospiti e i nickname duplicati.
- La traduzione dei testi delle notifiche: restano in italiano come oggi.

## Effetti visibili

- **Notifiche vecchie degli ospiti.** Le notifiche non lette degli ospiti create prima di oggi non
  hanno un telefono associato e non compaiono più (534 delle 558 attuali sono di nickname senza
  profilo, quasi tutte righe di prova).
- **Finestra fra 35a e 35b.** La 35b si applica circa 10 minuti dopo il deploy dell'app (cache
  `max-age=600`). In quella finestra `notifications` è ancora leggibile, ma non contiene
  credenziali: i `session_id` stanno in `notifiche_instradamento`, chiusa dalla 35a.
- **Ritorno indietro.** `35b_ritorno.sql` riapre `notifications` com'era (policy e i sette
  privilegi del catalogo, non `GRANT ALL`). Le colonne nuove rimaste, `sender_nickname` e
  `oggetto`, sono innocue: nessuna credenziale. `notifiche_instradamento` resta chiusa.
  `35a_ritorno.sql` ripristina prima le cinque funzioni, poi toglie `notifiche_instradamento`,
  `consciousness_post_autori` e le due colonne.
