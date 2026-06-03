# Audit di sicurezza — feature Rituali

**Data:** 2026-04-30
**Metodo:** black-box, REST anon key, replica del pattern audit telepatia (#23/#24).
**Stato:** report-only, nessuna modifica al DB applicata. SQL pronti in fondo.

> **AGGIORNAMENTO 2026-06-03 — TUTTE LE VULN CHIUSE.**
> - VULN-1/2/3/5 chiuse da **Rituali Step A** (2026-05-04): drop policy aperte + RPC SECURITY DEFINER, scritture dirette anon negate da RLS.
> - **VULN-4 (impersonazione INSERT) CHIUSA da Rituali Step B** (2026-06-03, SQL `supabase/sql/07_rituali_step_b.sql`): `create_ritual`/`create_ritual_comment` ora validano in modo **condizionale** — se il nickname dichiarato è un account registrato, l'hash deve combaciare (`Auth failed` altrimenti); i guest con nick libero procedono. Firme vecchie senza hash droppate. Test `test-rituali-impersonation.js` 7/7, rituali 18/18, live.

---

## TL;DR

La feature Rituali è **molto più aperta** di quella Telepatia post-fix. Confermati 4 vettori reali sfruttabili con la sola anon key da devtools, di cui 2 critici per vandalismo della community. Pattern remediation = stesso adottato per telepathy_scores il 2026-04-29: drop policy aperte sui write + RPC SECURITY DEFINER. Per ottenere ownership reale serve aggiungere `creator_user_id`/`author_user_id` (FK a `profiles`) e validare via `password_hash` come fa già il login.

---

## Vulnerabilità confermate

Tutti i test eseguiti contro `https://vxzxdkcluyrcftsnxxza.supabase.co` con la anon key pubblicata in `app.html:16`. Ogni "VULN" sotto include la response server.

### VULN-1 · `rituals` DELETE arbitrario · **CRITICA**

**Chi:** chiunque (anon).
**Come:** `DELETE /rest/v1/rituals?id=eq.<X>` con la anon key — riesce qualunque sia il `creator_id`.
**Prova:**
- Inserito ritual con `creator_id='audit-A'`, ID 19.
- DELETE da contesto anon "non-A" → response include `"id":19` con `"Count":1` (Supabase ha cancellato la riga).
- Successivo SELECT `id=eq.19` → `[]`.

**Impatto:** vandalismo. Un visitatore puo' far sparire qualsiasi rituale della community.

### VULN-2 · `rituals` UPDATE arbitrario su tutti i campi · **CRITICA**

**Chi:** chiunque.
**Come:** `PATCH /rest/v1/rituals?id=eq.<X>` con qualsiasi body.
**Prove (3 sotto-vettori):**
1. **Rinomina:** `PATCH … {"name":"PWNED_BY_ANON"}` → server risponde con la riga aggiornata, `name` cambiato.
2. **Sostituisci array partecipanti:** `PATCH … {"participants":["hacker","spam","fake1","fake2","fake3"]}` → riuscito; il campo `participants` di `rituals` (quello effettivamente usato dalla UI per il counter, vedi VULN-5) viene riscritto.
3. **Flood `energy`:** `PATCH … {"energy":999999999}` → riuscito; visualizzato in card.

**Impatto:** vandalismo + falsificazione metriche. Anche `description`, `type`, `date`, `time`, `duration`, `sacred_number` sono modificabili.

### VULN-3 · `ritual_comments` DELETE arbitrario · **ALTA**

**Chi:** chiunque.
**Come:** `DELETE /rest/v1/ritual_comments?id=eq.<X>`.
**Prova:** commento ID 10 (autore "AUDIT_A") cancellato da contesto non-A; response server `"Count":1`. Verificato vuoto al SELECT successivo.

**Impatto:** censura/vandalismo dei thread di commento sui rituali.

### VULN-4 · `ritual_comments` INSERT con impersonation · **MEDIA**

**Chi:** chiunque.
**Come:** `POST /rest/v1/ritual_comments {"ritual_id":<X>,"author_nickname":"<chiunque>","content":"…"}`.
Il server accetta qualsiasi `author_nickname`: nessuna validazione che corrisponda al chiamante (manca proprio il concetto di chiamante perché il client custom non passa JWT).
**Prova:** inserito commento `id=11` con `author_nickname="AUDIT_A"` da contesto non-A, riuscito.

**Impatto:** harassment / esibizione, post a nome di altri utenti. Limitazione: non si vede il timestamp di creazione differenziato e non si possono modificare commenti esistenti, ma si può sempre crearne di nuovi e poi cancellarli (vedi VULN-3).

### VULN-5 · cleanup expired rituals via DELETE client-side · **BASSA**

**Dov'è:** `app.html:1289-1291`.
```js
for (const r of expired) {
  await supabase.from('rituals').delete().eq('id', r.id);
}
```
**Cosa fa:** ogni client che carica `loadData()` (al mount + ogni 10s) calcola lato browser i rituali scaduti e li cancella uno per uno via REST. È sostenibile solo perché `rituals` è write-open (vedi VULN-1).

**Problemi:**
- Pattern fragile: dipende dal write-open. Se appliciamo i fix di VULN-1, questo loop si rompe a meno che non venga sostituito da un'RPC `cleanup_expired_rituals()` SECURITY DEFINER.
- Race: N client cancellano contemporaneamente — innocuo ma sporco.
- Logica `expired` è puramente client-side (basata su `new Date()` locale) → un client con orologio sballato puo' cancellare rituali non scaduti.

### INFO-1 · `ritual_participants` è dead-write (schema mismatch)

Il client (vedi `app.html:2579`) fa `upsert({ ritual_id, session_id })` su `ritual_participants` ma la tabella ha `ritual_id uuid` mentre `rituals.id` è `bigint`. Test diretto: ogni POST risponde `400 {"code":"22P02","message":"invalid input syntax for type uuid: \"22\""}`.

**Conseguenza:** la tabella non riceve mai INSERT validi. La partecipazione effettiva è gestita interamente dall'array `rituals.participants` (vedi VULN-2 sotto-vettore #2). La feature funziona perché il client non controlla l'esito dell'upsert e usa solo l'array.

**Non è una vulnerabilità di sicurezza**, ma è confusione di schema. Tre opzioni: (a) rendere usabile la tabella allineando i tipi, (b) droppare la tabella + togliere la chiamata, (c) lasciare cosi' (no-op silenzioso). Mia raccomandazione: **(b) drop + togli la upsert dal codice**. La verità è già nell'array `participants`.

---

## Cosa è OK / non è vulnerabile

- **SELECT pubbliche** (rituals, ritual_comments, ritual_participants): legittime, la UI le richiede.
- **Insert ritual** (chi e cosa): è ok essere aperto a guest+loggati per consentire la creazione spontanea, ma deve passare per una RPC che _almeno_ pulisce/normalizza `creator_id` e impedisca l'iniezione di campi arbitrari (es. impostare un `created_at` futuro).
- **`telepathy_*`** non sono toccate da questo audit.

---

## Piano di remediation

Tre step indipendenti, applicabili in ordine di priorità.

### Step A · Chiudi il cheat banale via devtools (~30min DB + ~30min client)

Stesso pattern usato il 2026-04-29 per `telepathy_scores`. Drop policy aperte INSERT/UPDATE/DELETE; manteni SELECT pubbliche; tutte le scritture passano per RPC SECURITY DEFINER. Le RPC accettano parametri "at face value" (come `increment_telepathy_score`) — non bloccano un attaccante motivato che chiama l'RPC con parametri inventati, **ma chiudono il vandalismo da devtools** che è il vettore reale.

Limite del pattern: senza JWT, l'RPC non sa chi sta chiamando. Per la **vera ownership** serve Step B.

### Step B · Ownership reale per utenti loggati (~2h)

Aggiungi colonne FK a `profiles` (`creator_user_id`, `author_user_id`). Le RPC di delete/update validano `email + password_hash` (stesso pattern del login del client custom) per recuperare lo `user_id` reale, poi confrontano con la colonna FK. Per guest, niente delete/update — solo create.

### Step C · Sostituisci il cleanup loop client (~20min)

Crea `cleanup_expired_rituals()` SECURITY DEFINER e chiamala 1 volta al `loadData` invece del loop. Idealmente schedulata via Supabase cron o pg_cron, ma anche solo client-triggered è meglio del loop attuale.

---

## SQL pronti — Step A (sicurezza minima)

> ⚠ Eseguire in sessione `psql` connessa al progetto, NON ancora applicato. Verificare con `\dp rituals` lo stato delle policy esistenti prima di droppare.

```sql
-- 1. Pulizia policy aperte (i nomi reali vanno confermati con \dp; questi sono i pattern presunti dal precedente audit telepathy)
ALTER TABLE rituals ENABLE ROW LEVEL SECURITY;
ALTER TABLE ritual_comments ENABLE ROW LEVEL SECURITY;

-- Lista policy esistenti per inventario:
-- SELECT polname, cmd FROM pg_policy p JOIN pg_class c ON p.polrelid = c.oid WHERE c.relname IN ('rituals','ritual_comments');

-- Drop esempio (adattare ai nomi reali):
-- DROP POLICY IF EXISTS "Allow all" ON rituals;
-- DROP POLICY IF EXISTS "anon all" ON rituals;
-- DROP POLICY IF EXISTS "Allow all" ON ritual_comments;

-- 2. Mantieni SELECT pubblica
DROP POLICY IF EXISTS rituals_select_public ON rituals;
CREATE POLICY rituals_select_public ON rituals FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS ritual_comments_select_public ON ritual_comments;
CREATE POLICY ritual_comments_select_public ON ritual_comments FOR SELECT TO anon USING (true);

-- Da qui in poi NESSUNA policy INSERT/UPDATE/DELETE per anon -> bloccato direct-write via REST.

-- 3. RPC create_ritual (anon-callable, signature trustful come increment_telepathy_score)
CREATE OR REPLACE FUNCTION create_ritual(
  p_creator text,
  p_creator_id text,
  p_name text,
  p_description text,
  p_type text,
  p_sacred_number int,
  p_date date,
  p_time time,
  p_duration int
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE v_id bigint;
BEGIN
  INSERT INTO rituals (creator, creator_id, name, description, type, sacred_number, date, time, duration, participants, energy)
  VALUES (p_creator, p_creator_id, p_name, p_description, p_type, p_sacred_number, p_date, p_time, p_duration, ARRAY[p_creator_id], 0)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION create_ritual TO anon;

-- 4. RPC join_ritual / leave_ritual (manipola array participants)
CREATE OR REPLACE FUNCTION join_ritual(p_ritual_id bigint, p_session_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE rituals
     SET participants = array_append(participants, p_session_id)
   WHERE id = p_ritual_id
     AND NOT (p_session_id = ANY(participants));
END;
$$;
GRANT EXECUTE ON FUNCTION join_ritual TO anon;

-- 5. RPC send_energy
CREATE OR REPLACE FUNCTION send_ritual_energy(p_ritual_id bigint, p_amount int DEFAULT 10)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF p_amount < 1 OR p_amount > 100 THEN RAISE EXCEPTION 'energy_out_of_range'; END IF;
  UPDATE rituals SET energy = energy + p_amount WHERE id = p_ritual_id;
END;
$$;
GRANT EXECUTE ON FUNCTION send_ritual_energy TO anon;

-- 6. RPC delete_ritual (Step A: trustful — accetta p_creator_id senza validazione)
CREATE OR REPLACE FUNCTION delete_ritual_unsafe(p_ritual_id bigint, p_creator_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  DELETE FROM rituals WHERE id = p_ritual_id AND creator_id = p_creator_id;
END;
$$;
GRANT EXECUTE ON FUNCTION delete_ritual_unsafe TO anon;
-- ^ NB: questo NON valida che chi chiama sia davvero il creator (un attaccante puo' inserire p_creator_id pescato da SELECT). Step A chiude solo il delete da devtools "facile". Per ownership reale, vedi Step B.

-- 7. RPC create_ritual_comment
CREATE OR REPLACE FUNCTION create_ritual_comment(p_ritual_id bigint, p_author_nickname text, p_content text)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_id bigint;
BEGIN
  IF length(p_content) > 2000 THEN RAISE EXCEPTION 'comment_too_long'; END IF;
  INSERT INTO ritual_comments (ritual_id, author_nickname, content)
  VALUES (p_ritual_id, p_author_nickname, p_content)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION create_ritual_comment TO anon;
-- ^ NB: anche qui p_author_nickname non è validato. Step A non chiude VULN-4.

-- 8. RPC delete_ritual_comment trustful
CREATE OR REPLACE FUNCTION delete_ritual_comment_unsafe(p_comment_id bigint, p_author_nickname text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  DELETE FROM ritual_comments WHERE id = p_comment_id AND author_nickname = p_author_nickname;
END;
$$;
GRANT EXECUTE ON FUNCTION delete_ritual_comment_unsafe TO anon;
```

**Modifiche client (`app.html`) per Step A:**
- `createRitual`: sostituire `supabase.from('rituals').insert(…)` con `supabase.rpc('create_ritual', {…})`.
- `joinRitual`: sostituire `update({participants: …})` + (rimuovi anche `ritual_participants.upsert`, vedi INFO-1) con `supabase.rpc('join_ritual', {p_ritual_id, p_session_id})`.
- `sendEnergy`: sostituire `update({energy: …})` con `supabase.rpc('send_ritual_energy', {p_ritual_id, p_amount: 10})`.
- `loadData`: sostituire il loop `for (const r of expired) await supabase.from('rituals').delete()…` con una sola RPC `cleanup_expired_rituals()` (vedi Step C) — oppure rimuovere e filtrare solo client-side.
- `createRitualComment`: sostituire `insert(…)` con `rpc('create_ritual_comment', {…})`.
- aggiungere bottone delete commento (oggi non c'è) o, se esiste un'azione di delete ritual nella UI, sostituirla con `rpc('delete_ritual_unsafe', {…})`.

---

## SQL pronti — Step B (ownership reale, opzionale)

```sql
-- A. Aggiungi colonne FK
ALTER TABLE rituals ADD COLUMN IF NOT EXISTS creator_user_id uuid REFERENCES profiles(id);
ALTER TABLE ritual_comments ADD COLUMN IF NOT EXISTS author_user_id uuid REFERENCES profiles(id);

-- B. Backfill da nickname (best-effort, solo dove c'è match unico)
UPDATE rituals r SET creator_user_id = p.id
  FROM profiles p WHERE r.creator = p.nickname AND r.creator_user_id IS NULL;
UPDATE ritual_comments c SET author_user_id = p.id
  FROM profiles p WHERE c.author_nickname = p.nickname AND c.author_user_id IS NULL;

-- C. Funzione helper: valida credenziali e ritorna user_id
CREATE OR REPLACE FUNCTION _auth_user_id(p_email text, p_password_hash text)
RETURNS uuid LANGUAGE sql SECURITY DEFINER AS $$
  SELECT id FROM profiles WHERE email = p_email AND password_hash = p_password_hash LIMIT 1;
$$;
REVOKE EXECUTE ON FUNCTION _auth_user_id FROM anon; -- non esporre direttamente

-- D. RPC delete_my_ritual (validata)
CREATE OR REPLACE FUNCTION delete_my_ritual(p_email text, p_password_hash text, p_ritual_id bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_uid uuid;
BEGIN
  v_uid := _auth_user_id(p_email, p_password_hash);
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth_failed'; END IF;
  DELETE FROM rituals WHERE id = p_ritual_id AND creator_user_id = v_uid;
END;
$$;
GRANT EXECUTE ON FUNCTION delete_my_ritual TO anon;

-- E. RPC update_my_ritual (validata, solo campi safe — nome/descrizione)
CREATE OR REPLACE FUNCTION update_my_ritual(p_email text, p_password_hash text, p_ritual_id bigint, p_name text, p_description text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_uid uuid;
BEGIN
  v_uid := _auth_user_id(p_email, p_password_hash);
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth_failed'; END IF;
  UPDATE rituals SET name = p_name, description = p_description
   WHERE id = p_ritual_id AND creator_user_id = v_uid;
END;
$$;
GRANT EXECUTE ON FUNCTION update_my_ritual TO anon;

-- F. RPC delete_my_comment
CREATE OR REPLACE FUNCTION delete_my_ritual_comment(p_email text, p_password_hash text, p_comment_id bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_uid uuid;
BEGIN
  v_uid := _auth_user_id(p_email, p_password_hash);
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth_failed'; END IF;
  DELETE FROM ritual_comments WHERE id = p_comment_id AND author_user_id = v_uid;
END;
$$;
GRANT EXECUTE ON FUNCTION delete_my_ritual_comment TO anon;

-- G. Aggiorna create_ritual / create_ritual_comment per popolare anche le FK
CREATE OR REPLACE FUNCTION create_ritual_v2(
  p_email text, p_password_hash text,
  p_name text, p_description text, p_type text,
  p_sacred_number int, p_date date, p_time time, p_duration int
) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_uid uuid; v_nick text; v_session text; v_id bigint;
BEGIN
  IF p_email IS NOT NULL THEN
    SELECT id, nickname INTO v_uid, v_nick FROM profiles WHERE email = p_email AND password_hash = p_password_hash;
    IF v_uid IS NULL THEN RAISE EXCEPTION 'auth_failed'; END IF;
    v_session := v_uid::text;
  ELSE
    v_uid := NULL; v_nick := 'Anonymous'; v_session := 'guest-' || gen_random_uuid()::text;
  END IF;
  INSERT INTO rituals (creator, creator_id, creator_user_id, name, description, type, sacred_number, date, time, duration, participants, energy)
  VALUES (v_nick, v_session, v_uid, p_name, p_description, p_type, p_sacred_number, p_date, p_time, p_duration, ARRAY[v_session], 0)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION create_ritual_v2 TO anon;
```

---

## SQL pronti — Step C (cleanup)

```sql
CREATE OR REPLACE FUNCTION cleanup_expired_rituals()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_count int;
BEGIN
  WITH expired AS (
    DELETE FROM rituals
     WHERE (date::timestamp + time::interval + (duration || ' minutes')::interval) < now() AT TIME ZONE 'UTC'
     RETURNING id
  )
  SELECT count(*) INTO v_count FROM expired;
  RETURN v_count;
END;
$$;
GRANT EXECUTE ON FUNCTION cleanup_expired_rituals TO anon;
```

E nel client, sostituire il loop `for (const r of expired) …` (`app.html:1289-1291`) con:
```js
await supabase.rpc('cleanup_expired_rituals');
```
(da chiamare 1x al `loadData` o, più pulito, su un timer separato 1×min.)

---

## Pulizia INFO-1 (consigliata, indipendente)

```sql
-- Se confermato che la tabella è dead-write:
DROP TABLE IF EXISTS ritual_participants;
```
E rimuovere `app.html:2579`:
```js
await supabase.from('ritual_participants').upsert({ ritual_id: ritualId, session_id: sessionId });
```

---

## Cosa NON ho fatto (e perché)

- **Non ho applicato nulla al DB.** Memoria utente: "sui fix architetturali pesanti (RLS, RPC, migrations DB) sempre chiedere conferma".
- **Non ho ispezionato `pg_policies`.** Supabase CLI non autenticato in ambiente; servono nomi reali delle policy esistenti per i `DROP POLICY` precisi (le query `\dp rituals` e `\dp ritual_comments` ti diranno cosa droppare).
- **Non ho deciso fra Step A vs A+B.** Decisione tua basata su quanto vale la pena la maggiore complessità di Step B.

## Suggerimento ordine di applicazione

1. **Fai prima un backup logico** (`pg_dump`) di `rituals`, `ritual_comments`, `ritual_participants`.
2. Applica **Step A** (RPC + drop policy) **insieme** alle modifiche client che chiamano le nuove RPC. Test E2E: `node test-rituali.js` deve restare 13/13.
3. Solo se vuoi vera ownership: **Step B** in una sessione separata.
4. **Step C** quando comodo (cleanup), può andare anche da solo.
5. **INFO-1** (drop `ritual_participants`) quando comodo.

E2E test esistente da rilanciare dopo ogni step: `test-rituali.js` (13/13 al baseline corrente).
