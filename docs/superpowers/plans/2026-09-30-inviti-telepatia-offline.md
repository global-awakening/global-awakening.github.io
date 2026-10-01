# Inviti a un training telepatico anche a chi non è collegato — piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** chi ha acceso «Ricevi inviti anche quando non sei collegata/o» compare nella lista «Disponibili su invito»; invitarlo gli manda subito una notifica push, lui la tocca, accetta, e il training parte — con blocchi, tetti e identità controllati dal server.

**Architecture:** tutto passa da RPC `SECURITY DEFINER` (migration `32a`, additiva, con le policy vecchie ancora aperte ma protette da un trigger di guardia; poi `32b` che chiude l'accesso diretto). Le push partono dalla RPC con `pg_net` verso una Edge Function nuova, `notify-telepathy-invite`, che rilegge sempre lo stato dal database. L'app (`src/app.jsx`) smette di scrivere e leggere `telepathy_invites` direttamente; la logica pura nuova sta in file a sé (`inviti-helpers.js`, `push-helpers.js`, `decisioni.mjs`) per poterla provare in Node.

**Tech Stack:** Postgres/Supabase (plpgsql, PostgREST, pg_net, pg_cron), Deno Edge Function (`npm:web-push@3.6.7`, `npm:@supabase/supabase-js@2.116.0`), React in un solo file `src/app.jsx` compilato con `node build.js` in `app.js`, service worker `sw.js`, test in Node + Playwright, PGlite (`@electric-sql/pglite`) per il SQL locale.

**Spec:** `docs/superpowers/specs/2026-09-25-inviti-telepatia-offline-design.md` (terza revisione, commit `d38d760`). Leggerla **prima di ogni task**: è la fonte, il piano la traduce. Dove il piano e la spec divergono vince la spec, e la divergenza va segnalata.

---

## Come è organizzato il lavoro

Quattro rami, quattro PR, nell'ordine di rilascio della spec §8. Ogni ramo nasce da `main` **aggiornato dopo il merge del precedente**. Nessuno nasce da `feat/inviti-telepatia-offline`: quel ramo è vecchio (parte da `996f8c9`) e contiene solo la spec e questo piano, che si portano sul primo ramo nuovo (Task 1).

| Fase | Ramo | Passo spec §8 | Cosa esce |
|---|---|---|---|
| 0 | — | — | Task 1: ramo, catalogo, baseline |
| A | `feat/inviti-offline-passo0` | 0 | `esito.mjs` condiviso, `deploy-push.js --solo`; spec e piano entrano su `main` |
| B | `feat/inviti-offline-motore` | 1 e 2 | Edge Function nuova, `32a` + `32a_ritorno`, test SQL locali, test sul DB vero |
| C | `feat/inviti-offline-app` | 3 | app, `push-helpers.js`, `inviti-helpers.js`, `sw.js` `ga-pwa-v12` |
| D | `feat/inviti-offline-chiusura` | 4 | `32b` + `32b_ritorno`, via il ripiego della tenuta, test vecchi riscritti |

### Chi fa cosa

- **Gli agenti** scrivono codice, test e migration, lanciano i test locali, le **letture** sul database vero (query di sola lettura con `scripts/apply-sql.js`, come fa già `test-push-cron.js`) e i test UI sul DB vero **dopo** che Irene ha applicato la migration che serve.
- **Gli agenti non applicano migration, non pubblicano Edge Function, non mergiano, non pushano.** Push del ramo e apertura della PR le fa il controller (la sessione che coordina), **dopo aver detto a Irene in chiaro** repo, ramo e operazione (regola 8 del CLAUDE.md globale).
- **Irene** fa i passi marcati **🟣 IRENE**, sempre con il prefisso `!` nel prompt di Claude Code (così il comando gira nella sua shell e non passa dal classificatore):
  - migration: `! node scripts/apply-sql.js supabase/sql/<file>.sql`
  - Edge Function: `! node scripts/deploy-push.js --solo <nome-funzione>`
  - merge: `! gh pr merge <N> --merge -R global-awakening/global-awakening.github.io`

### Passi di Irene, in ordine

1. 🟣 (dopo la PR 1) merge PR 1 → controllo del token → pubblicazione `notify-ritual-start` → prova dal vivo di un rituale → 20 minuti senza avvisi della sentinella (Task 3).
2. 🟣 (dopo la PR 2) merge PR 2 → pubblicazione `notify-telepathy-invite` → applicazione `32a` (Task 14).
3. 🟣 (dopo la PR 3) merge PR 3 → attesa ~10 minuti + chiudi e riapri → prova dal vivo con due telefoni (Task 25).
4. 🟣 (almeno un giorno dopo il passo 3, e con zero righe `via_diretta` nelle ultime 24 ore) applicazione `32b` → merge PR 4 (Task 29).

I ritorni indietro (`32a_ritorno.sql`, `32b_ritorno.sql`, ripubblicazione di `notify-ritual-start` dal commit precedente, revert dell'app con `ga-pwa-v13`) sono **scritti e provati in locale, mai applicati** se non serve: li lancia Irene solo su decisione sua.

## Global Constraints

- Ogni comando `node` si lancia muto: `NODE_OPTIONS="--require ./scripts/test-silenzioso.js" node <file>.js` (anche i test che non aprono un browser, anche nei prompt ai sub-agenti).
- Test SQL **prima** su PGlite (`scripts/pg-locale.js`); test sul DB vero e test UI Playwright **solo dopo** che Irene ha applicato la migration relativa.
- Nessuna data fissa legata a `now()`: nei test tutte le date sono relative ad adesso (`now() - interval '…'`, `Date.now() ± …`).
- Server locale per i test UI: `npx serve -l 4321 .` e **verificare** che stampi `Accepting connections at http://localhost:4321`. Su Windows un `serve` rimasto acceso fa aprire in silenzio un'altra porta: se la riga dice un'altra porta, fermare il vecchio (`Get-Process node` / Gestione attività) e ripartire. `TaskStop` non uccide il `node` figlio.
- L'hook pre-commit (`scripts/git-hooks/pre-commit`) rifiuta la parola del ruolo di servizio di Supabase (`service` + `_role` attaccati) in qualunque file, **tranne** le righe `GRANT`/`REVOKE … TO/FROM <ruolo>;` dei `.sql`. Nei `.js` si costruisce a pezzi (`'service' + '_role'`), nei testi si scrive «ruolo di servizio». **In questo piano, dentro i blocchi SQL, è scritto `RUOLO_DI_SERVIZIO`: nel file `.sql` va il nome vero del ruolo, e solo su una riga `GRANT`/`REVOKE`.** Il nome della variabile d'ambiente `SUPABASE_SERVICE_ROLE_KEY` è ammesso dall'hook.
- Blob git senza `\r` per `.sql`, `.js`, `.mjs`, `.ts` (lo garantisce `.gitattributes`; per le migration col cron si verifica: `git show HEAD:<file> | grep -c $'\r'` → `0`).
- `app.js` è generato: dopo ogni modifica a `src/app.jsx` si lancia `node build.js` e si committano entrambi.
- Commenti in italiano, nello stile del file toccato (spiegano il *perché*). **Nessun refactor fuori scope**: niente riscrittura di `telepathy_matches`, `notifications`, `online_users`, `toggle_ritual_candle`, `register_push_subscription` (spec §9).
- Migration idempotenti, in una transazione, chiuse da `NOTIFY pgrst, 'reload schema';`. Testa di ogni migration con i ⚠️ della spec (rilancio della 23_, della 30_/31_).
- Valori fissati dalla spec: invito **45 s** se il destinatario è online (visto negli ultimi **30 s**), **10 minuti** altrimenti; **1** invito aperto per mittente e **1** per destinatario; **10** inviti all'ora per mittente; **6** push d'invito all'ora per destinatario e **1** per coppia ogni **15 minuti**; disponibilità fuori lista dopo **14 giorni** senza aperture, cancellata dopo **90**; training inattivo dopo **10 minuti**; chi accetta aspetta al massimo **3 minuti**; orfani cancellati dopo **5 minuti**; cache `ga-pwa-v12`, `push-helpers.js?v=12`.
- Testi dell'interfaccia: italiano e inglese, come il resto dell'app. Frase accanto all'interruttore, testuale: «Il tuo nome sarà visibile a tutti quelli che usano l'app.»
- Mai `git push`, mai merge, mai `apply-sql.js` su un file che modifica, mai deploy: vedi «Chi fa cosa».

## Review Focus

1. **Orologio del telefono sbagliato di qualche minuto.** Chi invita vede il conto alla rovescia giusto e chi accetta esce dall'attesa a 3 minuti veri, perché tutto si calcola da `adesso` del server → test in `test-inviti-helpers.js` (Task 17: telefono avanti di 5 minuti).
2. **Notifica toccata con l'app già aperta ma bloccata o vecchia.** Se la finestra non conferma entro ~1 s, il service worker ricarica la pagina sull'invito invece di non fare niente → test in `test-sw-inviti.js` (Task 16: finestra che non risponde).
3. **Stessa persona con due telefoni** (o due schede): accetta su uno, l'altro mostra ancora il banner. Il secondo «Accetta» riceve un messaggio chiaro («L'invito è già stato accettato»), e il match creato dal secondo telefono si cancella → test SQL (Task 11, `gia_accettato`) e test UI (Task 20).
4. **Notifica aperta su un browser senza più l'identità** (dati del sito cancellati, altro browser): `get_telepathy_invite` risponde «non trovato» e l'app lo dice invece di mostrare una schermata vuota → test in `test-inviti-helpers.js` (Task 17) e scenario UI (Task 21).
5. **Nome con emoji, 50 caratteri o markup**: la notifica lo mostra come testo, per intero, senza rompersi; un nome vuoto diventa «Qualcuno»/«Someone» → test in `test-push-helpers.js` (Task 15).

---

## Mappa dei file

| File | Stato | Responsabilità |
|---|---|---|
| `supabase/functions/_shared/esito.mjs` | nuovo (spostato) | cosa fare quando una push fallisce; unico per le due funzioni |
| `supabase/functions/notify-ritual-start/index.ts` | modifica | import da `../_shared/esito.mjs` |
| `supabase/functions/notify-telepathy-invite/decisioni.mjs` | nuovo | logica pura: lettura della richiesta, quale push per quale stato, TTL, urgenza |
| `supabase/functions/notify-telepathy-invite/index.ts` | nuovo | legge il DB, dedup, spedisce |
| `scripts/deploy-push.js` | modifica | `--solo <funzione>`, elenco con la funzione nuova |
| `scripts/pg-locale.js` | modifica | `creaDbTelepatia()`: schema telepatia, `net` e `cron` finti |
| `supabase/sql/32a_inviti_telepatia_offline.sql` | nuovo | tutto il nuovo, additivo |
| `supabase/sql/32a_ritorno.sql` | nuovo | toglie indici unici, `CHECK`, trigger di guardia |
| `supabase/sql/32b_chiudi_inviti_diretti.sql` | nuovo | rinormalizza i pending, via policy e privilegi |
| `supabase/sql/32b_ritorno.sql` | nuovo | rimette policy e privilegi letti dal catalogo |
| `push-helpers.js` | modifica | quattro tipi d'invito, tipo sconosciuto neutro, azione «blocca», `puoTacere` |
| `sw.js` | modifica | `ga-pwa-v12`, `?v=12`, push soppressa in primo piano, `notificationclick` con conferma |
| `inviti-helpers.js` | nuovo | logica pura dell'app: messaggi, orologio del server, `?invito=`, esito dell'apertura, ripiego della tenuta |
| `app.html` | modifica | `<script src="inviti-helpers.js">` prima di `app.js` |
| `src/app.jsx` + `app.js` | modifica | invio, attesa, risposta, lista, scheda, interruttore, `?invito=`, `findPartner` |
| `test-invito-decisioni.js`, `test-invito-funzione.js` | nuovi | logica della funzione in Node; sonda sulla funzione pubblicata |
| `test-inviti-offline-sql.js` | nuovo | le RPC su PGlite |
| `test-inviti-offline-rpc.js` | nuovo | le RPC sul DB vero, dopo la 32a |
| `test-inviti-helpers.js`, `test-sw-inviti.js` | nuovi | logica pura dell'app; service worker in una sandbox `vm` |
| `test-inviti-offline-ui.js` | nuovo | due persone nel browser, contro il DB vero |
| `test-push-esito.js`, `test-push-helpers.js`, `test-pwa.js` | modifica | percorso nuovo, tipi nuovi, `?v=12` |
| `test-inviti-telepatia.js`, `test-telepathy.js` | modifica (fase D) | pulizia con la chiave di servizio, letture via RPC |

---

## Fase 0 — Preparazione

### Task 1: ramo di lavoro, catalogo, baseline

**Obiettivo:** partire da `main` con la 31_ dentro, avere spec e piano sul ramo, sapere com'è fatto davvero il database nelle tabelle che la spec non ha in migration, e misurare i test di oggi prima di toccare qualcosa (lezione del 03/06: un rosso deterministico è un test vecchio, non un flaky — ma solo se lo si è visto prima).

**Files:**
- Nessun file del repo modificato, salvo i due documenti portati dal ramo vecchio.
- Create (fuori da git): `.superpowers/sdd/catalogo-inviti.txt`, `.superpowers/sdd/baseline-inviti.txt` (la cartella `.superpowers/` è in `.gitignore`).

**Interfaces:**
- Produces: `catalogo-inviti.txt` con, per `telepathy_matches`, `telepathy_invites`, `online_users`, `notifications`, `telepathy_scores`, `user_blocks`: colonne e tipi (`udt_name`), vincoli e indici; policy e privilegi di `telepathy_invites`; trigger delle due tabelle telepatia; proprietario delle funzioni `SECURITY DEFINER`. Lo usano il Task 6 (schema locale) e il Task 26 (`32b_ritorno.sql`).

- [ ] **Step 1: `main` contiene la 31_?**

```bash
git fetch origin
git ls-tree --name-only origin/main supabase/sql/ | grep 31_account_cancellato_rituali.sql
```
Atteso: una riga. Se è vuota, **fermarsi**: la PR della 31_ (`fix/account-cancellato-rituali`) non è ancora mergiata, e la 32a ridefinisce `delete_my_account` partendo dal suo corpo. Chiedere a Irene.

- [ ] **Step 2: creare il ramo della fase A da `main` aggiornato, in un worktree**

La cartella principale del repo è spesso su un altro ramo con lavoro non committato: non fare checkout lì.

```bash
git worktree add ../wt-inviti-passo0 -b feat/inviti-offline-passo0 origin/main
cd ../wt-inviti-passo0
npm install
```

- [ ] **Step 3: portare spec e piano dal ramo vecchio**

```bash
git checkout feat/inviti-telepatia-offline -- \
  docs/superpowers/specs/2026-09-25-inviti-telepatia-offline-design.md \
  docs/superpowers/plans/2026-09-30-inviti-telepatia-offline.md
git commit -m "docs: spec e piano degli inviti telepatia offline

Portati dal ramo feat/inviti-telepatia-offline (nato da 996f8c9, ormai vecchio).

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```
Il ramo `feat/inviti-telepatia-offline` resta com'è (regola 3: mai cancellare rami).

- [ ] **Step 4: leggere il catalogo (sola lettura)**

`apply-sql.js` tronca il risultato a 500 caratteri: una query per riga, stretta. Scrivere ogni query in un file temporaneo fuori dal repo (per esempio `%TEMP%\cat1.sql`) e lanciarla:

```bash
NODE_OPTIONS="--require ./scripts/test-silenzioso.js" node scripts/apply-sql.js "$TEMP/cat1.sql"
```

Le query, una per file:

```sql
-- cat1..cat6: colonne (una tabella per volta: telepathy_matches, telepathy_invites, online_users,
-- notifications, telepathy_scores, user_blocks)
SELECT string_agg(column_name || ':' || udt_name || CASE WHEN is_nullable = 'NO' THEN '!' ELSE '' END, ',' ORDER BY ordinal_position) AS c
  FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'telepathy_matches';
```
```sql
-- cat7: vincoli e indici di telepathy_matches
SELECT string_agg(indexname || '=' || replace(indexdef, 'CREATE ', ''), ' | ') AS i FROM pg_indexes WHERE tablename = 'telepathy_matches';
```
```sql
-- cat8..cat12: una policy di telepathy_invites per volta (OFFSET 0, 1, 2, 3, 4 finché non torna vuoto)
SELECT policyname, cmd, roles::text AS ruoli, qual, with_check FROM pg_policies
 WHERE tablename = 'telepathy_invites' ORDER BY policyname LIMIT 1 OFFSET 0;
```
```sql
-- cat13: privilegi su telepathy_invites
SELECT string_agg(grantee || ':' || privilege_type, ',' ORDER BY grantee, privilege_type) AS g
  FROM information_schema.role_table_grants WHERE table_name = 'telepathy_invites' AND grantee IN ('anon', 'authenticated');
```
```sql
-- cat14: trigger esistenti sulle due tabelle
SELECT string_agg(tgrelid::regclass || '.' || tgname, ',') AS t FROM pg_trigger
 WHERE tgrelid IN ('public.telepathy_matches'::regclass, 'public.telepathy_invites'::regclass) AND NOT tgisinternal;
```
```sql
-- cat15: chi possiede le funzioni SECURITY DEFINER (serve al trigger di guardia, che distingue
-- le RPC dalle scritture dirette con current_user)
SELECT proowner::regrole AS proprietario FROM pg_proc WHERE proname = 'toggle_ritual_candle' LIMIT 1;
```
```sql
-- cat16: quanti pending per destinatario ci sono oggi (informativo: la 32a li chiude tutti)
SELECT count(*) FILTER (WHERE n > 1) AS destinatari_con_doppioni, coalesce(sum(n), 0) AS pending
  FROM (SELECT to_id, count(*) n FROM telepathy_invites WHERE status = 'pending' GROUP BY to_id) x;
```

Copiare le risposte, così come sono, in `.superpowers/sdd/catalogo-inviti.txt`. Se `apply-sql.js` viene bloccato dal classificatore anche per le letture, chiedere a Irene di lanciare lei le stesse query (🟣 `! node scripts/apply-sql.js <file>`) e incollare l'output.

Criteri: `cat15` risponde `postgres` (se no, il trigger di guardia del Task 8 va rivisto: annotarlo e fermarsi); `cat14` non elenca trigger sconosciuti (se ci sono, annotarli: la 32a non deve toglierli).

- [ ] **Step 5: baseline dei test**

Test locali (nessun server):

```bash
for t in test-pg-locale.js test-candela-stanza-sql.js test-rituali-ricorrenti-sql.js test-push-esito.js test-push-helpers.js test-push-finestre.js; do
  echo "== $t"; NODE_OPTIONS="--require ./scripts/test-silenzioso.js" node $t | tail -n 2
done
```

Test UI (server in un'altra finestra: `npx serve -l 4321 .`, verificare «Accepting connections at http://localhost:4321»):

```bash
for t in test-inviti-telepatia.js test-telepathy.js test-telepathy-session-end.js test-pwa.js test-push-ui.js test-push-rpc.js test-account-gdpr.js; do
  echo "== $t"; NODE_OPTIONS="--require ./scripts/test-silenzioso.js" node $t 2>&1 | tail -n 3
done
```

Scrivere in `.superpowers/sdd/baseline-inviti.txt` passati/falliti di ciascuno. `test-inviti-telepatia.js` ha un rosso **preesistente** noto: annotare quale passo fallisce, per riconoscerlo dopo.

**Fatto quando:** lo Step 1 trova la 31_; il ramo `feat/inviti-offline-passo0` ha un commit con i due documenti; `catalogo-inviti.txt` ha le 16 risposte; `baseline-inviti.txt` ha un conto per ognuno dei 13 test.

---

## Fase A — Passo 0: `esito.mjs` condiviso (ramo `feat/inviti-offline-passo0`)

### Task 2: spostare `esito.mjs` in `_shared` e dare `--solo` a `deploy-push.js`

**Obiettivo:** la logica che decide se cancellare un abbonamento esiste in **una** copia sola, che useranno entrambe le funzioni; lo script di pubblicazione sa pubblicarne una sola per volta (il passo 0 ripubblica solo `notify-ritual-start`).

**Files:**
- Move: `supabase/functions/notify-ritual-start/esito.mjs` → `supabase/functions/_shared/esito.mjs` (con `git mv`, contenuto identico)
- Modify: `supabase/functions/notify-ritual-start/index.ts` (riga dell'import)
- Modify: `test-push-esito.js` (costante `PERCORSO`, più un controllo)
- Modify: `scripts/deploy-push.js`

**Interfaces:**
- Produces: `import { decidiDopoErrore } from '../_shared/esito.mjs'` (firma invariata: `decidiDopoErrore(statusCode?: number) → 'cancella'|'rilascia'|'trattieni'`). `node scripts/deploy-push.js [--dry-run] [--solo <nome>]`, con `<nome>` fra `notify-ritual-start`, `alert-cron` (e dal Task 5 `notify-telepathy-invite`); senza `--solo` pubblica tutte quelle dell'elenco.

- [ ] **Step 1: il test prima — nuovo percorso e nessuna seconda copia**

In `test-push-esito.js` sostituire la riga

```js
const PERCORSO = './supabase/functions/notify-ritual-start/esito.mjs';
```
con
```js
// Dal passo 0 degli inviti telepatia (spec 2026-09-25 §4.2) il file sta in _shared/ e lo
// importano sia notify-ritual-start sia notify-telepathy-invite: una copia sola, perché due
// copie della logica che cancella gli abbonamenti divergerebbero.
const PERCORSO = './supabase/functions/_shared/esito.mjs';
const fs = require('fs');
const path = require('path');
```
e subito dopo `const { decidiDopoErrore } = await import(PERCORSO);` aggiungere:

```js
  // Nessuna seconda copia rimasta nelle cartelle delle funzioni.
  const copie = fs.readdirSync(path.join(__dirname, 'supabase', 'functions'), { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== '_shared')
    .filter((d) => fs.existsSync(path.join(__dirname, 'supabase', 'functions', d.name, 'esito.mjs')))
    .map((d) => d.name);
  atteso('esito.mjs esiste solo in _shared', copie.join(','), '');
  const indice = fs.readFileSync(path.join(__dirname, 'supabase/functions/notify-ritual-start/index.ts'), 'utf8');
  atteso('notify-ritual-start importa da _shared', /from '\.\.\/_shared\/esito\.mjs'/.test(indice), true);
```

- [ ] **Step 2: vederlo fallire**

Run: `NODE_OPTIONS="--require ./scripts/test-silenzioso.js" node test-push-esito.js`
Atteso: errore `Cannot find module …/_shared/esito.mjs` (il file non è ancora lì).

- [ ] **Step 3: spostare e aggiornare l'import**

```bash
mkdir -p supabase/functions/_shared
git mv supabase/functions/notify-ritual-start/esito.mjs supabase/functions/_shared/esito.mjs
```
In `supabase/functions/notify-ritual-start/index.ts`:
```ts
import { decidiDopoErrore } from './esito.mjs';
```
diventa
```ts
// In _shared/ dal passo 0 degli inviti telepatia: la stessa decisione vale per le push d'invito.
import { decidiDopoErrore } from '../_shared/esito.mjs';
```

- [ ] **Step 4: vederlo passare**

Run: `NODE_OPTIONS="--require ./scripts/test-silenzioso.js" node test-push-esito.js`
Atteso: tutti ✅, `0 falliti`, con due controlli in più rispetto alla baseline del Task 1.

- [ ] **Step 5: `--solo` in `deploy-push.js`**

In `scripts/deploy-push.js`, sopra `function main()`:

```js
// Le funzioni che questo script sa pubblicare. `--solo <nome>` ne pubblica una sola: il passo 0
// degli inviti telepatia ripubblica SOLO notify-ritual-start (è live, e va provata da sola prima
// di tutto il resto), il passo 1 pubblica SOLO notify-telepathy-invite.
const FUNZIONI = [
  { nome: 'notify-ritual-start', descrizione: 'pubblico il motore delle notifiche dei rituali' },
  { nome: 'alert-cron', descrizione: 'pubblico la sentinella sui guasti' },
];

function funzioniScelte(argv) {
  const i = argv.indexOf('--solo');
  if (i === -1) return FUNZIONI;
  const nome = argv[i + 1];
  const f = FUNZIONI.find((x) => x.nome === nome);
  if (!f) {
    console.error(`⛔  --solo vuole il nome di una funzione: ${FUNZIONI.map((x) => x.nome).join(', ')}`);
    process.exit(2);
  }
  return [f];
}
```
In `main()`, sostituire la riga `console.log('Funzioni da pubblicare: notify-ritual-start, alert-cron');` con

```js
  const scelte = funzioniScelte(process.argv);
  console.log(`Funzioni da pubblicare: ${scelte.map((f) => f.nome).join(', ')}`);
```
e le due righe `esegui('pubblico il motore …')` / `esegui('pubblico la sentinella …')` con

```js
  for (const f of scelte) {
    esegui(f.descrizione, ['functions', 'deploy', f.nome, '--project-ref', ref], ambiente);
  }
```
Aggiornare il commento d'uso in testa al file:
```
 *   node scripts/deploy-push.js                             # pubblica tutte le funzioni e carica i segreti
 *   node scripts/deploy-push.js --solo notify-ritual-start  # una sola funzione
 *   node scripts/deploy-push.js --dry-run [--solo <nome>]   # dice solo cosa farebbe
```

- [ ] **Step 6: provare lo script senza pubblicare niente**

```bash
NODE_OPTIONS="--require ./scripts/test-silenzioso.js" node scripts/deploy-push.js --dry-run --solo notify-ritual-start
NODE_OPTIONS="--require ./scripts/test-silenzioso.js" node scripts/deploy-push.js --dry-run --solo nessuna
```
Atteso: il primo stampa `Funzioni da pubblicare: notify-ritual-start` e `[dry-run] niente è stato pubblicato.` (se mancano token o VAPID in `.env.local`, stampa `⛔  Mancano in .env.local: …` ed esce 2: va bene lo stesso, vuol dire che il controllo c'è — annotarlo per Irene); il secondo esce con `⛔  --solo vuole il nome di una funzione` (codice 2).

- [ ] **Step 7: commit**

```bash
git add supabase/functions/_shared/esito.mjs supabase/functions/notify-ritual-start/index.ts test-push-esito.js scripts/deploy-push.js
git commit -m "refactor(push): esito.mjs in _shared per le due funzioni, deploy-push --solo

Passo 0 degli inviti telepatia (spec §8): la logica che decide se cancellare un
abbonamento resta una sola. notify-ritual-start va ripubblicata da sola e provata.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

**Fatto quando:** `test-push-esito.js` verde con i due controlli nuovi; `git ls-files | grep esito.mjs` → una sola riga, `supabase/functions/_shared/esito.mjs`; `deploy-push.js --dry-run --solo notify-ritual-start` elenca una sola funzione.

### Task 3: revisione, PR 1, passo 0 dal vivo

**Obiettivo:** la ripubblicazione di una funzione live con un import spostato è provata su un rituale vero prima che esista qualunque altra cosa.

- [ ] **Step 1: revisione indipendente** (sub-agente separato, `superpowers:requesting-code-review`) sul diff `origin/main..HEAD`: import giusto, nessun cambiamento di comportamento in `notify-ritual-start`, `deploy-push.js` identico senza `--solo`. Rilievi chiusi prima di proseguire.
- [ ] **Step 2: il controller** dice a Irene «sto per pushare `feat/inviti-offline-passo0` su `global-awakening/global-awakening.github.io` e aprire la PR 1», poi push e `gh pr create` (corpo che chiude con `🤖 Generated with [Claude Code](https://claude.com/claude-code)`).
- [ ] **Step 3: 🟣 IRENE** — merge: `! gh pr merge <N> --merge -R global-awakening/global-awakening.github.io`
- [ ] **Step 4: 🟣 IRENE** — dalla cartella del repo su `main` aggiornato, controllo del token (serve il permesso **Edge Functions**, non solo Database): `! node scripts/deploy-push.js --dry-run --solo notify-ritual-start`. Se dice che manca il token o se la pubblicazione vera fallisce parlando di permessi, crearne uno nuovo da https://supabase.com/dashboard/account/tokens e metterlo in `.env.local`.
- [ ] **Step 5: 🟣 IRENE** — pubblicazione: `! node scripts/deploy-push.js --solo notify-ritual-start`
- [ ] **Step 6: prova** — l'agente crea un rituale di prova che inizia fra 16 minuti (dall'app, con un account di prova, iscrivendosi alle notifiche su Chrome) e verifica **lui** su Chrome che arrivino il promemoria e l'avvio e che aprano il rituale giusto (memoria: «le prove le faccio io»); a Irene si chiede di guardare il telefono solo se serve un telefono vero. Poi `NODE_OPTIONS="--require ./scripts/test-silenzioso.js" node test-push-cron.js` subito e dopo 20 minuti: nessun job fallito, nessuna risposta non 2xx.
- [ ] **Ritorno indietro (scritto, non eseguito):** `git checkout <commit prima dello spostamento> -- supabase/functions/notify-ritual-start` in un worktree temporaneo e 🟣 `! node scripts/deploy-push.js --solo notify-ritual-start` da lì.

**Fatto quando:** PR 1 mergiata; `notify-ritual-start` ripubblicata; promemoria e avvio arrivati e aperti sul rituale giusto; `test-push-cron.js` verde due volte a 20 minuti di distanza.

---

## Fase B — Motore e migration 32a (ramo `feat/inviti-offline-motore`)

Il ramo nasce da `main` **dopo** il merge della PR 1:

```bash
git fetch origin
git worktree add ../wt-inviti-motore -b feat/inviti-offline-motore origin/main
cd ../wt-inviti-motore && npm install
```

### Task 4: la logica pura della Edge Function

**Obiettivo:** tutto quello che la funzione decide (se il corpo della richiesta è valido, a chi va una push, con quale testo, TTL e urgenza) sta in un modulo senza rete e senza database, provato in Node.

**Files:**
- Create: `supabase/functions/notify-telepathy-invite/decisioni.mjs`
- Create: `test-invito-decisioni.js`

**Interfaces:**
- Produces (usati dal Task 5):
  - `leggiRichiesta(corpo: unknown) → { tipo: 'scadenze' } | { tipo: 'invito'|'accettato'|'rifiutato', invito: string /* uuid minuscolo */ } | null`
  - `eraDaDieciMinuti(inv: { created_at: string, expires_at: string }) → boolean` (durata > 60 s)
  - `decidiPush(tipo: 'invito'|'accettato'|'rifiutato'|'scaduto', inv: RigaInvito|null, adessoMs: number) → { a: 'destinatario'|'mittente', kind: string, nome: string, ttl: number, urgency: 'high'|'normal' } | null`
  - `RigaInvito` = `{ id, from_id, from_name, to_id, to_name, status, created_at, expires_at, match_id, con_push }` (colonne di `telepathy_invites` lette dalla funzione)

- [ ] **Step 1: il test**

```js
/**
 * Test della logica pura di notify-telepathy-invite (spec 2026-09-25 §4.2).
 *
 * La funzione non si fida di chi la chiama: rilegge l'invito e manda una push solo se lo stato
 * la giustifica. Qui si prova proprio quella decisione, senza rete e senza database.
 *
 * Esecuzione: NODE_OPTIONS="--require ./scripts/test-silenzioso.js" node test-invito-decisioni.js
 */
const PERCORSO = './supabase/functions/notify-telepathy-invite/decisioni.mjs';

let passati = 0, falliti = 0;
const ok = (n) => { console.log('✅ ' + n); passati++; };
const ko = (n, d) => { console.error('❌ ' + n + ' — ' + d); falliti++; };
const atteso = (n, a, b) => (a === b ? ok(n) : ko(n, `atteso ${JSON.stringify(b)}, ottenuto ${JSON.stringify(a)}`));

(async () => {
  const { leggiRichiesta, decidiPush, eraDaDieciMinuti } = await import(PERCORSO);
  const ID = '3f0c2b1e-8a4d-4c6e-9b7a-1d2e3f4a5b6c';
  const adesso = Date.now();
  const iso = (ms) => new Date(adesso + ms).toISOString();
  const invito = (x) => ({ id: ID, from_id: 'a', from_name: 'Aurora', to_id: 'b', to_name: 'Bruno', status: 'pending',
    created_at: iso(-60000), expires_at: iso(540000), match_id: null, con_push: true, ...x });

  // --- la richiesta ---------------------------------------------------------
  atteso('corpo vuoto: ignorato', leggiRichiesta(null), null);
  atteso('scadenze', JSON.stringify(leggiRichiesta({ tipo: 'scadenze' })), '{"tipo":"scadenze"}');
  atteso('invito con uuid (maiuscole accettate, restituito minuscolo)',
    JSON.stringify(leggiRichiesta({ tipo: 'invito', invito: ID.toUpperCase() })), JSON.stringify({ tipo: 'invito', invito: ID }));
  atteso('uuid storto: ignorato', leggiRichiesta({ tipo: 'invito', invito: "x'; drop" }), null);
  // «scaduto» lo decide solo il giro delle scadenze: chiamarlo da fuori non deve bastare.
  atteso('«scaduto» da fuori: ignorato', leggiRichiesta({ tipo: 'scaduto', invito: ID }), null);

  // --- durata ---------------------------------------------------------------
  atteso('10 minuti', eraDaDieciMinuti({ created_at: iso(0), expires_at: iso(600000) }), true);
  atteso('45 secondi', eraDaDieciMinuti({ created_at: iso(0), expires_at: iso(45000) }), false);

  // --- invito ---------------------------------------------------------------
  let d = decidiPush('invito', invito(), adesso);
  atteso('invito pending con push: al destinatario', d && d.a, 'destinatario');
  atteso('invito: il nome è di chi invita', d && d.nome, 'Aurora');
  atteso('invito: TTL = secondi alla scadenza', d && d.ttl, 540);
  atteso('invito: urgenza alta', d && d.urgency, 'high');
  atteso('invito senza con_push: niente', decidiPush('invito', invito({ con_push: false }), adesso), null);
  atteso('invito scaduto: niente', decidiPush('invito', invito({ expires_at: iso(-1000) }), adesso), null);
  atteso('invito non più pending: niente', decidiPush('invito', invito({ status: 'cancelled' }), adesso), null);
  d = decidiPush('invito', invito({ expires_at: iso(500) }), adesso);
  atteso('a mezzo secondo dalla scadenza: TTL minimo 1', d && d.ttl, 1);

  // --- accettato ------------------------------------------------------------
  d = decidiPush('accettato', invito({ status: 'accepted', match_id: ID }), adesso);
  atteso('accettato con match_id: al mittente, TTL 180, alta', d && `${d.a}/${d.ttl}/${d.urgency}/${d.nome}`, 'mittente/180/high/Bruno');
  atteso('accettato senza match_id (app vecchia): niente', decidiPush('accettato', invito({ status: 'accepted' }), adesso), null);

  // --- rifiutato ------------------------------------------------------------
  d = decidiPush('rifiutato', invito({ status: 'declined' }), adesso);
  atteso('rifiutato da 10 minuti: al mittente, TTL 3600, normale', d && `${d.a}/${d.ttl}/${d.urgency}`, 'mittente/3600/normal');
  atteso('rifiutato da 45 s: niente', decidiPush('rifiutato', invito({ status: 'declined', created_at: iso(-10000), expires_at: iso(35000) }), adesso), null);

  // --- scaduto --------------------------------------------------------------
  d = decidiPush('scaduto', invito({ status: 'expired', created_at: iso(-700000), expires_at: iso(-100000) }), adesso);
  atteso('scaduto da 10 minuti: al mittente', d && `${d.a}/${d.kind}/${d.ttl}`, 'mittente/scaduto/3600');
  atteso('scaduto da 45 s: niente', decidiPush('scaduto', invito({ status: 'expired', created_at: iso(-100000), expires_at: iso(-55000) }), adesso), null);
  atteso('nessun invito: niente', decidiPush('invito', null, adesso), null);

  console.log(`\n${passati} passati, ${falliti} falliti`);
  process.exit(falliti === 0 ? 0 : 1);
})();
```

- [ ] **Step 2: vederlo fallire**

Run: `NODE_OPTIONS="--require ./scripts/test-silenzioso.js" node test-invito-decisioni.js`
Atteso: `Cannot find module …/decisioni.mjs`.

- [ ] **Step 3: il modulo**

```js
/**
 * decisioni.mjs — cosa fa notify-telepathy-invite, senza rete e senza database.
 *
 * La funzione è invocabile da chiunque abbia la chiave pubblica (come alert-cron): per questo
 * NON si fida del chiamante. Rilegge l'invito e manda una push solo se lo stato la giustifica.
 * Chi la chiama a caso ottiene al massimo un controllo in più, mai una notifica non dovuta.
 *
 * TTL e urgenza (spec §4.2): una notifica d'invito consegnata dopo la scadenza è solo rumore,
 * quindi il suo TTL è il tempo che resta; «accettato» vale quanto l'attesa massima di chi ha
 * accettato (3 minuti); rifiutato e scaduto possono arrivare con calma.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIPI_DA_FUORI = ['invito', 'accettato', 'rifiutato'];

export function leggiRichiesta(corpo) {
  if (!corpo || typeof corpo !== 'object') return null;
  if (corpo.tipo === 'scadenze') return { tipo: 'scadenze' };
  if (TIPI_DA_FUORI.includes(corpo.tipo) && typeof corpo.invito === 'string' && UUID.test(corpo.invito)) {
    return { tipo: corpo.tipo, invito: corpo.invito.toLowerCase() };
  }
  return null;
}

/** Stessa regola di telepatia_era_da_dieci nella 32a: un invito da 45 s dura 45 s, uno da 10 minuti 600. */
export function eraDaDieciMinuti(inv) {
  return Date.parse(inv.expires_at) - Date.parse(inv.created_at) > 60000;
}

export function decidiPush(tipo, inv, adessoMs) {
  if (!inv) return null;
  if (tipo === 'invito') {
    if (inv.status !== 'pending' || inv.con_push !== true) return null;
    const restano = Date.parse(inv.expires_at) - adessoMs;
    if (!(restano > 0)) return null;
    return { a: 'destinatario', kind: 'invito', nome: inv.from_name, ttl: Math.max(1, Math.floor(restano / 1000)), urgency: 'high' };
  }
  if (tipo === 'accettato') {
    if (inv.status !== 'accepted' || !inv.match_id) return null;
    return { a: 'mittente', kind: 'accettato', nome: inv.to_name, ttl: 180, urgency: 'high' };
  }
  if (tipo === 'rifiutato') {
    if (inv.status !== 'declined' || !eraDaDieciMinuti(inv)) return null;
    return { a: 'mittente', kind: 'rifiutato', nome: inv.to_name, ttl: 3600, urgency: 'normal' };
  }
  if (tipo === 'scaduto') {
    if (inv.status !== 'expired' || !eraDaDieciMinuti(inv)) return null;
    return { a: 'mittente', kind: 'scaduto', nome: inv.to_name, ttl: 3600, urgency: 'normal' };
  }
  return null;
}
```

- [ ] **Step 4: vederlo passare**

Run: `NODE_OPTIONS="--require ./scripts/test-silenzioso.js" node test-invito-decisioni.js`
Atteso: `22 passati, 0 falliti`.

- [ ] **Step 5: commit**

```bash
git add supabase/functions/notify-telepathy-invite/decisioni.mjs test-invito-decisioni.js
git commit -m "feat(push): logica pura della funzione delle push d'invito

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

**Fatto quando:** `test-invito-decisioni.js` → `22 passati, 0 falliti`.

### Task 5: la Edge Function `notify-telepathy-invite` e la sua pubblicazione

**Obiettivo:** la funzione che spedisce le push d'invito, con la dedup e la gestione degli errori di `notify-ritual-start`; `deploy-push.js` la sa pubblicare; una sonda la prova quando è pubblicata.

**Files:**
- Create: `supabase/functions/notify-telepathy-invite/index.ts`
- Modify: `scripts/deploy-push.js` (elenco `FUNZIONI`)
- Create: `test-invito-funzione.js`

**Interfaces:**
- Consumes: `leggiRichiesta`, `decidiPush` (Task 4); `decidiDopoErrore` da `../_shared/esito.mjs` (Task 2). Dal database (esistono dopo la 32a): colonne di `telepathy_invites` (`RigaInvito`), `telepathy_availability.session_id`, `push_subscriptions(id, endpoint, p256dh, auth, locale, failure_count, session_id)`, `telepathy_invite_pushes(invite_id, subscription_id, kind)`, RPC `expire_telepathy_invites() → TABLE(invito_id uuid)`.
- Produces: `POST /functions/v1/notify-telepathy-invite` con corpo `{invito, tipo}` o `{tipo:'scadenze'}` → sempre 200 (`{ignorato:true}` oppure `{inviate, errori, saltate, perse}`), 500 solo per un guasto (`{…, guasti:[…]}`). Payload della push: `{ tipo: 'invito'|'accettato'|'rifiutato'|'scaduto', invito: <uuid>, nome: <string>, locale: 'it'|'en' }` (lo legge `push-helpers.js`, Task 15).

- [ ] **Step 1: la sonda prima (rossa finché la funzione non è pubblicata)**

```js
/**
 * Sonda sulla Edge Function notify-telepathy-invite PUBBLICATA. Non manda push: ogni chiamata
 * qui non trova niente da fare, ed è proprio questo che si controlla (sempre 200, mai 4xx: con
 * un 4xx chiunque la chiami a caso farebbe scattare l'email della sentinella).
 *
 *   NODE_OPTIONS="--require ./scripts/test-silenzioso.js" node test-invito-funzione.js
 *       → prima della 32a: solo corpi che non toccano il database
 *   NODE_OPTIONS="--require ./scripts/test-silenzioso.js" node test-invito-funzione.js --dopo-32a
 *       → anche un invito inesistente e il giro delle scadenze
 */
const URL_F = 'https://vxzxdkcluyrcftsnxxza.supabase.co/functions/v1/notify-telepathy-invite';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4enhka2NsdXlyY2Z0c254eHphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzMzcyMTcsImV4cCI6MjA4NjkxMzIxN30.m_mzWHH1-ajVqeSFvuJAm8t5Kz7I7umcEKBrRPr5JXM';
const { randomUUID } = require('crypto');

let passati = 0, falliti = 0;
const check = (c, m, x) => { if (c) { console.log('  ✅ ' + m); passati++; } else { console.log('  ❌ ' + m + (x !== undefined ? ' — ' + JSON.stringify(x) : '')); falliti++; process.exitCode = 1; } };

async function chiama(corpo) {
  const r = await fetch(URL_F, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ANON, apikey: ANON },
    body: typeof corpo === 'string' ? corpo : JSON.stringify(corpo),
  });
  let j = null; try { j = await r.json(); } catch (_) {}
  return { stato: r.status, j };
}

(async () => {
  let r = await chiama({});
  check(r.stato === 200 && r.j && r.j.ignorato === true, 'corpo vuoto: 200 ignorato', r);
  r = await chiama('non è json');
  check(r.stato === 200 && r.j && r.j.ignorato === true, 'corpo storto: 200 ignorato', r);
  r = await chiama({ tipo: 'invito', invito: 'x' });
  check(r.stato === 200 && r.j && r.j.ignorato === true, 'id storto: 200 ignorato', r);
  if (process.argv.includes('--dopo-32a')) {
    r = await chiama({ tipo: 'invito', invito: randomUUID() });
    check(r.stato === 200 && r.j && r.j.ignorato === true, 'invito inesistente: 200 ignorato', r);
    r = await chiama({ tipo: 'scadenze' });
    check(r.stato === 200 && r.j && typeof r.j.inviate === 'number', 'giro scadenze: 200 con i conti', r);
  }
  console.log(`\n${passati} passati, ${falliti} falliti`);
})();
```

Run: `NODE_OPTIONS="--require ./scripts/test-silenzioso.js" node test-invito-funzione.js`
Atteso adesso: 3 ❌ con stato 404 (funzione non pubblicata). Resta rossa fino al Task 14.

- [ ] **Step 2: la funzione**

```ts
/**
 * notify-telepathy-invite — le push degli inviti a un training telepatico.
 *
 * Due strade (spec 2026-09-25 §4.2):
 *   - {invito, tipo}: la chiamano le RPC della 32a con pg_net, SOLO dopo aver scritto l'invito
 *     o la risposta. tipo ∈ invito | accettato | rifiutato.
 *   - {tipo:'scadenze'}: la chiama ogni minuto il job pg_cron `notify-ritual-start` (ridefinito
 *     nella 32a con una seconda chiamata). Segna scaduti gli inviti e avvisa i mittenti di
 *     quelli da 10 minuti.
 *
 * NON si fida di chi la chiama: rilegge l'invito e manda solo ciò che lo stato giustifica
 * (decisioni.mjs). Risponde 200 anche quando non c'è niente da fare, 500 solo per un guasto
 * vero: la sentinella alert-cron conta ogni risposta non 2xx, e un 4xx a una chiamata a caso
 * farebbe partire l'email per niente.
 *
 * Dedup come notify-ritual-start: si PRENOTA su telepathy_invite_pushes prima di spedire e si
 * libera solo su un «non consegnato» esplicito. Una doppia vibrazione costa più di una
 * notifica persa.
 */
// Versioni fissate, le stesse di notify-ritual-start (lezione del 22/09: senza versione la
// funzione si è rotta da sola alla prima ripubblicazione).
import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import webpush from 'npm:web-push@3.6.7';
import { decidiDopoErrore } from '../_shared/esito.mjs';
import { leggiRichiesta, decidiPush } from './decisioni.mjs';

const COLONNE = 'id, from_id, from_name, to_id, to_name, status, created_at, expires_at, match_id, con_push';

Deno.serve(async (req) => {
  let corpo: unknown = null;
  try { corpo = await req.json(); } catch (_) { corpo = null; }
  const richiesta = leggiRichiesta(corpo);
  if (!richiesta) return Response.json({ ignorato: true });

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  webpush.setVapidDetails(
    Deno.env.get('VAPID_SUBJECT')!,
    Deno.env.get('VAPID_PUBLIC_KEY')!,
    Deno.env.get('VAPID_PRIVATE_KEY')!
  );

  // Quali (invito, tipo) guardare in questo giro.
  const lavori: Array<{ invito: Record<string, any>; tipo: string }> = [];
  if (richiesta.tipo === 'scadenze') {
    const { data, error } = await supabase.rpc('expire_telepathy_invites');
    if (error) return Response.json({ errore: 'scadenze: ' + error.message }, { status: 500 });
    const ids = (data || []).map((r: { invito_id: string }) => r.invito_id);
    if (ids.length > 0) {
      const { data: inviti, error: e2 } = await supabase.from('telepathy_invites').select(COLONNE).in('id', ids);
      if (e2) return Response.json({ errore: 'lettura scaduti: ' + e2.message }, { status: 500 });
      for (const inv of inviti || []) lavori.push({ invito: inv, tipo: 'scaduto' });
    }
  } else {
    const { data, error } = await supabase.from('telepathy_invites').select(COLONNE).eq('id', richiesta.invito).maybeSingle();
    if (error) return Response.json({ errore: 'lettura invito: ' + error.message }, { status: 500 });
    if (!data) return Response.json({ ignorato: true });
    lavori.push({ invito: data, tipo: richiesta.tipo });
  }

  let inviate = 0, errori = 0, saltate = 0, perse = 0;
  const guasti: string[] = [];

  for (const { invito, tipo } of lavori) {
    const decisione = decidiPush(tipo, invito, Date.now());
    if (!decisione) continue;

    // Terzo giro della spec: la push d'invito parte solo se il destinatario ha ancora la riga di
    // disponibilità. Copre la riga sparita fra l'invio e la push, e qualunque invito arrivato qui
    // senza passare dai controlli della RPC.
    if (tipo === 'invito') {
      const { data: riga, error } = await supabase.from('telepathy_availability').select('id').eq('session_id', invito.to_id).maybeSingle();
      if (error) { guasti.push(`disponibilità ${invito.id}: ${error.message}`); continue; }
      if (!riga) continue;
    }

    const destinatario = decisione.a === 'destinatario' ? invito.to_id : invito.from_id;
    const { data: abbonamenti, error: eAb } = await supabase
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth, locale, failure_count')
      .eq('session_id', destinatario);
    if (eAb) { guasti.push(`abbonamenti ${invito.id}: ${eAb.message}`); continue; }

    for (const ab of abbonamenti || []) {
      // 1. Prenotazione.
      const { error: eDedup } = await supabase
        .from('telepathy_invite_pushes')
        .insert({ invite_id: invito.id, subscription_id: ab.id, kind: decisione.kind });
      if (eDedup) {
        if ((eDedup as { code?: string }).code === '23505') saltate++;
        else guasti.push(`prenotazione ${invito.id}: ${eDedup.message}`);
        continue;
      }

      // 2. Invio.
      const lingua = ab.locale === 'it' ? 'it' : 'en';
      try {
        await webpush.sendNotification(
          { endpoint: ab.endpoint, keys: { p256dh: ab.p256dh, auth: ab.auth } },
          JSON.stringify({ tipo: decisione.kind, invito: invito.id, nome: decisione.nome, locale: lingua }),
          { TTL: decisione.ttl, urgency: decisione.urgency }
        );
        inviate++;
        await supabase.from('push_subscriptions')
          .update((ab.failure_count ?? 0) > 0
            ? { failure_count: 0, last_seen_at: new Date().toISOString() }
            : { last_seen_at: new Date().toISOString() })
          .eq('id', ab.id);
      } catch (e) {
        errori++;
        const stato = (e as { statusCode?: number }).statusCode;
        switch (decidiDopoErrore(stato)) {
          case 'cancella':
            await supabase.from('push_subscriptions').delete().eq('id', ab.id);
            break;
          case 'rilascia':
            await supabase.from('telepathy_invite_pushes').delete()
              .eq('invite_id', invito.id).eq('subscription_id', ab.id).eq('kind', decisione.kind);
            break;
          case 'trattieni':
            perse++;
            break;
        }
        if (decidiDopoErrore(stato) !== 'cancella') {
          await supabase.from('push_subscriptions').update({ failure_count: (ab.failure_count ?? 0) + 1 }).eq('id', ab.id);
        }
      }
    }
  }

  if (guasti.length > 0) return Response.json({ inviate, errori, saltate, perse, guasti }, { status: 500 });
  return Response.json({ inviate, errori, saltate, perse });
});
```

Nota sul «rilascia»: la prenotazione liberata si riprende solo se qualcuno richiama la funzione per lo stesso invito. Per `invito`/`accettato`/`rifiutato` nessuno la richiama (la RPC chiama una volta sola): la notifica si perde, come la spec accetta («una doppia vibrazione costa più di una notifica persa»). Per `scaduto` la riprende il giro del minuto dopo, finché l'invito resta nella finestra di 10 minuti di `expire_telepathy_invites`.

- [ ] **Step 3: `deploy-push.js` conosce la funzione nuova**

In `FUNZIONI` (Task 2) aggiungere in fondo:

```js
  { nome: 'notify-telepathy-invite', descrizione: 'pubblico le push degli inviti telepatia' },
```
e cambiare il messaggio finale di `main()` in:
```js
  console.log('\n✅ Funzioni pubblicate e segreti caricati.');
```

Run: `NODE_OPTIONS="--require ./scripts/test-silenzioso.js" node scripts/deploy-push.js --dry-run --solo notify-telepathy-invite`
Atteso: `Funzioni da pubblicare: notify-telepathy-invite` (o il messaggio dei segreti mancanti, come al Task 2).

- [ ] **Step 4: controllo statico della funzione**

Deno non è installato in questo ambiente: se `deno --version` risponde, lanciare `deno check supabase/functions/notify-telepathy-invite/index.ts`; altrimenti annotarlo nel commit («non controllato con deno check») e lasciare il controllo alla pubblicazione del Task 14, che compila la funzione. Verificare a mano che gli import siano quelli scritti sopra:

```bash
grep -n "^import" supabase/functions/notify-telepathy-invite/index.ts
```
Atteso: quattro righe, `npm:@supabase/supabase-js@2.116.0`, `npm:web-push@3.6.7`, `../_shared/esito.mjs`, `./decisioni.mjs`.

- [ ] **Step 5: commit**

```bash
git add supabase/functions/notify-telepathy-invite/index.ts scripts/deploy-push.js test-invito-funzione.js
git commit -m "feat(push): Edge Function notify-telepathy-invite e sonda

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

**Fatto quando:** i quattro import sono quelli attesi; `deploy-push.js --dry-run --solo notify-telepathy-invite` elenca la funzione; `test-invito-funzione.js` esiste ed è rosso per 404 (diventa verde al Task 14).

### Task 6: il Postgres locale con lo schema della telepatia

**Obiettivo:** un database PGlite con le tabelle della telepatia come sono nel catalogo (Task 1), un `net` e un `cron` finti che registrano le chiamate, e la catena delle migration vere; senza rompere i test SQL che già usano `creaDbLocale`.

**Files:**
- Modify: `scripts/pg-locale.js`
- Modify: `test-pg-locale.js`

**Interfaces:**
- Consumes: `.superpowers/sdd/catalogo-inviti.txt` (Task 1).
- Produces: `creaDbTelepatia({ con32a = true, con32b = false } = {}) → Promise<PGlite>`: `creaDbLocale()` (catena fino alla 30_) + schema telepatia + `31_` + (se chiesto) `32a` e `32b`. Tabelle finte: `net.chiamate(id, url, body jsonb, headers jsonb, at)`; `cron.job(jobid, jobname UNIQUE, schedule, command, active)`. Costanti esportate: `F31`, `F32A`, `F32B` (percorsi dei file).

- [ ] **Step 1: il test prima**

In `test-pg-locale.js`, prima di `console.log(\`\n${passed} passati…\`)`, aggiungere:

```js
  // Schema della telepatia (inviti offline, 32a/32b): tabelle, net e cron finti.
  const { creaDbTelepatia } = require('./scripts/pg-locale');
  const dt = await creaDbTelepatia({ con32a: false });
  const tabelle = (await dt.query(`SELECT string_agg(table_name, ',' ORDER BY table_name) t FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name IN ('telepathy_matches','telepathy_invites','online_users','notifications','telepathy_scores','user_blocks','telepathy_queue')`)).rows[0].t;
  check(tabelle === 'notifications,online_users,telepathy_invites,telepathy_matches,telepathy_queue,telepathy_scores,user_blocks', 'schema telepatia: le tabelle ci sono', tabelle);
  await dt.query(`SELECT net.http_post(url := 'https://x/functions/v1/prova', body := '{"a":1}'::jsonb)`);
  const ch = (await dt.query(`SELECT url, body FROM net.chiamate`)).rows;
  check(ch.length === 1 && ch[0].body.a === 1, 'net.http_post finto registra la chiamata', ch);
  const job = (await dt.query(`SELECT command FROM cron.job WHERE jobname = 'notify-ritual-start'`)).rows;
  check(job.length === 1 && job[0].command.includes('notify-ritual-start'), 'cron: c\'è il job della 23_', job);
  const pol = (await dt.query(`SELECT count(*)::int n FROM pg_policies WHERE tablename = 'telepathy_invites'`)).rows[0].n;
  check(pol >= 1, 'telepathy_invites ha le policy aperte del catalogo', pol);
  // I test SQL di prima non vedono niente di tutto questo.
  const vecchio = await creaDbLocale();
  const nt = (await vecchio.query(`SELECT count(*)::int n FROM information_schema.tables WHERE table_name = 'telepathy_invites'`)).rows[0].n;
  check(nt === 0, 'creaDbLocale resta com\'era (test-candela crea da sé le sue tabelle)', nt);
```

Run: `NODE_OPTIONS="--require ./scripts/test-silenzioso.js" node test-pg-locale.js`
Atteso: `❌ eccezione: creaDbTelepatia is not a function`.

- [ ] **Step 2: lo schema**

In `scripts/pg-locale.js`, dopo `SCHEMA`, aggiungere `SCHEMA_TELEPATIA`. **Prima di scriverlo, confrontare ogni tabella con `catalogo-inviti.txt`**: colonne, tipi (`udt_name`: `timestamptz`, `text`, `uuid`, `int4`, `float8`, `bool`), `NOT NULL` (`!`), vincoli e indici. Il testo qui sotto è quello atteso dalla lettura del codice dell'app; dove il catalogo dice altro, **vince il catalogo** (e la differenza si scrive nel commit). In particolare: il tipo di `online_users.last_seen` (le funzioni della 32a lo convertono comunque con `::timestamptz`), la forma del vincolo `telepathy_matches_pair_unique`, i nomi e le condizioni delle policy di `telepathy_invites`.

```js
// Lo schema della telepatia e delle tabelle che delete_my_account/export_my_account toccano,
// ricopiato dal catalogo del database vero (letto il 30/09/2026, Task 1 del piano inviti).
// Solo per creaDbTelepatia: creaDbLocale resta com'era, perché test-candela-stanza-sql.js crea
// da sé alcune di queste tabelle e non deve trovarle già lì.
const SCHEMA_TELEPATIA = `
  ALTER TABLE profiles
    ADD COLUMN IF NOT EXISTS bio text, ADD COLUMN IF NOT EXISTS country text,
    ADD COLUMN IF NOT EXISTS show_telepathy_score boolean DEFAULT true;
  ALTER TABLE push_subscriptions
    ADD COLUMN IF NOT EXISTS endpoint text UNIQUE, ADD COLUMN IF NOT EXISTS p256dh text,
    ADD COLUMN IF NOT EXISTS auth text, ADD COLUMN IF NOT EXISTS locale text NOT NULL DEFAULT 'en',
    ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
    ADD COLUMN IF NOT EXISTS last_seen_at timestamptz NOT NULL DEFAULT now(),
    ADD COLUMN IF NOT EXISTS failure_count integer NOT NULL DEFAULT 0;
  CREATE TABLE online_users (id text PRIMARY KEY, nickname text NOT NULL, lat float8, lng float8, last_seen timestamptz DEFAULT now());
  CREATE TABLE telepathy_queue (id text PRIMARY KEY, nickname text, timestamp bigint);
  CREATE TABLE telepathy_matches (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user1_id text, user1_nickname text, user1_role text,
    user2_id text, user2_nickname text, user2_role text,
    level text DEFAULT 'shapes', round_count integer DEFAULT 0, sender_symbol text, receiver_guess text,
    level_change_choice_sender text, level_change_choice_receiver text,
    score_sender integer DEFAULT 0, score_receiver integer DEFAULT 0,
    created_at timestamptz DEFAULT now(), ended_at timestamptz, ended_by text);
  CREATE UNIQUE INDEX telepathy_matches_pair_unique
    ON telepathy_matches (least(user1_id, user2_id), greatest(user1_id, user2_id));
  CREATE TABLE telepathy_invites (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz DEFAULT now(),
    from_id text NOT NULL, from_name text NOT NULL, to_id text NOT NULL, to_name text NOT NULL,
    status text DEFAULT 'pending');
  ALTER TABLE telepathy_invites ENABLE ROW LEVEL SECURITY;
  -- Le 8 policy di oggi, come nel catalogo (cat8-cat12, pol5-pol7). Le quattro per public con
  -- auth.uid() sono inerti per l'app (auth.uid() è null con la chiave pubblica); le quattro per
  -- anon con true sono quelle che oggi lasciano leggere e scrivere chiunque.
  -- Se lo schema auth / auth.uid() non esiste già in creaDbLocale, crearlo qui (stub che rende NULL).
  CREATE POLICY "Destinatario può aggiornare lo status" ON telepathy_invites FOR UPDATE TO public USING ((auth.uid())::text = to_id);
  CREATE POLICY "Destinatario vede i propri inviti" ON telepathy_invites FOR SELECT TO public USING ((auth.uid())::text = to_id);
  CREATE POLICY "Mittente può cancellare il proprio invito" ON telepathy_invites FOR DELETE TO public USING ((auth.uid())::text = from_id);
  CREATE POLICY "Utenti autenticati possono creare inviti" ON telepathy_invites FOR INSERT TO public WITH CHECK ((auth.uid())::text = from_id);
  CREATE POLICY "anon can delete telepathy_invites" ON telepathy_invites FOR DELETE TO anon USING (true);
  CREATE POLICY "anon can insert telepathy_invites" ON telepathy_invites FOR INSERT TO anon WITH CHECK (true);
  CREATE POLICY "anon can select telepathy_invites" ON telepathy_invites FOR SELECT TO anon USING (true);
  CREATE POLICY "anon can update telepathy_invites" ON telepathy_invites FOR UPDATE TO anon USING (true) WITH CHECK (true);
  GRANT ALL ON telepathy_invites TO anon, authenticated;
  GRANT ALL ON telepathy_matches, online_users, telepathy_queue TO anon, authenticated;
  CREATE TABLE user_blocks (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    blocker_nickname text NOT NULL, blocked_nickname text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (blocker_nickname, blocked_nickname));
  CREATE TABLE telepathy_scores (user_id text PRIMARY KEY, nickname text, sessions_count integer DEFAULT 0,
    matches_count integer DEFAULT 0, rounds_count integer DEFAULT 0, updated_at timestamptz DEFAULT now());
  CREATE TABLE notifications (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_nickname text NOT NULL,
    type text NOT NULL, message text NOT NULL,
    read boolean DEFAULT false, created_at timestamptz DEFAULT now());
  GRANT ALL ON notifications TO anon, authenticated;
  CREATE TABLE consciousness_posts (author_nickname text); CREATE TABLE consciousness_comments (author_nickname text);
  CREATE TABLE magic_links (email text); CREATE TABLE password_resets (email text);
  CREATE TABLE content_reports (reporter_nickname text);

  -- pg_net finto: registra le chiamate invece di farle. Stessa firma di net.http_post.
  CREATE SCHEMA net;
  CREATE TABLE net.chiamate (id bigserial PRIMARY KEY, url text, body jsonb, headers jsonb, at timestamptz DEFAULT now());
  CREATE FUNCTION net.http_post(url text, body jsonb DEFAULT '{}'::jsonb, params jsonb DEFAULT '{}'::jsonb,
                                headers jsonb DEFAULT '{}'::jsonb, timeout_milliseconds integer DEFAULT 5000)
    RETURNS bigint LANGUAGE sql AS $f$
      INSERT INTO net.chiamate (url, body, headers) VALUES (url, body, headers) RETURNING id $f$;

  -- pg_cron finto: il minimo che serve alla 32a per ridefinire il job.
  CREATE SCHEMA cron;
  CREATE TABLE cron.job (jobid bigserial PRIMARY KEY, jobname text UNIQUE, schedule text, command text, active boolean DEFAULT true);
  CREATE FUNCTION cron.schedule(job_name text, schedule text, command text) RETURNS bigint LANGUAGE sql AS $f$
    INSERT INTO cron.job (jobname, schedule, command) VALUES (job_name, schedule, command)
    ON CONFLICT (jobname) DO UPDATE SET schedule = EXCLUDED.schedule, command = EXCLUDED.command
    RETURNING jobid $f$;
  CREATE FUNCTION cron.unschedule(job_id bigint) RETURNS boolean LANGUAGE sql AS $f$
    DELETE FROM cron.job WHERE jobid = job_id RETURNING true $f$;
  -- Il job della 23_, com'è oggi (una sola chiamata).
  SELECT cron.schedule('notify-ritual-start', '* * * * *',
    $j$ SELECT net.http_post(url := 'https://vxzxdkcluyrcftsnxxza.supabase.co/functions/v1/notify-ritual-start', body := '{}'::jsonb); $j$);
`;

const F31 = 'supabase/sql/31_account_cancellato_rituali.sql';
const F32A = 'supabase/sql/32a_inviti_telepatia_offline.sql';
const F32B = 'supabase/sql/32b_chiudi_inviti_diretti.sql';

// Per gli inviti telepatia: catena dei rituali fino alla 30_, schema della telepatia, 31_
// (l'ultima delete_my_account su main), poi le migration nuove se richieste.
async function creaDbTelepatia({ con32a = true, con32b = false } = {}) {
  const db = await creaDbLocale();
  await db.exec(SCHEMA_TELEPATIA);
  await applicaFile(db, F31);
  if (con32a) await applicaFile(db, F32A);
  if (con32a && con32b) await applicaFile(db, F32B);
  return db;
}
```
e cambiare l'export in:
```js
module.exports = { creaDbLocale, creaDbTelepatia, applicaFile, RUOLO_SERVIZIO, F31, F32A, F32B };
```

- [ ] **Step 3: vederlo passare, e i vecchi test ancora verdi**

```bash
NODE_OPTIONS="--require ./scripts/test-silenzioso.js" node test-pg-locale.js
NODE_OPTIONS="--require ./scripts/test-silenzioso.js" node test-candela-stanza-sql.js | tail -n 1
NODE_OPTIONS="--require ./scripts/test-silenzioso.js" node test-rituali-ricorrenti-sql.js | tail -n 1
```
Atteso: `test-pg-locale.js` → `7 passati, 0 falliti`; gli altri due con gli stessi numeri della baseline (Task 1).

- [ ] **Step 4: commit**

```bash
git add scripts/pg-locale.js test-pg-locale.js
git commit -m "test(sql): Postgres locale con lo schema della telepatia, net e cron finti

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

**Fatto quando:** `test-pg-locale.js` → `7 passati, 0 falliti`; i due test SQL esistenti invariati rispetto alla baseline; ogni differenza fra lo schema scritto e il catalogo è nel messaggio di commit.


### Come sono fatti i Task 7–12 (la migration 32a)

La 32a è **un solo file**, `supabase/sql/32a_inviti_telepatia_offline.sql`, costruito a sezioni: il Task 7 lo crea con testa, `BEGIN;`, sezione A e coda (`NOTIFY pgrst, 'reload schema';` + `COMMIT;`); ogni task successivo **inserisce la sua sezione subito prima della riga `NOTIFY`**. Allo stesso modo il file di test `test-inviti-offline-sql.js` nasce al Task 7 e ogni task aggiunge i suoi blocchi `sezione(...)` **subito prima della riga `// ── esecuzione ──`**. Ogni sezione del test gira su un database nuovo (niente stato condiviso fra sezioni).

Tutti i comandi di verifica dei Task 7–12:

```bash
NODE_OPTIONS="--require ./scripts/test-silenzioso.js" node test-inviti-offline-sql.js
```

### Task 7: 32a, sezione A — tabelle, colonne, trigger di guardia

**Obiettivo:** `telepathy_matches` sa quando un match è vivo e se è mai stato giocato; `telepathy_invites` entra nelle migration con le colonne nuove, gli stati ammessi, un invito aperto per mittente e per destinatario, e un trigger che nella finestra fra 32a e 32b riduce ogni scrittura diretta a un invito da 45 s senza push; nascono le tre tabelle nuove, chiuse ad anon.

**Files:**
- Create: `supabase/sql/32a_inviti_telepatia_offline.sql`
- Create: `test-inviti-offline-sql.js`

**Interfaces:**
- Consumes: `creaDbTelepatia`, `applicaFile`, `F32A` (Task 6).
- Produces (usati da tutti i task dopo):
  - `telepathy_matches.ultima_attivita timestamptz`, `.giocato boolean`, `.da_invito boolean`; trigger `telepathy_matches_attivita`.
  - `telepathy_invites.expires_at`, `.match_id uuid`, `.push_saltata`, `.con_push`, `.responded_at`, `.via_diretta`; `CHECK telepathy_invites_stato_valido`; indici `telepathy_invites_un_pending_mittente`, `telepathy_invites_un_pending_destinatario`; trigger `telepathy_invites_guardia`.
  - `telepathy_availability(id uuid, session_id text UNIQUE, nickname, enabled_at, rinnovata_il)`, `telepathy_invite_blocks(blocker_session, blocked_session, created_at)`, `telepathy_invite_pushes(invite_id, subscription_id, kind, sent_at)`.
  - Nel test: `sezione(nome, fn, opzioni)`, `check`, `errore`, `chiama(db, fn, {param: valore})`, `righe`, `uno`, `comeAnon`, `G(sid, nick)`, `online`, `abbonamento`, `iscritto`, `disp`, `idDisp`, `invia`, `giocato`, `chiamateMotore`.

- [ ] **Step 1: il test prima**

```js
/**
 * Inviti telepatia anche a chi non è collegato (32a, poi 32b) — lato SQL, su Postgres locale.
 * NODE_OPTIONS="--require ./scripts/test-silenzioso.js" node test-inviti-offline-sql.js
 *
 * Niente Supabase: PGlite con lo schema del catalogo (scripts/pg-locale.js) e le migration vere.
 * Ogni sezione gira su un database nuovo. Tutte le date sono relative ad adesso.
 * pg_net è finto: net.chiamate conta le push chieste alla Edge Function.
 */
const { creaDbTelepatia, applicaFile, F32A, F32B } = require('./scripts/pg-locale');
let passed = 0, failed = 0;
const check = (c, m, x) => { if (c) { console.log(`  ✅ ${m}`); passed++; } else { console.log(`  ❌ ${m}${x !== undefined ? ' — ' + JSON.stringify(x) : ''}`); failed++; process.exitCode = 1; } };
const errore = async (p) => { try { await p; return null; } catch (e) { return e.message; } };
const righe = (db, sql, p = []) => db.query(sql, p).then((r) => r.rows);
const uno = async (db, sql, p = []) => (await righe(db, sql, p))[0];
// Chiamata per nome dei parametri, come fa PostgREST: chiama(db, 'fn', { p_a: 1, p_b: null }).
const chiama = (db, fn, args = {}) => {
  const k = Object.keys(args);
  return uno(db, `SELECT ${fn}(${k.map((x, i) => `${x} => $${i + 1}`).join(', ')}) AS r`, k.map((x) => args[x])).then((r) => r.r);
};
const comeAnon = async (db, fn) => { await db.query('SET ROLE anon'); try { return await fn(); } finally { await db.query('RESET ROLE'); } };

// Persone e situazioni.
const G = (sid, nick) => ({ p_session_id: sid, p_password_hash: null, p_nickname: nick });
const online = (db, sid, nick, secondiFa = 0) => db.query(
  `INSERT INTO online_users (id, nickname, last_seen) VALUES ($1, $2, now() - make_interval(secs => $3))
   ON CONFLICT (id) DO UPDATE SET nickname = EXCLUDED.nickname, last_seen = EXCLUDED.last_seen`, [sid, nick, secondiFa]);
const abbonamento = (db, sid) => db.query(
  `INSERT INTO push_subscriptions (session_id, endpoint, p256dh, auth, locale)
   VALUES ($1, 'https://fcm.googleapis.com/fcm/send/prova_' || $1, 'k', 'a', 'it') ON CONFLICT (endpoint) DO NOTHING`, [sid]);
const iscritto = (db, sid, nick, pw) => db.query(
  `INSERT INTO profiles (session_id, nickname, email, password_hash) VALUES ($1, $2, lower($2) || '@test.com', $3)`, [sid, nick, pw]);
const disp = async (db, sid, nick) => { await abbonamento(db, sid); return chiama(db, 'set_telepathy_availability', { ...G(sid, nick), p_enabled: true }); };
const idDisp = async (db, sid) => (await uno(db, `SELECT id FROM telepathy_availability WHERE session_id = $1`, [sid])).id;
const invia = (db, sid, nick, dest) => chiama(db, 'send_telepathy_invite',
  { ...G(sid, nick), p_disponibilita_id: dest.disp || null, p_session_online: dest.online || null });
// Un match già giocato (un update dopo l'insert) fra u1 e u2.
const giocato = async (db, u1, u2) => {
  const id = (await uno(db, `INSERT INTO telepathy_matches (user1_id, user2_id) VALUES ($1, $2) RETURNING id`, [u1, u2])).id;
  await db.query(`UPDATE telepathy_matches SET round_count = 1 WHERE id = $1`, [id]);
  return id;
};
const chiamateMotore = async (db) => (await uno(db, `SELECT count(*)::int n FROM net.chiamate WHERE url LIKE '%/notify-telepathy-invite'`)).n;

const sezioni = [];
const sezione = (nome, fn, opzioni = { con32a: true }) => sezioni.push([nome, fn, opzioni]);

// ════ A. Tabelle e colonne (Task 7) ════════════════════════════════════════
sezione('A1. match: attività e giocato', async (db) => {
  const m = await uno(db, `INSERT INTO telepathy_matches (user1_id, user2_id, giocato) VALUES ('a', 'b', true) RETURNING *`);
  check(m.giocato === false, 'insert: giocato sempre false, anche se il client manda true', m.giocato);
  await db.query(`UPDATE telepathy_matches SET ultima_attivita = now() - interval '20 minutes' WHERE id = $1`, [m.id]);
  let r = await uno(db, `SELECT ultima_attivita < now() - interval '19 minutes' AS vecchia FROM telepathy_matches WHERE id = $1`, [m.id]);
  check(r.vecchia === true, 'migration e ruolo di servizio possono spostare ultima_attivita (serve ai test)', r);
  await comeAnon(db, () => db.query(`UPDATE telepathy_matches SET round_count = 1 WHERE id = $1`, [m.id]));
  const fresca = `SELECT ultima_attivita > now() - interval '5 seconds' AS fresca, giocato FROM telepathy_matches WHERE id = $1`;
  r = await uno(db, fresca, [m.id]);
  check(r.fresca === true && r.giocato === true, 'update dall\'app: ultima_attivita = adesso e giocato = true', r);
  await comeAnon(db, () => db.query(`UPDATE telepathy_matches SET ultima_attivita = now() - interval '1 hour', giocato = false WHERE id = $1`, [m.id]));
  r = await uno(db, fresca, [m.id]);
  check(r.fresca === true && r.giocato === true, 'dall\'app non si sposta indietro l\'attività né si toglie giocato', r);
});

sezione('A2. prima applicazione e rilancio', async () => {
  const db = await creaDbTelepatia({ con32a: false });
  const vecchio = await uno(db, `INSERT INTO telepathy_matches (user1_id, user2_id) VALUES ('x', 'y') RETURNING id`);
  await db.query(`INSERT INTO telepathy_invites (from_id, from_name, to_id, to_name, status) VALUES
    ('p1', 'P1', 'dest', 'D', 'pending'), ('p2', 'P2', 'dest', 'D', 'pending'), ('p3', 'P3', 'altro', 'A', 'boh')`);
  const mPrima = await errore(applicaFile(db, F32A));
  check(!mPrima, 'la 32a passa anche con due pending per lo stesso destinatario', mPrima);
  check((await uno(db, `SELECT giocato FROM telepathy_matches WHERE id = $1`, [vecchio.id])).giocato === true,
    'i match già presenti risultano giocati (sessioni vere, non orfani)');
  const nuovo = await uno(db, `INSERT INTO telepathy_matches (user1_id, user2_id) VALUES ('x2', 'y2') RETURNING giocato, da_invito`);
  check(nuovo.giocato === false && nuovo.da_invito === false, 'dopo la 32a i match nuovi nascono non giocati e non da invito', nuovo);
  const st = await righe(db, `SELECT status, count(*)::int n FROM telepathy_invites GROUP BY 1 ORDER BY 1`);
  check(JSON.stringify(st) === '[{"status":"expired","n":3}]', 'prima applicazione: pending e stati sconosciuti diventano expired', st);
  const idx = await righe(db, `SELECT indexname FROM pg_indexes WHERE tablename = 'telepathy_invites' AND indexname LIKE 'telepathy_invites_un_pending_%'`);
  check(idx.length === 2, 'i due indici unici parziali esistono', idx);
  const mCheck = await errore(db.query(`INSERT INTO telepathy_invites (from_id, to_id, status) VALUES ('q', 'r', 'inventato')`));
  check(!!mCheck && /check|violates/i.test(mCheck), 'uno stato sconosciuto è rifiutato dal CHECK', mCheck);
  await db.query(`INSERT INTO telepathy_invites (from_id, from_name, to_id, to_name, expires_at) VALUES
    ('vivo', 'V', 'dv', 'DV', now() + interval '5 minutes'), ('morto', 'M', 'dm', 'DM', now() - interval '1 second')`);
  const mRil = await errore(applicaFile(db, F32A));
  check(!mRil, 'la 32a si rilancia senza errori', mRil);
  const dopo = await righe(db, `SELECT from_id, status FROM telepathy_invites WHERE from_id IN ('vivo', 'morto') ORDER BY 1`);
  check(dopo[0].status === 'expired' && dopo[1].status === 'pending', 'rilancio: chiude solo i pending già scaduti, non quelli vivi', dopo);
}, { con32a: false });

sezione('A3. guardia sulle scritture dirette', async (db) => {
  const ins = await comeAnon(db, () => uno(db, `INSERT INTO telepathy_invites
      (from_id, from_name, to_id, to_name, status, expires_at, con_push, push_saltata, match_id, responded_at, created_at)
    VALUES ('ga', 'GA', 'gb', 'GB', 'accepted', now() + interval '1 year', true, true, gen_random_uuid(), now(), now() - interval '1 day')
    RETURNING *`));
  check(ins.status === 'pending', 'insert diretto: lo stato è sempre pending', ins.status);
  const d = await uno(db, `SELECT extract(epoch FROM expires_at - created_at)::int s, created_at > now() - interval '5 seconds' AS adesso
                           FROM telepathy_invites WHERE id = $1`, [ins.id]);
  check(d.s === 45 && d.adesso === true, 'insert diretto: 45 s da adesso, created_at non si inventa', d);
  check(ins.con_push === false && ins.push_saltata === false && ins.match_id === null && ins.responded_at === null,
    'insert diretto: niente push, niente match_id, niente responded_at', ins);
  check(ins.via_diretta === true, 'insert diretto: segnato via_diretta', ins.via_diretta);
  await comeAnon(db, () => db.query(`UPDATE telepathy_invites SET status = 'accepted', match_id = '11111111-1111-1111-1111-111111111111',
    expires_at = now() + interval '1 year', to_id = 'altro', con_push = true WHERE id = $1`, [ins.id]));
  const up = await uno(db, `SELECT * FROM telepathy_invites WHERE id = $1`, [ins.id]);
  check(up.status === 'accepted', 'update diretto: lo stato cambia (le app vecchie accettano così)', up.status);
  check(up.match_id === null && up.to_id === 'gb' && up.con_push === false, 'update diretto: match_id, destinatario e con_push restano com\'erano', up);
  check(up.responded_at !== null, 'update diretto: uscendo da pending, responded_at lo scrive il server', up.responded_at);
  const priv = await uno(db, `INSERT INTO telepathy_invites (from_id, from_name, to_id, to_name, con_push, expires_at)
    VALUES ('pa', 'PA', 'pb', 'PB', true, now() + interval '10 minutes')
    RETURNING con_push, via_diretta, extract(epoch FROM expires_at - created_at)::int s`);
  check(priv.con_push === true && priv.via_diretta === false && priv.s >= 599, 'scrittura privilegiata (RPC, servizio): le colonne restano quelle scritte', priv);
});

sezione('A4. tabelle nuove chiuse ad anon', async (db) => {
  for (const t of ['telepathy_availability', 'telepathy_invite_blocks', 'telepathy_invite_pushes']) {
    const m = await errore(comeAnon(db, () => db.query(`SELECT * FROM ${t}`)));
    check(!!m && /permission denied/i.test(m), `${t}: anon non legge`, m);
  }
});

// ── esecuzione ──
(async () => {
  for (const [nome, fn, opzioni] of sezioni) {
    console.log(`\n— ${nome} —`);
    try {
      const db = opzioni.con32a === false ? null : await creaDbTelepatia(opzioni);
      await fn(db);
    } catch (e) { check(false, `${nome}: eccezione`, e.message); }
  }
  console.log(`\n${passed} passati, ${failed} falliti`);
})();
```

- [ ] **Step 2: vederlo fallire**

Atteso: ogni sezione `❌ …: eccezione — ENOENT … 32a_inviti_telepatia_offline.sql`.

- [ ] **Step 3: la migration, testa e sezione A**

```sql
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

NOTIFY pgrst, 'reload schema';

COMMIT;
```

- [ ] **Step 4: vederlo passare**

Atteso: `23 passati, 0 falliti`.

- [ ] **Step 5: commit**

```bash
git add supabase/sql/32a_inviti_telepatia_offline.sql test-inviti-offline-sql.js
git commit -m "feat(sql): 32a sezione A — colonne, stati, un invito aperto, trigger di guardia

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

**Fatto quando:** `test-inviti-offline-sql.js` → `23 passati, 0 falliti`.

### Task 8: 32a, sezione B — funzioni interne condivise

**Obiettivo:** una sola definizione, sul server, di «chi è», «come si chiama in pubblico», «è online», «è in un training», «c'è un blocco», «è disponibile», «chi è la persona indicata» e «chiama il motore delle push»; nessuna di queste è chiamabile dall'app.

**Files:**
- Modify: `supabase/sql/32a_inviti_telepatia_offline.sql` (sezione B prima di `NOTIFY`)
- Modify: `test-inviti-offline-sql.js` (sezioni B prima di `// ── esecuzione ──`)

**Interfaces:**
- Produces (tutte `SECURITY DEFINER`, `SET search_path = public, pg_temp`, nessun privilegio ad anon/authenticated):
  - `telepatia_verifica_identita(p_session_id text, p_password_hash text) → void` (eccezioni `session_required`, `session_id_too_long`, `Auth failed`)
  - `nome_pubblico(p_session_id text, p_nome text) → text`
  - `telepatia_online(p_session_id text) → boolean` (visto negli ultimi 30 s)
  - `telepatia_in_training(p_session_id text, p_escludi uuid DEFAULT NULL) → boolean`
  - `telepatia_bloccati(p_sid_a text, p_nome_a text, p_sid_b text, p_nome_b text) → boolean`
  - `telepatia_era_da_dieci(p_creato timestamptz, p_scade timestamptz) → boolean`
  - `telepatia_disponibile(p_session_id text) → boolean`
  - `telepatia_risolvi(p_disponibilita_id uuid, p_session_online text, OUT o_sid text, OUT o_nome text)`
  - `telepatia_motivo_stato(p_status text) → text` (`accepted`→`gia_accettato`, `declined`→`rifiutato`, `cancelled`→`annullato`, altrimenti `scaduto`)
  - `telepatia_chiama_motore(p_corpo jsonb) → void`

- [ ] **Step 1: il test prima**

```js
// ════ B. Funzioni interne (Task 8) ═════════════════════════════════════════
sezione('B1. identità', async (db) => {
  await iscritto(db, 'reg1', 'Aurora', 'h1');
  const id = (sid, pw) => errore(db.query(`SELECT telepatia_verifica_identita($1, $2)`, [sid, pw]));
  let m = await id('reg1', null);
  check(!!m && m.includes('Auth failed'), 'iscritto senza credenziale: Auth failed', m);
  m = await id('reg1', 'sbagliata');
  check(!!m && m.includes('Auth failed'), 'iscritto con credenziale sbagliata: Auth failed', m);
  check(!(await id('reg1', 'h1')), 'iscritto con la sua credenziale: passa');
  check(!(await id('ospite1', null)), 'ospite: basta il session_id');
  m = await id('', null);
  check(!!m && m.includes('session_required'), 'session_id vuoto: session_required', m);
  m = await id('x'.repeat(256), null);
  check(!!m && m.includes('session_id_too_long'), 'session_id oltre 255: session_id_too_long', m);
});

sezione('B2. nome_pubblico uguale alla pulizia della candela (30_)', async (db) => {
  await iscritto(db, 'reg1', 'Aurora', 'h1');
  await db.query(`INSERT INTO profiles (session_id, nickname, email, password_hash) VALUES ('reg3', 'Luna Nuova', 'l@test.com', 'hl')`);
  const t = Date.now() - 60000;
  const rit = await uno(db, `SELECT * FROM create_ritual('Ospite', 'prova', 'Candela', '', 'consciousness', 11, $1, $2, 30, NULL)`,
    [new Date(t).toISOString().slice(0, 10), new Date(t).toISOString().slice(11, 16)]);
  // Gli stessi casi di test-candela-stanza-sql.js, scritti con gli escape per non perderli.
  const nomi = ['  Luce  ', 'aURORA', '​Aurora‮', ' ​Lu‏c⁦e\u0007\u001b ', '​‍‪⁩\u0001',
    '​'.repeat(10) + 'y'.repeat(60), 'Luna Nuova', 'Luna　Nuova', 'Ａｕｒｏｒａ',
    'Luna 　Piena', '   ', 'x'.repeat(80), 'Au­rora', 'Normale'];
  let uguali = 0;
  for (let i = 0; i < nomi.length; i++) {
    const sid = 'np' + i;
    await db.query(`SELECT segna_presenza_rituale($1, $2)`, [rit.id, sid]);
    const r = await uno(db, `SELECT * FROM toggle_ritual_candle($1, $2, $3, NULL)`, [rit.id, sid, nomi[i]]);
    const np = (await uno(db, `SELECT nome_pubblico($1, $2) AS n`, [sid, nomi[i]])).n;
    if (r.candles_nomi[sid] === np) uguali++; else console.log('    diverso:', JSON.stringify(nomi[i]), r.candles_nomi[sid], np);
  }
  check(uguali === nomi.length, `nome_pubblico e toggle_ritual_candle: stesso nome su ${nomi.length} casi`, uguali);
  check((await uno(db, `SELECT nome_pubblico('reg1', 'Impostore') AS n`)).n === 'Aurora', 'iscritto: il nome viene dal profilo');
});

sezione('B3. in training', async (db) => {
  const inTr = async (sid, escludi = null) => (await uno(db, `SELECT telepatia_in_training($1, $2) AS t`, [sid, escludi])).t;
  const m1 = (await uno(db, `INSERT INTO telepathy_matches (user1_id, user2_id) VALUES ('t1', 't2') RETURNING id`)).id;
  check(await inTr('t1') === false, 'match appena nato, mai giocato, senza invito: non è un training');
  await db.query(`UPDATE telepathy_matches SET round_count = 1 WHERE id = $1`, [m1]);
  check(await inTr('t1') === true && await inTr('t2') === true, 'dopo un update: training per entrambi');
  await db.query(`UPDATE telepathy_matches SET ultima_attivita = now() - interval '11 minutes' WHERE id = $1`, [m1]);
  check(await inTr('t1') === false, 'dieci minuti senza aggiornamenti: non più in training');
  const m2 = (await uno(db, `INSERT INTO telepathy_matches (user1_id, user2_id, da_invito) VALUES ('t3', 't4', true) RETURNING id`)).id;
  await db.query(`INSERT INTO telepathy_invites (from_id, from_name, to_id, to_name, status, match_id, responded_at)
                  VALUES ('t3', 'T3', 't4', 'T4', 'accepted', $1, now())`, [m2]);
  check(await inTr('t3') === true, 'mai giocato ma legato a un invito accettato: training');
  check(await inTr('t3', m2) === false, 'il match escluso non conta');
  await db.query(`UPDATE telepathy_matches SET ended_at = now() WHERE id = $1`, [m2]);
  check(await inTr('t3') === false, 'match con ended_at: non è un training');
});

sezione('B4. online e blocchi', async (db) => {
  await online(db, 'o1', 'Uno');
  await online(db, 'o2', 'Due', 31);
  check((await uno(db, `SELECT telepatia_online('o1') AS t`)).t === true, 'visto adesso: online');
  check((await uno(db, `SELECT telepatia_online('o2') AS t`)).t === false, 'visto 31 s fa: non online');
  await db.query(`INSERT INTO user_blocks (blocker_nickname, blocked_nickname) VALUES ('Uno', 'Due')`);
  check((await uno(db, `SELECT telepatia_bloccati('o2', 'Due', 'o1', 'Uno') AS b`)).b === true, 'user_blocks vale nei due sensi');
  await db.query(`INSERT INTO telepathy_invite_blocks (blocker_session, blocked_session) VALUES ('s1', 's2')`);
  check((await uno(db, `SELECT telepatia_bloccati('s2', 'X', 's1', 'Y') AS b`)).b === true, 'telepathy_invite_blocks vale nei due sensi');
  check((await uno(db, `SELECT telepatia_bloccati('s3', 'X', 's1', 'Y') AS b`)).b === false, 'senza blocchi: falso');
});

sezione('B5. funzioni interne chiuse all\'app, motore chiamato bene', async (db) => {
  for (const q of [`SELECT telepatia_verifica_identita('a', NULL)`, `SELECT nome_pubblico('a', 'b')`,
                   `SELECT telepatia_in_training('a')`, `SELECT telepatia_online('a')`,
                   `SELECT telepatia_bloccati('a', 'b', 'c', 'd')`, `SELECT telepatia_chiama_motore('{}'::jsonb)`,
                   `SELECT telepatia_disponibile('a')`, `SELECT * FROM telepatia_risolvi(NULL, 'a')`]) {
    const m = await errore(comeAnon(db, () => db.query(q)));
    check(!!m && /permission denied/i.test(m), `anon non esegue: ${q.slice(0, 45)}`, m);
  }
  await db.query(`SELECT telepatia_chiama_motore('{"tipo":"prova"}'::jsonb)`);
  const c = await uno(db, `SELECT url, body, headers FROM net.chiamate ORDER BY id DESC LIMIT 1`);
  const ruolo = JSON.parse(Buffer.from(c.headers.Authorization.split('.')[1], 'base64').toString()).role;
  check(c.url.endsWith('/functions/v1/notify-telepathy-invite') && c.body.tipo === 'prova' && ruolo === 'anon',
    'telepatia_chiama_motore: una chiamata alla funzione giusta, con la chiave pubblica', c.url);
});
```

- [ ] **Step 2: vederlo fallire** — Atteso: le sezioni B vanno in eccezione (`function telepatia_verifica_identita(…) does not exist`); le A restano verdi (23).

- [ ] **Step 3: la sezione B**

```sql
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

-- La pulizia del nome della 30_ (toggle_ritual_candle), identica carattere per carattere.
-- toggle_ritual_candle NON si ridefinisce per usarla (spec §9): le due copie le tiene uguali il
-- test B2 di test-inviti-offline-sql.js.
CREATE OR REPLACE FUNCTION public.nome_pubblico(p_session_id text, p_nome text)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_nome text;
BEGIN
  SELECT nullif(btrim(nickname), '') INTO v_nome FROM profiles WHERE session_id = p_session_id;
  IF v_nome IS NULL THEN
    v_nome := regexp_replace(normalize(coalesce(p_nome, ''), NFKC),
                '[[:cntrl:]­͏؜ᅟᅠ᠎​-‏‪-‮⁠-⁤⁦-⁩ㅤ﻿ﾠ]',
                '', 'g');
    v_nome := regexp_replace(v_nome, '[[:space:]   -     　]+', ' ', 'g');
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
-- server), telepathy_invite_blocks sui session_id.
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

REVOKE ALL ON FUNCTION public.telepatia_verifica_identita(text, text)        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.nome_pubblico(text, text)                      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.telepatia_online(text)                         FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.telepatia_in_training(text, uuid)              FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.telepatia_bloccati(text, text, text, text)     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.telepatia_era_da_dieci(timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.telepatia_disponibile(text)                    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.telepatia_risolvi(uuid, text)                  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.telepatia_motivo_stato(text)                   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.telepatia_chiama_motore(jsonb)                 FROM PUBLIC, anon, authenticated;
```

- [ ] **Step 4: vederlo passare** — Atteso: `51 passati, 0 falliti`. Se B2 stampa righe «diverso:», la copia della pulizia non è identica a quella della 30_: confrontare le due regex carattere per carattere con `git show HEAD:supabase/sql/30_candela_nella_stanza.sql`.

- [ ] **Step 5: commit**

```bash
git add supabase/sql/32a_inviti_telepatia_offline.sql test-inviti-offline-sql.js
git commit -m "feat(sql): 32a sezione B — identità, nome pubblico, training, blocchi, motore

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

**Fatto quando:** `51 passati, 0 falliti`, nessuna riga «diverso:».


### Task 9: 32a, sezione C — interruttore, lista «Disponibili su invito», scheda

**Obiettivo:** accendere, spegnere e rinnovare la disponibilità con lo stato deciso dal server; la lista e la scheda escludono blocchi, chi è online, chi gioca, chi non ha abbonamenti o non apre l'app da 14 giorni, e non restituiscono mai `session_id`, `user_id` o email.

**Files:**
- Modify: `supabase/sql/32a_inviti_telepatia_offline.sql` (sezione C prima di `NOTIFY`)
- Modify: `test-inviti-offline-sql.js`

**Interfaces:**
- Consumes: funzioni della sezione B (Task 8).
- Produces (RPC per l'app, `GRANT EXECUTE … TO anon, authenticated`):
  - `set_telepathy_availability(p_session_id text, p_password_hash text, p_nickname text, p_enabled boolean) → jsonb {ok, acceso, motivo?}`; `motivo` ∈ `nessun_abbonamento`, `dati_non_validi`
  - `renew_telepathy_availability(p_session_id text, p_password_hash text) → jsonb {ok, stato}`; `stato` ∈ `acceso`, `spento`, `senza_abbonamento`
  - `get_invitable_users(p_session_id text, p_password_hash text, p_nickname text DEFAULT NULL) → TABLE(id uuid, nickname text)`
  - `get_invite_card(p_session_id text, p_password_hash text, p_nickname text DEFAULT NULL, p_disponibilita_id uuid DEFAULT NULL, p_session_online text DEFAULT NULL) → jsonb {ok, motivo?, scheda?: {nickname, country, bio, prove, indovinate}}`; `motivo` ∈ `non_trovato`, `dati_non_validi`

- [ ] **Step 1: il test prima**

```js
// ════ C. Interruttore, lista, scheda (Task 9) ══════════════════════════════
sezione('C1. interruttore', async (db) => {
  const set = (sid, nick, on, pw = null) => chiama(db, 'set_telepathy_availability', { p_session_id: sid, p_password_hash: pw, p_nickname: nick, p_enabled: on });
  const renew = (sid) => chiama(db, 'renew_telepathy_availability', { p_session_id: sid, p_password_hash: null });
  const riga = (sid) => uno(db, `SELECT nickname FROM telepathy_availability WHERE session_id = $1`, [sid]);
  let r = await set('d1', 'Dora', true);
  check(r.ok === false && r.motivo === 'nessun_abbonamento' && r.acceso === false, 'accendere senza abbonamento: nessun_abbonamento', r);
  await abbonamento(db, 'd1');
  r = await set('d1', ' Dora ', true);
  check(r.ok === true && r.acceso === true, 'con un abbonamento si accende', r);
  check((await riga('d1')).nickname === 'Dora', 'il nome salvato è quello ripulito');
  check((await renew('d1')).stato === 'acceso', 'renew con riga e abbonamento: acceso');
  await db.query(`DELETE FROM push_subscriptions WHERE session_id = 'd1'`);
  check((await renew('d1')).stato === 'senza_abbonamento', 'renew senza abbonamento: senza_abbonamento');
  r = await set('d1', 'Dora', false);
  check(r.ok === true && r.acceso === false && !(await riga('d1')), 'spegnere cancella la riga', r);
  r = await renew('d1');
  check(r.stato === 'spento' && !(await riga('d1')), 'renew senza riga: spento, e non la crea', r);
  await iscritto(db, 'reg1', 'Aurora', 'h1');
  await abbonamento(db, 'reg1');
  const m = await errore(set('reg1', 'X', true));
  check(!!m && m.includes('Auth failed'), 'iscritto senza credenziale: Auth failed', m);
  r = await set('reg1', 'Impostore', true, 'h1');
  check(r.acceso === true && (await riga('reg1')).nickname === 'Aurora', 'iscritto: il nome viene dal profilo', r);
});

sezione('C2. lista «Disponibili su invito»', async (db) => {
  for (const [sid, nick] of [['io', 'Io'], ['ok1', 'Ok'], ['bl1', 'Bloccato'], ['bl2', 'MiBlocca'], ['vecchio', 'Vecchio'], ['onl', 'Online'], ['train', 'Allena']]) {
    await disp(db, sid, nick);
  }
  await db.query(`INSERT INTO user_blocks (blocker_nickname, blocked_nickname) VALUES ('Io', 'Bloccato')`);
  await db.query(`INSERT INTO telepathy_invite_blocks (blocker_session, blocked_session) VALUES ('bl2', 'io')`);
  await db.query(`INSERT INTO telepathy_availability (session_id, nickname) VALUES ('nosub', 'SenzaAbbonamento')`);
  await db.query(`UPDATE telepathy_availability SET rinnovata_il = now() - interval '20 days' WHERE session_id = 'vecchio'`);
  await online(db, 'onl', 'Online');
  await giocato(db, 'train', 'zz');
  const lista = await righe(db, `SELECT * FROM get_invitable_users('io', NULL, 'Io')`);
  check(JSON.stringify(lista.map((x) => x.nickname)) === '["Ok"]',
    'la lista esclude me, blocchi nei due sensi, senza abbonamento, 14 giorni, online, in training', lista.map((x) => x.nickname));
  check(Object.keys(lista[0]).sort().join(',') === 'id,nickname', 'la lista restituisce solo id opaco e nickname', Object.keys(lista[0]));
  check(lista[0].id !== 'ok1' && /^[0-9a-f-]{36}$/.test(lista[0].id), 'l\'id è quello opaco, non il session_id', lista[0].id);
  await chiama(db, 'renew_telepathy_availability', { p_session_id: 'vecchio', p_password_hash: null });
  const lista2 = await righe(db, `SELECT nickname FROM get_invitable_users('io', NULL, 'Io') ORDER BY nickname`);
  check(JSON.stringify(lista2.map((x) => x.nickname)) === '["Ok","Vecchio"]', 'dopo 20 giorni la riapertura lo rimette in lista da sola', lista2);
  const lista3 = await righe(db, `SELECT nickname FROM get_invitable_users('io', NULL, ' Io ')`);
  check(!lista3.some((x) => x.nickname === 'Bloccato'), 'blocco per nome: il nome mandato dall\'app passa da nome_pubblico', lista3);
});

sezione('C3. scheda', async (db) => {
  const scheda = (disp_, onl) => chiama(db, 'get_invite_card', { ...G('io', 'Io'), p_disponibilita_id: disp_, p_session_online: onl });
  await iscritto(db, 'reg2', 'Stella', 'hs');
  await db.query(`UPDATE profiles SET country = 'IT', bio = 'Ciao', show_telepathy_score = true WHERE session_id = 'reg2'`);
  await db.query(`INSERT INTO telepathy_scores (user_id, nickname, rounds_count, matches_count) VALUES ('stella@test.com', 'Stella', 40, 12)`);
  await abbonamento(db, 'reg2');
  await chiama(db, 'set_telepathy_availability', { p_session_id: 'reg2', p_password_hash: 'hs', p_nickname: null, p_enabled: true });
  const idStella = await idDisp(db, 'reg2');
  let c = await scheda(idStella, null);
  check(c.ok === true && c.scheda.nickname === 'Stella' && c.scheda.country === 'IT' && c.scheda.bio === 'Ciao', 'scheda di un iscritto: nome, paese, bio', c);
  check(c.scheda.prove === 40 && c.scheda.indovinate === 12, 'scheda: prove e indovinate', c.scheda);
  const testo = JSON.stringify(c);
  check(!testo.includes('reg2') && !testo.includes('@test.com') && !('user_id' in c.scheda) && !('session_id' in c.scheda),
    'scheda: niente session_id, user_id, email', testo);
  await db.query(`UPDATE profiles SET show_telepathy_score = false WHERE session_id = 'reg2'`);
  c = await scheda(idStella, null);
  check(c.scheda.prove === null && c.scheda.indovinate === null, 'punteggio nascosto: prove e indovinate null', c.scheda);
  await online(db, 'osp', 'Ospitina');
  await db.query(`INSERT INTO telepathy_scores (user_id, nickname, rounds_count, matches_count) VALUES ('osp', 'Ospitina', 7, 2)`);
  c = await scheda(null, 'osp');
  check(c.ok === true && c.scheda.nickname === 'Ospitina' && c.scheda.prove === 7 && c.scheda.bio === null, 'scheda di un ospite dalla lista Online', c);
  await db.query(`UPDATE online_users SET last_seen = now() - interval '31 seconds' WHERE id = 'osp'`);
  c = await scheda(null, 'osp');
  check(c.ok === false && c.motivo === 'non_trovato', 'p_session_online non visto da 31 s: non trovato', c);
  c = await scheda('22222222-2222-2222-2222-222222222222', null);
  check(c.ok === false && c.motivo === 'non_trovato', 'id opaco inesistente: non trovato', c);
  c = await scheda(idStella, 'osp');
  check(c.ok === false && c.motivo === 'dati_non_validi', 'entrambi i parametri: dati_non_validi', c);
  await db.query(`INSERT INTO user_blocks (blocker_nickname, blocked_nickname) VALUES ('Stella', 'Io')`);
  c = await scheda(idStella, null);
  check(c.ok === false && c.motivo === 'non_trovato', 'chi mi ha bloccato: la scheda risulta non trovata', c);
});
```

- [ ] **Step 2: vederlo fallire** — Atteso: sezioni C in eccezione (`function set_telepathy_availability … does not exist`), le altre verdi (51).

- [ ] **Step 3: la sezione C**

```sql
-- ════ C. Interruttore, lista «Disponibili su invito», scheda ═════════════════

-- Solo da un gesto della persona (l'interruttore). Accendere vuole un abbonamento push: senza,
-- comparire in lista sarebbe una promessa falsa. Spegnere cancella la riga.
CREATE OR REPLACE FUNCTION public.set_telepathy_availability(p_session_id text, p_password_hash text,
                                                             p_nickname text, p_enabled boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM telepatia_verifica_identita(p_session_id, p_password_hash);
  IF p_enabled IS NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', 'dati_non_validi', 'acceso', false); END IF;
  IF NOT p_enabled THEN
    DELETE FROM telepathy_availability WHERE session_id = p_session_id;
    RETURN jsonb_build_object('ok', true, 'acceso', false);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM push_subscriptions WHERE session_id = p_session_id) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'nessun_abbonamento', 'acceso', false);
  END IF;
  INSERT INTO telepathy_availability (session_id, nickname)
  VALUES (p_session_id, nome_pubblico(p_session_id, p_nickname))
  ON CONFLICT (session_id) DO UPDATE SET nickname = EXCLUDED.nickname, rinnovata_il = now();
  RETURN jsonb_build_object('ok', true, 'acceso', true);
END $$;

-- A ogni apertura dell'app. Rinnova SOLO una riga che esiste (non la crea mai) e dice com'è
-- l'interruttore per il server: un altro telefono che l'ha spento vince sul rinnovo di questo.
-- Dopo 14 giorni senza aperture la persona era fuori lista: questo la rimette (spec §2.2).
CREATE OR REPLACE FUNCTION public.renew_telepathy_availability(p_session_id text, p_password_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM telepatia_verifica_identita(p_session_id, p_password_hash);
  UPDATE telepathy_availability SET rinnovata_il = now() WHERE session_id = p_session_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', true, 'stato', 'spento'); END IF;
  IF NOT EXISTS (SELECT 1 FROM push_subscriptions WHERE session_id = p_session_id) THEN
    RETURN jsonb_build_object('ok', true, 'stato', 'senza_abbonamento');
  END IF;
  RETURN jsonb_build_object('ok', true, 'stato', 'acceso');
END $$;

-- La lista. Solo l'identificativo opaco e il nome: mai il session_id. Chi è online sta già
-- nella lista Online, quindi qui non compare (la deduplica la fa il server). p_nickname è il
-- nome di chi chiama per i blocchi per nome: passa da nome_pubblico, come nell'invio (spec
-- §4.1 punto 7, «Il nome di chi chiama, per i blocchi»).
CREATE OR REPLACE FUNCTION public.get_invitable_users(p_session_id text, p_password_hash text, p_nickname text DEFAULT NULL)
RETURNS TABLE (id uuid, nickname text) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
#variable_conflict use_column
DECLARE v_me text;
BEGIN
  PERFORM telepatia_verifica_identita(p_session_id, p_password_hash);
  v_me := nome_pubblico(p_session_id, p_nickname);
  RETURN QUERY
    SELECT a.id, x.nome
      FROM telepathy_availability a
      CROSS JOIN LATERAL (SELECT nome_pubblico(a.session_id, a.nickname) AS nome) x
     WHERE a.session_id <> p_session_id
       AND a.rinnovata_il > now() - interval '14 days'
       AND EXISTS (SELECT 1 FROM push_subscriptions s WHERE s.session_id = a.session_id)
       AND NOT telepatia_online(a.session_id)
       AND NOT telepatia_in_training(a.session_id)
       AND NOT telepatia_bloccati(p_session_id, v_me, a.session_id, x.nome)
     ORDER BY x.nome
     LIMIT 200;
END $$;

-- La scheda: nome, paese, bio, prove e indovinate. Mai user_id (per un iscritto è l'email),
-- mai session_id. Punteggio nascosto se il profilo lo nasconde. Blocchi: «non trovato», come
-- una persona che non c'è (non si rivela il blocco).
CREATE OR REPLACE FUNCTION public.get_invite_card(p_session_id text, p_password_hash text, p_nickname text DEFAULT NULL,
                                                  p_disponibilita_id uuid DEFAULT NULL, p_session_online text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_sid text; v_nome text; v_email text; v_paese text; v_bio text; v_mostra boolean;
        v_prove integer; v_indovinate integer;
BEGIN
  PERFORM telepatia_verifica_identita(p_session_id, p_password_hash);
  IF (p_disponibilita_id IS NULL) = (p_session_online IS NULL) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'dati_non_validi');
  END IF;
  SELECT o_sid, o_nome INTO v_sid, v_nome FROM telepatia_risolvi(p_disponibilita_id, p_session_online);
  IF v_sid IS NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', 'non_trovato'); END IF;
  IF v_sid = p_session_id THEN RETURN jsonb_build_object('ok', false, 'motivo', 'dati_non_validi'); END IF;
  -- Dalla lista «Disponibili su invito» la scheda esiste solo per chi è davvero in lista.
  IF p_disponibilita_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM telepathy_availability a
        WHERE a.id = p_disponibilita_id AND a.rinnovata_il > now() - interval '14 days'
          AND EXISTS (SELECT 1 FROM push_subscriptions s WHERE s.session_id = a.session_id)) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'non_trovato');
  END IF;
  IF telepatia_bloccati(p_session_id, nome_pubblico(p_session_id, p_nickname), v_sid, v_nome) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'non_trovato');
  END IF;
  SELECT email, country, bio, show_telepathy_score INTO v_email, v_paese, v_bio, v_mostra
    FROM profiles WHERE session_id = v_sid;
  SELECT rounds_count, matches_count INTO v_prove, v_indovinate
    FROM telepathy_scores WHERE user_id = coalesce(v_email, v_sid);
  IF v_mostra IS FALSE THEN v_prove := NULL; v_indovinate := NULL; END IF;
  RETURN jsonb_build_object('ok', true, 'scheda', jsonb_build_object(
    'nickname', v_nome, 'country', v_paese, 'bio', v_bio, 'prove', v_prove, 'indovinate', v_indovinate));
END $$;

REVOKE ALL ON FUNCTION public.set_telepathy_availability(text, text, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.renew_telepathy_availability(text, text)              FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_invitable_users(text, text, text)                 FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_invite_card(text, text, text, uuid, text)         FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_telepathy_availability(text, text, text, boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.renew_telepathy_availability(text, text)              TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_invitable_users(text, text, text)                 TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_invite_card(text, text, text, uuid, text)         TO anon, authenticated;
```

- [ ] **Step 4: vederlo passare** — Atteso: `74 passati, 0 falliti`.
- [ ] **Step 5: commit** — `git add` dei due file, messaggio `feat(sql): 32a sezione C — interruttore, lista, scheda` con la riga `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

**Fatto quando:** `74 passati, 0 falliti`.

### Task 10: 32a, sezione D — l'invio

**Obiettivo:** `send_telepathy_invite` rifiuta con un motivo chiaro ogni caso della spec, sceglie la durata (45 s / 10 minuti), scrive l'invito e la notifica della campanella con i nomi del server, applica i tetti per destinatario, traduce il 23505 per indice, e chiede la push solo dopo che l'insert è riuscito e solo a chi ha la riga di disponibilità.

**Files:**
- Modify: `supabase/sql/32a_inviti_telepatia_offline.sql` (sezione D)
- Modify: `test-inviti-offline-sql.js`

**Interfaces:**
- Produces: `send_telepathy_invite(p_session_id text, p_password_hash text, p_nickname text, p_disponibilita_id uuid DEFAULT NULL, p_session_online text DEFAULT NULL) → jsonb`: `{ok:true, id, expires_at, created_at, push_saltata, adesso}` oppure `{ok:false, motivo}` con `motivo` ∈ `dati_non_validi`, `non_disponibile`, `in_match`, `invito_in_corso`, `gia_invitato`, `troppi_inviti`. Notifica: `notifications(user_nickname = nome del destinatario, type = 'telepathy_invite', message = '<mittente> ti ha invitato a un training telepatico')`. Push: `telepatia_chiama_motore({invito, tipo:'invito'})`.

- [ ] **Step 1: il test prima**

```js
// ════ D. Invio (Task 10) ═══════════════════════════════════════════════════
sezione('D1. invio: i rifiuti', async (db) => {
  await disp(db, 'dest', 'Dest');
  const dId = await idDisp(db, 'dest');
  await disp(db, 'blk', 'Blk');
  await db.query(`INSERT INTO telepathy_invite_blocks (blocker_session, blocked_session) VALUES ('blk', 'mitt')`);
  let r = await invia(db, 'mitt', 'Mitt', { disp: await idDisp(db, 'blk') });
  check(r.ok === false && r.motivo === 'non_disponibile', 'destinatario che mi ha bloccato: non_disponibile', r);
  await db.query(`INSERT INTO telepathy_availability (session_id, nickname) VALUES ('senza', 'Senza')`);
  r = await invia(db, 'mitt', 'Mitt', { disp: await idDisp(db, 'senza') });
  check(r.ok === false && r.motivo === 'non_disponibile', 'destinatario senza abbonamento: non_disponibile', r);
  await disp(db, 'allena', 'Allena');
  await giocato(db, 'allena', 'q');
  r = await invia(db, 'mitt', 'Mitt', { disp: await idDisp(db, 'allena') });
  check(r.ok === false && r.motivo === 'non_disponibile', 'destinatario in un training: non_disponibile (stesso motivo del blocco)', r);
  await disp(db, 'mitt', 'Mitt');
  r = await invia(db, 'mitt', 'Mitt', { disp: await idDisp(db, 'mitt') });
  check(r.ok === false && r.motivo === 'dati_non_validi', 'invitare sé stessi: dati_non_validi', r);
  r = await invia(db, 'mitt', 'Mitt', { disp: dId, online: 'x' });
  check(r.ok === false && r.motivo === 'dati_non_validi', 'due parametri insieme: dati_non_validi', r);
  await online(db, 'lontano', 'Lontano', 31);
  r = await invia(db, 'mitt', 'Mitt', { online: 'lontano' });
  check(r.ok === false && r.motivo === 'non_disponibile', 'p_session_online visto 31 s fa: non si trova', r);
  const m2 = await giocato(db, 'mitt', 'w');
  r = await invia(db, 'mitt', 'Mitt', { disp: dId });
  check(r.ok === false && r.motivo === 'in_match', 'mittente in un training: in_match', r);
  await db.query(`UPDATE telepathy_matches SET ended_at = now() WHERE id = $1`, [m2]);
  r = await invia(db, 'mitt', 'Mitt', { disp: dId });
  check(r.ok === true && !!r.id, 'finito il training, l\'invito parte', r);
  const r2 = await invia(db, 'mitt', 'Mitt', { disp: dId });
  check(r2.ok === false && r2.motivo === 'invito_in_corso', 'secondo invito dello stesso mittente: invito_in_corso', r2);
  await disp(db, 'altro', 'Altro');
  const r3 = await invia(db, 'altro', 'Altro', { disp: dId });
  check(r3.ok === false && r3.motivo === 'gia_invitato', 'un secondo mittente verso lo stesso destinatario: gia_invitato', r3);
  await db.query(`UPDATE telepathy_invites SET expires_at = now() - interval '1 second' WHERE id = $1`, [r.id]);
  const r4 = await invia(db, 'altro', 'Altro', { disp: dId });
  check(r4.ok === true, 'scaduto l\'invito, il destinatario si libera', r4);
  check((await uno(db, `SELECT status FROM telepathy_invites WHERE id = $1`, [r.id])).status === 'expired', 'e quello vecchio è expired');
});

sezione('D2. invio: 10 all\'ora per mittente', async (db) => {
  await disp(db, 'dd', 'DD');
  await db.query(`INSERT INTO telepathy_invites (from_id, from_name, to_id, to_name, status, created_at)
                  SELECT 'spam', 'Spam', 'v' || i, 'V', 'cancelled', now() - interval '10 minutes' FROM generate_series(1, 10) i`);
  const r = await invia(db, 'spam', 'Spam', { disp: await idDisp(db, 'dd') });
  check(r.ok === false && r.motivo === 'troppi_inviti', '10 inviti nell\'ultima ora: troppi_inviti', r);
  await db.query(`UPDATE telepathy_invites SET created_at = now() - interval '61 minutes' WHERE from_id = 'spam'`);
  check((await invia(db, 'spam', 'Spam', { disp: await idDisp(db, 'dd') })).ok === true, 'dopo un\'ora si può di nuovo');
});

sezione('D3. invio: durata, push, nomi, campanella', async (db) => {
  const dettagli = (id) => uno(db, `SELECT *, extract(epoch FROM expires_at - created_at)::int s FROM telepathy_invites WHERE id = $1`, [id]);
  await disp(db, 'off', 'Off');
  let n0 = await chiamateMotore(db);
  let r = await invia(db, 'm1', 'M1', { disp: await idDisp(db, 'off') });
  let inv = await dettagli(r.id);
  check(inv.s === 600 && inv.con_push === true && inv.push_saltata === false, 'offline con l\'interruttore: 10 minuti e push', inv);
  check(await chiamateMotore(db) === n0 + 1, 'esattamente una chiamata alla Edge Function');
  const body = (await uno(db, `SELECT body FROM net.chiamate ORDER BY id DESC LIMIT 1`)).body;
  check(body.invito === r.id && body.tipo === 'invito', 'la chiamata porta id e tipo', body);
  check(inv.from_name === 'M1' && inv.to_name === 'Off', 'i nomi li scrive il server', inv);
  const nt = await uno(db, `SELECT message FROM notifications WHERE user_nickname = 'Off' AND type = 'telepathy_invite'`);
  check(!!nt && nt.message === 'M1 ti ha invitato a un training telepatico', 'la notifica della campanella la scrive la RPC', nt);
  await online(db, 'onl', 'Onl');
  n0 = await chiamateMotore(db);
  r = await invia(db, 'm2', 'M2', { online: 'onl' });
  inv = await dettagli(r.id);
  check(inv.s === 45 && inv.con_push === false && inv.push_saltata === false, 'online senza interruttore: 45 s, niente push, niente push_saltata', inv);
  check(await chiamateMotore(db) === n0, 'online senza interruttore: nessuna chiamata');
  await disp(db, 'onl2', 'Onl2');
  await online(db, 'onl2', 'Onl2');
  n0 = await chiamateMotore(db);
  r = await invia(db, 'm3', 'M3', { online: 'onl2' });
  inv = await dettagli(r.id);
  check(inv.s === 45 && inv.con_push === true, 'online con l\'interruttore: 45 s e push (la sopprime il service worker)', inv);
  check(await chiamateMotore(db) === n0 + 1, 'online con l\'interruttore: una chiamata');
  await iscritto(db, 'reg9', 'Nove', 'h9');
  await disp(db, 't9', 'T9');
  r = await chiama(db, 'send_telepathy_invite', { p_session_id: 'reg9', p_password_hash: 'h9', p_nickname: 'Impostore', p_disponibilita_id: await idDisp(db, 't9'), p_session_online: null });
  check(r.ok === true && (await dettagli(r.id)).from_name === 'Nove', 'iscritto: il nome viene dal profilo, non dall\'app', r);
  const mA = await errore(chiama(db, 'send_telepathy_invite', { p_session_id: 'reg9', p_password_hash: 'no', p_nickname: null, p_disponibilita_id: await idDisp(db, 't9'), p_session_online: null }));
  check(!!mA && mA.includes('Auth failed'), 'iscritto con credenziale sbagliata: Auth failed', mA);
  await disp(db, 't10', 'T10');
  r = await invia(db, 'finto', 'nove', { disp: await idDisp(db, 't10') });
  check(r.ok === true && (await dettagli(r.id)).from_name === 'Anonymous', 'ospite col nome di un iscritto: Anonymous', r);
});

sezione('D4. tetti per destinatario', async (db) => {
  await disp(db, 'pop', 'Pop');
  await db.query(`INSERT INTO telepathy_invites (from_id, from_name, to_id, to_name, status, con_push, created_at)
                  SELECT 'f' || i, 'F', 'pop', 'Pop', 'declined', true, now() - interval '20 minutes' FROM generate_series(1, 6) i`);
  let n0 = await chiamateMotore(db);
  let r = await invia(db, 'nuovo', 'Nuovo', { disp: await idDisp(db, 'pop') });
  check(r.ok === true && r.push_saltata === true, 'settimo invito con push nell\'ora: si scrive, ma senza push', r);
  check(await chiamateMotore(db) === n0, 'e nessuna chiamata');
  const inv = await uno(db, `SELECT con_push, push_saltata FROM telepathy_invites WHERE id = $1`, [r.id]);
  check(inv.con_push === false && inv.push_saltata === true, 'con_push false, push_saltata true', inv);
  await disp(db, 'cop', 'Cop');
  const copId = await idDisp(db, 'cop');
  r = await invia(db, 'amico', 'Amico', { disp: copId });
  check(r.ok === true && r.push_saltata === false, 'primo invito della coppia: con push', r);
  await db.query(`UPDATE telepathy_invites SET status = 'cancelled' WHERE id = $1`, [r.id]);
  n0 = await chiamateMotore(db);
  r = await invia(db, 'amico', 'Amico', { disp: copId });
  check(r.ok === true && r.push_saltata === true && await chiamateMotore(db) === n0, 'stessa coppia entro 15 minuti: senza push', r);
});

sezione('D5. due invii nello stesso istante (23505 tradotto)', async (db) => {
  await disp(db, 'c1', 'C1');
  // La vera concorrenza in PGlite non si prova: un trigger di test scrive la riga in conflitto
  // subito prima dell'insert della RPC. pg_trigger_depth(): agisce solo a profondità 1, perché
  // il suo stesso insert fa scattare di nuovo i trigger della tabella.
  await db.exec(`
    CREATE FUNCTION test_conflitto() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
      IF current_setting('test.conflitto', true) = 'mittente' THEN
        INSERT INTO telepathy_invites (from_id, from_name, to_id, to_name) VALUES (NEW.from_id, 'X', 'terzo', 'T');
      ELSIF current_setting('test.conflitto', true) = 'destinatario' THEN
        INSERT INTO telepathy_invites (from_id, from_name, to_id, to_name) VALUES ('terzo', 'T', NEW.to_id, 'X');
      END IF;
      RETURN NEW;
    END $$;
    CREATE TRIGGER zz_test_conflitto BEFORE INSERT ON telepathy_invites FOR EACH ROW EXECUTE FUNCTION test_conflitto();`);
  const n0 = await chiamateMotore(db);
  await db.query(`SELECT set_config('test.conflitto', 'mittente', false)`);
  let r = await invia(db, 'corsa', 'Corsa', { disp: await idDisp(db, 'c1') });
  check(r.ok === false && r.motivo === 'invito_in_corso', '23505 sull\'indice del mittente: invito_in_corso', r);
  await db.query(`SELECT set_config('test.conflitto', 'destinatario', false)`);
  r = await invia(db, 'corsa', 'Corsa', { disp: await idDisp(db, 'c1') });
  check(r.ok === false && r.motivo === 'gia_invitato', '23505 sull\'indice del destinatario: gia_invitato', r);
  check(await chiamateMotore(db) === n0, 'nei conflitti non parte nessuna chiamata');
  check((await uno(db, `SELECT count(*)::int n FROM telepathy_invites WHERE from_id IN ('corsa', 'terzo')`)).n === 0,
    'e non resta nessuna riga (il conflitto annulla anche l\'insert del trigger)');
  await db.query(`SELECT set_config('test.conflitto', '', false)`);
});
```

- [ ] **Step 2: vederlo fallire** — Atteso: sezioni D in eccezione (`function send_telepathy_invite … does not exist`), le altre verdi (74).

- [ ] **Step 3: la sezione D**

```sql
-- ════ D. L'invio ═════════════════════════════════════════════════════════════
-- Una sola strada per tutti gli inviti, anche verso chi è online (p_session_online): un solo
-- insieme di controlli. L'altra persona si indica con DUE parametri distinti, uno solo
-- valorizzato: il server deve sapere per quale strada si arriva.
CREATE OR REPLACE FUNCTION public.send_telepathy_invite(p_session_id text, p_password_hash text, p_nickname text,
                                                        p_disponibilita_id uuid DEFAULT NULL, p_session_online text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_me text; v_sid text; v_nome text; v_online boolean;
  v_con_push boolean := false; v_saltata boolean := false;
  v_id uuid; v_creato timestamptz; v_scade timestamptz; v_vincolo text;
BEGIN
  PERFORM telepatia_verifica_identita(p_session_id, p_password_hash);
  IF (p_disponibilita_id IS NULL) = (p_session_online IS NULL) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'dati_non_validi');
  END IF;
  SELECT o_sid, o_nome INTO v_sid, v_nome FROM telepatia_risolvi(p_disponibilita_id, p_session_online);
  IF v_sid IS NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', 'non_disponibile'); END IF;
  IF v_sid = p_session_id THEN RETURN jsonb_build_object('ok', false, 'motivo', 'dati_non_validi'); END IF;
  v_me := nome_pubblico(p_session_id, p_nickname);
  IF telepatia_in_training(p_session_id) THEN RETURN jsonb_build_object('ok', false, 'motivo', 'in_match'); END IF;
  -- Non disponibile, bloccato nei due sensi, già in un training: stesso motivo per tutti e tre,
  -- per non rivelare il blocco.
  IF NOT telepatia_disponibile(v_sid) OR telepatia_bloccati(p_session_id, v_me, v_sid, v_nome) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'non_disponibile');
  END IF;
  -- now() non può stare nel predicato degli indici unici: prima si chiudono gli scaduti delle
  -- due persone, poi si guarda chi ha ancora un invito aperto.
  UPDATE telepathy_invites SET status = 'expired', responded_at = now()
   WHERE status = 'pending' AND expires_at <= now()
     AND (from_id IN (p_session_id, v_sid) OR to_id IN (p_session_id, v_sid));
  IF EXISTS (SELECT 1 FROM telepathy_invites WHERE from_id = p_session_id AND status = 'pending') THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'invito_in_corso');
  END IF;
  IF EXISTS (SELECT 1 FROM telepathy_invites WHERE to_id = v_sid AND status = 'pending') THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'gia_invitato');
  END IF;
  IF (SELECT count(*) FROM telepathy_invites
       WHERE from_id = p_session_id AND created_at > now() - interval '1 hour') >= 10 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'troppi_inviti');
  END IF;

  v_online := telepatia_online(v_sid);
  v_scade := now() + CASE WHEN v_online THEN interval '45 seconds' ELSE interval '10 minutes' END;
  -- La push solo a chi ha acceso l'interruttore (secondo giro): chi è online senza riga riceve
  -- solo l'avviso dentro l'app, e non conta nel tetto.
  IF EXISTS (SELECT 1 FROM telepathy_availability WHERE session_id = v_sid) THEN
    v_saltata := (SELECT count(*) FROM telepathy_invites
                   WHERE to_id = v_sid AND con_push AND created_at > now() - interval '1 hour') >= 6
              OR EXISTS (SELECT 1 FROM telepathy_invites
                          WHERE from_id = p_session_id AND to_id = v_sid AND con_push
                            AND created_at > now() - interval '15 minutes');
    v_con_push := NOT v_saltata;
  END IF;

  BEGIN
    INSERT INTO telepathy_invites (from_id, from_name, to_id, to_name, status, expires_at, con_push, push_saltata)
    VALUES (p_session_id, v_me, v_sid, v_nome, 'pending', v_scade, v_con_push, v_saltata)
    RETURNING id, created_at INTO v_id, v_creato;
  EXCEPTION WHEN unique_violation THEN
    -- Due invii nello stesso istante: vince il primo. Il motivo dipende dall'indice urtato.
    GET STACKED DIAGNOSTICS v_vincolo = CONSTRAINT_NAME;
    RETURN jsonb_build_object('ok', false, 'motivo',
      CASE WHEN v_vincolo = 'telepathy_invites_un_pending_mittente' THEN 'invito_in_corso' ELSE 'gia_invitato' END);
  END;

  INSERT INTO notifications (user_nickname, type, message)
  VALUES (v_nome, 'telepathy_invite', v_me || ' ti ha invitato a un training telepatico');
  -- Solo adesso, a insert riuscito: la richiesta parte al commit.
  IF v_con_push THEN
    PERFORM telepatia_chiama_motore(jsonb_build_object('invito', v_id, 'tipo', 'invito'));
  END IF;
  RETURN jsonb_build_object('ok', true, 'id', v_id, 'expires_at', v_scade, 'created_at', v_creato,
                            'push_saltata', v_saltata, 'adesso', now());
END $$;

REVOKE ALL ON FUNCTION public.send_telepathy_invite(text, text, text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_telepathy_invite(text, text, text, uuid, text) TO anon, authenticated;
```

- [ ] **Step 4: vederlo passare** — Atteso: `109 passati, 0 falliti`.
- [ ] **Step 5: commit** — `feat(sql): 32a sezione D — invio con blocchi, tetti e push dal server` (+ `Co-Authored-By`).

**Fatto quando:** `109 passati, 0 falliti`.

### Task 11: 32a, sezione E — risposta, annullo, letture, «Non voglio più inviti»

**Obiettivo:** solo il destinatario risponde, una volta sola, entro la scadenza; accettare vuole il match giusto e chiude gli inviti in uscita di chi accetta; il mittente annulla; le due letture sostituiscono le SELECT dirette senza mai dare il `to_id` al mittente; il blocco da invito lo fa solo chi l'ha ricevuto.

**Files:**
- Modify: `supabase/sql/32a_inviti_telepatia_offline.sql` (sezione E)
- Modify: `test-inviti-offline-sql.js`

**Interfaces:**
- Produces:
  - `respond_telepathy_invite(p_invite_id uuid, p_session_id text, p_password_hash text, p_accept boolean, p_match_id uuid DEFAULT NULL) → jsonb {ok, status?, responded_at?, adesso?, motivo?}`; `motivo` ∈ `dati_non_validi`, `non_trovato`, `gia_accettato`, `rifiutato`, `annullato`, `scaduto`, `match_non_valido`, `in_match`
  - `cancel_telepathy_invite(p_invite_id uuid, p_session_id text, p_password_hash text) → jsonb {ok, motivo?}`
  - `get_my_telepathy_invites(p_session_id text, p_password_hash text) → jsonb {ok, adesso, in_arrivo, in_uscita}`; `in_arrivo` = `{id, nome, from_id, status, expires_at, created_at, push_saltata}` o `null`; `in_uscita` = `{id, nome, status, expires_at, created_at, responded_at, match_id, push_saltata}` o `null`
  - `get_telepathy_invite(p_invite_id uuid, p_session_id text, p_password_hash text) → jsonb {ok, adesso, motivo?, invito?: {id, ruolo: 'mittente'|'destinatario', nome, status, expires_at, created_at, responded_at, match_id, match_attivo, push_saltata, from_id?}}`
  - `block_telepathy_inviter(p_session_id text, p_password_hash text, p_invite_id uuid DEFAULT NULL, p_disponibilita_id uuid DEFAULT NULL, p_session_online text DEFAULT NULL) → jsonb {ok, nome?, motivo?}`

- [ ] **Step 1: il test prima**

```js
// ════ E. Risposta, annullo, letture, blocco (Task 11) ══════════════════════
const rispondi = (db, id, sid, accetta, match = null) => chiama(db, 'respond_telepathy_invite',
  { p_invite_id: id, p_session_id: sid, p_password_hash: null, p_accept: accetta, p_match_id: match });
const nuovoMatch = async (db, u1, u2) => (await uno(db, `INSERT INTO telepathy_matches (user1_id, user2_id, da_invito) VALUES ($1, $2, true) RETURNING id`, [u1, u2])).id;

sezione('E1. accettare', async (db) => {
  await disp(db, 'ric', 'Ric');
  const { id: idInv } = await invia(db, 'inv', 'Inv', { disp: await idDisp(db, 'ric') });
  let x = await rispondi(db, idInv, 'terzo', false);
  check(x.ok === false && x.motivo === 'non_trovato', 'solo il destinatario risponde', x);
  x = await rispondi(db, idInv, 'ric', true, null);
  check(x.ok === false && x.motivo === 'match_non_valido', 'accettare senza match: match_non_valido', x);
  x = await rispondi(db, idInv, 'ric', true, await nuovoMatch(db, 'inv', 'altro'));
  check(x.ok === false && x.motivo === 'match_non_valido', 'match di un\'altra coppia: match_non_valido', x);
  const giusto = await nuovoMatch(db, 'inv', 'ric');
  await disp(db, 'terza', 'Terza');
  const uscita = await invia(db, 'ric', 'Ric', { disp: await idDisp(db, 'terza') });
  const n0 = await chiamateMotore(db);
  x = await rispondi(db, idInv, 'ric', true, giusto);
  check(x.ok === true && x.status === 'accepted', 'accettare con il match giusto', x);
  const salvato = await uno(db, `SELECT match_id, responded_at FROM telepathy_invites WHERE id = $1`, [idInv]);
  check(salvato.match_id === giusto && salvato.responded_at !== null, 'match_id e responded_at salvati', salvato);
  check((await uno(db, `SELECT status FROM telepathy_invites WHERE id = $1`, [uscita.id])).status === 'cancelled',
    'l\'invito in uscita di chi accetta è annullato sul server');
  const ultima = await uno(db, `SELECT body FROM net.chiamate ORDER BY id DESC LIMIT 1`);
  check(await chiamateMotore(db) === n0 + 1 && ultima.body.tipo === 'accettato', 'push «accettato» chiesta', ultima);
  x = await rispondi(db, idInv, 'ric', true, giusto);
  check(x.ok === false && x.motivo === 'gia_accettato', 'una volta sola: la seconda accettazione (altro telefono) è rifiutata', x);
});

sezione('E2. rifiutare, scadenza, in_match', async (db) => {
  await disp(db, 'r2', 'R2');
  let r = await invia(db, 'i2', 'I2', { disp: await idDisp(db, 'r2') });
  let n0 = await chiamateMotore(db);
  let x = await rispondi(db, r.id, 'r2', false);
  check(x.ok === true && x.status === 'declined', 'rifiutare', x);
  check(await chiamateMotore(db) === n0 + 1, 'invito da 10 minuti rifiutato: push «rifiutato» chiesta');
  const nt = await uno(db, `SELECT message FROM notifications WHERE user_nickname = 'I2' AND type = 'telepathy_declined'`);
  check(!!nt && nt.message === 'R2 ha rifiutato il tuo invito al training telepatico', 'la notifica di rifiuto la scrive la RPC', nt);
  await online(db, 'r3', 'R3');
  r = await invia(db, 'i3', 'I3', { online: 'r3' });
  n0 = await chiamateMotore(db);
  x = await rispondi(db, r.id, 'r3', false);
  check(x.ok === true && await chiamateMotore(db) === n0, 'invito da 45 s rifiutato: nessuna push (chi invita è online)', x);
  await online(db, 'r4', 'R4');
  r = await invia(db, 'i4', 'I4', { online: 'r4' });
  await db.query(`UPDATE telepathy_invites SET expires_at = now() - interval '1 second' WHERE id = $1`, [r.id]);
  x = await rispondi(db, r.id, 'r4', true, await nuovoMatch(db, 'i4', 'r4'));
  check(x.ok === false && x.motivo === 'scaduto', 'dopo la scadenza: scaduto', x);
  await online(db, 'r5', 'R5');
  r = await invia(db, 'i5', 'I5', { online: 'r5' });
  const mm = await nuovoMatch(db, 'i5', 'r5');
  await giocato(db, 'r5', 'zzz');
  x = await rispondi(db, r.id, 'r5', true, mm);
  check(x.ok === false && x.motivo === 'in_match', 'chi accetta è già in un altro training: in_match', x);
});

sezione('E3. annullo e letture', async (db) => {
  const leggi = (sid) => chiama(db, 'get_my_telepathy_invites', { p_session_id: sid, p_password_hash: null });
  const unoSolo = (id, sid) => chiama(db, 'get_telepathy_invite', { p_invite_id: id, p_session_id: sid, p_password_hash: null });
  const annulla = (id, sid) => chiama(db, 'cancel_telepathy_invite', { p_invite_id: id, p_session_id: sid, p_password_hash: null });
  await disp(db, 'b', 'B');
  const r = await invia(db, 'a', 'A', { disp: await idDisp(db, 'b') });
  let x = await annulla(r.id, 'b');
  check(x.ok === false && x.motivo === 'non_trovato', 'annulla solo il mittente', x);
  const perB = await leggi('b');
  check(!!perB.in_arrivo && perB.in_arrivo.from_id === 'a' && perB.in_arrivo.nome === 'A', 'il destinatario riceve from_id dell\'invito pending', perB.in_arrivo);
  const perA = await leggi('a');
  check(!!perA.in_uscita && perA.in_uscita.nome === 'B' && !('to_id' in perA.in_uscita) && !JSON.stringify(perA).includes('"b"'),
    'il mittente non riceve mai il to_id', perA);
  check(typeof perA.adesso === 'string' && !Number.isNaN(Date.parse(perA.adesso)), 'torna l\'ora del server', perA.adesso);
  x = await unoSolo(r.id, 'c');
  check(x.ok === false && x.motivo === 'non_trovato', 'get_telepathy_invite di un invito non mio: non trovato', x);
  x = await unoSolo(r.id, 'b');
  check(x.ok === true && x.invito.ruolo === 'destinatario' && x.invito.from_id === 'a', 'dal destinatario, pending: from_id presente', x);
  x = await annulla(r.id, 'a');
  check(x.ok === true, 'il mittente annulla', x);
  x = await unoSolo(r.id, 'b');
  check(x.invito.status === 'cancelled' && x.invito.from_id == null, 'annullato: niente più from_id', x.invito);
  const r2 = await invia(db, 'a', 'A', { disp: await idDisp(db, 'b') });
  await db.query(`UPDATE telepathy_invites SET expires_at = now() - interval '1 second' WHERE id = $1`, [r2.id]);
  await leggi('a');
  check((await uno(db, `SELECT status FROM telepathy_invites WHERE id = $1`, [r2.id])).status === 'expired', 'get_my segna expired gli scaduti');
});

sezione('E4. «Non voglio più inviti da questa persona»', async (db) => {
  const blocca = (sid, a) => chiama(db, 'block_telepathy_inviter', { p_session_id: sid, p_password_hash: null,
    p_invite_id: a.invito || null, p_disponibilita_id: a.disp || null, p_session_online: a.online || null });
  const bloccoC = (da, a) => uno(db, `SELECT 1 AS x FROM telepathy_invite_blocks WHERE blocker_session = $1 AND blocked_session = $2`, [da, a]);
  await disp(db, 'vit', 'Vit');
  const r = await invia(db, 'dis', 'Dis', { disp: await idDisp(db, 'vit') });
  let x = await blocca('dis', { invito: r.id });
  check(x.ok === false && x.motivo === 'non_trovato', 'con l\'invito non blocca il mittente', x);
  x = await blocca('terzo', { invito: r.id });
  check(x.ok === false && x.motivo === 'non_trovato', 'né un terzo', x);
  const n0 = await chiamateMotore(db);
  x = await blocca('vit', { invito: r.id });
  check(x.ok === true, 'il destinatario blocca dall\'invito', x);
  const st = await uno(db, `SELECT status FROM telepathy_invites WHERE id = $1`, [r.id]);
  check(st.status === 'declined' && await chiamateMotore(db) === n0, 'l\'invito aperto si chiude come rifiutato, senza push', st);
  await disp(db, 'dis', 'Dis');
  const lv = await righe(db, `SELECT nickname FROM get_invitable_users('vit', NULL, 'Vit')`);
  const ld = await righe(db, `SELECT nickname FROM get_invitable_users('dis', NULL, 'Dis')`);
  check(!lv.some((u) => u.nickname === 'Dis') && !ld.some((u) => u.nickname === 'Vit'), 'da lì non si vedono più, nei due sensi', { lv, ld });
  const r3 = await invia(db, 'dis', 'Dis', { disp: await idDisp(db, 'vit') });
  check(r3.ok === false && r3.motivo === 'non_disponibile', 'e non si possono invitare', r3);
  await disp(db, 'z1', 'Z1');
  x = await blocca('osp1', { disp: await idDisp(db, 'z1') });
  check(x.ok === true && !!(await bloccoC('osp1', 'z1')), 'blocco con l\'id opaco, da ospite', x);
  await online(db, 'z2', 'Z2');
  x = await blocca('osp1', { online: 'z2' });
  check(x.ok === true && !!(await bloccoC('osp1', 'z2')), 'blocco con il session_id di chi è online', x);
  await online(db, 'z3', 'Z3', 31);
  x = await blocca('osp1', { online: 'z3' });
  check(x.ok === false && x.motivo === 'non_trovato', 'online da più di 30 s: non trovato', x);
  x = await blocca('osp1', {});
  check(x.ok === false && x.motivo === 'dati_non_validi', 'nessun parametro: dati_non_validi', x);
});
```

- [ ] **Step 2: vederlo fallire** — Atteso: sezioni E in eccezione, le altre verdi (109).

- [ ] **Step 3: la sezione E**

```sql
-- ════ E. Risposta, annullo, letture, blocco ══════════════════════════════════

-- Solo il destinatario, solo se pending e non scaduto; il passaggio di stato è un UPDATE
-- atomico. Accettare: il match lo crea l'app PRIMA (insert diretto, fuori scope rifarlo) e qui
-- si controlla che sia quello della coppia giusta.
CREATE OR REPLACE FUNCTION public.respond_telepathy_invite(p_invite_id uuid, p_session_id text, p_password_hash text,
                                                           p_accept boolean, p_match_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v telepathy_invites%ROWTYPE; v_stato text;
BEGIN
  PERFORM telepatia_verifica_identita(p_session_id, p_password_hash);
  IF p_invite_id IS NULL OR p_accept IS NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', 'dati_non_validi'); END IF;
  SELECT * INTO v FROM telepathy_invites WHERE id = p_invite_id AND to_id = p_session_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'motivo', 'non_trovato'); END IF;
  IF v.status = 'pending' AND v.expires_at <= now() THEN
    UPDATE telepathy_invites SET status = 'expired', responded_at = now() WHERE id = v.id AND status = 'pending';
    v.status := 'expired';
  END IF;
  IF v.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', telepatia_motivo_stato(v.status));
  END IF;

  IF p_accept THEN
    IF p_match_id IS NULL OR NOT EXISTS (
         SELECT 1 FROM telepathy_matches m
          WHERE m.id = p_match_id AND m.ended_at IS NULL AND m.user1_id = v.from_id AND m.user2_id = v.to_id) THEN
      RETURN jsonb_build_object('ok', false, 'motivo', 'match_non_valido');
    END IF;
    -- Nessuno si ritrova in due sessioni.
    IF telepatia_in_training(p_session_id, p_match_id) OR telepatia_in_training(v.from_id, p_match_id) THEN
      RETURN jsonb_build_object('ok', false, 'motivo', 'in_match');
    END IF;
    UPDATE telepathy_invites SET status = 'accepted', match_id = p_match_id, responded_at = now()
     WHERE id = v.id AND status = 'pending' AND expires_at > now();
    IF NOT FOUND THEN
      -- Un altro telefono ha risposto un istante prima, o la scadenza è arrivata adesso.
      SELECT status INTO v_stato FROM telepathy_invites WHERE id = v.id;
      RETURN jsonb_build_object('ok', false, 'motivo', telepatia_motivo_stato(coalesce(v_stato, 'expired')));
    END IF;
    -- Chi sta per giocare non può restare invitante di qualcun altro.
    UPDATE telepathy_invites SET status = 'cancelled', responded_at = now()
     WHERE from_id = p_session_id AND status = 'pending';
    -- Anche per gli inviti da 45 s: chi ha invitato può aver posato il telefono.
    PERFORM telepatia_chiama_motore(jsonb_build_object('invito', v.id, 'tipo', 'accettato'));
    v_stato := 'accepted';
  ELSE
    UPDATE telepathy_invites SET status = 'declined', responded_at = now()
     WHERE id = v.id AND status = 'pending' AND expires_at > now();
    IF NOT FOUND THEN
      SELECT status INTO v_stato FROM telepathy_invites WHERE id = v.id;
      RETURN jsonb_build_object('ok', false, 'motivo', telepatia_motivo_stato(coalesce(v_stato, 'expired')));
    END IF;
    INSERT INTO notifications (user_nickname, type, message)
    VALUES (v.from_name, 'telepathy_declined', v.to_name || ' ha rifiutato il tuo invito al training telepatico');
    -- Per un invito da 45 s chi ha invitato è online e lo vede nell'app.
    IF telepatia_era_da_dieci(v.created_at, v.expires_at) THEN
      PERFORM telepatia_chiama_motore(jsonb_build_object('invito', v.id, 'tipo', 'rifiutato'));
    END IF;
    v_stato := 'declined';
  END IF;
  RETURN jsonb_build_object('ok', true, 'status', v_stato, 'responded_at', now(), 'adesso', now());
END $$;

-- Solo il mittente, solo se pending. Nessuna push.
CREATE OR REPLACE FUNCTION public.cancel_telepathy_invite(p_invite_id uuid, p_session_id text, p_password_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM telepatia_verifica_identita(p_session_id, p_password_hash);
  UPDATE telepathy_invites SET status = 'cancelled', responded_at = now()
   WHERE id = p_invite_id AND from_id = p_session_id AND status = 'pending';
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'motivo', 'non_trovato'); END IF;
  RETURN jsonb_build_object('ok', true);
END $$;

-- La lettura degli inviti al posto delle SELECT dirette. Il session_id dell'altra persona torna
-- in UN caso solo: from_id dell'invito pending a me indirizzato (serve per creare il match e per
-- l'attesa; chi invita è per forza online, quindi già in online_users). Chi invita non riceve
-- mai il to_id: l'id del partner lo prende dal match quando ci entra.
CREATE OR REPLACE FUNCTION public.get_my_telepathy_invites(p_session_id text, p_password_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_in jsonb; v_out jsonb;
BEGIN
  PERFORM telepatia_verifica_identita(p_session_id, p_password_hash);
  -- La risposta non mente anche se il cron è in ritardo.
  UPDATE telepathy_invites SET status = 'expired', responded_at = now()
   WHERE status = 'pending' AND expires_at <= now() AND (from_id = p_session_id OR to_id = p_session_id);
  SELECT jsonb_build_object('id', i.id, 'nome', i.from_name, 'from_id', i.from_id, 'status', i.status,
                            'expires_at', i.expires_at, 'created_at', i.created_at, 'push_saltata', i.push_saltata)
    INTO v_in
    FROM telepathy_invites i
   WHERE i.to_id = p_session_id AND i.status = 'pending' AND i.expires_at > now()
     AND NOT telepatia_bloccati(i.from_id, i.from_name, i.to_id, i.to_name)
   ORDER BY i.created_at DESC LIMIT 1;
  SELECT jsonb_build_object('id', o.id, 'nome', o.to_name, 'status', o.status, 'expires_at', o.expires_at,
                            'created_at', o.created_at, 'responded_at', o.responded_at, 'match_id', o.match_id,
                            'push_saltata', o.push_saltata)
    INTO v_out
    FROM telepathy_invites o
   WHERE o.from_id = p_session_id AND o.created_at > now() - interval '24 hours'
   ORDER BY o.created_at DESC LIMIT 1;
  RETURN jsonb_build_object('ok', true, 'adesso', now(), 'in_arrivo', v_in, 'in_uscita', v_out);
END $$;

-- Lo stato di UN invito mio, per chi arriva dalla notifica (?invito=<id>). Distingue scaduto,
-- rifiutato, annullato, accettato (con match_id e se il match è ancora vivo) e aperto.
CREATE OR REPLACE FUNCTION public.get_telepathy_invite(p_invite_id uuid, p_session_id text, p_password_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v telepathy_invites%ROWTYPE; v_ruolo text;
BEGIN
  PERFORM telepatia_verifica_identita(p_session_id, p_password_hash);
  SELECT * INTO v FROM telepathy_invites WHERE id = p_invite_id AND (from_id = p_session_id OR to_id = p_session_id);
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'motivo', 'non_trovato', 'adesso', now()); END IF;
  v_ruolo := CASE WHEN v.to_id = p_session_id THEN 'destinatario' ELSE 'mittente' END;
  IF v_ruolo = 'destinatario' AND telepatia_bloccati(v.from_id, v.from_name, v.to_id, v.to_name) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'non_trovato', 'adesso', now());
  END IF;
  IF v.status = 'pending' AND v.expires_at <= now() THEN
    UPDATE telepathy_invites SET status = 'expired', responded_at = now() WHERE id = v.id AND status = 'pending';
    v.status := 'expired';
  END IF;
  RETURN jsonb_build_object('ok', true, 'adesso', now(), 'invito', jsonb_build_object(
    'id', v.id, 'ruolo', v_ruolo,
    'nome', CASE WHEN v_ruolo = 'destinatario' THEN v.from_name ELSE v.to_name END,
    'status', v.status, 'expires_at', v.expires_at, 'created_at', v.created_at,
    'responded_at', v.responded_at, 'match_id', v.match_id, 'push_saltata', v.push_saltata,
    'match_attivo', EXISTS (SELECT 1 FROM telepathy_matches m WHERE m.id = v.match_id AND m.ended_at IS NULL),
    'from_id', CASE WHEN v_ruolo = 'destinatario' AND v.status = 'pending' THEN v.from_id END));
END $$;

-- «Non voglio più inviti da questa persona», per ospiti e iscritti. Uno solo dei tre modi di
-- indicare la persona. Con l'invito vale solo per chi l'ha ricevuto.
CREATE OR REPLACE FUNCTION public.block_telepathy_inviter(p_session_id text, p_password_hash text,
                                                          p_invite_id uuid DEFAULT NULL, p_disponibilita_id uuid DEFAULT NULL,
                                                          p_session_online text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_sid text; v_nome text;
BEGIN
  PERFORM telepatia_verifica_identita(p_session_id, p_password_hash);
  IF (p_invite_id IS NOT NULL)::int + (p_disponibilita_id IS NOT NULL)::int + (p_session_online IS NOT NULL)::int <> 1 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'dati_non_validi');
  END IF;
  IF p_invite_id IS NOT NULL THEN
    SELECT from_id, from_name INTO v_sid, v_nome FROM telepathy_invites WHERE id = p_invite_id AND to_id = p_session_id;
  ELSE
    SELECT o_sid, o_nome INTO v_sid, v_nome FROM telepatia_risolvi(p_disponibilita_id, p_session_online);
  END IF;
  IF v_sid IS NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', 'non_trovato'); END IF;
  IF v_sid = p_session_id THEN RETURN jsonb_build_object('ok', false, 'motivo', 'dati_non_validi'); END IF;
  INSERT INTO telepathy_invite_blocks (blocker_session, blocked_session) VALUES (p_session_id, v_sid)
  ON CONFLICT DO NOTHING;
  -- Gli inviti aperti fra i due si chiudono, senza push e senza notifiche.
  UPDATE telepathy_invites SET status = 'declined', responded_at = now()
   WHERE status = 'pending' AND from_id = v_sid AND to_id = p_session_id;
  UPDATE telepathy_invites SET status = 'cancelled', responded_at = now()
   WHERE status = 'pending' AND from_id = p_session_id AND to_id = v_sid;
  RETURN jsonb_build_object('ok', true, 'nome', v_nome);
END $$;

REVOKE ALL ON FUNCTION public.respond_telepathy_invite(uuid, text, text, boolean, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_telepathy_invite(uuid, text, text)                 FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_telepathy_invites(text, text)                      FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_telepathy_invite(uuid, text, text)                    FROM PUBLIC;
REVOKE ALL ON FUNCTION public.block_telepathy_inviter(text, text, uuid, uuid, text)     FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.respond_telepathy_invite(uuid, text, text, boolean, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_telepathy_invite(uuid, text, text)                 TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_telepathy_invites(text, text)                      TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_telepathy_invite(uuid, text, text)                    TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.block_telepathy_inviter(text, text, uuid, uuid, text)     TO anon, authenticated;
```

- [ ] **Step 4: vederlo passare** — Atteso: `142 passati, 0 falliti`.
- [ ] **Step 5: commit** — `feat(sql): 32a sezione E — risposta, annullo, letture, blocco` (+ `Co-Authored-By`).

**Fatto quando:** `142 passati, 0 falliti`.


### Task 12: 32a, sezione F — scadenze, account, cron; il ritorno indietro

**Obiettivo:** gli inviti scaduti diventano `expired` e i mittenti degli inviti da 10 minuti vengono avvisati anche se a segnarli è stato qualcun altro; le righe vecchie si puliscono (inviti chiusi dopo 1 giorno, disponibilità dopo 90); cancellare l'account porta via disponibilità e blocchi impostati, l'export li contiene senza `session_id` altrui; lo stesso job del cron chiama anche la funzione nuova; la migration si rilancia e ha il suo ritorno indietro provato.

**Files:**
- Modify: `supabase/sql/32a_inviti_telepatia_offline.sql` (sezione F)
- Create: `supabase/sql/32a_ritorno.sql`
- Modify: `test-inviti-offline-sql.js`

**Interfaces:**
- Produces: `expire_telepathy_invites() → TABLE(invito_id uuid)` (solo ruolo di servizio); `delete_my_account(text, text)` e `export_my_account(text, text)` ridefinite (firme invariate); job pg_cron `notify-ritual-start` con due chiamate.

- [ ] **Step 1: il test prima**

```js
// ════ F. Scadenze, account, cron, rilancio e ritorno (Task 12) ═════════════
sezione('F1. scadenze e pulizia', async (db) => {
  const scaduti = async () => (await righe(db, `SELECT * FROM expire_telepathy_invites()`)).map((x) => x.invito_id);
  await disp(db, 's1', 'S1');
  await online(db, 's2', 'S2');
  const lungo = await invia(db, 'm1', 'M1', { disp: await idDisp(db, 's1') });
  const breve = await invia(db, 'm2', 'M2', { online: 's2' });
  await db.query(`UPDATE telepathy_invites SET expires_at = now() - interval '1 second' WHERE id IN ($1, $2)`, [lungo.id, breve.id]);
  let ids = await scaduti();
  check(ids.includes(lungo.id) && !ids.includes(breve.id), 'restituisce solo gli scaduti da 10 minuti', ids);
  check((await righe(db, `SELECT status FROM telepathy_invites WHERE id IN ($1, $2)`, [lungo.id, breve.id])).every((x) => x.status === 'expired'),
    'e li segna tutti expired');
  await disp(db, 's3', 'S3');
  const altro = await invia(db, 'm3', 'M3', { disp: await idDisp(db, 's3') });
  await db.query(`UPDATE telepathy_invites SET expires_at = now() - interval '1 second' WHERE id = $1`, [altro.id]);
  await chiama(db, 'get_my_telepathy_invites', { p_session_id: 's3', p_password_hash: null });
  ids = await scaduti();
  check(ids.includes(altro.id), 'uno scaduto segnato da get_my torna lo stesso (la push «scaduto» non si perde)', ids);
  await db.query(`UPDATE telepathy_invites SET responded_at = now() - interval '25 hours' WHERE id = $1`, [breve.id]);
  await db.query(`INSERT INTO telepathy_availability (session_id, nickname, rinnovata_il) VALUES
    ('v20', 'V20', now() - interval '20 days'), ('v91', 'V91', now() - interval '91 days')`);
  await scaduti();
  check(!(await uno(db, `SELECT 1 AS x FROM telepathy_invites WHERE id = $1`, [breve.id])), 'le righe chiuse da più di un giorno si cancellano');
  const rimaste = (await righe(db, `SELECT session_id FROM telepathy_availability WHERE session_id IN ('v20', 'v91')`)).map((x) => x.session_id);
  check(JSON.stringify(rimaste) === '["v20"]', 'disponibilità: a 20 giorni resta (è solo fuori lista), a 91 si cancella', rimaste);
  const mA = await errore(comeAnon(db, () => db.query(`SELECT * FROM expire_telepathy_invites()`)));
  check(!!mA && /permission denied/i.test(mA), 'anon non può chiamare expire_telepathy_invites', mA);
});

sezione('F2. cancellare ed esportare l\'account', async (db) => {
  await iscritto(db, 'via', 'Via', 'hv');
  await abbonamento(db, 'via');
  await chiama(db, 'set_telepathy_availability', { p_session_id: 'via', p_password_hash: 'hv', p_nickname: null, p_enabled: true });
  await disp(db, 'amica', 'Amica');
  const inv = await chiama(db, 'send_telepathy_invite', { p_session_id: 'via', p_password_hash: 'hv', p_nickname: null,
    p_disponibilita_id: await idDisp(db, 'amica'), p_session_online: null });
  await db.query(`INSERT INTO telepathy_invite_blocks (blocker_session, blocked_session) VALUES ('via', 'x1'), ('x2', 'via')`);
  const exp = (await uno(db, `SELECT export_my_account('Via', 'hv') AS e`)).e;
  check(exp.telepathy_invites.length === 1 && exp.telepathy_invites[0].ruolo === 'mittente' && exp.telepathy_invites[0].altra_persona === 'Amica',
    'export: gli inviti, con ruolo e nome dell\'altra persona', exp.telepathy_invites);
  check(!!exp.telepathy_availability && exp.telepathy_availability.nickname === 'Via' && exp.telepathy_invite_blocks.length === 1,
    'export: la disponibilità e i blocchi impostati da me', exp);
  const testo = JSON.stringify({ i: exp.telepathy_invites, b: exp.telepathy_invite_blocks });
  check(!testo.includes('amica') && !testo.includes('x1'), 'export: nessun session_id altrui', testo);
  await db.query(`SELECT delete_my_account('Via', 'hv')`);
  check(!(await uno(db, `SELECT 1 AS x FROM telepathy_availability WHERE session_id = 'via'`)), 'delete: la disponibilità se ne va');
  const bl = await righe(db, `SELECT blocker_session FROM telepathy_invite_blocks WHERE 'via' IN (blocker_session, blocked_session)`);
  check(JSON.stringify(bl.map((x) => x.blocker_session)) === '["x2"]', 'delete: via i blocchi impostati da me, restano quelli subiti', bl);
  check(!(await uno(db, `SELECT 1 AS x FROM telepathy_invites WHERE id = $1`, [inv.id])), 'delete: gli inviti se ne vanno (come dalla 06_)');
  const corpo = (await uno(db, `SELECT prosrc FROM pg_proc WHERE proname = 'delete_my_account'`)).prosrc;
  check(corpo.includes('NUOVO (31)') && corpo.includes('DELETE FROM ritual_presence WHERE session_id = v_sid') && corpo.includes('NUOVO (32)'),
    'delete_my_account: il corpo della 31_ più il blocco 32');
});

sezione('F3. un solo job, due chiamate', async (db) => {
  const job = await uno(db, `SELECT schedule, command FROM cron.job WHERE jobname = 'notify-ritual-start'`);
  check(job.schedule === '* * * * *', 'stesso orario', job.schedule);
  check(job.command.includes('/functions/v1/notify-ritual-start') && job.command.includes('/functions/v1/notify-telepathy-invite')
    && job.command.includes('"tipo":"scadenze"'), 'lo stesso job chiama le due funzioni', job.command);
  check(!job.command.includes('\r') && !/service.?role/i.test(job.command), 'nessun ritorno a capo di Windows, nessuna chiave privilegiata');
  check((await uno(db, `SELECT count(*)::int n FROM cron.job WHERE jobname = 'notify-ritual-start'`)).n === 1, 'un solo job con quel nome');
});

sezione('F4. rilancio e ritorno indietro', async (db) => {
  check(!(await errore(applicaFile(db, F32A))), '32a rilanciata: nessun errore');
  const firme = await righe(db, `SELECT proname, count(*)::int n FROM pg_proc WHERE proname IN ('send_telepathy_invite', 'get_invitable_users',
    'get_invite_card', 'respond_telepathy_invite', 'block_telepathy_inviter', 'set_telepathy_availability', 'renew_telepathy_availability',
    'cancel_telepathy_invite', 'get_my_telepathy_invites', 'get_telepathy_invite', 'expire_telepathy_invites') GROUP BY 1`);
  check(firme.length === 11 && firme.every((f) => f.n === 1), 'undici RPC, una firma ciascuna', firme);
  check((await uno(db, `SELECT count(*)::int n FROM cron.job WHERE jobname = 'notify-ritual-start'`)).n === 1, 'rilancio: sempre un solo job');
  check(!(await errore(applicaFile(db, 'supabase/sql/32a_ritorno.sql'))), '32a_ritorno si applica');
  await comeAnon(db, () => db.query(`INSERT INTO telepathy_invites (from_id, from_name, to_id, to_name) VALUES ('old', 'Old', 'dup', 'Dup'), ('old2', 'Old2', 'dup', 'Dup')`));
  check((await uno(db, `SELECT count(*)::int n FROM telepathy_invites WHERE to_id = 'dup' AND status = 'pending'`)).n === 2,
    'dopo il ritorno le app vecchie scrivono come prima della 32a (anche due pending per destinatario)');
  check(!(await errore(applicaFile(db, F32A))), 'dopo il ritorno la 32a si riapplica, normalizzando i doppioni');
});
```

- [ ] **Step 2: vederlo fallire** — Atteso: F1 ed F2 in eccezione (`expire_telepathy_invites` non esiste; l'export non ha `telepathy_invites`), F3 rossa (il comando del job ha una sola chiamata), F4 in eccezione (`32a_ritorno.sql` non esiste). Le altre verdi (142).

- [ ] **Step 3: la sezione F**

```sql
-- ════ F. Scadenze, account, cron ═════════════════════════════════════════════

-- Solo per la Edge Function (ruolo di servizio). Segna expired i pending scaduti; restituisce
-- gli inviti da 10 minuti diventati expired negli ultimi 10 minuti, DA CHIUNQUE siano stati
-- segnati (anche da get_my_telepathy_invites di chi ha riaperto l'app): altrimenti la push
-- «scaduto» si perderebbe proprio quando il destinatario apre tardi. La stessa riga può tornare
-- in più giri: la dedup di telepathy_invite_pushes evita i doppioni.
CREATE OR REPLACE FUNCTION public.expire_telepathy_invites()
RETURNS TABLE (invito_id uuid) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  UPDATE telepathy_invites SET status = 'expired', responded_at = now()
   WHERE status = 'pending' AND expires_at <= now();
  -- Pulizia: gli inviti chiusi da più di un giorno (con loro, a cascata, la dedup delle push) e
  -- le disponibilità di chi non apre l'app da 90 giorni (a 14 era già fuori lista, §2.2).
  DELETE FROM telepathy_invites WHERE status <> 'pending' AND coalesce(responded_at, created_at) < now() - interval '1 day';
  DELETE FROM telepathy_availability WHERE rinnovata_il < now() - interval '90 days';
  RETURN QUERY
    SELECT i.id FROM telepathy_invites i
     WHERE i.status = 'expired' AND i.responded_at > now() - interval '10 minutes'
       AND telepatia_era_da_dieci(i.created_at, i.expires_at);
END $$;
REVOKE ALL ON FUNCTION public.expire_telepathy_invites() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_telepathy_invites() TO RUOLO_DI_SERVIZIO;

-- ── Cancellare l'account ─────────────────────────────────────────────────────
-- Corpo della 31_ (l'ultima migration che la ridefinisce), identico, più il blocco «NUOVO (32)».
CREATE OR REPLACE FUNCTION public.delete_my_account(
  p_nickname      text,
  p_password_hash text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
  v_sid   text;
BEGIN
  SELECT email, session_id INTO v_email, v_sid
    FROM profiles
   WHERE nickname = p_nickname AND password_hash = p_password_hash;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Auth failed';
  END IF;

  -- (a) Anonimizza i contenuti pubblici (preserva i thread altrui)
  UPDATE consciousness_posts    SET author_nickname = 'Utente eliminato' WHERE author_nickname = p_nickname;
  UPDATE consciousness_comments SET author_nickname = 'Utente eliminato' WHERE author_nickname = p_nickname;
  UPDATE ritual_comments        SET author_nickname = 'Utente eliminato' WHERE author_nickname = p_nickname;
  UPDATE rituals                SET creator         = 'Utente eliminato' WHERE creator = p_nickname;
  -- chat_messages NON esiste piu' (droppata da 08_drop_dead_tables.sql): vedi 17_.

  -- (b) Cancella i dati personali/privati
  DELETE FROM private_messages WHERE sender_name = p_nickname OR receiver_name = p_nickname;
  DELETE FROM notifications    WHERE user_nickname = p_nickname;

  IF v_email IS NOT NULL AND v_email <> '' THEN
    DELETE FROM telepathy_scores WHERE user_id = v_email;
    DELETE FROM magic_links      WHERE email   = v_email;
    DELETE FROM password_resets  WHERE email   = v_email;
  END IF;

  IF v_sid IS NOT NULL AND v_sid <> '' THEN
    DELETE FROM online_users      WHERE id = v_sid;
    DELETE FROM telepathy_queue   WHERE id = v_sid;
    DELETE FROM telepathy_invites WHERE from_id = v_sid OR to_id = v_sid;

    -- NUOVO (22): abbonamenti alle notifiche push. Un endpoint push e' un canale aperto verso
    -- un telefono: lasciarlo vivo dopo la cancellazione significa continuare a scrivere a
    -- qualcuno che ha chiesto di sparire.
    DELETE FROM push_subscriptions WHERE session_id = v_sid;

    -- NUOVO (30): le sue candele e il nome accanto, in ogni rituale.
    UPDATE rituals
       SET candles      = coalesce((SELECT jsonb_agg(e) FROM jsonb_array_elements(candles) e
                                     WHERE e <> to_jsonb(v_sid)), '[]'::jsonb),
           candles_nomi = candles_nomi - v_sid
     WHERE candles @> to_jsonb(array[v_sid]) OR candles_nomi ? v_sid;

    -- NUOVO (31): la sua partecipazione (participants, array di session_id come candles) e le
    -- sue presenze nelle stanze. Gli altri partecipanti restano, nello stesso ordine.
    UPDATE rituals
       SET participants = coalesce((SELECT jsonb_agg(e) FROM jsonb_array_elements(participants) e
                                     WHERE e <> to_jsonb(v_sid)), '[]'::jsonb)
     WHERE participants @> to_jsonb(array[v_sid]);
    DELETE FROM ritual_presence WHERE session_id = v_sid;

    -- NUOVO (32): la disponibilità agli inviti e i «Non voglio più inviti» impostati da me.
    -- Quelli subiti restano, come per user_blocks (18_): cancellare l'account non deve diventare
    -- un modo per farsi sbloccare. Gli inviti li cancella già la riga più sopra (dalla 06_), e
    -- con loro, a cascata, telepathy_invite_pushes.
    DELETE FROM telepathy_availability  WHERE session_id = v_sid;
    DELETE FROM telepathy_invite_blocks WHERE blocker_session = v_sid;
  END IF;

  -- (c) SP1: se ne vanno solo i blocchi che ho impostato io. Quelli subiti
  -- restano, altrimenti cancellare l'account diventa un modo per farsi
  -- sbloccare da chi ci ha bloccati.
  DELETE FROM user_blocks WHERE blocker_nickname = p_nickname;
  UPDATE content_reports SET reporter_nickname = 'Utente eliminato' WHERE reporter_nickname = p_nickname;

  -- (d) Cancella l'identita'
  DELETE FROM profiles WHERE nickname = p_nickname AND password_hash = p_password_hash;
END $$;

GRANT EXECUTE ON FUNCTION public.delete_my_account(text, text) TO anon;

-- ── Esportare l'account ──────────────────────────────────────────────────────
-- Corpo della 24_ (l'ultima che la ridefinisce), identico, più le tre voci «NUOVO (32)». Senza
-- i session_id delle altre persone: chi invita non riceve mai il to_id (spec §6), e l'export non
-- deve diventare la strada per averlo.
CREATE OR REPLACE FUNCTION public.export_my_account(
  p_nickname      text,
  p_password_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email  text;
  v_sid    text;
  v_result jsonb;
BEGIN
  SELECT email, session_id INTO v_email, v_sid
    FROM profiles
   WHERE nickname = p_nickname AND password_hash = p_password_hash;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Auth failed';
  END IF;

  SELECT jsonb_build_object(
    'exported_at', now(),
    'profile', (SELECT to_jsonb(p) - 'password_hash'
                  FROM profiles p WHERE p.nickname = p_nickname),
    'private_messages', coalesce((SELECT jsonb_agg(to_jsonb(m))
                  FROM private_messages m
                 WHERE m.sender_name = p_nickname OR m.receiver_name = p_nickname), '[]'::jsonb),
    'consciousness_posts', coalesce((SELECT jsonb_agg(to_jsonb(c))
                  FROM consciousness_posts c WHERE c.author_nickname = p_nickname), '[]'::jsonb),
    'consciousness_comments', coalesce((SELECT jsonb_agg(to_jsonb(c))
                  FROM consciousness_comments c WHERE c.author_nickname = p_nickname), '[]'::jsonb),
    'ritual_comments', coalesce((SELECT jsonb_agg(to_jsonb(rc))
                  FROM ritual_comments rc WHERE rc.author_nickname = p_nickname), '[]'::jsonb),
    'rituals_created', coalesce((SELECT jsonb_agg(to_jsonb(r))
                  FROM rituals r WHERE r.creator = p_nickname OR r.creator_id = v_sid), '[]'::jsonb),
    'telepathy_scores', coalesce((SELECT jsonb_agg(to_jsonb(ts))
                  FROM telepathy_scores ts WHERE ts.user_id = v_email), '[]'::jsonb),
    'notifications', coalesce((SELECT jsonb_agg(to_jsonb(n))
                  FROM notifications n WHERE n.user_nickname = p_nickname), '[]'::jsonb),
    -- NUOVO (24): abbonamenti alle notifiche push.
    'push_subscriptions', coalesce((SELECT jsonb_agg(to_jsonb(ps))
                  FROM push_subscriptions ps WHERE ps.session_id = v_sid), '[]'::jsonb),
    -- NUOVO (32): inviti (mandati e ricevuti), disponibilità, blocchi impostati da me.
    'telepathy_invites', coalesce((SELECT jsonb_agg(jsonb_build_object(
                    'ruolo', CASE WHEN i.from_id = v_sid THEN 'mittente' ELSE 'destinatario' END,
                    'altra_persona', CASE WHEN i.from_id = v_sid THEN i.to_name ELSE i.from_name END,
                    'status', i.status, 'created_at', i.created_at,
                    'expires_at', i.expires_at, 'responded_at', i.responded_at))
                  FROM telepathy_invites i WHERE i.from_id = v_sid OR i.to_id = v_sid), '[]'::jsonb),
    'telepathy_availability', (SELECT jsonb_build_object('nickname', a.nickname, 'enabled_at', a.enabled_at,
                                                         'rinnovata_il', a.rinnovata_il)
                  FROM telepathy_availability a WHERE a.session_id = v_sid),
    'telepathy_invite_blocks', coalesce((SELECT jsonb_agg(jsonb_build_object('created_at', b.created_at))
                  FROM telepathy_invite_blocks b WHERE b.blocker_session = v_sid), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END $$;

GRANT EXECUTE ON FUNCTION public.export_my_account(text, text) TO anon;

-- ── Il cron: nessun job nuovo ────────────────────────────────────────────────
-- Il job della 23_, stesso nome, stesso orario, stessa prima chiamata, più la seconda verso
-- notify-telepathy-invite. Una sola cosa da sorvegliare, e la sentinella la vede già. Solo la
-- chiave pubblica, come nella 23_.
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'notify-ritual-start';
SELECT cron.schedule(
  'notify-ritual-start',
  '* * * * *',
  $job$
  SELECT net.http_post(
    url     := 'https://vxzxdkcluyrcftsnxxza.supabase.co/functions/v1/notify-ritual-start',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4enhka2NsdXlyY2Z0c254eHphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzMzcyMTcsImV4cCI6MjA4NjkxMzIxN30.m_mzWHH1-ajVqeSFvuJAm8t5Kz7I7umcEKBrRPr5JXM'
               ),
    body    := '{}'::jsonb
  );
  SELECT net.http_post(
    url     := 'https://vxzxdkcluyrcftsnxxza.supabase.co/functions/v1/notify-telepathy-invite',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4enhka2NsdXlyY2Z0c254eHphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzMzcyMTcsImV4cCI6MjA4NjkxMzIxN30.m_mzWHH1-ajVqeSFvuJAm8t5Kz7I7umcEKBrRPr5JXM'
               ),
    body    := '{"tipo":"scadenze"}'::jsonb
  );
  $job$
);
```

Sulla riga `GRANT EXECUTE ON FUNCTION public.expire_telepathy_invites() TO RUOLO_DI_SERVIZIO;` scrivere nel file il nome vero del ruolo di servizio (vedi Global Constraints). In PGlite il ruolo esiste (lo crea `pg-locale.js`), quindi il GRANT passa anche in locale.

- [ ] **Step 4: il ritorno indietro, `supabase/sql/32a_ritorno.sql`**

```sql
-- ============================================================================
-- 32a_ritorno.sql — ritorno indietro della 32a. SCRITTO E PROVATO IN LOCALE, NON APPLICATO:
-- lo lancia Irene solo se decide che serve (spec §8 passo 2).
--
-- Quando: se gli indici unici, il CHECK sugli stati o il trigger di guardia danno problemi alle
-- app vecchie ancora in cache (inviti che non partono, accettazioni che falliscono).
-- Cosa NON tocca: tabelle, colonne e RPC nuove (senza l'app nuova sono inerti) e il trigger di
-- telepathy_matches (aggiorna solo ultima_attivita e giocato, le app vecchie non lo vedono).
-- Il job del cron torna com'era con: node scripts/apply-sql.js supabase/sql/23_cron_push.sql
-- Per rimettere tutto: rilanciare la 32a (alla prima riapplicazione chiude tutti i pending).
-- ============================================================================
BEGIN;
DROP TRIGGER IF EXISTS telepathy_invites_guardia ON telepathy_invites;
DROP INDEX IF EXISTS telepathy_invites_un_pending_mittente;
DROP INDEX IF EXISTS telepathy_invites_un_pending_destinatario;
ALTER TABLE telepathy_invites DROP CONSTRAINT IF EXISTS telepathy_invites_stato_valido;
NOTIFY pgrst, 'reload schema';
COMMIT;
```

- [ ] **Step 5: vederlo passare** — Atteso: `165 passati, 0 falliti`.

- [ ] **Step 6: i test SQL che la 32a potrebbe toccare**

```bash
NODE_OPTIONS="--require ./scripts/test-silenzioso.js" node test-candela-stanza-sql.js | tail -n 1
NODE_OPTIONS="--require ./scripts/test-silenzioso.js" node test-rituali-ricorrenti-sql.js | tail -n 1
NODE_OPTIONS="--require ./scripts/test-silenzioso.js" node test-pg-locale.js | tail -n 1
```
Atteso: gli stessi numeri del Task 1 e del Task 6.

- [ ] **Step 7: niente `\r`, niente parola vietata fuori dai GRANT**

```bash
git add supabase/sql/32a_inviti_telepatia_offline.sql supabase/sql/32a_ritorno.sql test-inviti-offline-sql.js
git commit -m "feat(sql): 32a sezione F — scadenze, account, cron; 32a_ritorno

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
git show HEAD:supabase/sql/32a_inviti_telepatia_offline.sql | grep -c $'\r'
git show HEAD:supabase/sql/32a_ritorno.sql | grep -c $'\r'
```
Atteso: il commit passa l'hook pre-commit; le due conte stampano `0`.

**Fatto quando:** `test-inviti-offline-sql.js` → `165 passati, 0 falliti`; i test SQL esistenti invariati; nessun `\r` nei due blob.

### Task 13: il test sul database vero (scritto ora, lanciato dopo la 32a)

**Obiettivo:** dopo che Irene ha applicato la 32a, provare sul Supabase vero, con la chiave pubblica come l'app, che le RPC ci sono, rispondono come in locale e si parlano con la Edge Function; pulire tutto con la chiave di servizio.

**Files:**
- Create: `test-inviti-offline-rpc.js`

**Interfaces:**
- Consumes: le RPC della 32a (Task 9–12); `getServiceKey`, `purge` da `test-helpers.js`; `SUPABASE_SERVICE_KEY` in `.env.test`.

- [ ] **Step 1: il test**

```js
/**
 * Le RPC degli inviti offline sul database VERO, con la chiave pubblica come l'app.
 * NODE_OPTIONS="--require ./scripts/test-silenzioso.js" node test-inviti-offline-rpc.js
 *
 * Prerequisiti: 32a applicata, notify-telepathy-invite pubblicata, SUPABASE_SERVICE_KEY in
 * .env.test (per la pulizia). ⚠️ Per pochi secondi le righe di disponibilità di prova sono
 * visibili a utenti veri nella lista «Disponibili su invito»: nickname con prefisso GAInvRpc_,
 * pulizia nel finally. Lanciarlo in un orario tranquillo.
 */
const { getServiceKey, purge } = require('./test-helpers');
const SUPABASE_URL = 'https://vxzxdkcluyrcftsnxxza.supabase.co';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4enhka2NsdXlyY2Z0c254eHphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzMzcyMTcsImV4cCI6MjA4NjkxMzIxN30.m_mzWHH1-ajVqeSFvuJAm8t5Kz7I7umcEKBrRPr5JXM';
const TS = Date.now();
const A = { sid: `gainvrpc_a_${TS}`, nick: `GAInvRpc_A_${TS}` };
const B = { sid: `gainvrpc_b_${TS}`, nick: `GAInvRpc_B_${TS}` };

let passati = 0, falliti = 0;
const check = (c, m, x) => { if (c) { console.log('  ✅ ' + m); passati++; } else { console.log('  ❌ ' + m + (x !== undefined ? ' — ' + JSON.stringify(x) : '')); falliti++; process.exitCode = 1; } };

async function rpc(fn, corpo) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  });
  let j = null; try { j = await r.json(); } catch (_) {}
  return { stato: r.status, j };
}
const tu = (p) => ({ p_session_id: p.sid, p_password_hash: null });
const abbona = (p) => rpc('register_push_subscription', { p_session_id: p.sid,
  p_endpoint: `https://fcm.googleapis.com/fcm/send/gainvrpc_${p.sid}`, p_p256dh: 'p256dh_finta', p_auth: 'auth_finta', p_locale: 'it' });

(async () => {
  if (!getServiceKey()) { console.log('⛔ serve SUPABASE_SERVICE_KEY in .env.test per ripulire: non parto.'); process.exit(2); }
  try {
    let r = await rpc('set_telepathy_availability', { ...tu(B), p_nickname: B.nick, p_enabled: true });
    check(r.stato === 200 && r.j.ok === false && r.j.motivo === 'nessun_abbonamento', 'senza abbonamento non si accende', r);
    await abbona(B);
    r = await rpc('set_telepathy_availability', { ...tu(B), p_nickname: B.nick, p_enabled: true });
    check(r.j && r.j.ok === true && r.j.acceso === true, 'con l\'abbonamento si accende', r);
    r = await rpc('get_invitable_users', { ...tu(A), p_nickname: A.nick });
    const riga = Array.isArray(r.j) ? r.j.find((x) => x.nickname === B.nick) : null;
    check(!!riga && Object.keys(riga).sort().join(',') === 'id,nickname', 'B è nella lista di A, con il solo id opaco', r.j && r.j.length);
    r = await rpc('get_invite_card', { ...tu(A), p_nickname: A.nick, p_disponibilita_id: riga && riga.id, p_session_online: null });
    check(r.j && r.j.ok === true && r.j.scheda.nickname === B.nick && !JSON.stringify(r.j).includes(B.sid), 'la scheda di B non contiene il suo session_id', r.j);
    r = await rpc('send_telepathy_invite', { ...tu(A), p_nickname: A.nick, p_disponibilita_id: riga && riga.id, p_session_online: null });
    check(r.j && r.j.ok === true && r.j.push_saltata === false, 'A invita B (10 minuti, con push)', r.j);
    const invito = r.j && r.j.id;
    const secondi = r.j ? (Date.parse(r.j.expires_at) - Date.parse(r.j.adesso)) / 1000 : 0;
    check(secondi > 590 && secondi <= 600, 'B offline: 10 minuti dall\'ora del server', secondi);
    r = await rpc('get_my_telepathy_invites', tu(B));
    check(r.j && r.j.in_arrivo && r.j.in_arrivo.id === invito && r.j.in_arrivo.from_id === A.sid, 'B vede l\'invito, con from_id', r.j);
    r = await rpc('get_my_telepathy_invites', tu(A));
    check(r.j && r.j.in_uscita && !JSON.stringify(r.j).includes(B.sid), 'A vede il suo invito, senza il session_id di B', r.j);
    r = await rpc('respond_telepathy_invite', { p_invite_id: invito, ...tu(B), p_accept: false, p_match_id: null });
    check(r.j && r.j.ok === true && r.j.status === 'declined', 'B rifiuta', r.j);
    r = await rpc('expire_telepathy_invites', {});
    check(r.stato === 401 || r.stato === 403 || r.stato === 404, 'expire_telepathy_invites non è chiamabile con la chiave pubblica', r.stato);
    r = await rpc('set_telepathy_availability', { ...tu(B), p_nickname: B.nick, p_enabled: false });
    check(r.j && r.j.ok === true && r.j.acceso === false, 'B spegne l\'interruttore', r.j);
  } finally {
    await purge(SUPABASE_URL, [
      `telepathy_invites?from_id=eq.${A.sid}`, `telepathy_invites?to_id=eq.${A.sid}`,
      `telepathy_invites?from_id=eq.${B.sid}`, `telepathy_invites?to_id=eq.${B.sid}`,
      `telepathy_availability?session_id=in.(${A.sid},${B.sid})`,
      `push_subscriptions?session_id=in.(${A.sid},${B.sid})`,
      `notifications?user_nickname=in.(${A.nick},${B.nick})`,
    ], { label: 'inviti-rpc' });
  }
  console.log(`\n${passati} passati, ${falliti} falliti`);
})();
```

- [ ] **Step 2: vederlo rosso adesso** (32a non ancora applicata)

Run: `NODE_OPTIONS="--require ./scripts/test-silenzioso.js" node test-inviti-offline-rpc.js`
Atteso: il primo controllo ❌ con stato 404 (`Could not find the function`). Resta rosso fino al Task 14.

- [ ] **Step 3: commit** — `test: inviti offline sul database vero (dopo la 32a)` (+ `Co-Authored-By`).

**Fatto quando:** il file esiste, è rosso per 404, e la pulizia è nel `finally`.

### Task 14: revisione, PR 2, passi 1 e 2 dal vivo

**Obiettivo:** la migration e la funzione arrivano su `main` rivedute; Irene pubblica la funzione, poi applica la 32a; tutto si verifica sul database vero.

- [ ] **Step 1: revisione indipendente del gruppo B** (sub-agente separato, `superpowers:requesting-code-review`), sul diff `origin/main..HEAD`, con la spec in mano. Deve controllare almeno: ogni RPC chiamata con un `session_id` passa da `telepatia_verifica_identita`; nessuna restituisce `session_id` altrui oltre al `from_id` dell'invito pending a me; nessun `GRANT` ad anon su funzioni interne o su `expire_telepathy_invites`; i ⚠️ in testa; il trigger di guardia copre insert e update; il corpo di `delete_my_account` è quello della 31_ più il blocco 32 (`diff` fra i due corpi); il job ha due chiamate e nessun segreto. Rilievi chiusi, test rilanciati.
- [ ] **Step 2: il controller** dice a Irene «sto per pushare `feat/inviti-offline-motore` e aprire la PR 2», poi push e PR.
- [ ] **Step 3: 🟣 IRENE** — `! gh pr merge <N> --merge -R global-awakening/global-awakening.github.io`
- [ ] **Step 4: 🟣 IRENE** — da `main` aggiornato: `! node scripts/deploy-push.js --solo notify-telepathy-invite`
- [ ] **Step 5: sonda prima della 32a** — `NODE_OPTIONS="--require ./scripts/test-silenzioso.js" node test-invito-funzione.js` → `3 passati, 0 falliti`. Se rosso, **non** si applica la 32a.
- [ ] **Step 6: 🟣 IRENE** — `! node scripts/apply-sql.js supabase/sql/32a_inviti_telepatia_offline.sql`
- [ ] **Step 7: verifiche dopo la 32a**

```bash
NODE_OPTIONS="--require ./scripts/test-silenzioso.js" node test-invito-funzione.js --dopo-32a
NODE_OPTIONS="--require ./scripts/test-silenzioso.js" node test-inviti-offline-rpc.js
NODE_OPTIONS="--require ./scripts/test-silenzioso.js" node test-push-cron.js
```
Atteso: `5 passati, 0 falliti`; `11 passati, 0 falliti`; `test-push-cron.js` verde, e di nuovo verde dopo 3 minuti e dopo 20 (nessuna risposta non 2xx: il job ora chiama due funzioni ogni minuto).

- [ ] **Step 8: le app vecchie funzionano ancora** — con il server locale sulla versione di `main` (l'app non è cambiata): `NODE_OPTIONS="--require ./scripts/test-silenzioso.js" node test-inviti-telepatia.js` e `test-telepathy.js` → gli stessi numeri della baseline (Task 1). È la prova della tenuta: inviti diretti, accettazione diretta, match.

- [ ] **Ritorno indietro (scritto, non eseguito):** 🟣 `! node scripts/apply-sql.js supabase/sql/32a_ritorno.sql` e poi 🟣 `! node scripts/apply-sql.js supabase/sql/23_cron_push.sql`.

**Fatto quando:** PR 2 mergiata; funzione pubblicata; 32a applicata; sonda `5/5`, RPC `11/11`, cron verde a 0, 3 e 20 minuti; `test-inviti-telepatia.js` e `test-telepathy.js` come la baseline.

---

## Fase C — L'app (ramo `feat/inviti-offline-app`)

Il ramo nasce da `main` **dopo** il merge della PR 2 **e** dopo che Irene ha applicato la 32a (Task 14): i test UI di questa fase girano sul database vero, e l'app nuova usa colonne (`da_invito`) e RPC che esistono solo dopo la 32a.

```bash
git fetch origin
git worktree add ../wt-inviti-app -b feat/inviti-offline-app origin/main
cd ../wt-inviti-app && npm install
```

Il server locale serve a tutti i test UI della fase, in una finestra a parte: `npx serve -l 4321 .` → verificare `Accepting connections at http://localhost:4321`. Dopo ogni modifica a `src/app.jsx`: `node build.js` (ricompila `app.js`) prima di lanciare i test UI.

### Task 15: i testi delle notifiche d'invito (`push-helpers.js`)

**Obiettivo:** la notifica dice la cosa giusta per ognuno dei quattro tipi d'invito, in italiano e in inglese, con un ripiego per ogni campo; un tipo sconosciuto non diventa più il testo di un rituale; il service worker ha le due funzioni pure che gli servono.

**Files:**
- Modify: `push-helpers.js` (riscritto per intero qui sotto)
- Modify: `test-push-helpers.js`

**Interfaces:**
- Consumes: payload della Edge Function `{tipo, invito, nome, locale}` (Task 5).
- Produces (su `self.PushHelpers` e `module.exports`): `costruisciNotifica(payload) → {titolo, corpo, tag, url, azioni: Array<{action, title}>}`; `eTipoInvito(tipo) → boolean`; `urlAzione(url, azione) → string`; `puoTacere(userAgent) → boolean`; `TIPI_INVITO`.

- [ ] **Step 1: il test prima**

In `test-push-helpers.js` la prima riga di codice diventa
```js
const { costruisciNotifica, urlAzione, puoTacere } = require('./push-helpers.js');
```
e prima di `console.log(\`\n${passati} passati…\`)` si aggiunge:

```js
// --- Inviti telepatia (spec 2026-09-25 §4.3) ----------------------------------
const ID = '3f0c2b1e-8a4d-4c6e-9b7a-1d2e3f4a5b6c';
const inv = costruisciNotifica({ tipo: 'invito', invito: ID, nome: 'Aurora', locale: 'it' });
uguale('invito it: titolo', inv.titolo, 'Aurora ti invita a un training telepatico');
uguale('invito it: testo', inv.corpo, 'Tocca per rispondere.');
/\d+\s*minut/i.test(inv.titolo + inv.corpo) ? ko('invito senza numero di minuti', inv.titolo) : ok('invito senza numero di minuti');
uguale('invito: destinazione', inv.url, 'app.html?invito=' + ID);
uguale('invito: tag', inv.tag, 'invito-' + ID);
uguale('invito: azione «blocca»', inv.azioni.length === 1 && inv.azioni[0].action, 'blocca');
uguale('invito en: titolo', costruisciNotifica({ tipo: 'invito', invito: ID, nome: 'Aurora', locale: 'en' }).titolo, 'Aurora invites you to a telepathy training');
const acc = costruisciNotifica({ tipo: 'accettato', invito: ID, nome: 'Bruno', locale: 'it' });
uguale('accettato it', acc.titolo, 'Bruno ha accettato, entra!');
uguale('stesso tag per tutti i messaggi di un invito', acc.tag, inv.tag);
uguale('accettato: nessuna azione', acc.azioni.length, 0);
uguale('rifiutato it', costruisciNotifica({ tipo: 'rifiutato', invito: ID, nome: 'Bruno', locale: 'it' }).titolo, 'Bruno non può ora');
uguale('scaduto it', costruisciNotifica({ tipo: 'scaduto', invito: ID, nome: 'Bruno', locale: 'it' }).titolo, "L'invito a Bruno è scaduto");
uguale('scaduto en', costruisciNotifica({ tipo: 'scaduto', invito: ID, nome: 'Bruno', locale: 'en' }).titolo, 'Your invite to Bruno has expired');
const senza = costruisciNotifica({ tipo: 'invito', locale: 'it' });
uguale('invito senza nome: «Qualcuno»', senza.titolo, 'Qualcuno ti invita a un training telepatico');
uguale('invito senza id: apre l\'app, nessuna azione', `${senza.url}/${senza.azioni.length}`, 'app.html/0');
uguale('un id storto non entra nell\'indirizzo', costruisciNotifica({ tipo: 'invito', invito: 'x"><script>', nome: 'A' }).url, 'app.html');
const lungo = '🌙'.repeat(5) + 'L'.repeat(45);
costruisciNotifica({ tipo: 'invito', invito: ID, nome: lungo, locale: 'it' }).titolo.startsWith(lungo)
  ? ok('nome di 50 caratteri con emoji: intero') : ko('nome di 50 caratteri con emoji: intero', lungo);
costruisciNotifica({ tipo: 'invito', invito: ID, nome: '<b>x</b>', locale: 'it' }).titolo.includes('<b>x</b>')
  ? ok('il nome resta testo') : ko('il nome resta testo', '');
const ign = costruisciNotifica({ tipo: 'boh', rituale: 'Luna', ritualeId: 3, locale: 'it' });
uguale('tipo sconosciuto: testo neutro, non un rituale', `${ign.titolo}/${ign.corpo}/${ign.url}`, "Global Awakening/Apri l'app/app.html");
uguale('promemoria invariato', costruisciNotifica({ tipo: 'reminder', rituale: 'X', ritualeId: 1, locale: 'it' }).titolo, 'X sta per iniziare');
uguale('urlAzione: blocca', urlAzione('app.html?invito=' + ID, 'blocca'), 'app.html?invito=' + ID + '&azione=blocca');
uguale('urlAzione: senza azione', urlAzione('app.html?invito=' + ID, ''), 'app.html?invito=' + ID);
uguale('urlAzione: su un rituale non fa niente', urlAzione('app.html?ritual=4', 'blocca'), 'app.html?ritual=4');
uguale('puoTacere: Chrome su Android', puoTacere('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36'), true);
uguale('puoTacere: Safari su iPhone', puoTacere('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'), false);
uguale('puoTacere: Chrome su iPhone (sotto è Safari)', puoTacere('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0 Mobile/15E148 Safari/604.1'), false);
uguale('puoTacere: Firefox', puoTacere('Mozilla/5.0 (Windows NT 10.0; rv:131.0) Gecko/20100101 Firefox/131.0'), false);
```

- [ ] **Step 2: vederlo fallire** — Run: `NODE_OPTIONS="--require ./scripts/test-silenzioso.js" node test-push-helpers.js`. Atteso: i controlli nuovi ❌ (`urlAzione is not a function` o titoli di rituale al posto di quelli d'invito).

- [ ] **Step 3: il nuovo `push-helpers.js`**

```js
/**
 * push-helpers.js — funzioni pure delle notifiche push.
 *
 * Vive fuori da sw.js per un motivo solo: dentro un service worker non si testa niente, e
 * questa è la parte che decide cosa legge la persona sul telefono. Caricato da sw.js con
 * importScripts() e da node con require().
 *
 * Deliberatamente in stile ES5 e senza dipendenze: gira dentro un service worker, dove non
 * c'è nessun passaggio di build.
 *
 * Due famiglie di notifiche: i rituali (reminder, start — le manda notify-ritual-start) e, dal
 * 2026-10, gli inviti a un training telepatico (invito, accettato, rifiutato, scaduto — le manda
 * notify-telepathy-invite). Qualunque altro tipo diventa un testo neutro: prima diventava
 * «sta iniziando ora» di un rituale, che per un invito sarebbe stato falso.
 */
(function (globale) {
  'use strict';

  var TESTI = {
    it: {
      // Nessun numero di minuti: chi si iscrive cinque minuti prima dell'inizio è ancora
      // dentro la soglia del promemoria, e «inizia tra 15 minuti» sarebbe falso.
      reminder: function (n) {
        return { titolo: n + ' sta per iniziare', corpo: 'Preparati: il rituale sta per cominciare.' };
      },
      start: function (n) {
        return { titolo: n + ' sta iniziando ora', corpo: 'Il rituale è iniziato. Unisciti adesso.' };
      }
    },
    en: {
      reminder: function (n) {
        return { titolo: n + ' is about to begin', corpo: 'Get ready: the ritual is about to start.' };
      },
      start: function (n) {
        return { titolo: n + ' is starting now', corpo: 'The ritual has begun. Join now.' };
      }
    }
  };

  // Inviti. Nessun numero di minuti nemmeno qui: la durata dipende da com'era il destinatario
  // (45 s o 10 minuti) e il tempo scorre mentre la notifica aspetta.
  var TESTI_INVITO = {
    it: {
      invito: function (n) { return { titolo: n + ' ti invita a un training telepatico', corpo: 'Tocca per rispondere.' }; },
      accettato: function (n) { return { titolo: n + ' ha accettato, entra!', corpo: 'Il training ti aspetta.' }; },
      rifiutato: function (n) { return { titolo: n + ' non può ora', corpo: 'Puoi invitare qualcun altro.' }; },
      scaduto: function (n) { return { titolo: "L'invito a " + n + ' è scaduto', corpo: 'Puoi riprovare quando vuoi.' }; },
      blocca: 'Non voglio più inviti da questa persona',
      qualcuno: 'Qualcuno',
      neutro: { titolo: 'Global Awakening', corpo: "Apri l'app" }
    },
    en: {
      invito: function (n) { return { titolo: n + ' invites you to a telepathy training', corpo: 'Tap to answer.' }; },
      accettato: function (n) { return { titolo: n + ' accepted, join now!', corpo: 'The training is waiting for you.' }; },
      rifiutato: function (n) { return { titolo: n + " can't right now", corpo: 'You can invite someone else.' }; },
      scaduto: function (n) { return { titolo: 'Your invite to ' + n + ' has expired', corpo: 'You can try again any time.' }; },
      blocca: 'No more invites from this person',
      qualcuno: 'Someone',
      neutro: { titolo: 'Global Awakening', corpo: 'Open the app' }
    }
  };

  var TIPI_INVITO = ['invito', 'accettato', 'rifiutato', 'scaduto'];
  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  function eTipoInvito(tipo) { return TIPI_INVITO.indexOf(tipo) !== -1; }

  /**
   * Costruisce titolo, testo, tag, destinazione e azioni di una notifica.
   *
   * Non solleva mai: `userVisibleOnly` ci obbliga a mostrare SEMPRE una notifica quando ne
   * arriva una. Se questo codice esplodesse su un payload storto, il browser mostrerebbe una
   * notifica generica di sistema al posto nostro e, a forza di quelle, ci toglierebbe il
   * permesso. Quindi ogni campo ha un ripiego.
   */
  function costruisciNotifica(payload) {
    var p = payload || {};
    var lingua = TESTI[p.locale] ? p.locale : 'en';

    if (p.tipo === 'reminder' || p.tipo === 'start') {
      var tipo = p.tipo;
      var nome = typeof p.rituale === 'string' && p.rituale.length > 0 ? p.rituale : (lingua === 'it' ? 'Un rituale' : 'A ritual');
      var rid = typeof p.ritualeId === 'number' ? p.ritualeId : '';
      var t = TESTI[lingua][tipo](nome);
      return {
        titolo: t.titolo,
        corpo: t.corpo,
        // Il centro notifiche del telefono sostituisce le notifiche con lo stesso tag: se
        // promemoria e avvio lo condividessero, l'avvio cancellerebbe il promemoria invece
        // di affiancarlo.
        tag: 'rituale-' + rid + '-' + tipo,
        url: rid === '' ? 'app.html' : 'app.html?ritual=' + rid,
        azioni: []
      };
    }

    var ti = TESTI_INVITO[lingua];
    if (eTipoInvito(p.tipo)) {
      var chi = typeof p.nome === 'string' && p.nome.length > 0 ? p.nome : ti.qualcuno;
      var id = typeof p.invito === 'string' && UUID.test(p.invito) ? p.invito.toLowerCase() : '';
      var ts = ti[p.tipo](chi);
      return {
        titolo: ts.titolo,
        corpo: ts.corpo,
        // Stesso tag per tutti i messaggi di un invito: «accettato» sostituisce «invito» invece
        // di impilarsi, e dove la push si mostra anche con l'app aperta (Safari) non ci sono doppioni.
        tag: 'invito-' + (id || 'senza-id'),
        url: id ? 'app.html?invito=' + id : 'app.html',
        // Il service worker non chiama RPC (non ha la credenziale di un iscritto): l'azione apre
        // l'app sulla conferma del blocco. Dove le azioni non esistono (iPhone) la stessa scelta
        // sta nella schermata dell'invito.
        azioni: p.tipo === 'invito' && id ? [{ action: 'blocca', title: ti.blocca }] : []
      };
    }

    return { titolo: ti.neutro.titolo, corpo: ti.neutro.corpo, tag: 'ga-generico', url: 'app.html', azioni: [] };
  }

  /** La destinazione del tocco su un'azione della notifica. Solo gli inviti hanno «blocca». */
  function urlAzione(url, azione) {
    if (azione === 'blocca' && typeof url === 'string' && url.indexOf('?invito=') !== -1) return url + '&azione=blocca';
    return url;
  }

  /**
   * Se si può NON mostrare una push d'invito quando l'app è in primo piano. Solo Chromium fuori
   * da iOS lo tollera: Safari (anche Chrome su iPhone, che sotto è Safari) conta le push senza
   * notifica e può togliere il permesso; Firefox ha una quota. Nel dubbio si mostra.
   */
  function puoTacere(userAgent) {
    var ua = typeof userAgent === 'string' ? userAgent : '';
    return /(Chrome|Chromium)\//.test(ua) && !/iPhone|iPad|iPod/.test(ua);
  }

  var api = { costruisciNotifica: costruisciNotifica, eTipoInvito: eTipoInvito, urlAzione: urlAzione,
              puoTacere: puoTacere, TIPI_INVITO: TIPI_INVITO };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else globale.PushHelpers = api;
})(typeof self !== 'undefined' ? self : this);
```

- [ ] **Step 4: vederlo passare** — Atteso: `0 falliti`, e i passati = quelli della baseline del Task 1 **più 27**.
- [ ] **Step 5: commit** — `git add push-helpers.js test-push-helpers.js`, `feat(push): testi delle notifiche d'invito, tipo sconosciuto neutro` (+ `Co-Authored-By`).

**Fatto quando:** `test-push-helpers.js` → 0 falliti, baseline + 27.

### Task 16: il service worker (`sw.js`, `ga-pwa-v12`)

**Obiettivo:** le app installate prendono il codice nuovo (`ga-pwa-v12`, `push-helpers.js?v=12`); una push d'invito con l'app in primo piano su Chromium non mostra la notifica ma avvisa la finestra; il tocco su una notifica d'invito passa l'invito all'app aperta senza ricaricarla e, se l'app non risponde entro ~1 s, ricarica sull'invito; i rituali restano come oggi.

**Files:**
- Modify: `sw.js`
- Modify: `test-pwa.js` (riga 176, controllo di `importScripts`)
- Create: `test-sw-inviti.js`

**Interfaces:**
- Consumes: `PushHelpers.costruisciNotifica / puoTacere / urlAzione` (Task 15).
- Produces: alla finestra dell'app, `postMessage({tipo, invito})` per una push d'invito soppressa; `postMessage({tipo:'apri-invito', invito, azione}, [porta])` al tocco, con risposta attesa `{ok:true}` sulla porta (la implementa il Task 21). `data` della notifica: `{url, tipo, invito}`.

- [ ] **Step 1: il test prima, `test-sw-inviti.js`**

```js
/**
 * Il service worker davanti alle push d'invito, in una sandbox vm di Node (dentro un browser
 * vero non si prova niente di tutto questo).
 * NODE_OPTIONS="--require ./scripts/test-silenzioso.js" node test-sw-inviti.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let passati = 0, falliti = 0;
const check = (c, m, x) => { if (c) { console.log('  ✅ ' + m); passati++; } else { console.log('  ❌ ' + m + (x !== undefined ? ' — ' + JSON.stringify(x) : '')); falliti++; process.exitCode = 1; } };
const ID = '3f0c2b1e-8a4d-4c6e-9b7a-1d2e3f4a5b6c';
const UA_CHROME = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36';
const UA_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

function caricaSW({ userAgent, finestre = [] }) {
  const ascoltatori = {};
  const mostrate = [];
  const aperte = [];
  const self = {
    navigator: { userAgent },
    addEventListener: (tipo, fn) => { ascoltatori[tipo] = fn; },
    registration: { showNotification: async (titolo, opzioni) => { mostrate.push({ titolo, opzioni }); } },
    clients: { matchAll: async () => finestre, openWindow: async (u) => { aperte.push(u); }, claim: async () => {} },
    skipWaiting: () => {},
  };
  const contesto = {
    self, console, URL, MessageChannel, setTimeout, clearTimeout, Promise,
    caches: { open: async () => ({ add: async () => {}, put: async () => {}, match: async () => null }), keys: async () => [], delete: async () => true, match: async () => null },
    fetch: async () => { throw new Error('rete finta'); }, Request: function () {}, Response: function () {},
  };
  contesto.importScripts = (u) => vm.runInContext(fs.readFileSync(path.join(__dirname, u.split('?')[0]), 'utf8'), contesto);
  vm.createContext(contesto);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'sw.js'), 'utf8'), contesto);
  return { ascoltatori, mostrate, aperte, self };
}
function finestra({ visibile = true, risponde = true } = {}) {
  const f = {
    url: 'http://localhost:4321/app.html', visibilityState: visibile ? 'visible' : 'hidden',
    messaggi: [], navigata: null, focus: async () => {}, navigate: async (u) => { f.navigata = u; },
    postMessage: (m, porte) => { f.messaggi.push(m); if (risponde && porte && porte[0]) porte[0].postMessage({ ok: true }); },
  };
  return f;
}
async function push(sw, payload) {
  const attese = [];
  sw.ascoltatori.push({ data: { json: () => payload }, waitUntil: (p) => attese.push(p) });
  await Promise.all(attese);
}
async function tocca(sw, data, action = '') {
  const attese = [];
  sw.ascoltatori.notificationclick({ action, notification: { data, close: () => {} }, waitUntil: (p) => attese.push(p) });
  await Promise.all(attese);
}
const invito = { tipo: 'invito', invito: ID, nome: 'Aurora', locale: 'it' };

(async () => {
  let f = finestra();
  let sw = caricaSW({ userAgent: UA_CHROME, finestre: [f] });
  await push(sw, invito);
  check(sw.mostrate.length === 0 && f.messaggi.length === 1 && f.messaggi[0].invito === ID, 'Chrome, app in primo piano: niente notifica, l\'app riceve l\'invito', { m: sw.mostrate, f: f.messaggi });

  f = finestra();
  sw = caricaSW({ userAgent: UA_IPHONE, finestre: [f] });
  await push(sw, invito);
  check(sw.mostrate.length === 1, 'iPhone, app in primo piano: la notifica si mostra lo stesso (Safari conta le push silenziose)', sw.mostrate.length);

  f = finestra({ visibile: false });
  sw = caricaSW({ userAgent: UA_CHROME, finestre: [f] });
  await push(sw, invito);
  const o = sw.mostrate[0] && sw.mostrate[0].opzioni;
  check(!!o && o.tag === 'invito-' + ID && o.actions.length === 1 && o.data.url === 'app.html?invito=' + ID && o.data.invito === ID,
    'app in secondo piano: notifica con tag, azione «blocca» e destinazione', o);

  f = finestra();
  sw = caricaSW({ userAgent: UA_CHROME, finestre: [f] });
  await push(sw, { tipo: 'start', rituale: 'Luna', ritualeId: 4, locale: 'it' });
  check(sw.mostrate.length === 1 && sw.mostrate[0].titolo === 'Luna sta iniziando ora', 'i rituali non cambiano: si mostrano anche con l\'app aperta', sw.mostrate);

  f = finestra();
  sw = caricaSW({ userAgent: UA_CHROME, finestre: [f] });
  await tocca(sw, { url: 'app.html?invito=' + ID, tipo: 'invito', invito: ID });
  check(f.messaggi.length === 1 && f.messaggi[0].tipo === 'apri-invito' && f.navigata === null, 'tocco con l\'app aperta che risponde: invito per messaggio, nessuna ricarica', f);

  f = finestra({ risponde: false });
  sw = caricaSW({ userAgent: UA_CHROME, finestre: [f] });
  const t0 = Date.now();
  await tocca(sw, { url: 'app.html?invito=' + ID, tipo: 'invito', invito: ID });
  check(f.navigata === 'app.html?invito=' + ID && Date.now() - t0 >= 900, 'app aperta che non risponde (vecchia o bloccata): dopo ~1 s ricarica sull\'invito', { navigata: f.navigata, ms: Date.now() - t0 });

  f = finestra({ risponde: false });
  sw = caricaSW({ userAgent: UA_CHROME, finestre: [f] });
  await tocca(sw, { url: 'app.html?invito=' + ID, tipo: 'invito', invito: ID }, 'blocca');
  check(f.navigata === 'app.html?invito=' + ID + '&azione=blocca', 'azione «blocca»: la ricarica porta anche azione=blocca', f.navigata);

  sw = caricaSW({ userAgent: UA_CHROME, finestre: [] });
  await tocca(sw, { url: 'app.html?invito=' + ID, tipo: 'invito', invito: ID });
  check(sw.aperte[0] === 'app.html?invito=' + ID, 'nessuna finestra: se ne apre una sull\'invito', sw.aperte);

  f = finestra();
  sw = caricaSW({ userAgent: UA_CHROME, finestre: [f] });
  await tocca(sw, { url: 'app.html?ritual=4' });
  check(f.messaggi.length === 0 && f.navigata === 'app.html?ritual=4', 'tocco su un rituale: navigate come oggi', f);

  f = finestra({ visibile: false });
  sw = caricaSW({ userAgent: UA_CHROME, finestre: [f] });
  delete sw.self.PushHelpers;
  await push(sw, invito);
  check(sw.mostrate.length === 1 && sw.mostrate[0].titolo === 'Global Awakening' && !/rituale/i.test(sw.mostrate[0].opzioni.body),
    'senza PushHelpers, per un invito il ripiego è neutro (non parla di rituali)', sw.mostrate);

  console.log(`\n${passati} passati, ${falliti} falliti`);
})();
```

- [ ] **Step 2: vederlo fallire** — Run: `NODE_OPTIONS="--require ./scripts/test-silenzioso.js" node test-sw-inviti.js`. Atteso: rossi il 1°, il 3° (niente `actions`), il 5°, il 6°, il 7° e il 10°.

- [ ] **Step 3: `sw.js`**

1. In testa, `importScripts('push-helpers.js');` diventa:
```js
// ?v=12: importScripts passa dalla cache HTTP del browser (fino a max-age=600), non dal gestore
// fetch. Con un indirizzo nuovo i telefoni prendono i testi nuovi insieme al service worker nuovo.
importScripts('push-helpers.js?v=12');
```
2. Sotto il commento della v11 aggiungere la riga
```js
// v12: inviti a un training anche a chi non è collegato (2026-10). Testi e gestori nuovi delle
// push d'invito: senza il bump le app installate terrebbero quelli vecchi.
```
e `const CACHE = 'ga-pwa-v11';` diventa `const CACHE = 'ga-pwa-v12';`; in `PRECACHE`, `'push-helpers.js'` diventa `'push-helpers.js?v=12'`.
3. Sostituire per intero il gestore `push` e il gestore `notificationclick` con:

```js
// Tipi d'invito: scritti anche qui, perché il ripiego deve riconoscerli pure senza PushHelpers.
const TIPI_INVITO = ['invito', 'accettato', 'rifiutato', 'scaduto'];

// Il payload arriva cifrato dalla Edge Function; il browser lo decifra e ce lo consegna qui.
// `userVisibleOnly: true`, dichiarato al momento dell'iscrizione, ci obbliga a mostrare SEMPRE
// una notifica: se questo handler non ne mostrasse nessuna, il browser ne mostrerebbe una
// generica di sistema al posto nostro e, a forza di quelle, ci toglierebbe il permesso.
// Per questo costruisciNotifica ha un ripiego per ogni campo e non solleva mai.
// Unica eccezione voluta: un invito con l'app in primo piano su Chromium (vedi sotto).
self.addEventListener('push', (e) => {
  e.waitUntil((async () => {
    let payload = {};
    try { payload = e.data ? e.data.json() : {}; } catch (_) { payload = {}; }
    const eInvito = !!payload && TIPI_INVITO.includes(payload.tipo);

    // Invito con l'app in primo piano: niente notifica, la finestra aggiorna subito banner o
    // attesa. Solo dove il browser lo tollera (Chromium fuori da iOS, PushHelpers.puoTacere):
    // Safari conta le push senza notifica e può togliere il permesso, e lì la notifica si
    // mostra sempre (lo stesso tag evita i doppioni). I rituali non passano di qui.
    if (eInvito) {
      try {
        if (self.PushHelpers && self.PushHelpers.puoTacere(self.navigator && self.navigator.userAgent)) {
          const finestre = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
          const visibile = finestre.find((f) => f.visibilityState === 'visible' && f.url.includes('app.html'));
          if (visibile) {
            visibile.postMessage({ tipo: payload.tipo, invito: payload.invito });
            return;
          }
        }
      } catch (_) { /* nel dubbio la notifica si mostra */ }
    }

    // Ripiego assoluto. costruisciNotifica non solleva su payload storti, ma self.PushHelpers
    // puo' essere undefined se importScripts non e' andato a buon fine. Per un invito il ripiego
    // e' neutro: un testo di rituale sarebbe falso.
    let n;
    try {
      n = self.PushHelpers.costruisciNotifica(payload);
    } catch (_) {
      const it = payload && payload.locale === 'it';
      n = eInvito
        ? { titolo: 'Global Awakening', corpo: it ? "Apri l'app" : 'Open the app', tag: 'invito-ripiego', url: 'app.html', azioni: [] }
        : { titolo: 'Global Awakening', corpo: it ? 'Un rituale sta iniziando.' : 'A ritual is starting.', tag: 'rituale-ripiego', url: 'app.html', azioni: [] };
    }

    try {
      await self.registration.showNotification(n.titolo, {
        body: n.corpo,
        tag: n.tag,
        icon: 'icons/icon-192.png',
        badge: 'icons/icon-192.png',
        actions: n.azioni || [],
        data: { url: n.url, tipo: payload && payload.tipo, invito: payload && payload.invito }
      });
    } catch (_) {
      // Anche showNotification puo' rigettare (opzioni non supportate su qualche browser).
      // Meglio una notifica scarna che nessuna notifica.
      await self.registration.showNotification('Global Awakening', { body: n.corpo });
    }
  })());
});

// Chiede alla finestra di aprire l'invito e aspetta la conferma. Un'app vecchia (senza il
// gestore) o una pagina bloccata non risponde: dopo attesaMs si ripiega sulla ricarica.
function chiediAllaFinestra(finestra, messaggio, attesaMs) {
  return new Promise((risolvi) => {
    const canale = new MessageChannel();
    let timer = null;
    const fine = (esito) => { clearTimeout(timer); try { canale.port1.close(); } catch (_) {} risolvi(esito); };
    timer = setTimeout(() => fine(false), attesaMs);
    // addEventListener + start() invece di onmessage: funziona uguale nei browser e in Node
    // (test-sw-inviti.js usa il MessageChannel di Node).
    canale.port1.addEventListener('message', (ev) => fine(!!(ev.data && ev.data.ok)));
    canale.port1.start();
    try { finestra.postMessage(messaggio, [canale.port2]); } catch (_) { fine(false); }
  });
}

// Toccando la notifica: se una finestra dell'app e' gia' aperta la si mette a fuoco invece di
// aprirne una seconda (cinque rituali, cinque copie dell'app). Per un invito le si passa l'invito
// per messaggio, senza ricaricarla (una ricarica interromperebbe un training in corso); i
// rituali restano con navigate().
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const dati = e.notification.data || {};
  const base = dati.url || 'app.html';
  const eInvito = TIPI_INVITO.includes(dati.tipo) && typeof dati.invito === 'string';
  const azione = e.action === 'blocca' ? 'blocca' : null;
  const destinazione = azione && self.PushHelpers ? self.PushHelpers.urlAzione(base, azione) : base;

  e.waitUntil((async () => {
    const finestre = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const f of finestre) {
      if (f.url.includes('app.html')) {
        await f.focus();
        if (eInvito && await chiediAllaFinestra(f, { tipo: 'apri-invito', invito: dati.invito, azione }, 1000)) return;
        // navigate() non e' disponibile ovunque: se manca, la finestra resta dov'e' ma
        // almeno e' in primo piano, che e' meglio di una seconda copia dell'app.
        if ('navigate' in f) { try { await f.navigate(destinazione); } catch (_) {} }
        return;
      }
    }
    await self.clients.openWindow(destinazione);
  })());
});
```

4. In `test-pwa.js`, il controllo alla riga 176 diventa:
```js
  if (/importScripts\('push-helpers\.js(\?v=\d+)?'\)/.test(swTesto)) pass('sw.js carica push-helpers.js');
```
(e il controllo del `PRECACHE` alla riga 182 resta com'è: `'push-helpers.js?v=12'` contiene `push-helpers.js`).

- [ ] **Step 4: vederlo passare**

```bash
NODE_OPTIONS="--require ./scripts/test-silenzioso.js" node test-sw-inviti.js
NODE_OPTIONS="--require ./scripts/test-silenzioso.js" node test-push-helpers.js | tail -n 1
```
Atteso: `10 passati, 0 falliti`; `test-push-helpers.js` invariato dal Task 15. Con il server locale acceso: `NODE_OPTIONS="--require ./scripts/test-silenzioso.js" node test-pwa.js` → gli stessi numeri della baseline.

- [ ] **Step 5: commit** — `git add sw.js test-pwa.js test-sw-inviti.js`, `feat(pwa): service worker v12 per le push d'invito` (+ `Co-Authored-By`).

**Fatto quando:** `test-sw-inviti.js` → `10 passati, 0 falliti`; `test-pwa.js` come la baseline; `grep -c "ga-pwa-v12" sw.js` → `1`.

### Task 17: la logica pura dell'app (`inviti-helpers.js`)

**Obiettivo:** tutto ciò che l'app decide sugli inviti senza toccare la rete — testi e messaggi dei motivi, ora del server, conti alla rovescia, lettura di `?invito=`, cosa fare aprendo un invito, il ripiego della tenuta, l'attesa di 3 minuti — sta in un file provato in Node, caricato dalla pagina prima di `app.js`.

**Files:**
- Create: `inviti-helpers.js`
- Create: `test-inviti-helpers.js`
- Modify: `app.html` (script prima di `app.js`)
- Modify: `sw.js` (`inviti-helpers.js` nel `PRECACHE` e fra i file «freschi»)

**Interfaces:**
- Produces (`window.InvitiHelpers` e `module.exports`):
  - `testo(chiave: string, lingua: 'it'|'en', valori?: {nome?, tempo?}) → string` (chiave sconosciuta → testo di `errore`)
  - `scarto(adessoServerIso: string, adessoLocaleMs: number) → number` (ms, server − telefono)
  - `secondiRimasti(scadenzaIso: string, scartoMs: number, adessoLocaleMs: number) → number` (≥ 0)
  - `mmss(secondi: number) → string` (`'m:ss'`)
  - `leggiInvitoDaUrl(search: string) → {invito: string|null, azione: 'blocca'|null, presente: boolean}`
  - `esitoApertura(risposta: /* get_telepathy_invite */ object, azione: 'blocca'|null) → {tipo: 'rispondi'|'conferma_blocco'|'entra'|'attesa'|'messaggio', motivo?, nome?, matchId?}`
  - `motivoDaStato(status: string) → string`
  - `matchDiRipiego(matches: object[], mioSid: string, invitoCreatoIl: string) → object|null`
  - `attesaFinita(respondedAtIso: string, scartoMs: number, adessoLocaleMs: number, limiteMs = 180000) → boolean`
  - `percentuale(prove: number|null, indovinate: number|null) → string|null`

- [ ] **Step 1: il test prima**

```js
/**
 * La logica pura degli inviti dentro l'app (inviti-helpers.js).
 * NODE_OPTIONS="--require ./scripts/test-silenzioso.js" node test-inviti-helpers.js
 */
const H = require('./inviti-helpers.js');
let passati = 0, falliti = 0;
const uguale = (n, a, b) => { if (a === b) { console.log('✅ ' + n); passati++; } else { console.error(`❌ ${n} — atteso ${JSON.stringify(b)}, ottenuto ${JSON.stringify(a)}`); falliti++; } };
const ID = '3f0c2b1e-8a4d-4c6e-9b7a-1d2e3f4a5b6c';
const adessoTel = Date.now();
const serverIndietro = adessoTel - 5 * 60000;                 // telefono avanti di 5 minuti
const iso = (ms) => new Date(ms).toISOString();

// Orologio (Review Focus 1)
const s = H.scarto(iso(serverIndietro), adessoTel);
uguale('scarto: telefono avanti di 5 minuti', Math.round(s / 1000), -300);
uguale('conto alla rovescia giusto anche col telefono avanti', H.secondiRimasti(iso(serverIndietro + 45000), s, adessoTel), 45);
uguale('dopo la scadenza: 0, mai negativo', H.secondiRimasti(iso(serverIndietro - 1000), s, adessoTel), 0);
uguale('mmss', `${H.mmss(600)}|${H.mmss(45)}|${H.mmss(0)}`, '10:00|0:45|0:00');

// ?invito=
let u = H.leggiInvitoDaUrl(`?invito=${ID.toUpperCase()}&azione=blocca`);
uguale('?invito= con azione=blocca', `${u.invito}|${u.azione}|${u.presente}`, `${ID}|blocca|true`);
u = H.leggiInvitoDaUrl(`?invito=${ID}&azione=cancella-tutto`);
uguale('azione sconosciuta: ignorata', u.azione, null);
u = H.leggiInvitoDaUrl('?invito=<script>');
uguale('id storto: niente invito, ma il parametro va tolto dall\'indirizzo', `${u.invito}|${u.presente}`, 'null|true');
uguale('nessun parametro', H.leggiInvitoDaUrl('').presente, false);

// Aprire un invito (Review Focus 4 per il primo caso)
const risp = (x) => ({ ok: true, adesso: iso(adessoTel), invito: { id: ID, nome: 'Aurora', match_id: null, match_attivo: false, ...x } });
uguale('invito non mio o identità persa: non trovato', H.esitoApertura({ ok: false, motivo: 'non_trovato' }, null).motivo, 'non_trovato');
uguale('destinatario, aperto: rispondi', H.esitoApertura(risp({ ruolo: 'destinatario', status: 'pending' }), null).tipo, 'rispondi');
uguale('destinatario con azione=blocca: conferma, anche se scaduto', H.esitoApertura(risp({ ruolo: 'destinatario', status: 'expired' }), 'blocca').tipo, 'conferma_blocco');
uguale('destinatario, scaduto', H.esitoApertura(risp({ ruolo: 'destinatario', status: 'expired' }), null).motivo, 'scaduto');
uguale('destinatario, già accettato (altro telefono)', H.esitoApertura(risp({ ruolo: 'destinatario', status: 'accepted' }), null).motivo, 'gia_accettato');
uguale('mittente, ancora aperto: attesa', H.esitoApertura(risp({ ruolo: 'mittente', status: 'pending' }), null).tipo, 'attesa');
const entra = H.esitoApertura(risp({ ruolo: 'mittente', status: 'accepted', match_id: ID, match_attivo: true }), null);
uguale('mittente, accettato con match vivo: entra', `${entra.tipo}|${entra.matchId}`, `entra|${ID}`);
uguale('mittente, accettato ma match sparito', H.esitoApertura(risp({ ruolo: 'mittente', status: 'accepted', match_id: ID }), null).motivo, 'non_ce_piu');
uguale('mittente, rifiutato', H.esitoApertura(risp({ ruolo: 'mittente', status: 'declined' }), null).motivo, 'rifiutato');
uguale('mittente, annullato', H.esitoApertura(risp({ ruolo: 'mittente', status: 'cancelled' }), null).motivo, 'annullato');

// Ripiego della tenuta (accettato da un'app vecchia, senza match_id)
const creato = iso(adessoTel - 30000);
const matches = [
  { id: 'vecchio', user1_id: 'io', user2_id: 'x', created_at: iso(adessoTel - 60000) },
  { id: 'finito', user1_id: 'io', user2_id: 'y', created_at: iso(adessoTel - 10000), ended_at: iso(adessoTel) },
  { id: 'altrui', user1_id: 'z', user2_id: 'io', created_at: iso(adessoTel - 5000) },
  { id: 'giusto', user1_id: 'io', user2_id: 'w', created_at: iso(adessoTel - 20000) },
];
uguale('ripiego: il match attivo in cui sono user1, creato dopo l\'invito', (H.matchDiRipiego(matches, 'io', creato) || {}).id, 'giusto');
uguale('ripiego: niente se non c\'è', H.matchDiRipiego(matches.slice(0, 3), 'io', creato), null);

// Attesa di chi ha accettato: 3 minuti dall'ora del server
uguale('attesa: 179 s (telefono avanti di 5 minuti) non è finita', H.attesaFinita(iso(serverIndietro - 179000), s, adessoTel), false);
uguale('attesa: 181 s è finita', H.attesaFinita(iso(serverIndietro - 181000), s, adessoTel), true);

// Testi
uguale('messaggio con il nome', H.testo('rifiutato', 'it', { nome: 'Bruno' }), 'Bruno non può ora');
uguale('chiave sconosciuta: il messaggio d\'errore', H.testo('boh', 'it'), H.testo('errore', 'it'));
uguale('la frase accanto all\'interruttore', H.testo('nota_nome', 'it'), 'Il tuo nome sarà visibile a tutti quelli che usano l\'app.');
uguale('inglese', H.testo('interruttore', 'en'), 'Receive invites even when you are not connected');

// Percentuale della scheda
uguale('percentuale', H.percentuale(40, 12), '30%');
uguale('percentuale senza prove: niente', `${H.percentuale(0, 0)}|${H.percentuale(null, null)}`, 'null|null');

console.log(`\n${passati} passati, ${falliti} falliti`);
process.exit(falliti === 0 ? 0 : 1);
```

- [ ] **Step 2: vederlo fallire** — Atteso: `Cannot find module './inviti-helpers.js'`.

- [ ] **Step 3: `inviti-helpers.js`**

```js
/**
 * inviti-helpers.js — la logica degli inviti a un training telepatico che l'app usa senza
 * toccare la rete. Vive fuori da app.jsx per lo stesso motivo di push-helpers.js e
 * music-helpers.js: dentro l'app non si prova senza un database e due telefoni; qui si prova in
 * node (test-inviti-helpers.js). Stile ES5, nessuna dipendenza, nessun passaggio di build.
 *
 * Una regola attraversa tutto il file: i tempi si contano dall'ora del SERVER (campo `adesso`
 * delle RPC), non dall'orologio del telefono, che può essere avanti o indietro di minuti.
 */
(function (globale) {
  'use strict';

  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  var TESTI = {
    it: {
      invito_in_corso: 'Hai già un invito in corso',
      gia_invitato: 'È già stato invitato, riprova fra poco',
      troppi_inviti: 'Hai mandato troppi inviti, riprova più tardi',
      non_disponibile: 'Non è più disponibile',
      in_match: 'Sei già in un training',
      dati_non_validi: 'Qualcosa non torna: riprova',
      non_trovato: 'Invito non trovato su questo dispositivo',
      scaduto: "L'invito è scaduto",
      rifiutato: '{nome} non può ora',
      annullato: "L'invito è stato ritirato",
      gia_accettato: "L'invito è già stato accettato",
      non_ce_piu: "L'altra persona non c'è più",
      match_non_valido: 'Non è stato possibile avviare il training: riprova',
      nessun_abbonamento: 'Le notifiche di questo telefono non sono più attive: riaccendi per ricevere inviti',
      permesso_negato: "Senza il permesso per le notifiche non puoi ricevere inviti quando l'app è chiusa",
      push_saltata: "Non gli arriverà una notifica ora: lo vedrà se apre l'app entro la scadenza",
      errore: 'Connessione non riuscita: riprova',
      interruttore: 'Ricevi inviti anche quando non sei collegata/o',
      nota_nome: "Il tuo nome sarà visibile a tutti quelli che usano l'app.",
      disponibili: 'Disponibili su invito',
      invita: 'Invita a un training',
      blocca: 'Non voglio più inviti da questa persona',
      conferma_blocco: 'Non riceverai più inviti da {nome}, e non potrai invitarla/o. Confermi?',
      bloccato_ok: 'Non riceverai più inviti da {nome}',
      conferma: 'Conferma', annulla: 'Annulla', chiudi: 'Chiudi', rifiuta: 'Rifiuta',
      invito_a: 'Invito a {nome}: {tempo}',
      scade_fra: 'scade fra {tempo}',
      scaduto_breve: 'scaduto',
      attesa_invitante: 'In attesa che {nome} entri… ({tempo})',
      non_arrivato: '{nome} non è arrivato: torni alla lobby',
      invito_durante_training: '{nome} ti ha invitato: sei già in un training',
      prove: 'Prove', indovinate: 'Indovinate',
      qualcuno: 'Qualcuno'
    },
    en: {
      invito_in_corso: 'You already have an invite in progress',
      gia_invitato: 'Already invited by someone else, try again shortly',
      troppi_inviti: 'You sent too many invites, try again later',
      non_disponibile: 'No longer available',
      in_match: 'You are already in a training',
      dati_non_validi: 'Something is off: try again',
      non_trovato: 'Invite not found on this device',
      scaduto: 'The invite has expired',
      rifiutato: "{nome} can't right now",
      annullato: 'The invite was withdrawn',
      gia_accettato: 'The invite has already been accepted',
      non_ce_piu: 'The other person is no longer there',
      match_non_valido: 'The training could not start: try again',
      nessun_abbonamento: 'Notifications on this phone are no longer active: switch on again to receive invites',
      permesso_negato: 'Without notification permission you cannot receive invites while the app is closed',
      push_saltata: 'They will not get a notification now: they will see it if they open the app before it expires',
      errore: 'Connection failed: try again',
      interruttore: 'Receive invites even when you are not connected',
      nota_nome: 'Your name will be visible to everyone using the app.',
      disponibili: 'Available on invite',
      invita: 'Invite to a training',
      blocca: 'No more invites from this person',
      conferma_blocco: 'You will no longer receive invites from {nome}, and you will not be able to invite them. Confirm?',
      bloccato_ok: 'You will no longer receive invites from {nome}',
      conferma: 'Confirm', annulla: 'Cancel', chiudi: 'Close', rifiuta: 'Decline',
      invito_a: 'Invite to {nome}: {tempo}',
      scade_fra: 'expires in {tempo}',
      scaduto_breve: 'expired',
      attesa_invitante: 'Waiting for {nome} to join… ({tempo})',
      non_arrivato: '{nome} did not arrive: back to the lobby',
      invito_durante_training: '{nome} invited you: you are already in a training',
      prove: 'Trials', indovinate: 'Hits',
      qualcuno: 'Someone'
    }
  };

  function testo(chiave, lingua, valori) {
    var t = TESTI[lingua] ? TESTI[lingua] : TESTI.en;
    var s = Object.prototype.hasOwnProperty.call(t, chiave) ? t[chiave] : t.errore;
    var v = valori || {};
    return s.replace('{nome}', typeof v.nome === 'string' && v.nome.length > 0 ? v.nome : t.qualcuno)
            .replace('{tempo}', typeof v.tempo === 'string' ? v.tempo : '');
  }

  function scarto(adessoServerIso, adessoLocaleMs) {
    var s = Date.parse(adessoServerIso);
    return isNaN(s) ? 0 : s - adessoLocaleMs;
  }

  function secondiRimasti(scadenzaIso, scartoMs, adessoLocaleMs) {
    var t = Date.parse(scadenzaIso);
    if (isNaN(t)) return 0;
    return Math.max(0, Math.ceil((t - (adessoLocaleMs + (scartoMs || 0))) / 1000));
  }

  function mmss(secondi) {
    var s = Math.max(0, Math.floor(secondi || 0));
    var r = s % 60;
    return Math.floor(s / 60) + ':' + (r < 10 ? '0' : '') + r;
  }

  function leggiInvitoDaUrl(search) {
    var p = new URLSearchParams(search || '');
    var id = p.get('invito');
    return {
      invito: id && UUID.test(id) ? id.toLowerCase() : null,
      azione: p.get('azione') === 'blocca' ? 'blocca' : null,
      presente: p.has('invito')
    };
  }

  function motivoDaStato(status) {
    if (status === 'accepted') return 'gia_accettato';
    if (status === 'declined') return 'rifiutato';
    if (status === 'cancelled') return 'annullato';
    return 'scaduto';
  }

  // Cosa fare arrivando da una notifica (o da ?invito=): la risposta è quella di
  // get_telepathy_invite. Mai una schermata vuota: ogni caso ha il suo messaggio.
  function esitoApertura(r, azione) {
    if (!r || r.ok !== true || !r.invito) return { tipo: 'messaggio', motivo: 'non_trovato' };
    var i = r.invito;
    if (i.ruolo === 'destinatario') {
      if (azione === 'blocca') return { tipo: 'conferma_blocco', nome: i.nome };
      if (i.status === 'pending') return { tipo: 'rispondi', nome: i.nome };
      return { tipo: 'messaggio', motivo: motivoDaStato(i.status), nome: i.nome };
    }
    if (i.status === 'pending') return { tipo: 'attesa', nome: i.nome };
    if (i.status === 'accepted') {
      return i.match_id && i.match_attivo ? { tipo: 'entra', matchId: i.match_id, nome: i.nome }
                                          : { tipo: 'messaggio', motivo: 'non_ce_piu', nome: i.nome };
    }
    return { tipo: 'messaggio', motivo: motivoDaStato(i.status), nome: i.nome };
  }

  // Solo fra la 32a e la 32b: un'app vecchia accetta senza match_id, creando il match con
  // user1_id = chi ha invitato. Si entra nel match attivo in cui sono user1, nato dopo l'invito.
  function matchDiRipiego(matches, mioSid, invitoCreatoIl) {
    var t0 = Date.parse(invitoCreatoIl);
    if (isNaN(t0) || !matches || !matches.length) return null;
    var buoni = matches.filter(function (m) {
      return m && m.user1_id === mioSid && !m.ended_at && Date.parse(m.created_at) >= t0;
    });
    buoni.sort(function (a, b) { return Date.parse(a.created_at) - Date.parse(b.created_at); });
    return buoni[0] || null;
  }

  function attesaFinita(respondedAtIso, scartoMs, adessoLocaleMs, limiteMs) {
    var t = Date.parse(respondedAtIso);
    if (isNaN(t)) return true;
    return (adessoLocaleMs + (scartoMs || 0)) - t >= (limiteMs || 180000);
  }

  function percentuale(prove, indovinate) {
    if (typeof prove !== 'number' || prove <= 0 || typeof indovinate !== 'number') return null;
    return Math.round((100 * indovinate) / prove) + '%';
  }

  var api = { testo: testo, scarto: scarto, secondiRimasti: secondiRimasti, mmss: mmss,
              leggiInvitoDaUrl: leggiInvitoDaUrl, esitoApertura: esitoApertura, motivoDaStato: motivoDaStato,
              matchDiRipiego: matchDiRipiego, attesaFinita: attesaFinita, percentuale: percentuale };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else globale.InvitiHelpers = api;
})(typeof window !== 'undefined' ? window : this);
```

- [ ] **Step 4: caricarlo nella pagina e nella cache**

In `app.html`, subito prima di `<script src="app.js"></script>`:
```html
    <!-- Prima di app.js: definisce InvitiHelpers (inviti a un training, spec 2026-09-25). -->
    <script src="inviti-helpers.js"></script>
```
In `sw.js`: aggiungere `'inviti-helpers.js'` a `PRECACHE` (dopo `'music-helpers.js'`) e, nella condizione `isFresh`, `|| url.pathname.endsWith('/inviti-helpers.js')` accanto a `music-helpers.js` (è codice dell'app quanto `app.js`: in cache-first una correzione non arriverebbe mai).

- [ ] **Step 5: vederlo passare**

```bash
NODE_OPTIONS="--require ./scripts/test-silenzioso.js" node test-inviti-helpers.js
NODE_OPTIONS="--require ./scripts/test-silenzioso.js" node test-sw-inviti.js | tail -n 1
```
Atteso: `28 passati, 0 falliti`; `10 passati, 0 falliti`.

- [ ] **Step 6: commit** — `git add inviti-helpers.js test-inviti-helpers.js app.html sw.js`, `feat(inviti): logica pura dell'app per gli inviti` (+ `Co-Authored-By`).

**Fatto quando:** `test-inviti-helpers.js` → `28 passati, 0 falliti`; `app.html` carica `inviti-helpers.js` prima di `app.js`; il file è in `PRECACHE` e fra i «freschi».


### Come sono fatti i Task 18–23 (l'app)

`src/app.jsx` è un file solo, di ~6000 righe. Nei task i punti d'inserimento sono indicati **con il testo che c'è oggi** (i numeri di riga sono quelli di `main` al 30/09 e servono solo a orientarsi). Dopo ogni task: `node build.js`, poi i test UI dello scenario del task. Il file di test `test-inviti-offline-ui.js` nasce al Task 18; ogni task aggiunge i suoi `scenario(...)` **prima della riga `// ── esecuzione ──`** e si lancia con il nome dello scenario:

```bash
NODE_OPTIONS="--require ./scripts/test-silenzioso.js" node test-inviti-offline-ui.js <scenario>
```

Negli attributi per i test si usa `data-test="…"`, come nel resto dell'app.

### Task 18: le fondamenta nell'app e l'invio

**Obiettivo:** l'app chiama le RPC con le credenziali giuste da qualunque intervallo; l'invio passa da `send_telepathy_invite` anche per chi è online; «Annulla» passa da `cancel_telepathy_invite`; chiudere l'app non ritira più l'invito, uscire dalla telepatia sì; «Gioca ancora» chiude il match prima di reinvitare; i motivi del server diventano messaggi chiari; chi invita vede un conto alla rovescia dall'ora del server.

**Files:**
- Modify: `src/app.jsx`, `app.js` (build)
- Create: `test-inviti-offline-ui.js`

**Interfaces:**
- Consumes: `InvitiHelpers` (Task 17); RPC `send_telepathy_invite`, `cancel_telepathy_invite` (Task 10–11); `end_telepathy_match` (14_).
- Produces (nel componente, usati dai task seguenti): stati `invitoInUscita` (forma di `in_uscita`), `scartoOrologio` (ms), `adessoLocale` (ms, ticchetta ogni secondo), `avvisoInviti` (string), `attesaInvitante` (`{invitoId, respondedAt, nome}`), `giroInviti` (contatore); ref `passwordHashRef`, `invitoInUscitaRef`, `attesaInvitanteRef`; `IH` (= `InvitiHelpers` o `null`); `testoInviti(chiave, valori?) → string`; `rpcInviti(fn, extra?) → Promise<data | {ok:false, motivo:'errore'}>`; `sendDirectInvite(target)` con `target` = `{id: session_id, nickname}` (lista Online) oppure `{disponibilita_id, nickname}` (lista «Disponibili su invito»). Attributi: `data-test="conto-invito"`, `"annulla-invito"`, `"riga-online"`, `"avviso-inviti"`.

- [ ] **Step 1: il test UI prima — scheletro e scenario `invio_online`**

```js
/**
 * Inviti a un training anche a chi non è collegato — nel browser, con più persone.
 * NODE_OPTIONS="--require ./scripts/test-silenzioso.js" node test-inviti-offline-ui.js [scenario ...]
 *
 * Prerequisiti: 32a applicata, notify-telepathy-invite pubblicata, server `npx serve -l 4321 .`
 * (verificare «Accepting connections at http://localhost:4321»), SUPABASE_SERVICE_KEY in .env.test.
 *
 * ⚠️ Gira sul database e sulla Edge Function VERI. Per la durata del test le disponibilità di
 * prova sono visibili a utenti veri in «Disponibili su invito»: nickname con prefisso GAInv_,
 * interruttori accesi solo dove serve, pulizia nel finally. Lanciarlo in un orario tranquillo.
 * I tempi del server non si aspettano: si spostano con la chiave di servizio (expires_at,
 * responded_at, created_at delle righe di prova).
 * Le push vanno a indirizzi finti (stub di PushManager, come test-push-ui.js): il servizio push li
 * rifiuta e esito.mjs può cancellarli, che è il comportamento previsto.
 */
const { chromium } = require('playwright');
const { getServiceKey, purge, loginAsGuest } = require('./test-helpers');

const APP_URL = 'http://localhost:4321/app.html';
const SUPABASE_URL = 'https://vxzxdkcluyrcftsnxxza.supabase.co';
const KEY = getServiceKey();
const TS = Date.now();
const nick = (x) => `GAInv_${x}_${TS}`;

let passati = 0, falliti = 0;
const ok = (m) => { console.log('  ✅ ' + m); passati++; };
const ko = (m, x) => { console.log('  ❌ ' + m + (x !== undefined ? ' — ' + JSON.stringify(x) : '')); falliti++; process.exitCode = 1; };
const check = (c, m, x) => (c ? ok(m) : ko(m, x));
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
async function attendi(fn, ms = 15000) {
  const fine = Date.now() + ms;
  while (Date.now() < fine) { const v = await fn(); if (v) return v; await pausa(500); }
  return null;
}

// Stub delle push, come test-push-ui.js: Chromium di test non ha un servizio push vero.
const STUB = `
  window.__permesso = 'default';
  if (typeof Notification !== 'undefined') {
    Object.defineProperty(Notification, 'permission', { get: () => window.__permesso, configurable: true });
    Notification.requestPermission = async () => { window.__permesso = window.__rispostaPermesso || 'granted'; return window.__permesso; };
  }
  if (typeof PushManager !== 'undefined') {
    window.__subFinta = null;
    PushManager.prototype.getSubscription = async function () { return window.__subFinta; };
    PushManager.prototype.subscribe = async function () {
      const endpoint = 'https://fcm.googleapis.com/fcm/send/gainv_' + Date.now() + '_' + Math.random().toString(36).slice(2);
      window.__subFinta = { endpoint, toJSON: () => ({ endpoint, keys: { p256dh: 'p256dh_finta', auth: 'auth_finta' } }),
                            unsubscribe: async () => { window.__subFinta = null; return true; } };
      return window.__subFinta;
    };
  }
`;

async function servizio(percorso, opts = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${percorso}`, { ...opts,
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(opts.headers || {}) } });
  const t = await r.text();
  try { return JSON.parse(t); } catch (_) { return t; }
}
const q = (s) => encodeURIComponent(s);
const leggi = async (tabella, filtro) => { const r = await servizio(`${tabella}?${filtro}`); return Array.isArray(r) ? r : []; };
const sposta = (tabella, filtro, campi) => servizio(`${tabella}?${filtro}`, { method: 'PATCH', body: JSON.stringify(campi) });
const faSecondi = (s) => new Date(Date.now() - s * 1000).toISOString();

const tutte = [];   // per la pulizia finale
let attive = [];    // contesti da chiudere a fine scenario
async function entra(browser, etichetta, { permesso = 'granted' } = {}) {
  const ctx = await browser.newContext();
  await ctx.grantPermissions(['notifications'], { origin: 'http://localhost:4321' });
  await ctx.addInitScript(`window.__rispostaPermesso = ${JSON.stringify(permesso)};` + STUB);
  const page = await ctx.newPage();
  const p = { ctx, page, nick: nick(etichetta) };
  await loginAsGuest(page, p.nick);
  p.sid = await page.evaluate(() => localStorage.getItem('ga_session_id'));
  tutte.push(p); attive.push(p);
  return p;
}
async function aTelepatia(p, page = p.page) {
  await page.locator('button').filter({ hasText: /Telepatia|Telepathy/ }).first().click();
  await page.waitForSelector('text=Telepathy Training', { timeout: 20000 });
}
const rigaOnline = (p, di) => p.page.locator('[data-test="riga-online"]').filter({ hasText: di.nick });
const pendingDa = async (p) => (await leggi('telepathy_invites', `from_id=eq.${q(p.sid)}&status=eq.pending&select=*`))[0] || null;

async function pulizia() {
  const sids = tutte.map((p) => p.sid).filter(Boolean);
  if (sids.length === 0) return;
  const inS = q(`(${sids.map((s) => `"${s}"`).join(',')})`);
  const inN = q(`(${tutte.map((p) => `"${p.nick}"`).join(',')})`);
  await purge(SUPABASE_URL, [
    `telepathy_invites?from_id=in.${inS}`, `telepathy_invites?to_id=in.${inS}`,
    `telepathy_matches?user1_id=in.${inS}`, `telepathy_matches?user2_id=in.${inS}`,
    `telepathy_availability?session_id=in.${inS}`,
    `telepathy_invite_blocks?blocker_session=in.${inS}`, `telepathy_invite_blocks?blocked_session=in.${inS}`,
    `push_subscriptions?session_id=in.${inS}`, `online_users?id=in.${inS}`, `telepathy_queue?id=in.${inS}`,
    `notifications?user_nickname=in.${inN}`,
  ], { label: 'inviti-ui' });
}

const scenari = [];
const scenario = (nome, fn) => scenari.push([nome, fn]);

// ════ Task 18: invio ═══════════════════════════════════════════════════════
scenario('invio_online', async (browser) => {
  const A = await entra(browser, 'A');
  const B = await entra(browser, 'B');
  const C = await entra(browser, 'C');
  await aTelepatia(A); await aTelepatia(C);
  await rigaOnline(A, B).waitFor({ timeout: 20000 });
  await rigaOnline(A, B).locator('button').click();
  const conto = A.page.locator('[data-test="conto-invito"]');
  await conto.waitFor({ timeout: 10000 });
  check(/0:(4\d|3\d)/.test(await conto.innerText()), 'chi invita vede il conto alla rovescia da 45 s', await conto.innerText());
  const inv = await attendi(() => pendingDa(A));
  check(!!inv && inv.con_push === false && inv.from_name === A.nick && inv.to_id === B.sid && inv.via_diretta === false,
    'l\'invito passa dalla RPC: nomi dal server, niente push (B non ha l\'interruttore)', inv);
  await B.page.locator('.invite-toast').waitFor({ timeout: 15000 });
  ok('B vede l\'invito');
  await rigaOnline(C, B).waitFor({ timeout: 20000 });
  await rigaOnline(C, B).locator('button').click();
  await C.page.locator('[data-test="avviso-inviti"]').filter({ hasText: /già stato invitato|Already invited/ }).waitFor({ timeout: 10000 });
  ok('un secondo mittente legge «È già stato invitato, riprova fra poco»');
  await A.page.locator('[data-test="annulla-invito"]').click();
  await B.page.locator('.invite-toast').waitFor({ state: 'detached', timeout: 15000 });
  const annullato = (await leggi('telepathy_invites', `id=eq.${inv.id}&select=status`))[0];
  check(!!annullato && annullato.status === 'cancelled', '«Annulla» passa dalla RPC: cancelled', annullato);
  await rigaOnline(A, B).locator('button').click();
  const secondo = await attendi(() => pendingDa(A));
  await A.page.close();
  await pausa(2000);
  const dopo = (await leggi('telepathy_invites', `id=eq.${secondo.id}&select=status`))[0];
  check(!!dopo && dopo.status === 'pending', 'chiudere l\'app non ritira più l\'invito', dopo);
});

// ── esecuzione ──
(async () => {
  if (!KEY) { console.log('⛔ serve SUPABASE_SERVICE_KEY in .env.test (spostare i tempi e ripulire): non parto.'); process.exit(2); }
  const scelti = process.argv.slice(2);
  const browser = await chromium.launch({ headless: false });
  try {
    for (const [nome, fn] of scenari) {
      if (scelti.length && !scelti.includes(nome)) continue;
      console.log(`\n— ${nome} —`);
      try { await fn(browser); } catch (e) { ko(`${nome}: eccezione`, e.message); }
      for (const p of attive) await p.ctx.close().catch(() => {});
      attive = [];
    }
  } finally {
    await pulizia();
    await browser.close();
  }
  console.log(`\n${passati} passati, ${falliti} falliti`);
})();
```

- [ ] **Step 2: vederlo fallire** — server acceso, `node build.js` non serve ancora. Run: `… node test-inviti-offline-ui.js invio_online`. Atteso: ❌ al primo controllo (manca `data-test="riga-online"` / `conto-invito`) o `eccezione: Timeout`.

- [ ] **Step 3: gli stati** — subito dopo la riga `const [directInviteTarget, setDirectInviteTarget] = useState(null); // utente a cui abbiamo inviato invito` (r. 907):

```js
          // Inviti a un training anche a chi non è collegato (spec 2026-09-25 §4.4). Lo stato vero
          // lo decide il server: qui c'è solo l'ultima risposta delle RPC.
          const [invitoInUscita, setInvitoInUscita] = useState(null);   // in_uscita di get_my_telepathy_invites
          const [scartoOrologio, setScartoOrologio] = useState(0);      // ora del server − ora del telefono, in ms
          const [adessoLocale, setAdessoLocale] = useState(Date.now()); // ticchettio dei conti alla rovescia
          const [avvisoInviti, setAvvisoInviti] = useState(null);       // messaggio da mostrare (motivi delle RPC)
          const [attesaInvitante, setAttesaInvitante] = useState(null); // { invitoId, respondedAt, nome } per chi ha accettato
          const [giroInviti, setGiroInviti] = useState(0);              // +1 = rileggi subito (push arrivata in primo piano)
```

- [ ] **Step 4: credenziali e chiamata alle RPC** — subito dopo `React.useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);` (r. 1347):

```js
          // Le RPC degli inviti si chiamano anche da intervalli (presenze, attese) nati in un
          // render vecchio: le credenziali si leggono dai ref, non dalla chiusura.
          const passwordHashRef = React.useRef(null);
          const invitoInUscitaRef = React.useRef(null);
          const attesaInvitanteRef = React.useRef(null);
          React.useEffect(() => { passwordHashRef.current = passwordHash; }, [passwordHash]);
          React.useEffect(() => { invitoInUscitaRef.current = invitoInUscita; }, [invitoInUscita]);
          React.useEffect(() => { attesaInvitanteRef.current = attesaInvitante; }, [attesaInvitante]);
          const IH = typeof InvitiHelpers !== 'undefined' ? InvitiHelpers : null;
          const testoInviti = (chiave, valori) => (IH ? IH.testo(chiave, lang === 'it' ? 'it' : 'en', valori) : String(chiave));
          const rpcInviti = async (fn, extra) => {
            const { data, error } = await supabase.rpc(fn, {
              p_session_id: sessionIdRef.current || sessionId,
              p_password_hash: passwordHashRef.current || null,
              ...(extra || {})
            });
            // Il client fatto a mano non solleva: un errore (rete, Auth failed) torna qui.
            if (error) return { ok: false, motivo: 'errore' };
            return data;
          };
          // I conti alla rovescia ticchettano solo quando c'è qualcosa da contare.
          React.useEffect(() => {
            if (!invitoInUscita && !attesaInvitante) return;
            const t = setInterval(() => setAdessoLocale(Date.now()), 1000);
            return () => clearInterval(t);
          }, [invitoInUscita, attesaInvitante]);
          React.useEffect(() => {
            if (!avvisoInviti) return;
            const t = setTimeout(() => setAvvisoInviti(null), 6000);
            return () => clearTimeout(t);
          }, [avvisoInviti]);
```

- [ ] **Step 5: chiudere l'app non ritira l'invito** — in `handleUnload` (r. 1360) togliere **solo** la riga

```js
                  fetch(`${SUPABASE_URL}/rest/v1/telepathy_invites?from_id=eq.${sid}`, opts);
```
e al suo posto il commento `// L'invito in uscita NON si cancella: chiudere l'app non lo ritira più (spec §4.4). Si ritira con «Annulla» o uscendo dalla telepatia.`

- [ ] **Step 6: `resetTelepathy`** — la riga `supabase.from('telepathy_invites').delete().eq('from_id', sessionId);` (r. 2454) diventa:

```js
              // Uscire volontariamente dalla telepatia ritira l'invito in uscita; chiudere l'app no.
              const uscita = invitoInUscitaRef.current;
              if (uscita && uscita.status === 'pending') rpcInviti('cancel_telepathy_invite', { p_invite_id: uscita.id });
```
e, accanto a `setDirectInviteTarget(null);` nella stessa funzione, aggiungere `setInvitoInUscita(null);` e `setAttesaInvitante(null);`.

- [ ] **Step 7: invio, annullo, «Gioca ancora»** — sostituire per intero `sendDirectInvite`, `cancelDirectInvite` (r. 2516–2556) e `playAgainSamePartner` (r. 2635–2649):

```js
          // Una sola strada per ogni invito, anche verso chi è online: send_telepathy_invite
          // controlla identità, blocchi nei due sensi, tetti e disponibilità, scrive l'invito e la
          // notifica della campanella, e chiede la push. target: { id, nickname } dalla lista
          // Online oppure { disponibilita_id, nickname } dalla lista «Disponibili su invito».
          const sendDirectInvite = async (targetUser) => {
            if (directInviteTarget || invitoInUscitaRef.current) return;
            setDirectInviteTarget(targetUser);
            const r = await rpcInviti('send_telepathy_invite', {
              p_nickname: nickname || 'Anonymous',
              p_disponibilita_id: targetUser.disponibilita_id || null,
              p_session_online: targetUser.disponibilita_id ? null : targetUser.id
            });
            if (!r || !r.ok) {
              setDirectInviteTarget(null);
              setAvvisoInviti(testoInviti((r && r.motivo) || 'errore', { nome: targetUser.nickname }));
              return;
            }
            if (IH) setScartoOrologio(IH.scarto(r.adesso, Date.now()));
            setInvitoInUscita({ id: r.id, nome: targetUser.nickname, status: 'pending', expires_at: r.expires_at,
                                created_at: r.created_at, push_saltata: r.push_saltata, match_id: null, responded_at: null });
            if (r.push_saltata) setAvvisoInviti(testoInviti('push_saltata'));
          };

          // «Annulla»: libera il pulsante e ritira l'invito sul server.
          const cancelDirectInvite = async () => {
            const uscita = invitoInUscitaRef.current;
            setDirectInviteTarget(null);
            setInvitoInUscita(null);
            if (uscita) await rpcInviti('cancel_telepathy_invite', { p_invite_id: uscita.id });
          };

          const playAgainSamePartner = async () => {
            const savedPartner = partner;
            if (!savedPartner) return;
            // Stessa soglia del server (30 s): non si promette un invito che verrebbe rifiutato.
            const { data: presence } = await supabase.from('online_users').select('id,last_seen').eq('id', savedPartner.id);
            const stillOnline = presence && presence.length > 0 &&
              (Date.now() - new Date(presence[0].last_seen).getTime() < 30000);
            if (!stillOnline) {
              alert(`${savedPartner.nickname} ${t.telepathy.partnerOffline}`);
              return;
            }
            // Prima si chiude il match appena finito, ASPETTANDO la risposta: la cancellazione di
            // resetTelepathy parte senza attesa, e un match giocato da meno di 10 minuti senza
            // ended_at farebbe rispondere al server in_match / non_disponibile.
            if (matchId) {
              try { await supabase.rpc('end_telepathy_match', { p_match_id: matchId, p_ended_by: sessionId }); } catch (_) {}
            }
            resetTelepathy();
            await sendDirectInvite({ id: savedPartner.id, nickname: savedPartner.nickname });
          };
```

- [ ] **Step 8: la lista Online e il conto alla rovescia** — nel blocco `{/* Lista utenti online */}` (r. 4589–4623):
  - al `<div key={u.id} …>` di ogni riga aggiungere `data-test="riga-online"`;
  - la condizione del pulsante «Proponi» `{u.status === 'available' && directInviteTarget?.id !== u.id && (` diventa `{u.status === 'available' && !invitoInUscita && !directInviteTarget && (`;
  - togliere il blocco `{directInviteTarget?.id === u.id && ( … inviteSent … cancel … )}`;
  - **sopra** `{/* Lista utenti online */}` inserire il riquadro dell'invito in uscita, che vale per entrambe le liste:

```jsx
                        {invitoInUscita && (
                          <div className="bg-glass-dark rounded-xl p-4" style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem'}}>
                            {/* «Invito inviato...» resta: test-telepathy.js lo cerca dopo «Proponi». */}
                            <span data-test="conto-invito" className="text-white text-sm">
                              {t.telepathy.inviteSent} {testoInviti('invito_a', { nome: invitoInUscita.nome, tempo: (() => {
                                const s = IH ? IH.secondiRimasti(invitoInUscita.expires_at, scartoOrologio, adessoLocale) : 0;
                                return s > 0 ? testoInviti('scade_fra', { tempo: IH.mmss(s) }) : testoInviti('scaduto_breve');
                              })() })}
                            </span>
                            <button data-test="annulla-invito" onClick={cancelDirectInvite} className="text-secondary text-xs"
                              style={{textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', padding: 0}}>
                              {t.telepathy.cancel}
                            </button>
                          </div>
                        )}
```

- [ ] **Step 9: il messaggio** — accanto al blocco `{infoToast && ( … )}` (r. 5582):

```jsx
              {avvisoInviti && (
                <div data-test="avviso-inviti" role="status" style={{
                  position: 'fixed', bottom: '4.5rem', left: '50%', transform: 'translateX(-50%)',
                  width: 'min(360px, calc(100vw - 2rem))', background: 'rgba(30,27,75,0.96)',
                  border: '1px solid rgba(167,139,250,0.5)', borderRadius: '0.85rem', padding: '0.85rem 1rem', zIndex: 9999
                }}>
                  <p className="text-white" style={{fontSize: '0.9rem', margin: 0, textAlign: 'center'}}>{avvisoInviti}</p>
                </div>
              )}
```

- [ ] **Step 10: build e test**

```bash
node build.js
NODE_OPTIONS="--require ./scripts/test-silenzioso.js" node test-inviti-offline-ui.js invio_online
```
Atteso: `6 passati, 0 falliti`. (L'attesa di chi invita non è ancora collegata al server: se B accettasse, A non entrerebbe — è il Task 19.)

- [ ] **Step 11: commit** — `git add src/app.jsx app.js test-inviti-offline-ui.js`, `feat(inviti): l'invio passa dal server, chiudere l'app non ritira l'invito` (+ `Co-Authored-By`).

**Fatto quando:** scenario `invio_online` → `6 passati, 0 falliti`; `grep -c "from('telepathy_invites')" src/app.jsx` diminuito di 4 rispetto a `main` (spariscono i `delete`/`insert` di `sendDirectInvite` e `cancelDirectInvite` e la cancellazione in `resetTelepathy`).

### Task 19: l'attesa di chi invita e il rientro nel match

**Obiettivo:** chi invita segue il suo invito via `get_my_telepathy_invites` ogni 2 s; quando è accettato entra **solo** nel `match_id` scritto lì, con id e nome del partner presi dal match, e il suo arrivo conta come attività; a `expires_at` il pulsante si libera senza timer locali; riaprendo l'app entro 3 minuti da un'accettazione rientra da solo; durante la tenuta segue il ripiego «accettato senza `match_id`».

**Files:**
- Modify: `src/app.jsx`, `app.js`, `test-inviti-offline-ui.js`

**Interfaces:**
- Consumes: `rpcInviti`, `invitoInUscita`, `IH.matchDiRipiego`, `IH.attesaFinita` (Task 17–18); RPC `get_my_telepathy_invites`.
- Produces: `entraNelMatchDaInvito(matchId: string, match?: object) → Promise<boolean>`; `data-test="partner-nome"` sul nome del partner nella schermata del training.

- [ ] **Step 1: il test prima**

```js
// ════ Task 19: attesa di chi invita ════════════════════════════════════════
scenario('attesa_di_chi_invita', async (browser) => {
  const A = await entra(browser, 'A2');
  const B = await entra(browser, 'B2');
  await aTelepatia(A);
  await rigaOnline(A, B).waitFor({ timeout: 20000 });
  await rigaOnline(A, B).locator('button').click();
  const inv = await attendi(() => pendingDa(A));
  await sposta('telepathy_invites', `id=eq.${inv.id}`, { expires_at: faSecondi(1) });
  await A.page.locator('[data-test="conto-invito"]').waitFor({ state: 'detached', timeout: 10000 });
  ok('a expires_at (ora del server) l\'invito si chiude e il pulsante torna, senza timer locale');
  await rigaOnline(A, B).locator('button').click();
  await B.page.locator('.invite-toast [data-test="btn-accetta"]').click({ timeout: 15000 });
  await A.page.locator('[data-test="partner-nome"]').filter({ hasText: B.nick }).waitFor({ timeout: 15000 });
  ok('B accetta: A entra nel match, col nome del partner preso dal match');
  const m = (await leggi('telepathy_matches', `user1_id=eq.${q(A.sid)}&select=user2_id,da_invito,giocato`))[0];
  check(!!m && m.user2_id === B.sid && m.da_invito === true && m.giocato === true,
    'è il match dell\'invito, e l\'arrivo di A conta come attività (giocato)', m);
});

scenario('rientro_all_avvio', async (browser) => {
  const A = await entra(browser, 'A3');
  const B = await entra(browser, 'B3');
  await aTelepatia(A);
  await rigaOnline(A, B).waitFor({ timeout: 20000 });
  await rigaOnline(A, B).locator('button').click();
  const inv = await attendi(() => pendingDa(A));
  await A.page.close();
  await servizio(`online_users?id=eq.${q(A.sid)}`, { method: 'DELETE' });   // A risulta offline
  await B.page.locator('.invite-toast [data-test="btn-accetta"]').click({ timeout: 15000 });
  const pA = await A.ctx.newPage();
  // Riapre dalla notifica «accettato» (?invito=<id>): entra nel match_id dell'invito. Senza il parametro
  // lo farebbe lo stesso il rientro all'avvio; con, si prova anche la strada di chi arriva dalla notifica.
  await pA.goto(`${APP_URL}?invito=${inv.id}`);
  await pA.locator('[data-test="partner-nome"]').filter({ hasText: B.nick }).waitFor({ timeout: 25000 });
  ok('A riapre l\'app entro 3 minuti ed entra da sola/o nel match accettato');
});
```

- [ ] **Step 2: vederlo fallire** — `… node test-inviti-offline-ui.js attesa_di_chi_invita rientro_all_avvio`. Atteso: timeout su `partner-nome` (manca l'attributo e l'ingresso dal `match_id`).

- [ ] **Step 3: entrare nel match di un invito** — subito prima della riga `// Poll per match da invito diretto (l'invitante aspetta che l'altro accetti)` (r. 2347):

```js
          // Chi ha invitato entra SOLO nel match dell'invito accettato (spec §4.4): nessuna ricerca
          // di «un match qualunque in cui compaio». Id e nome del partner vengono dal match
          // (user2_*): chi invita non riceve mai il session_id dell'altro dalle RPC.
          const entraNelMatchDaInvito = async (idMatch, gia) => {
            let m = gia;
            if (!m) {
              const { data } = await supabase.from('telepathy_matches').select('*').eq('id', idMatch);
              m = data && data[0];
            }
            if (!m || m.ended_at) {
              setDirectInviteTarget(null);
              setInvitoInUscita(null);
              setAvvisoInviti(testoInviti('non_ce_piu'));
              return false;
            }
            // L'arrivo è un update del match: per il trigger della 32a vale come attività.
            await supabase.from('telepathy_matches').update({ round_count: m.round_count || 0 }).eq('id', m.id);
            const amUser1 = m.user1_id === sessionId;
            setPartner({ id: amUser1 ? m.user2_id : m.user1_id, nickname: amUser1 ? m.user2_nickname : m.user1_nickname });
            setRole(amUser1 ? m.user1_role : m.user2_role);
            setMatchId(m.id);
            setSessionEnded(false);
            setPartnerDisconnected(false);
            setDirectInviteTarget(null);
            setInvitoInUscita(null);
            setActiveTab('telepathy');
            return true;
          };
```

- [ ] **Step 4: l'attesa** — sostituire per intero l'effetto `// Poll per match da invito diretto …` (r. 2347–2376) con:

```js
          // L'invitante segue il suo invito dal server ogni 2 s. Il conto alla rovescia viene da
          // expires_at (45 s o 10 minuti): niente timer locale, resta giusto dopo una riapertura.
          useEffect(() => {
            if (!invitoInUscita || partner) return;
            let fermo = false;
            const giro = async () => {
              const r = await rpcInviti('get_my_telepathy_invites', {});
              if (fermo || !r || !r.ok) return;
              if (IH) setScartoOrologio(IH.scarto(r.adesso, Date.now()));
              const u = r.in_uscita;
              if (!u || u.id !== invitoInUscita.id) return;
              if (u.status === 'pending') { setInvitoInUscita(u); return; }
              if (u.status === 'accepted') {
                if (u.match_id) { await entraNelMatchDaInvito(u.match_id); return; }
                // TENUTA (fra la 32a e la 32b; si toglie con la 32b): un'app vecchia accetta senza
                // match_id e crea il match con user1_id = chi ha invitato. Funziona solo con
                // quest'app aperta: senza match_id non parte nessuna push «accettato».
                const { data: miei } = await supabase.from('telepathy_matches').select('*').eq('user1_id', sessionId);
                const m = IH ? IH.matchDiRipiego(miei, sessionId, u.created_at) : null;
                if (m) await entraNelMatchDaInvito(m.id, m);
                return;
              }
              setDirectInviteTarget(null);
              setInvitoInUscita(null);
              setAvvisoInviti(testoInviti(IH ? IH.motivoDaStato(u.status) : 'scaduto', { nome: u.nome }));
            };
            giro();
            const intervallo = setInterval(giro, 2000);
            return () => { fermo = true; clearInterval(intervallo); };
          }, [invitoInUscita && invitoInUscita.id, partner, sessionId, giroInviti]);

          // Rientro all'avvio: se il mio invito è stato accettato da meno di 3 minuti (ora del
          // server) con un match ancora vivo, ci entro; se è ancora aperto, riprendo l'attesa.
          const rientroFattoRef = React.useRef(false);
          useEffect(() => {
            if (!nickname || !sessionId || partner || rientroFattoRef.current) return;
            rientroFattoRef.current = true;
            (async () => {
              const r = await rpcInviti('get_my_telepathy_invites', {});
              if (!r || !r.ok || !r.in_uscita || !IH) return;
              const scarto = IH.scarto(r.adesso, Date.now());
              setScartoOrologio(scarto);
              const u = r.in_uscita;
              if (u.status === 'pending') { setInvitoInUscita(u); setDirectInviteTarget({ id: null, nickname: u.nome }); return; }
              if (u.status === 'accepted' && u.match_id && !IH.attesaFinita(u.responded_at, scarto, Date.now())) {
                await entraNelMatchDaInvito(u.match_id);
              }
            })();
          }, [nickname, sessionId]);
```

- [ ] **Step 5: il nome del partner** — alla riga `<p className="text-white font-bold">{partner?.nickname}</p>` (r. 4712) aggiungere `data-test="partner-nome"`.

- [ ] **Step 6: build e test**

```bash
node build.js
NODE_OPTIONS="--require ./scripts/test-silenzioso.js" node test-inviti-offline-ui.js invio_online attesa_di_chi_invita rientro_all_avvio
```
Atteso: `10 passati, 0 falliti`.

- [ ] **Step 7: commit** — `feat(inviti): chi invita entra solo nel match dell'invito, e rientra all'avvio` (+ `Co-Authored-By`).

**Fatto quando:** i tre scenari → `10 passati, 0 falliti`; nell'app non c'è più nessuna `select('*')` di tutta `telepathy_matches` dentro l'attesa dell'invitante.

### Task 20: chi riceve — lettura, campanella, risposta, attesa di chi ha invitato

**Obiettivo:** l'invito in arrivo si legge solo da `get_my_telepathy_invites` (loop delle presenze, campanella, push in primo piano); accettare crea il match `da_invito` e poi chiama `respond_telepathy_invite` (se il server rifiuta, il match si cancella e l'app dice perché); rifiutare passa dalla RPC; chi ha accettato aspetta chi ha invitato fino a 3 minuti dall'ora del server senza essere buttato fuori dai controlli dei 35 s e dei 90 s; durante un training un invito mostra solo «Rifiuta».

**Files:**
- Modify: `src/app.jsx`, `app.js`, `test-inviti-offline-ui.js`

**Interfaces:**
- Consumes: `rpcInviti`, `attesaInvitante`, `attesaInvitanteRef`, `giroInviti` (Task 18); RPC `get_my_telepathy_invites`, `respond_telepathy_invite`, `get_telepathy_invite`.
- Produces: `aggiornaInviti() → Promise<risposta di get_my_telepathy_invites | null>` (aggiorna `incomingInvite` = `{from_id, from_name, invite_id, expires_at}`); attributi `data-test="btn-accetta"`, `"btn-rifiuta"`, `"attesa-invitante"`, `"invito-durante-training"`.

- [ ] **Step 1: il test prima**

```js
// ════ Task 20: chi riceve ══════════════════════════════════════════════════
scenario('attesa_di_chi_accetta', async (browser) => {
  const A = await entra(browser, 'A4');
  const B = await entra(browser, 'B4');
  await aTelepatia(A);
  await rigaOnline(A, B).waitFor({ timeout: 20000 });
  await rigaOnline(A, B).locator('button').click();
  const inv = await attendi(() => pendingDa(A));
  await A.page.close();
  await servizio(`online_users?id=eq.${q(A.sid)}`, { method: 'DELETE' });
  await B.page.locator('.invite-toast [data-test="btn-accetta"]').click({ timeout: 15000 });
  await B.page.locator('[data-test="attesa-invitante"]').waitFor({ timeout: 10000 });
  ok('chi accetta vede «In attesa che … entri»');
  await pausa(95000);   // oltre i 35 s di checkPartnerLeft e i 90 s del timeout A3
  check(await B.page.locator('[data-test="attesa-invitante"]').isVisible(), 'dopo 95 s è ancora in attesa (spenti i controlli dei 35 s e dei 90 s)');
  await sposta('telepathy_invites', `id=eq.${inv.id}`, { responded_at: faSecondi(181) });
  await B.page.locator('[data-test="avviso-inviti"]').filter({ hasText: A.nick }).waitFor({ timeout: 10000 });
  const m = (await leggi('telepathy_matches', `user2_id=eq.${q(B.sid)}&select=ended_at`))[0];
  check(!m || !!m.ended_at, 'a 3 minuti dall\'accettazione (ora del server) il match si chiude e si torna alla lobby', m);
});

scenario('rifiuto_e_due_schede', async (browser) => {
  const A = await entra(browser, 'A5');
  const B = await entra(browser, 'B5');
  const B2 = await B.ctx.newPage();   // la stessa persona su una seconda scheda
  await B2.goto(APP_URL);
  await aTelepatia(A);
  await rigaOnline(A, B).waitFor({ timeout: 20000 });
  await rigaOnline(A, B).locator('button').click();
  await B.page.locator('.invite-toast').waitFor({ timeout: 15000 });
  await B2.locator('.invite-toast').waitFor({ timeout: 15000 });
  await B.page.locator('.invite-toast [data-test="btn-accetta"]').click();
  await B2.locator('.invite-toast [data-test="btn-accetta"]').click({ timeout: 5000 }).catch(() => {});
  const secondo = await attendi(async () => (await B2.locator('[data-test="avviso-inviti"]').count()) > 0
    || (await B2.locator('.invite-toast').count()) === 0, 10000);
  check(!!secondo, 'la seconda scheda non entra in un secondo training: messaggio o banner sparito', null);
  const aperti = await leggi('telepathy_matches', `user2_id=eq.${q(B.sid)}&ended_at=is.null&select=id`);
  check(aperti.length === 1, 'resta un match solo (quello della seconda scheda si cancella)', aperti);
  await B.page.locator('[data-test="partner-nome"]').waitFor({ timeout: 10000 }).catch(() => {});
  const C = await entra(browser, 'C5');
  await aTelepatia(C);
  const D = await entra(browser, 'D5');
  await rigaOnline(C, D).waitFor({ timeout: 20000 });
  await rigaOnline(C, D).locator('button').click();
  await D.page.locator('.invite-toast [data-test="btn-rifiuta"]').click({ timeout: 15000 });
  await C.page.locator('[data-test="avviso-inviti"]').filter({ hasText: /non può ora|can't right now/ }).waitFor({ timeout: 10000 });
  ok('D rifiuta: C legge «… non può ora»');
});

scenario('campanella_e_training', async (browser) => {
  const A = await entra(browser, 'A6');
  const B = await entra(browser, 'B6');
  await aTelepatia(A);
  await rigaOnline(A, B).waitFor({ timeout: 20000 });
  await rigaOnline(A, B).locator('button').click();
  const inv = await attendi(() => pendingDa(A));
  await sposta('telepathy_invites', `id=eq.${inv.id}`, { expires_at: faSecondi(1) });
  await B.page.locator('.invite-toast').waitFor({ state: 'detached', timeout: 15000 });
  ok('scaduto sul server, il banner di chi riceve sparisce (niente più soglia dei 120 s)');
  // Un invito mentre si gioca: lo scrive il test col ruolo di servizio (il server, giustamente,
  // rifiuta di invitare chi è in un training).
  const C = await entra(browser, 'C6');
  await aTelepatia(C);
  await rigaOnline(C, B).waitFor({ timeout: 20000 });
  await rigaOnline(C, B).locator('button').click();
  await B.page.locator('.invite-toast [data-test="btn-accetta"]').click({ timeout: 15000 });
  await B.page.locator('[data-test="partner-nome"]').waitFor({ timeout: 15000 });
  await servizio('telepathy_invites', { method: 'POST', body: JSON.stringify({
    from_id: A.sid, from_name: A.nick, to_id: B.sid, to_name: B.nick, status: 'pending',
    expires_at: new Date(Date.now() + 600000).toISOString() }) });
  await B.page.locator('[data-test="invito-durante-training"]').waitFor({ timeout: 15000 });
  check(await B.page.locator('[data-test="invito-durante-training"] [data-test="btn-accetta"]').count() === 0,
    'durante un training l\'invito mostra solo «Rifiuta»');
  check(await B.page.locator('[data-test="partner-nome"]').isVisible(), 'e il training continua');
});
```

- [ ] **Step 2: vederlo fallire** — `… node test-inviti-offline-ui.js attesa_di_chi_accetta rifiuto_e_due_schede campanella_e_training`. Atteso: timeout su `btn-accetta` / `attesa-invitante`.

- [ ] **Step 3: la lettura dell'invito in arrivo** — subito dopo il blocco di `rpcInviti` (Task 18, Step 4):

```js
          // L'invito in arrivo lo dice solo il server (ce n'è al massimo uno): loop delle presenze,
          // campanella e push arrivate in primo piano passano tutti da qui.
          const aggiornaInviti = async () => {
            const r = await rpcInviti('get_my_telepathy_invites', {});
            if (!r || !r.ok) return null;
            if (IH) setScartoOrologio(IH.scarto(r.adesso, Date.now()));
            const a = r.in_arrivo;
            // I blocchi li filtra già il server; isBlocked copre la lista locale appena cambiata.
            setIncomingInvite(a && !isBlocked(a.nome)
              ? { from_id: a.from_id, from_name: a.nome, invite_id: a.id, expires_at: a.expires_at } : null);
            return r;
          };
          React.useEffect(() => { if (giroInviti) aggiornaInviti(); }, [giroInviti]);
```

- [ ] **Step 4: il loop delle presenze** — sostituire le righe dal commento `// Controlla inviti in arrivo` fino alla fine della pulizia `// Pulizia inviti vecchi (> 2 minuti)` (r. 1469–1484) con:

```js
                  // Invito in arrivo: dal server (niente più SELECT diretta né pulizia dei 2 minuti:
                  // la scadenza la decide expires_at).
                  await aggiornaInviti();
```

- [ ] **Step 5: la campanella**
  - In `markOneNotifRead` (r. 2914–2917) il blocco `const isExpiredInvite = … 120000); if (isExpiredInvite) return;` diventa:
```js
            // Una notifica d'invito è «viva» solo se il server ha un invito aperto per me:
            // altrimenti toccarla la chiude soltanto (spec §4.4, niente più soglia dei 120 s).
            if (notif.type === 'telepathy_invite') {
              const r = await aggiornaInviti();
              if (!r || !r.in_arrivo) return;
            }
```
  - Nello stesso `markOneNotifRead`, nel ramo `else`, togliere per intero il blocco `if (notif.type === 'telepathy_invite') { // Fetch immediato … }` (r. 2941–2949): l'ha già fatto il blocco sopra.
  - Nella lista delle notifiche (r. 4036–4037) `const isExpiredInvite = n.type === 'telepathy_invite' && n.created_at && (Date.now() - new Date(n.created_at).getTime() > 120000);` diventa `const isExpiredInvite = n.type === 'telepathy_invite' && !incomingInvite;`.

- [ ] **Step 6: accettare e rifiutare** — sostituire per intero `acceptInvite` e `declineInvite` (r. 2558–2633):

```js
          const acceptInvite = async () => {
            if (!incomingInvite) return;
            // Durante un training non si accetta (il server risponderebbe in_match): la UI mostra solo «Rifiuta».
            if ((matchId || partner) && !sessionEnded && !partnerDisconnected) return;
            if (matchId || partner) resetTelepathy();
            setSearchingPartner(false);
            const invito = incomingInvite;
            // Residui conclusi della stessa coppia: farebbero fallire l'insert sul vincolo
            // telepathy_matches_pair_unique (409). Solo .eq/.neq/.lt nel client fatto a mano.
            const { data: staleAccept } = await supabase.from('telepathy_matches').select('*');
            for (const m of (staleAccept || [])) {
              const isPair = (m.user1_id === invito.from_id && m.user2_id === sessionId) || (m.user1_id === sessionId && m.user2_id === invito.from_id);
              if (isPair && m.ended_at) await supabase.from('telepathy_matches').delete().eq('id', m.id);
            }
            const myRole = Math.random() > 0.5 ? 'sender' : 'receiver';
            const theirRole = myRole === 'sender' ? 'receiver' : 'sender';
            // Prima il match (come oggi, fuori scope rifarlo), segnato da_invito: così, se l'app si
            // chiude prima della risposta, findPartner riconosce l'orfano e non ci risucchia nessuno.
            const { data: matchData, error: matchError } = await supabase.from('telepathy_matches').insert({
              user1_id: invito.from_id,
              user1_nickname: invito.from_name,
              user1_role: theirRole,
              user2_id: sessionId,
              user2_nickname: nickname || 'Anonymous',
              user2_role: myRole,
              level: 'lvl3', // ogni sessione parte dal livello più facile (3 card)
              round_count: 0,
              da_invito: true
            });
            if (matchError || !matchData || matchData.length === 0) {
              // Di solito: la stessa persona ha appena accettato da un altro telefono o un'altra
              // scheda, e il match della coppia esiste già (vincolo pair_unique). Si chiede al
              // server com'è l'invito, per dire il motivo vero («già accettato»).
              const stato = await rpcInviti('get_telepathy_invite', { p_invite_id: invito.invite_id });
              const motivo = stato && stato.ok && stato.invito && stato.invito.status !== 'pending' && IH
                ? IH.motivoDaStato(stato.invito.status) : 'match_non_valido';
              setIncomingInvite(null);
              setAvvisoInviti(testoInviti(motivo, { nome: invito.from_name }));
              return;
            }
            const nuovo = matchData[0];
            // Poi la risposta: controlla scadenza, coppia, training in corso, e chi ha già risposto.
            const r = await rpcInviti('respond_telepathy_invite', { p_invite_id: invito.invite_id, p_accept: true, p_match_id: nuovo.id });
            if (!r || !r.ok) {
              await supabase.from('telepathy_matches').delete().eq('id', nuovo.id);
              setIncomingInvite(null);
              setAvvisoInviti(testoInviti((r && r.motivo) || 'errore', { nome: invito.from_name }));
              return;
            }
            if (IH && r.adesso) setScartoOrologio(IH.scarto(r.adesso, Date.now()));
            setMatchId(nuovo.id);
            setPartner({ id: invito.from_id, nickname: invito.from_name });
            setRole(myRole);
            setIncomingInvite(null);
            // Chi ha invitato può essere offline: si aspetta fino a 3 minuti da responded_at.
            setAttesaInvitante({ invitoId: invito.invite_id, respondedAt: r.responded_at, nome: invito.from_name });
            setSessionEnded(false);
            setPartnerDisconnected(false);
            setShowResult(false);
            setSelectedSymbol(null);
            setGuessedSymbol(null);
            setPartnerSymbol(null);
            setWaitingForPartner(false);
            setSenderHasSent(false); // A4: la griglia receiver parte bloccata finché il sender non invia
            setRoundCount(0);
            setSessionMatches(0);
            setActiveTab('telepathy');
          };

          // Rifiutare: stato e notifica al mittente li scrive la RPC (e la push, per un invito da 10 minuti).
          const declineInvite = async () => {
            const invito = incomingInvite;
            if (!invito) return;
            setIncomingInvite(null);
            const r = await rpcInviti('respond_telepathy_invite', { p_invite_id: invito.invite_id, p_accept: false, p_match_id: null });
            if (r && r.ok === false && r.motivo !== 'scaduto') setAvvisoInviti(testoInviti(r.motivo, { nome: invito.from_name }));
          };
```

- [ ] **Step 7: l'attesa di chi ha accettato** — subito dopo `declineInvite`:

```js
          // Chi ha accettato aspetta chi ha invitato (spesso offline, arriva dalla notifica) al
          // massimo 3 minuti da responded_at, riletto dal server a ogni giro: una riapertura non
          // riparte da zero e un test può spostarlo. Appena l'altro compare in online_users (30 s)
          // l'attesa finisce e tornano i controlli normali.
          const rispostoIlRef = React.useRef(null);
          useEffect(() => {
            if (!attesaInvitante || !matchId || !partner) return;
            rispostoIlRef.current = attesaInvitante.respondedAt;
            let fermo = false;
            const giro = async () => {
              const { data: pu } = await supabase.from('online_users').select('last_seen').eq('id', partner.id);
              if (fermo) return;
              if (pu && pu.length > 0 && Date.now() - new Date(pu[0].last_seen).getTime() < 30000) { setAttesaInvitante(null); return; }
              const r = await rpcInviti('get_telepathy_invite', { p_invite_id: attesaInvitante.invitoId });
              if (fermo) return;
              const scarto = r && r.adesso && IH ? IH.scarto(r.adesso, Date.now()) : scartoOrologio;
              if (r && r.ok && r.invito && r.invito.responded_at) rispostoIlRef.current = r.invito.responded_at;
              if (IH && IH.attesaFinita(rispostoIlRef.current, scarto, Date.now())) {
                try { await supabase.rpc('end_telepathy_match', { p_match_id: matchId, p_ended_by: sessionId }); } catch (_) {}
                const nome = attesaInvitante.nome;
                resetTelepathy();
                setAvvisoInviti(testoInviti('non_arrivato', { nome }));
              }
            };
            giro();
            const intervallo = setInterval(giro, 2000);
            return () => { fermo = true; clearInterval(intervallo); };
          }, [attesaInvitante && attesaInvitante.invitoId, matchId, partner]);
```

- [ ] **Step 8: spegnere i due controlli durante l'attesa**
  - In `checkPartnerLeft` (r. 2303) `if (partner?.id) {` diventa `if (partner?.id && !attesaInvitanteRef.current) {` (resta attivo il controllo «il match è sparito o ha `ended_at`»).
  - Nel timeout A3 (r. 2506) la condizione `const waitingOnPartner = !!matchId && !sessionEnded && …` diventa `const waitingOnPartner = !!matchId && !attesaInvitante && !sessionEnded && …`, e `attesaInvitante` si aggiunge in fondo all'array delle dipendenze dello stesso effetto.

- [ ] **Step 9: la UI**
  - Nel banner `{incomingInvite && (!partner || sessionEnded) && (` (r. 5596): al pulsante `onClick={acceptInvite}` aggiungere `data-test="btn-accetta"`, a quello `onClick={declineInvite}` `data-test="btn-rifiuta"`.
  - Subito dopo quel blocco:
```jsx
              {incomingInvite && partner && !sessionEnded && !partnerDisconnected && (
                <div data-test="invito-durante-training" className="invite-toast-training" style={{
                  position: 'fixed', top: '1rem', right: '1rem', width: 'min(320px, calc(100vw - 2rem))',
                  background: 'rgba(30,27,75,0.95)', border: '1px solid rgba(167,139,250,0.5)', borderRadius: '0.85rem',
                  padding: '0.75rem 1rem', zIndex: 9999
                }}>
                  <p className="text-white" style={{fontSize: '0.85rem', margin: '0 0 0.5rem 0'}}>
                    {testoInviti('invito_durante_training', { nome: incomingInvite.from_name })}
                  </p>
                  <button data-test="btn-rifiuta" onClick={declineInvite} className="btn-secondary" style={{fontSize: '0.8rem', padding: '0.3rem 0.75rem'}}>
                    {testoInviti('rifiuta')}
                  </button>
                </div>
              )}
              {attesaInvitante && partner && !sessionEnded && (
                <div data-test="attesa-invitante" role="status" style={{
                  position: 'fixed', top: '1rem', left: '50%', transform: 'translateX(-50%)',
                  width: 'min(360px, calc(100vw - 2rem))', background: 'rgba(30,27,75,0.95)',
                  border: '1px solid rgba(167,139,250,0.5)', borderRadius: '0.85rem', padding: '0.75rem 1rem', zIndex: 9998, textAlign: 'center'
                }}>
                  <p className="text-white" style={{fontSize: '0.9rem', margin: 0}}>
                    {testoInviti('attesa_invitante', { nome: attesaInvitante.nome, tempo: IH ? IH.mmss(
                      IH.secondiRimasti(new Date(Date.parse(attesaInvitante.respondedAt) + 180000).toISOString(), scartoOrologio, adessoLocale)) : '' })}
                  </p>
                </div>
              )}
```
  (La classe `invite-toast-training` è diversa da `invite-toast` di proposito: i test contano `.invite-toast` per il banner con «Accetta».)

- [ ] **Step 10: build e test**

```bash
node build.js
NODE_OPTIONS="--require ./scripts/test-silenzioso.js" node test-inviti-offline-ui.js invio_online attesa_di_chi_invita rientro_all_avvio attesa_di_chi_accetta rifiuto_e_due_schede campanella_e_training
```
Atteso: `19 passati, 0 falliti`.

- [ ] **Step 11: commit** — `feat(inviti): chi riceve legge dal server, accetta e aspetta chi ha invitato` (+ `Co-Authored-By`).

**Fatto quando:** i sei scenari → `19 passati, 0 falliti`; `grep -n "from('telepathy_invites')" src/app.jsx` → nessuna riga; `grep -n "120000" src/app.jsx` → non compare più nelle notifiche d'invito.

### Task 21: aprire un invito dalla notifica (`?invito=`) e «Non voglio più inviti»

**Obiettivo:** dalla notifica (o da un link `?invito=<id>`) l'app apre l'invito giusto, anche dopo un'entrata da ospite, e dice sempre quale caso è; il tocco con l'app aperta arriva per messaggio dal service worker, con conferma; «Non voglio più inviti da questa persona» (dal banner, dalla notifica con `azione=blocca`) passa da una conferma e da `block_telepathy_inviter`.

**Files:**
- Modify: `src/app.jsx`, `app.js`, `test-inviti-offline-ui.js`

**Interfaces:**
- Consumes: `IH.leggiInvitoDaUrl`, `IH.esitoApertura` (Task 17); `entraNelMatchDaInvito` (Task 19); `aggiornaInviti` (Task 20); messaggio `apri-invito` del service worker (Task 16).
- Produces: stati `invitoDaAprire` (`{invito, azione}`), `confermaBlocco` (`{nome, p_invite_id? | p_disponibilita_id? | p_session_online?}`); funzione `confermaBloccoInviti()`; attributi `data-test="conferma-blocco"`, `"btn-conferma-blocco"`, `"btn-annulla-blocco"`, `"btn-blocca-da-invito"`.

- [ ] **Step 1: il test prima**

```js
// ════ Task 21: ?invito= e blocco ═══════════════════════════════════════════
scenario('apri_da_notifica', async (browser) => {
  const A = await entra(browser, 'A7');
  const B = await entra(browser, 'B7');
  await aTelepatia(A);
  await rigaOnline(A, B).waitFor({ timeout: 20000 });
  await rigaOnline(A, B).locator('button').click();
  const inv = await attendi(() => pendingDa(A));
  await B.page.goto(`${APP_URL}?invito=${inv.id}`);
  await B.page.locator('.invite-toast [data-test="btn-accetta"]').waitFor({ timeout: 15000 });
  check(!(await B.page.evaluate(() => location.search)).includes('invito'), '?invito= si toglie subito dall\'indirizzo e apre l\'invito');
  // Il tocco con l'app aperta: il service worker manda «apri-invito» e aspetta la conferma.
  const conferma = await B.page.evaluate(async (id) => {
    const canale = new MessageChannel();
    const risposta = new Promise((r) => { canale.port1.onmessage = (e) => r(e.data); setTimeout(() => r(null), 1500); });
    navigator.serviceWorker.dispatchEvent(new MessageEvent('message', { data: { tipo: 'apri-invito', invito: id, azione: 'blocca' }, ports: [canale.port2] }));
    return risposta;
  }, inv.id);
  check(!!conferma && conferma.ok === true, 'l\'app conferma al service worker di aver ricevuto l\'invito', conferma);
  await B.page.locator('[data-test="conferma-blocco"]').waitFor({ timeout: 10000 });
  await B.page.locator('[data-test="btn-conferma-blocco"]').click();
  const blocco = await attendi(async () => (await leggi('telepathy_invite_blocks', `blocker_session=eq.${q(B.sid)}&blocked_session=eq.${q(A.sid)}&select=created_at`))[0]);
  check(!!blocco, 'azione «blocca»: dopo la conferma il blocco è sul server', blocco);
  const st = (await leggi('telepathy_invites', `id=eq.${inv.id}&select=status`))[0];
  check(!!st && st.status === 'declined', 'e l\'invito aperto si chiude come rifiutato', st);
  await B.page.goto(`${APP_URL}?invito=00000000-0000-4000-8000-000000000000`);
  await B.page.locator('[data-test="avviso-inviti"]').filter({ hasText: /non trovato|not found/ }).waitFor({ timeout: 15000 });
  ok('un invito che non è mio (o di un\'identità persa): «Invito non trovato su questo dispositivo»');
});
```

- [ ] **Step 2: vederlo fallire** — `… node test-inviti-offline-ui.js apri_da_notifica`. Atteso: timeout sul banner dopo `?invito=` (l'app ignora il parametro).

- [ ] **Step 3: leggere `?invito=`** — subito dopo lo `useState` di `ritualeDaAprire` (r. 1103–1108):

```js
          // Dalla notifica d'invito si arriva con ?invito=<id>[&azione=blocca] (push-helpers.js).
          // Un solo useState legge insieme i due parametri e POI toglie l'indirizzo: leggerli in
          // due punti farebbe perdere il secondo, già cancellato dal primo. Si tengono finché
          // l'identità non è pronta (può servire un'entrata come ospite).
          const [invitoDaAprire, setInvitoDaAprire] = useState(() => {
            if (typeof InvitiHelpers === 'undefined') return null;
            const letto = InvitiHelpers.leggiInvitoDaUrl(window.location.search);
            if (letto.presente) window.history.replaceState({}, '', window.location.pathname);
            return letto.invito ? { invito: letto.invito, azione: letto.azione } : null;
          });
          const [confermaBlocco, setConfermaBlocco] = useState(null);
```

- [ ] **Step 4: aprire l'invito, il messaggio del service worker, il blocco** — subito dopo l'effetto dell'attesa di chi ha accettato (Task 20, Step 7):

```js
          // Aprire un invito (da ?invito= o dal messaggio del service worker): get_telepathy_invite
          // dice di chi è e in che stato; IH.esitoApertura sceglie cosa mostrare. Mai una
          // schermata vuota.
          useEffect(() => {
            if (!invitoDaAprire || !nickname || !sessionId || !IH) return;
            const { invito, azione } = invitoDaAprire;
            setInvitoDaAprire(null);
            (async () => {
              const r = await rpcInviti('get_telepathy_invite', { p_invite_id: invito });
              if (r && r.adesso) setScartoOrologio(IH.scarto(r.adesso, Date.now()));
              const esito = IH.esitoApertura(r, azione);
              setActiveTab('telepathy');
              if (esito.tipo === 'conferma_blocco') { setConfermaBlocco({ nome: esito.nome, p_invite_id: invito }); return; }
              if (esito.tipo === 'rispondi') {
                // Durante un training il render mostra solo «Rifiuta» (invito-durante-training).
                setIncomingInvite({ from_id: r.invito.from_id, from_name: r.invito.nome, invite_id: r.invito.id, expires_at: r.invito.expires_at });
                return;
              }
              if (esito.tipo === 'entra') { await entraNelMatchDaInvito(esito.matchId); return; }
              if (esito.tipo === 'attesa') {
                setInvitoInUscita(r.invito);
                setDirectInviteTarget({ id: null, nickname: r.invito.nome });
                return;
              }
              setAvvisoInviti(testoInviti(esito.motivo, { nome: esito.nome }));
            })();
          }, [invitoDaAprire, nickname, sessionId]);

          // Il service worker: «apri-invito» al tocco sulla notifica (con conferma sulla porta,
          // altrimenti dopo ~1 s ricarica la pagina), e un avviso quando una push d'invito arriva
          // con l'app in primo piano (non mostrata): si rilegge subito.
          useEffect(() => {
            if (!('serviceWorker' in navigator)) return;
            const ascolta = (ev) => {
              const d = ev.data || {};
              if (d.tipo === 'apri-invito') {
                const letto = IH ? IH.leggiInvitoDaUrl('?invito=' + encodeURIComponent(String(d.invito || ''))) : { invito: null };
                if (letto.invito) setInvitoDaAprire({ invito: letto.invito, azione: d.azione === 'blocca' ? 'blocca' : null });
                if (ev.ports && ev.ports[0]) ev.ports[0].postMessage({ ok: !!letto.invito });
                return;
              }
              if (['invito', 'accettato', 'rifiutato', 'scaduto'].includes(d.tipo)) setGiroInviti((x) => x + 1);
            };
            navigator.serviceWorker.addEventListener('message', ascolta);
            return () => navigator.serviceWorker.removeEventListener('message', ascolta);
          }, []);

          // «Non voglio più inviti da questa persona»: blocco lato server per session_id, nei due
          // sensi, anche per gli ospiti. Il service worker non lo fa mai da sé: passa sempre di qui.
          const confermaBloccoInviti = async () => {
            const c = confermaBlocco;
            if (!c) return;
            setConfermaBlocco(null);
            const { nome, ...chi } = c;
            const r = await rpcInviti('block_telepathy_inviter', { p_invite_id: null, p_disponibilita_id: null, p_session_online: null, ...chi });
            if (!r || !r.ok) { setAvvisoInviti(testoInviti((r && r.motivo) || 'errore')); return; }
            setIncomingInvite(null);
            setAvvisoInviti(testoInviti('bloccato_ok', { nome: r.nome || nome }));
          };
```

- [ ] **Step 5: la UI**
  - Nel banner d'invito (`{incomingInvite && (!partner || sessionEnded) && (`), sotto la riga dei due pulsanti:
```jsx
                  <button data-test="btn-blocca-da-invito"
                    onClick={() => setConfermaBlocco({ nome: incomingInvite.from_name, p_invite_id: incomingInvite.invite_id })}
                    className="text-white text-xs" style={{marginTop: '0.5rem', opacity: 0.85, textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', padding: 0}}>
                    {testoInviti('blocca')}
                  </button>
```
  - Accanto al blocco `{avvisoInviti && ( … )}`:
```jsx
              {confermaBlocco && (
                <div data-test="conferma-blocco" role="dialog" style={{position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 10000,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem'}}>
                  <div className="bg-glass-dark rounded-2xl" style={{maxWidth: '22rem', width: '100%', padding: '1.25rem'}}>
                    <p className="text-white" style={{marginBottom: '1rem'}}>{testoInviti('conferma_blocco', { nome: confermaBlocco.nome })}</p>
                    <div style={{display: 'flex', gap: '0.5rem'}}>
                      <button data-test="btn-conferma-blocco" className="btn-primary" style={{flex: 1}} onClick={confermaBloccoInviti}>{testoInviti('conferma')}</button>
                      <button data-test="btn-annulla-blocco" className="btn-secondary" style={{flex: 1}} onClick={() => setConfermaBlocco(null)}>{testoInviti('annulla')}</button>
                    </div>
                  </div>
                </div>
              )}
```

- [ ] **Step 6: build e test**

```bash
node build.js
NODE_OPTIONS="--require ./scripts/test-silenzioso.js" node test-inviti-offline-ui.js apri_da_notifica
```
Atteso: `5 passati, 0 falliti`.

- [ ] **Step 7: commit** — `feat(inviti): apertura dalla notifica e «Non voglio più inviti»` (+ `Co-Authored-By`).

**Fatto quando:** `apri_da_notifica` → `5 passati, 0 falliti`.


### Task 22: l'interruttore, la lista «Disponibili su invito», la scheda, i cambi d'identità

**Obiettivo:** l'interruttore (in Telepatia e in Impostazioni, stesso stato, con la frase sul nome) chiede il permesso, registra l'abbonamento e accende la disponibilità, e resta spento dicendolo se qualcosa non va; all'apertura il server dice com'è; la lista mostra chi è invitabile e la scheda (anche dalla lista Online) permette di invitare o di dire «Non voglio più inviti»; prima di un cambio d'identità la disponibilità vecchia si spegne.

**Files:**
- Modify: `src/app.jsx`, `app.js`, `test-inviti-offline-ui.js`

**Interfaces:**
- Consumes: `rpcInviti`, `testoInviti`, `sendDirectInvite`, `confermaBlocco`/`confermaBloccoInviti` (Task 18, 21); `pushDisponibile`, `iscriviPush`, `setMostraInstallaPerPush` (esistenti, r. 3122–3170); RPC `set_telepathy_availability`, `renew_telepathy_availability`, `get_invitable_users`, `get_invite_card`.
- Produces: stati `disponibileInviti` (`true|false|null`), `invitabili` (`[{id, nickname}]`), `schedaInvito` (`{chi, dati}`); `renderInterruttoreInviti(dataTest)`; `apriScheda(chi)`; `spegniDisponibilitaDi(sid, hash)`. Attributi: `data-test="interruttore-inviti"`, `"interruttore-inviti-impostazioni"`, `"lista-disponibili"`, `"riga-disponibile"`, `"scheda-invito"`, `"btn-invita"`, `"btn-blocca-scheda"`, `"btn-chiudi-scheda"`.

- [ ] **Step 1: il test prima**

```js
// ════ Task 22: interruttore, lista, scheda ═════════════════════════════════
const interruttore = (p) => p.page.locator('[data-test="interruttore-inviti"]');
const acceso = async (p) => (await interruttore(p).getAttribute('aria-checked')) === 'true';

scenario('interruttore', async (browser) => {
  const N = await entra(browser, 'N8', { permesso: 'denied' });
  await aTelepatia(N);
  await interruttore(N).waitFor({ timeout: 15000 });
  check((await N.page.getByText(/Il tuo nome sarà visibile a tutti quelli che usano l'app\.|Your name will be visible to everyone using the app\./).count()) > 0,
    'accanto all\'interruttore la frase sul nome visibile');
  await interruttore(N).click();
  await N.page.locator('[data-test="avviso-inviti"]').waitFor({ timeout: 10000 });
  check(!(await acceso(N)), 'permesso negato: l\'interruttore resta spento, e lo dice');
  const S = await entra(browser, 'S8');
  await aTelepatia(S);
  await interruttore(S).click();
  await attendi(() => acceso(S), 15000);
  const riga = (await leggi('telepathy_availability', `session_id=eq.${q(S.sid)}&select=nickname`))[0];
  check(!!riga && riga.nickname === S.nick, 'permesso dato: acceso, e la riga è sul server', riga);
  // Spento da «un altro telefono»: alla riapertura vince il server.
  await servizio('rpc/set_telepathy_availability', { method: 'POST', body: JSON.stringify({ p_session_id: S.sid, p_password_hash: null, p_nickname: S.nick, p_enabled: false }) });
  await S.page.reload();
  await aTelepatia(S);
  await interruttore(S).waitFor({ timeout: 15000 });
  await pausa(3000);
  check(!(await acceso(S)), 'spento da un altro telefono: alla riapertura risulta spento');
  await interruttore(S).click();
  await attendi(() => acceso(S), 15000);
  S.page.once('dialog', (d) => d.accept());
  await S.page.locator('button:has-text("Logout"), button:has-text("Esci")').first().click();
  const via = await attendi(async () => (await leggi('telepathy_availability', `session_id=eq.${q(S.sid)}&select=id`)).length === 0, 10000);
  check(!!via, 'logout di un ospite con l\'interruttore acceso: la disponibilità si spegne');
});

scenario('lista_e_scheda', async (browser) => {
  const S = await entra(browser, 'S9');
  await aTelepatia(S);
  await interruttore(S).click();
  await attendi(() => acceso(S), 15000);
  await S.ctx.close();                                                        // S chiude l'app…
  await servizio(`online_users?id=eq.${q(S.sid)}`, { method: 'DELETE' });    // …e non risulta più online
  const A = await entra(browser, 'A9');
  await aTelepatia(A);
  const riga = A.page.locator('[data-test="riga-disponibile"]').filter({ hasText: S.nick });
  await riga.waitFor({ timeout: 25000 });
  ok('chi ha acceso l\'interruttore e non è online compare in «Disponibili su invito»');
  check((await A.page.locator('[data-test="riga-online"]').filter({ hasText: S.nick }).count()) === 0, 'e non compare anche fra gli online');
  await riga.locator('span').first().click();
  await A.page.locator('[data-test="scheda-invito"]').waitFor({ timeout: 10000 });
  check((await A.page.locator('[data-test="scheda-invito"]').innerText()).includes(S.nick), 'la scheda si apre, col nome');
  await A.page.locator('[data-test="btn-invita"]').click();
  const inv = await attendi(() => pendingDa(A));
  const durata = inv ? (Date.parse(inv.expires_at) - Date.parse(inv.created_at)) / 1000 : 0;
  check(!!inv && inv.con_push === true && durata === 600, 'invito da 10 minuti, con push', { con_push: inv && inv.con_push, durata });
  check(/(9|10):\d\d/.test(await A.page.locator('[data-test="conto-invito"]').innerText()), 'e il conto alla rovescia da 10 minuti');
  const B = await entra(browser, 'B9');
  await aTelepatia(B);
  await rigaOnline(B, A).waitFor({ timeout: 20000 });
  await rigaOnline(B, A).locator('span').filter({ hasText: A.nick }).click();
  await B.page.locator('[data-test="scheda-invito"]').waitFor({ timeout: 10000 });
  ok('la stessa scheda si apre dalla lista Online');
  await B.page.locator('[data-test="btn-blocca-scheda"]').click();
  await B.page.locator('[data-test="btn-conferma-blocco"]').click();
  const bl = await attendi(async () => (await leggi('telepathy_invite_blocks', `blocker_session=eq.${q(B.sid)}&blocked_session=eq.${q(A.sid)}&select=created_at`))[0]);
  check(!!bl, 'dalla scheda: «Non voglio più inviti» con il session_id di chi è online', bl);
});
```

- [ ] **Step 2: vederlo fallire** — `… node test-inviti-offline-ui.js interruttore lista_e_scheda`. Atteso: timeout su `interruttore-inviti`.

- [ ] **Step 3: stato, rinnovo, interruttore** — subito dopo `confermaBloccoInviti` (Task 21, Step 4):

```js
          const [disponibileInviti, setDisponibileInviti] = useState(null); // null = non ancora chiesto al server
          const [invitabili, setInvitabili] = useState([]);                 // get_invitable_users: [{ id (opaco), nickname }]
          const [schedaInvito, setSchedaInvito] = useState(null);           // { chi, dati }

          // Lo stato dell'interruttore lo decide il server, non localStorage: un altro telefono che
          // l'ha spento vince sul rinnovo di questo. Con «senza_abbonamento» si prova una volta a
          // riregistrare l'abbonamento (se il permesso c'è ancora) e a rinnovare.
          useEffect(() => {
            if (!nickname || !sessionId) return;
            let fermo = false;
            (async () => {
              let r = await rpcInviti('renew_telepathy_availability', {});
              if (fermo || !r || !r.ok) return;
              if (r.stato === 'senza_abbonamento' && pushDisponibile() && Notification.permission === 'granted') {
                try { await iscriviPush(); r = await rpcInviti('renew_telepathy_availability', {}); } catch (_) {}
              }
              if (fermo || !r || !r.ok) return;
              setDisponibileInviti(r.stato === 'acceso');
              if (r.stato === 'senza_abbonamento') setAvvisoInviti(testoInviti('nessun_abbonamento'));
            })();
            return () => { fermo = true; };
          }, [nickname, sessionId]);

          // Accendere: il tocco sull'interruttore, con la frase accanto, è la nostra domanda; da
          // qui parte il permesso del browser, poi l'abbonamento (lo stesso dei rituali), poi la
          // disponibilità. Se qualcosa non va, l'interruttore resta spento e lo dice: niente verde
          // finto (rilievo della review del 21/09).
          const accendiDisponibilita = async () => {
            if (!pushDisponibile()) {
              const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
              const installata = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
              if (iOS && !installata) setMostraInstallaPerPush(true);
              setDisponibileInviti(false);
              setAvvisoInviti(testoInviti('nessun_abbonamento'));
              return;
            }
            try {
              if (Notification.permission !== 'granted') {
                const p = await Notification.requestPermission();
                if (p !== 'granted') { setDisponibileInviti(false); setAvvisoInviti(testoInviti('permesso_negato')); return; }
              }
              await iscriviPush();
            } catch (_) {
              setDisponibileInviti(false);
              setAvvisoInviti(testoInviti('nessun_abbonamento'));
              return;
            }
            const r = await rpcInviti('set_telepathy_availability', { p_nickname: nickname || 'Anonymous', p_enabled: true });
            const ok = !!(r && r.ok && r.acceso);
            setDisponibileInviti(ok);
            if (!ok) setAvvisoInviti(testoInviti((r && r.motivo) || 'errore'));
          };
          // Spegnere toglie la riga, non l'abbonamento: le notifiche dei rituali restano.
          const spegniDisponibilita = async () => {
            const r = await rpcInviti('set_telepathy_availability', { p_nickname: nickname || 'Anonymous', p_enabled: false });
            if (r && r.ok) setDisponibileInviti(false); else setAvvisoInviti(testoInviti('errore'));
          };
          // Prima di un cambio d'identità (iscrizione, login, link magico, logout) si spegne la
          // disponibilità del session_id che se ne va: altrimenti resterebbe in lista una persona
          // che su questo telefono non riceve più niente (spec §4.4).
          const spegniDisponibilitaDi = async (sid, hash) => {
            if (!disponibileInviti || !sid) return;
            try { await supabase.rpc('set_telepathy_availability', { p_session_id: sid, p_password_hash: hash || null, p_nickname: null, p_enabled: false }); } catch (_) {}
            setDisponibileInviti(false);
          };
          const renderInterruttoreInviti = (dataTest) => (
            <div style={{padding: '0.5rem 0'}}>
              <div className="flex items-center justify-between">
                <span className="text-white text-sm">{testoInviti('interruttore')}</span>
                <button data-test={dataTest} role="switch" aria-checked={disponibileInviti === true}
                  onClick={() => (disponibileInviti ? spegniDisponibilita() : accendiDisponibilita())}
                  style={{width: '3rem', height: '1.5rem', borderRadius: '9999px', position: 'relative', cursor: 'pointer', transition: 'all 0.3s',
                    background: disponibileInviti ? 'rgba(34,197,94,0.5)' : 'rgba(255,255,255,0.2)',
                    border: disponibileInviti ? '1px solid rgba(34,197,94,0.7)' : '1px solid rgba(255,255,255,0.3)'}}>
                  <div style={{width: '1.1rem', height: '1.1rem', borderRadius: '50%', background: '#fff', position: 'absolute', top: '50%',
                    transform: 'translateY(-50%)', left: disponibileInviti ? 'calc(100% - 1.3rem)' : '0.15rem', transition: 'all 0.3s'}} />
                </button>
              </div>
              <p className="text-secondary text-xs" style={{marginTop: '0.25rem'}}>{testoInviti('nota_nome')}</p>
            </div>
          );

          // La lista, finché si è nella lobby della telepatia.
          useEffect(() => {
            if (activeTab !== 'telepathy' || partner || !nickname) return;
            let fermo = false;
            const giro = async () => {
              const r = await rpcInviti('get_invitable_users', { p_nickname: nickname || 'Anonymous' });
              if (!fermo && Array.isArray(r)) setInvitabili(r);
            };
            giro();
            const intervallo = setInterval(giro, 15000);
            return () => { fermo = true; clearInterval(intervallo); };
          }, [activeTab, partner, nickname]);

          // La scheda: dalla lista «Disponibili su invito» ({ disponibilita_id, nickname }) o dalla
          // lista Online ({ id: session_id, nickname }). Nessun session_id torna dal server.
          const apriScheda = async (chi) => {
            const r = await rpcInviti('get_invite_card', {
              p_nickname: nickname || 'Anonymous',
              p_disponibilita_id: chi.disponibilita_id || null,
              p_session_online: chi.disponibilita_id ? null : chi.id
            });
            if (!r || !r.ok) { setAvvisoInviti(testoInviti(r && r.motivo === 'non_trovato' ? 'non_disponibile' : ((r && r.motivo) || 'errore'))); return; }
            setSchedaInvito({ chi, dati: r.scheda });
          };
```
  In `confermaBloccoInviti` (Task 21), accanto a `setIncomingInvite(null);`, aggiungere `setSchedaInvito(null);`.

- [ ] **Step 4: la UI**
  - Nella lobby della telepatia, **sopra** il riquadro dell'invito in uscita (Task 18, Step 8): `<div className="bg-glass-dark rounded-xl p-4">{renderInterruttoreInviti('interruttore-inviti')}</div>`.
  - In Impostazioni, subito dopo il `</div>` che chiude la riga `data-test="push-interruttore"` (r. 5061): `{renderInterruttoreInviti('interruttore-inviti-impostazioni')}`.
  - Nella lista Online (Task 18, Step 8), l'`onClick={() => openProfile(u.nickname)}` del nome diventa `onClick={() => apriScheda({ id: u.id, nickname: u.nickname })}`.
  - Subito **dopo** la lista Online, la lista nuova:
```jsx
                        {invitabili.length > 0 && (
                          <div data-test="lista-disponibili" className="bg-glass-dark rounded-xl p-4">
                            <h3 className="text-white font-bold mb-3">{testoInviti('disponibili')} ({invitabili.length})</h3>
                            <div style={{display: 'flex', flexDirection: 'column', gap: '0.5rem'}}>
                              {invitabili.map(u => (
                                <div key={u.id} data-test="riga-disponibile" style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.75rem', borderRadius: '0.75rem', background: 'rgba(255,255,255,0.05)'}}>
                                  <span className="text-white text-sm font-medium" style={{cursor: 'pointer', textDecoration: 'underline dotted'}}
                                    onClick={() => apriScheda({ disponibilita_id: u.id, nickname: u.nickname })}>{u.nickname}</span>
                                  {!invitoInUscita && !directInviteTarget && (
                                    <button onClick={() => sendDirectInvite({ disponibilita_id: u.id, nickname: u.nickname })} className="btn-primary"
                                      style={{fontSize: '0.75rem', padding: '0.3rem 0.75rem'}}>{t.telepathy.propose}</button>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
```
  - Accanto al blocco `{confermaBlocco && ( … )}` (Task 21), la scheda:
```jsx
              {schedaInvito && (
                <div data-test="scheda-invito" role="dialog" style={{position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9999,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem'}}>
                  <div className="bg-glass-dark rounded-2xl" style={{maxWidth: '22rem', width: '100%', padding: '1.25rem'}}>
                    <h3 className="text-white font-bold">{schedaInvito.dati.nickname}</h3>
                    {schedaInvito.dati.country && <p className="text-secondary text-sm">{schedaInvito.dati.country}</p>}
                    {schedaInvito.dati.bio && <p className="text-white text-sm" style={{margin: '0.5rem 0'}}>{schedaInvito.dati.bio}</p>}
                    {schedaInvito.dati.prove != null && (
                      <p className="text-secondary text-sm">
                        {testoInviti('prove')}: {schedaInvito.dati.prove}
                        {IH && IH.percentuale(schedaInvito.dati.prove, schedaInvito.dati.indovinate) ? ` · ${testoInviti('indovinate')}: ${IH.percentuale(schedaInvito.dati.prove, schedaInvito.dati.indovinate)}` : ''}
                      </p>
                    )}
                    <div style={{display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '1rem'}}>
                      {!invitoInUscita && !directInviteTarget && (
                        <button data-test="btn-invita" className="btn-primary"
                          onClick={() => { const chi = schedaInvito.chi; setSchedaInvito(null); sendDirectInvite(chi); }}>{testoInviti('invita')}</button>
                      )}
                      <button data-test="btn-blocca-scheda" className="btn-secondary"
                        onClick={() => setConfermaBlocco({ nome: schedaInvito.dati.nickname, ...(schedaInvito.chi.disponibilita_id
                          ? { p_disponibilita_id: schedaInvito.chi.disponibilita_id } : { p_session_online: schedaInvito.chi.id }) })}>
                        {testoInviti('blocca')}
                      </button>
                      <button data-test="btn-chiudi-scheda" className="btn-secondary" onClick={() => setSchedaInvito(null)}>{testoInviti('chiudi')}</button>
                    </div>
                  </div>
                </div>
              )}
```
  (La scheda ha `zIndex: 9999` e la conferma del blocco `10000`: la conferma si apre sopra la scheda.)

- [ ] **Step 5: i cambi d'identità**
  - Login con password (r. 1802): subito **prima** di `setSessionId(existing.session_id);` → `await spegniDisponibilitaDi(sessionId, null);`
  - Iscrizione (r. 1887): subito **prima** di `setSessionId(newSid);` → `await spegniDisponibilitaDi(sessionId, null);`
  - Link magico (r. ~1998): subito **prima** di `setSessionId(existing.session_id);` → `await spegniDisponibilitaDi(sessionId, null);`
  - Logout (r. 2047): subito **prima** di `spegniPushAlLogout();` → `spegniDisponibilitaDi(sessionId, passwordHash);` (senza `await`: `handleLogout` non è asincrona, e la chiamata parte con la credenziale di chi esce prima che venga cancellata).
  (Nei primi tre casi chi cambia identità è un ospite, o nessuno: `p_password_hash` nullo basta.)

- [ ] **Step 6: build e test**

```bash
node build.js
NODE_OPTIONS="--require ./scripts/test-silenzioso.js" node test-inviti-offline-ui.js interruttore lista_e_scheda
grep -c 'interruttore-inviti-impostazioni' src/app.jsx
```
Atteso: `12 passati, 0 falliti`; `1`.

- [ ] **Step 7: commit** — `feat(inviti): interruttore, lista «Disponibili su invito», scheda` (+ `Co-Authored-By`).

**Fatto quando:** `interruttore` + `lista_e_scheda` → `12 passati, 0 falliti`; l'interruttore compare in Telepatia e in Impostazioni.

### Task 23: `findPartner` — i training lunghi restano, gli orfani no

**Obiettivo:** un training non si cancella più a 5 minuti dalla nascita; si cancellano i match chiusi da più di un minuto, quelli fermi da 10 minuti e gli orfani mai giocati nati da più di 5; un orfano d'invito non risucchia chi cerca un partner, mentre l'abbinamento casuale continua a funzionare.

**Files:**
- Modify: `src/app.jsx`, `app.js`, `test-inviti-offline-ui.js`

**Interfaces:**
- Consumes: colonne `giocato`, `da_invito`, `ultima_attivita` (Task 7). Attributo nuovo: `data-test="btn-casuale"` sul pulsante dell'abbinamento casuale.

- [ ] **Step 1: il test prima**

```js
// ════ Task 23: findPartner ═════════════════════════════════════════════════
scenario('match_lunghi_e_orfani', async (browser) => {
  const X = await entra(browser, 'X10');
  const nuovo = async (campi) => (await servizio('telepathy_matches', { method: 'POST', body: JSON.stringify({ level: 'lvl3', ...campi }) }))[0];
  const lungo = await nuovo({ user1_id: `lungo1_${TS}`, user1_nickname: nick('L1'), user2_id: `lungo2_${TS}`, user2_nickname: nick('L2'), round_count: 3 });
  await sposta('telepathy_matches', `id=eq.${lungo.id}`, { created_at: faSecondi(360), round_count: 4 });   // nato 6 minuti fa, giocato adesso
  const orfano = await nuovo({ user1_id: X.sid, user1_nickname: X.nick, user2_id: `orfano_${TS}`, user2_nickname: nick('O'), round_count: 0, da_invito: true, created_at: faSecondi(360) });
  const giovane = await nuovo({ user1_id: X.sid, user1_nickname: X.nick, user2_id: `giovane_${TS}`, user2_nickname: nick('G'), round_count: 0, da_invito: true, created_at: faSecondi(60) });
  await aTelepatia(X);
  await X.page.locator('[data-test="btn-casuale"]').click();
  await pausa(8000);   // qualche giro di findPartner
  check((await leggi('telepathy_matches', `id=eq.${lungo.id}&select=id`)).length === 1, 'un training nato 6 minuti fa ma giocato adesso non si cancella');
  check((await leggi('telepathy_matches', `id=eq.${orfano.id}&select=id`)).length === 0, 'un orfano d\'invito mai giocato, di 6 minuti fa, sì');
  check((await X.page.locator('[data-test="partner-nome"]').filter({ hasText: nick('G') }).count()) === 0, 'un orfano d\'invito recente non risucchia chi cerca un partner');
  const Y = await entra(browser, 'Y10');
  await aTelepatia(Y);
  await Y.page.locator('[data-test="btn-casuale"]').click();
  await X.page.locator('[data-test="partner-nome"]').filter({ hasText: Y.nick }).waitFor({ timeout: 30000 });
  await Y.page.locator('[data-test="partner-nome"]').filter({ hasText: X.nick }).waitFor({ timeout: 30000 });
  ok('l\'abbinamento casuale funziona ancora: il match appena nato, mai giocato, non da invito, prende entrambi');
  await servizio(`telepathy_matches?id=in.(${lungo.id},${giovane.id})`, { method: 'DELETE' });
});
```

- [ ] **Step 2: vederlo fallire** — `… node test-inviti-offline-ui.js match_lunghi_e_orfani`. Atteso: ❌ sul primo controllo (la pulizia di oggi cancella tutto ciò che è nato da 5 minuti) o timeout su `btn-casuale`.

- [ ] **Step 3: la pulizia e il passo 1** — in `findPartner` (r. 1559), la riga `await supabase.from('telepathy_matches').delete().lt('created_at', new Date(Date.now() - 300000).toISOString());` diventa:

```js
              // Non più «tutto ciò che è nato da 5 minuti», che cancellava anche i training lunghi
              // (spec §4.4, secondo e terzo giro). Tre delete separati: il client fatto a mano
              // conosce solo .eq/.neq/.lt. Chiusi da più di un minuto (resta il tempo per la
              // schermata finale), fermi da 10, orfani mai giocati nati da più di 5 (chi accetta
              // aspetta al massimo 3).
              const adesso = Date.now();
              await supabase.from('telepathy_matches').delete().lt('ended_at', new Date(adesso - 60000).toISOString());
              await supabase.from('telepathy_matches').delete().lt('ultima_attivita', new Date(adesso - 600000).toISOString());
              await supabase.from('telepathy_matches').delete().eq('giocato', false).lt('created_at', new Date(adesso - 300000).toISOString());
```
  e subito dopo, prima di `// 1. Check if someone already matched with me`:
```js
              // «Vivo» per l'abbinamento: non chiuso e non un orfano d'invito mai giocato. I match
              // casuali appena nati restano vivi: è così che chi è in coda scopre il match creato
              // dall'altro, prima che nessuno abbia giocato.
              const vivo = (m) => !m.ended_at && !(m.da_invito && !m.giocato);
```
  Poi, nelle tre ricerche della stessa funzione, `&& !m.ended_at` diventa `&& vivo(m)`:
  - passo 1 (r. 1566): `const myMatch = matches.find(m => (m.user1_id === sessionId || m.user2_id === sessionId) && vivo(m));`
  - `existingForMe` (r. 1603) e `existingForThem` (r. 1613), stessa sostituzione (senza, un orfano d'invito di chi è in coda lo terrebbe fuori dall'abbinamento casuale per 5 minuti).

- [ ] **Step 4: il pulsante** — al `<button onClick={startSearching} className="btn-primary w-full" …>` (r. 4629) aggiungere `data-test="btn-casuale"`.

- [ ] **Step 5: build e test**

```bash
node build.js
NODE_OPTIONS="--require ./scripts/test-silenzioso.js" node test-inviti-offline-ui.js match_lunghi_e_orfani
```
Atteso: `4 passati, 0 falliti`.

- [ ] **Step 6: commit** — `fix(telepatia): i training lunghi non si cancellano più, gli orfani sì` (+ `Co-Authored-By`).

**Fatto quando:** `match_lunghi_e_orfani` → `4 passati, 0 falliti`; `grep -n "300000" src/app.jsx` compare solo nella pulizia degli orfani (`giocato`, `created_at`).

### Task 24: tutti i test, e i vecchi al loro posto

**Obiettivo:** il ramo intero è verde: i test nuovi, quelli locali, quelli UI esistenti. Un test esistente che diventa rosso è o una regressione (si corregge il codice) o un test che controllava un comportamento che la spec ha cambiato (si aggiorna il test, citando il paragrafo della spec nel commit). Mai «flaky» senza averlo visto rosso e verde sulla stessa versione (lezione del 03/06).

- [ ] **Step 1: locali**

```bash
for t in test-inviti-offline-sql.js test-pg-locale.js test-candela-stanza-sql.js test-rituali-ricorrenti-sql.js \
         test-invito-decisioni.js test-push-esito.js test-push-helpers.js test-push-finestre.js test-sw-inviti.js test-inviti-helpers.js; do
  echo "== $t"; NODE_OPTIONS="--require ./scripts/test-silenzioso.js" node $t | tail -n 1
done
```
Atteso: `165/0`, `7/0`, baseline, baseline, `22/0`, baseline+2, baseline+27, baseline, `10/0`, `28/0`.

- [ ] **Step 2: UI e DB vero** (server locale acceso, in un orario tranquillo)

```bash
NODE_OPTIONS="--require ./scripts/test-silenzioso.js" node test-inviti-offline-ui.js
for t in test-inviti-offline-rpc.js test-inviti-telepatia.js test-telepathy.js test-telepathy-session-end.js test-telepathy-gating.js \
         test-telepathy-role-rotation.js test-pwa.js test-push-ui.js test-push-rpc.js test-account-gdpr.js test-account-rpc.js \
         test-moderazione.js test-moderazione-ui.js test-rituali.js test-rituali-ricorrenti-ui.js test-ospite-identita.js; do
  echo "== $t"; NODE_OPTIONS="--require ./scripts/test-silenzioso.js" node $t 2>&1 | tail -n 2
done
```
Atteso: `test-inviti-offline-ui.js` → `40 passati, 0 falliti` (conteggio sotto); `test-inviti-offline-rpc.js` → `11/0`; gli altri come la baseline del Task 1. `test-inviti-telepatia.js`: il rosso preesistente deve essere **lo stesso** passo di prima, non uno nuovo.

  Nota sul conteggio: gli scenari sono `invio_online` 6, `attesa_di_chi_invita` 3, `rientro_all_avvio` 1, `attesa_di_chi_accetta` 3, `rifiuto_e_due_schede` 3, `campanella_e_training` 3, `apri_da_notifica` 5, `interruttore` 5, `lista_e_scheda` 7, `match_lunghi_e_orfani` 4 → **40 passati, 0 falliti**.

- [ ] **Step 3: correggere ciò che è rosso** — per ogni rosso nuovo, un commit a parte con il perché. Casi prevedibili, già decisi:
  - un test che si aspettava la scadenza delle notifiche d'invito a 120 s o la cancellazione degli inviti a 2 minuti: il comportamento è cambiato (spec §4.4, «Campanella» e «Il loop presenze»), si aggiorna il test;
  - un test che cliccava il nome nella lista Online della telepatia per aprire il **profilo**: ora apre la scheda d'invito (spec §4.4, «Lista»), si aggiorna il test.

**Fatto quando:** tutti i numeri come sopra, e ogni correzione a un test esistente ha nel commit il paragrafo della spec che giustifica il cambiamento.

### Task 25: revisione dell'intero ramo, PR 3, rilascio e prova dal vivo

- [ ] **Step 1: revisione indipendente dell'intero ramo** (sub-agente separato, `superpowers:requesting-code-review`, diff `origin/main..HEAD`, con spec e piano): nessuna lettura o scrittura diretta di `telepathy_invites` rimasta nell'app; `beforeunload` non tocca più gli inviti; nessun timer locale decide la scadenza; i controlli dei 35 s e dei 90 s sono spenti solo durante l'attesa di chi ha accettato; `?invito=` e `azione` letti in un solo `useState`; `ga-pwa-v12` e `?v=12`; nessun refactor fuori scope (confrontare i file toccati con la Mappa dei file). Rilievi chiusi e Task 24 rilanciato.
- [ ] **Step 2: il controller** dice a Irene «sto per pushare `feat/inviti-offline-app` e aprire la PR 3», poi push e PR.
- [ ] **Step 3: 🟣 IRENE** — `! gh pr merge <N> --merge -R global-awakening/global-awakening.github.io`
- [ ] **Step 4: attesa della cache** — ~10 minuti (`max-age=600`), poi chiudi e riapri l'app. Una correzione che «non funziona» subito dopo il rilascio si prova prima in Chrome, non nell'app installata (lezione del 22/09).
- [ ] **Step 5: prova dal vivo — prima l'agente**, sul sito vero con due profili di Chrome da ospite: interruttore, lista, scheda, invito da 10 minuti a chi ha chiuso la scheda, accettazione dalla notifica di Chrome, ingresso di chi ha invitato, rifiuto, scadenza, «Non voglio più inviti» dalla notifica.
- [ ] **Step 6: 🟣 IRENE — solo quello che serve un telefono**: con due telefoni, uno con l'app chiusa: la push d'invito arriva e apre l'invito; «accettato», «rifiutato», «scaduto» arrivano a chi ha invitato; con l'app in primo piano su Android la notifica non compare ma il banner sì; l'azione «Non voglio più inviti da questa persona» sulla notifica apre la conferma; toccare la notifica con l'app aperta non la ricarica.
- [ ] **Step 7: sentinella** — `NODE_OPTIONS="--require ./scripts/test-silenzioso.js" node test-push-cron.js` dopo le prove: nessuna risposta non 2xx.
- [ ] **Ritorno indietro (scritto, non eseguito):** PR di revert su `main` **con un nuovo bump della cache a `ga-pwa-v13`** (e `push-helpers.js?v=13`), altrimenti le app installate resterebbero sul codice ritirato. Il database resta alla 32a e l'app vecchia funziona grazie alle policy aperte.

**Fatto quando:** PR 3 mergiata; prove dello Step 5 superate dall'agente; prove dello Step 6 confermate da Irene; `test-push-cron.js` verde.

---

## Fase D — Chiusura dell'accesso diretto (ramo `feat/inviti-offline-chiusura`)

Si comincia **almeno un giorno dopo** il merge della PR 3. Il ramo nasce da `main` aggiornato.

### Task 26: la migration 32b e il suo ritorno

**Obiettivo:** dopo la 32b nessuno legge né scrive `telepathy_invites` con la chiave pubblica; le RPC funzionano come prima; prima di chiudere si rinormalizzano i `pending`; il ritorno rimette esattamente le policy e i privilegi del catalogo.

**Files:**
- Create: `supabase/sql/32b_chiudi_inviti_diretti.sql`, `supabase/sql/32b_ritorno.sql`
- Modify: `test-inviti-offline-sql.js`

**Interfaces:**
- Consumes: `.superpowers/sdd/catalogo-inviti.txt` (risposte `cat8`…`cat13` del Task 1); `F32B` (Task 6).

- [ ] **Step 1: il test prima**

```js
// ════ G. 32b (Task 26) ═════════════════════════════════════════════════════
// Le policy di telepathy_invites com'erano prima della 32b (catalogo, Task 1: cat8…cat12).
const POLICY_DAL_CATALOGO = ['Destinatario può aggiornare lo status', 'Destinatario vede i propri inviti',
  'Mittente può cancellare il proprio invito', 'Utenti autenticati possono creare inviti',
  'anon can delete telepathy_invites', 'anon can insert telepathy_invites',
  'anon can select telepathy_invites', 'anon can update telepathy_invites'];

sezione('G1. la 32b chiude l\'accesso diretto', async () => {
  const db = await creaDbTelepatia({ con32a: true, con32b: false });
  await db.query(`INSERT INTO telepathy_invites (from_id, from_name, to_id, to_name, expires_at) VALUES
    ('w1', 'W1', 'w2', 'W2', now() + interval '1 year'), ('w3', 'W3', 'w4', 'W4', now() + interval '5 minutes')`);
  await applicaFile(db, F32B);
  const st = await righe(db, `SELECT from_id, status FROM telepathy_invites ORDER BY from_id`);
  check(st[0].status === 'expired' && st[1].status === 'pending', '32b: chiude i pending con una scadenza impossibile, non quelli validi', st);
  for (const [nome, sql] of [['select', `SELECT * FROM telepathy_invites`], ['insert', `INSERT INTO telepathy_invites (from_id, to_id) VALUES ('a', 'b')`],
                             ['update', `UPDATE telepathy_invites SET status = 'declined'`], ['delete', `DELETE FROM telepathy_invites`]]) {
    const m = await errore(comeAnon(db, () => db.query(sql)));
    check(!!m && /permission denied/i.test(m), `dopo la 32b anon non fa ${nome} su telepathy_invites`, m);
  }
  check((await righe(db, `SELECT policyname FROM pg_policies WHERE tablename = 'telepathy_invites'`)).length === 0, 'nessuna policy rimasta');
  await abbonamento(db, 'g1');
  await chiama(db, 'set_telepathy_availability', { ...G('g1', 'G1'), p_enabled: true });
  const gid = await idDisp(db, 'g1');
  const r = await comeAnon(db, () => chiama(db, 'send_telepathy_invite', { ...G('g2', 'G2'), p_disponibilita_id: gid, p_session_online: null }));
  check(r.ok === true, 'dopo la 32b le RPC funzionano da anon', r);
  const letto = await comeAnon(db, () => chiama(db, 'get_my_telepathy_invites', { p_session_id: 'g1', p_password_hash: null }));
  check(!!letto.in_arrivo && letto.in_arrivo.nome === 'G2', 'e la lettura passa dalla RPC', letto);
  check(!(await errore(applicaFile(db, F32B))), '32b rilanciata: nessun errore');
  await applicaFile(db, 'supabase/sql/32b_ritorno.sql');
  check(!(await errore(comeAnon(db, () => db.query(`SELECT count(*) FROM telepathy_invites`)))), '32b_ritorno: anon torna a leggere');
  const pol = (await righe(db, `SELECT policyname FROM pg_policies WHERE tablename = 'telepathy_invites'`)).map((x) => x.policyname).sort();
  check(JSON.stringify(pol) === JSON.stringify([...POLICY_DAL_CATALOGO].sort()), '32b_ritorno: le stesse policy del catalogo', pol);
}, { con32a: false });
```
**Prima di scrivere il test**, confrontare `POLICY_DAL_CATALOGO` con `cat8…cat12`: se i nomi sono diversi, vincono quelli del catalogo (e allora vanno corretti anche in `scripts/pg-locale.js`, Task 6).

- [ ] **Step 2: vederlo fallire** — Atteso: `G1: eccezione — ENOENT … 32b_chiudi_inviti_diretti.sql`; le altre sezioni verdi (165).

- [ ] **Step 3: `supabase/sql/32b_chiudi_inviti_diretti.sql`**

```sql
-- ============================================================================
-- 32b_chiudi_inviti_diretti.sql — inviti a un training anche a chi non è collegato (2 di 2)
-- Segue: 32a_inviti_telepatia_offline.sql. Spec: 2026-09-25 §4.1 punto 5, §6, §8 passo 4.
--
-- Chiude l'accesso diretto a telepathy_invites: via tutte le policy, nessun privilegio all'app,
-- ANCHE in lettura. La tabella lega nomi e session_id: lasciarla leggibile trasformerebbe ogni
-- invito in una mappa «nome → session_id» e renderebbe inutile l'identificativo opaco della
-- lista. Da qui si legge e si scrive solo con le RPC della 32a.
--
-- ⚠️ Applicare SOLO quando (1) l'app nuova è live da almeno un giorno e (2) questa query
--    risponde 0 (nessuna app vecchia scrive più direttamente):
--      SELECT count(*) FROM telepathy_invites
--       WHERE via_diretta AND coalesce(responded_at, created_at) > now() - interval '24 hours';
-- Dopo: un'app vecchia ancora in cache non vede e non manda inviti finché non si aggiorna
-- (~10 minuti + chiudi e riapri). Accettato (spec §5).
-- Ritorno indietro: 32b_ritorno.sql.
-- Idempotente, in una transazione.
-- ============================================================================
BEGIN;

-- Prima di chiudere: i pending già scaduti e quelli con una scadenza impossibile (oltre 10
-- minuti da adesso), per il caso in cui qualcosa sia sfuggito al trigger di guardia.
UPDATE telepathy_invites SET status = 'expired', responded_at = coalesce(responded_at, now())
 WHERE status = 'pending' AND (expires_at <= now() OR expires_at > now() + interval '10 minutes 5 seconds');

-- Tutte le policy, con i nomi che hanno oggi (sono nate dallo Studio).
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'telepathy_invites' LOOP
    EXECUTE format('DROP POLICY %I ON public.telepathy_invites', p.policyname);
  END LOOP;
END $$;
REVOKE ALL ON public.telepathy_invites FROM PUBLIC, anon, authenticated;
-- RLS resta attiva e senza policy; il trigger di guardia resta (non costa niente e copre
-- un'eventuale riapertura).

NOTIFY pgrst, 'reload schema';

COMMIT;
```

- [ ] **Step 4: `supabase/sql/32b_ritorno.sql`** — le policy e i privilegi **esattamente** come nelle risposte `cat8…cat13` del Task 1. La forma attesa (da correggere sul catalogo, voce per voce: comando, ruoli, `USING`, `WITH CHECK`):

```sql
-- ============================================================================
-- 32b_ritorno.sql — ritorno indietro della 32b. SCRITTO E PROVATO IN LOCALE, NON APPLICATO:
-- lo lancia Irene solo se decide che serve.
-- Rimette le policy e i privilegi di telepathy_invites com'erano prima della 32b, letti dal
-- catalogo il 30/09/2026 (Task 1 del piano inviti, .superpowers/sdd/catalogo-inviti.txt).
-- Le RPC della 32a continuano a funzionare anche con l'accesso diretto riaperto.
-- ============================================================================
BEGIN;
DROP POLICY IF EXISTS "Destinatario può aggiornare lo status" ON public.telepathy_invites;
CREATE POLICY "Destinatario può aggiornare lo status" ON public.telepathy_invites FOR UPDATE TO public USING ((auth.uid())::text = to_id);
DROP POLICY IF EXISTS "Destinatario vede i propri inviti" ON public.telepathy_invites;
CREATE POLICY "Destinatario vede i propri inviti" ON public.telepathy_invites FOR SELECT TO public USING ((auth.uid())::text = to_id);
DROP POLICY IF EXISTS "Mittente può cancellare il proprio invito" ON public.telepathy_invites;
CREATE POLICY "Mittente può cancellare il proprio invito" ON public.telepathy_invites FOR DELETE TO public USING ((auth.uid())::text = from_id);
DROP POLICY IF EXISTS "Utenti autenticati possono creare inviti" ON public.telepathy_invites;
CREATE POLICY "Utenti autenticati possono creare inviti" ON public.telepathy_invites FOR INSERT TO public WITH CHECK ((auth.uid())::text = from_id);
DROP POLICY IF EXISTS "anon can delete telepathy_invites" ON public.telepathy_invites;
CREATE POLICY "anon can delete telepathy_invites" ON public.telepathy_invites FOR DELETE TO anon USING (true);
DROP POLICY IF EXISTS "anon can insert telepathy_invites" ON public.telepathy_invites;
CREATE POLICY "anon can insert telepathy_invites" ON public.telepathy_invites FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS "anon can select telepathy_invites" ON public.telepathy_invites;
CREATE POLICY "anon can select telepathy_invites" ON public.telepathy_invites FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS "anon can update telepathy_invites" ON public.telepathy_invites;
CREATE POLICY "anon can update telepathy_invites" ON public.telepathy_invites FOR UPDATE TO anon USING (true) WITH CHECK (true);
-- I privilegi di cat13: tutti e sette (DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE,
-- UPDATE) per anon e authenticated, quindi ALL è equivalente.
GRANT ALL ON public.telepathy_invites TO anon, authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
```

- [ ] **Step 5: vederlo passare** — Atteso: `176 passati, 0 falliti`.
- [ ] **Step 6: commit** — `git add supabase/sql/32b_chiudi_inviti_diretti.sql supabase/sql/32b_ritorno.sql test-inviti-offline-sql.js`, `feat(sql): 32b — chiusa la lettura e la scrittura diretta degli inviti; 32b_ritorno` (+ `Co-Authored-By`). Poi `git show HEAD:supabase/sql/32b_chiudi_inviti_diretti.sql | grep -c $'\r'` → `0`.

**Fatto quando:** `176 passati, 0 falliti`; le policy di `32b_ritorno.sql` coincidono, voce per voce, con `cat8…cat13`.

### Task 27: via il ripiego della tenuta

**Obiettivo:** dopo la 32b un'accettazione senza `match_id` non può più esistere: il ripiego si toglie dall'app e dal file di logica.

**Files:**
- Modify: `src/app.jsx`, `app.js`, `inviti-helpers.js`, `test-inviti-helpers.js`

- [ ] **Step 1: il test prima** — in `test-inviti-helpers.js` togliere i due controlli «ripiego: …» e aggiungere:
```js
uguale('dopo la 32b il ripiego della tenuta non esiste più', typeof H.matchDiRipiego, 'undefined');
```
Run: `… node test-inviti-helpers.js` → atteso ❌ sull'ultimo controllo.
- [ ] **Step 2: togliere** — da `inviti-helpers.js` la funzione `matchDiRipiego` e la sua voce in `api`; da `src/app.jsx`, nell'effetto dell'attesa di chi invita (Task 19, Step 4), il blocco dal commento `// TENUTA (fra la 32a e la 32b …` fino al `return;` che lo chiude, sostituito da:
```js
                // Dalla 32b un'accettazione ha sempre il match_id (solo le RPC scrivono gli inviti).
                return;
```
- [ ] **Step 3: vederlo passare** — `node build.js`; `… node test-inviti-helpers.js` → `27 passati, 0 falliti`; `grep -n "matchDiRipiego\|TENUTA" src/app.jsx inviti-helpers.js` → nessuna riga.
- [ ] **Step 4: commit** — `refactor(inviti): via il ripiego della tenuta dopo la 32b` (+ `Co-Authored-By`).

**Fatto quando:** `27 passati, 0 falliti`; nessuna traccia del ripiego.

### Task 28: i test vecchi che toccavano `telepathy_invites` con la chiave pubblica

**Obiettivo:** `test-inviti-telepatia.js` e `test-telepathy.js` funzionano dopo la 32b: pulizia con la chiave di servizio, letture di debug con la chiave di servizio.

**Files:**
- Modify: `test-inviti-telepatia.js`, `test-telepathy.js`

- [ ] **Step 1: `test-inviti-telepatia.js`** — sotto `const { chromium } = require('playwright');` aggiungere `const { purge } = require('./test-helpers');`; in `cleanup()` sostituire le due righe `await sbFetch(\`telepathy_invites?from_name=eq.…\`, { method: 'DELETE' });` con:
```js
    // Dalla 32b la tabella non è più scrivibile con la chiave pubblica: pulizia con la chiave di servizio.
    await purge(SUPABASE_URL, [
      `telepathy_invites?from_name=eq.${encodeURIComponent(NICK_A)}`,
      `telepathy_invites?from_name=eq.${encodeURIComponent(NICK_B)}`,
    ], { label: 'inviti-telepatia' });
```
- [ ] **Step 2: `test-telepathy.js`** — la pulizia passa già da `purge` (chiave di servizio): resta. La lettura di debug (r. 406–410) diventa:
```js
      // Debug: verifica invito nel DB (dalla 32b solo con la chiave di servizio).
      const invites = await serviceFetch(`telepathy_invites?select=from_name,to_name,status&status=eq.pending&order=created_at.desc&limit=5`)
        .then((r) => (r && typeof r.json === 'function' ? r.json() : r)).catch(() => []);
      log('DEBUG', `Inviti pending nel DB: ${JSON.stringify(Array.isArray(invites) ? invites : [])}`);
```
  (Prima di scriverla, leggere la firma di `serviceFetch` in `test-helpers.js`: se restituisce già il JSON, basta `await serviceFetch(…)`. Il `to_id` non si stampa più: è un session_id.)
- [ ] **Step 3: provarli** — 32b non ancora applicata: tutti e due devono dare gli stessi numeri della baseline (la chiave di servizio funziona anche adesso). Dopo la 32b (Task 29) si rilanciano.
- [ ] **Step 4: commit** — `test: pulizia e letture degli inviti con la chiave di servizio (32b)` (+ `Co-Authored-By`).

**Fatto quando:** i due test hanno gli stessi numeri della baseline; `grep -n "telepathy_invites" test-inviti-telepatia.js test-telepathy.js` mostra solo righe che passano da `purge` o `serviceFetch`.

### Task 29: revisione, 32b dal vivo, PR 4

- [ ] **Step 1: revisione indipendente del gruppo D** (sub-agente separato) sul diff `origin/main..HEAD`: la 32b non tocca nient'altro che `telepathy_invites`; il ritorno coincide col catalogo; il ripiego è sparito; i test vecchi non usano più la chiave pubblica su quella tabella.
- [ ] **Step 2: il criterio per la 32b** — l'agente lancia la query di sola lettura (file temporaneo, `apply-sql.js`):
```sql
SELECT count(*) AS dirette_24h FROM telepathy_invites
 WHERE via_diretta AND coalesce(responded_at, created_at) > now() - interval '24 hours';
```
  e controlla che il merge della PR 3 abbia almeno un giorno. Se `dirette_24h > 0`, **si aspetta** e si riprova il giorno dopo (qualcuno ha ancora l'app vecchia aperta).
- [ ] **Step 3: il controller** dice a Irene «sto per pushare `feat/inviti-offline-chiusura` e aprire la PR 4», poi push e PR.
- [ ] **Step 4: 🟣 IRENE** — `! node scripts/apply-sql.js supabase/sql/32b_chiudi_inviti_diretti.sql`
- [ ] **Step 5: verifiche dopo la 32b**
```bash
NODE_OPTIONS="--require ./scripts/test-silenzioso.js" node test-inviti-offline-rpc.js
NODE_OPTIONS="--require ./scripts/test-silenzioso.js" node test-inviti-offline-ui.js
NODE_OPTIONS="--require ./scripts/test-silenzioso.js" node test-inviti-telepatia.js
NODE_OPTIONS="--require ./scripts/test-silenzioso.js" node test-telepathy.js
```
  Atteso: `11/0`; `40/0` (il ripiego non è più coperto da nessuno scenario: nessuno lo usava); i due vecchi come la baseline. In più, una lettura diretta con la chiave pubblica deve tornare errore o vuota: `curl` non va su questa macchina, quindi da Node: `fetch('https://vxzxdkcluyrcftsnxxza.supabase.co/rest/v1/telepathy_invites?select=id&limit=1', { headers: { apikey: ANON, Authorization: 'Bearer ' + ANON } })` → stato 401/403 oppure `[]`.
- [ ] **Step 6: 🟣 IRENE** — `! gh pr merge <N> --merge -R global-awakening/global-awakening.github.io` (la 32b va applicata **prima** del merge: l'app con il ripiego tolto non deve incontrare accettazioni senza `match_id`).
- [ ] **Ritorno indietro (scritto, non eseguito):** 🟣 `! node scripts/apply-sql.js supabase/sql/32b_ritorno.sql`.

**Fatto quando:** 32b applicata con `dirette_24h = 0`; RPC `11/0`, UI `40/0`; lettura diretta anon rifiutata o vuota; PR 4 mergiata.

---

## Controllo del piano contro la spec

| Spec | Dove |
|---|---|
| §2.1 interruttore spento di default, in Telepatia e Impostazioni, chiede il permesso | Task 22 |
| §2.1 ospiti invitabili | Task 9–11 (ospiti nei test SQL), Task 22 (UI da ospite) |
| §2.1 lista sotto «Online», scheda con nickname, paese, bio, prove, % | Task 9, Task 22 |
| §2.1 push subito; ritorni accettato/rifiutato/scaduto | Task 4–5, 10–12 |
| §2.1 blocchi nei due sensi dal server; 1 aperto per mittente; 10 all'ora | Task 8, 10 |
| §2.2 durata 45 s / 10 minuti | Task 10 (D3), Task 22 |
| §2.2 «Non voglio più inviti» per session_id, anche ospiti | Task 11 (E4), Task 21, Task 22 |
| §2.2 14 giorni fuori lista, rinnovo alla riapertura, 90 giorni cancellazione | Task 9 (C2), Task 12 (F1) |
| §2.2 1 aperto per destinatario, `gia_invitato` | Task 7, Task 10 |
| §2.3 online senza interruttore: niente push | Task 10 (D3) |
| §2.3 training finché si gioca, inattività 10 minuti | Task 7, 8, 23 |
| §2.3 rilascio in due tempi | Fasi B–D, Task 14, 29 |
| §2.4 chi ha un invito aperto non ne manda altri; punteggio nascosto; 3 minuti; frase; tetti 6/ora, 1/15 min | Task 10, 9, 20, 22 |
| §4.1 punti 1–11 | Task 7–12 |
| §4.2 Edge Function, `esito.mjs` in `_shared`, versioni fissate, 2xx a vuoto | Task 2, 4, 5 |
| §4.3 testi, tag, azione blocca, tipo sconosciuto neutro, soppressione in primo piano, `MessageChannel`, `?v=12`, `ga-pwa-v12` | Task 15, 16 |
| §4.4 app (tutti i punti) | Task 18–23 |
| §5 casi limite | test SQL (Task 7–12, 26) e scenari UI (Task 18–23) |
| §6 sicurezza | Task 7 (guardia), 8 (identità), 9 (niente session_id), 26 (32b) |
| §7 test | Task 6–13, 15–17, 18–24, 26–28 |
| §8 passi 0–4 e ritorni | Task 3, 14, 25, 29; `32a_ritorno` Task 12, `32b_ritorno` Task 26 |
| §10 punti aperti | vedi sotto |

**Punti della spec che restano aperti (non li chiude il piano):** togliere un «Non voglio più inviti» (nessuna interfaccia per rivederli); conferma di Irene su tetti (6/ora, 1 per coppia ogni 15 minuti) e soglia d'inattività (10 minuti); testo della sentinella `alert-cron` ancora «notifiche di avvio rituale».

**Scelte del piano da far confermare a Irene prima dell'esecuzione:**
- Accendere l'interruttore apre subito il permesso del browser: il tocco sull'interruttore, con la frase accanto, vale come «la domanda nostra» del flusso dei rituali (spec §4.4 «riusa il flusso»). Accendere l'interruttore riusa lo stesso abbonamento dei rituali, e `iscriviPush` toglie il segno `ga_push_spento`: chi aveva spento le notifiche dei rituali e poi accende gli inviti, le riaccende anche per i rituali (è un solo abbonamento per telefono).
- Toccando un nome nella lista Online della telepatia si apre la scheda d'invito, non più il profilo (spec §4.4).

## Esecuzione

Piano pronto per la revisione di Irene. Esecuzione consigliata: **subagent-driven** (`superpowers:subagent-driven-development`), un sub-agente per task e un revisore separato a fine di ogni gruppo (Task 3, 14, 25, 29) come chiede la spec, perché le fasi dipendono da passi reali di Irene sul database e sulle Edge Function, e un errore rilasciato qui tocca notifiche e dati di persone vere.

