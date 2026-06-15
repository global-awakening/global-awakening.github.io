# Telepatia — più simboli, livelli per difficoltà e raccolta dati per l'indagine

**Data:** 2026-06-15
**Stato:** Design approvato in brainstorming, in attesa di revisione utente prima del piano di implementazione.

## Contesto e obiettivo

Il gioco di telepatia ha oggi 3 modalità per *tipo* di simbolo (Simboli=6, Numeri=9, Lettere=6) e conserva solo un punteggio **aggregato** (`telepathy_scores`); il dato grezzo del singolo tentativo (`telepathy_matches`) viene cancellato a fine sessione e purgato dopo 5 minuti.

L'obiettivo, nato dall'idea di usare l'app per un'**indagine sul funzionamento della telepatia**, è duplice:
1. **Aumentare e riorganizzare i simboli** trasformando i livelli in una **scala di difficoltà oggettiva** per numero di card.
2. **Conservare ogni singolo tentativo** in modo permanente, così da poter calcolare in seguito la significatività statistica (la percentuale di match è davvero sopra il caso 1/N?).

Principio guida: *raccogli bene oggi, calcola quando vuoi*. In app si continua a mostrare solo una semplice "% di match"; l'analisi seria si fa dopo, sui dati raccolti.

## Decisioni prese (vincolanti)

- **Scala di difficoltà a 4 livelli per numero di card: 3 → 5 → 7 → 9** (probabilità per puro caso 33% → 20% → 14% → 11%). Usa un unico set di simboli; ogni livello mostra le **prime N** del set.
- **Numeri (1–9) e Lettere (A–F) restano come modalità "extra"**, accanto alla nuova scala.
- **Set unico di 9 simboli:** ⭐ Stella · ☀️ Sole · 🌙 Luna · 💜 Cuore · 👁️ Occhio · ∞ Infinito · 💧 Goccia · 🔥 Fiamma · 🔮 Sfera di cristallo.
  - Restano **emoji**, tranne il **Sole** che è (ed era già) un **SVG nostro**, perché l'emoji del sole varia troppo tra dispositivi. Se in futuro emergono altre emoji che rendono in modo radicalmente diverso, si convertiranno a SVG una alla volta.
  - L'**∞** è un carattere di testo e oggi risulta scuro: va **schiarito** con un colore dedicato (es. `#e9d5ff`). Tocca solo l'infinito (le emoji ignorano il colore del testo).
- **Raccolta dati: includere anche gli ospiti** (anonimi).
- **Classifica pubblica "Migliori telepati": invariata** — iscritti e ospiti insieme, mostrati col nickname, come oggi.
- **Codice anonimo riconoscibile per gli ospiti** (es. `aurora-lince-72`): identificativo stabile e leggibile che sostituisce il `sessionId` illeggibile/effimero come chiave dei dati dell'ospite, per consentire un eventuale appello pubblico volontario. Non cambia ciò che si vede in classifica (resta il nickname).

## Componenti

### 1. Livelli come scala di difficoltà

Stato attuale (`src/app.jsx`):
- `telepathySymbols` (6), `telepathyNumbers` (9), `telepathyWords` (6) — array di `{id, icon, name}` (riga ~59).
- `getCurrentSymbols(level)` ritorna l'array in base a `level` ∈ {`numbers`, `words`, default=symbols} (riga ~778).
- `currentLevel` è lo stato del livello scelto; etichette in `translations` (`levelShapes`, ecc.).

Cambiamenti:
- Estendere `telepathySymbols` da 6 a **9** simboli (vedi componente 2).
- Introdurre la **scala di difficoltà**: 4 livelli che usano `telepathySymbols.slice(0, N)` con N ∈ {3,5,7,9}. Modello suggerito: identificare il livello con la coppia (modalità, N). Le modalità diventano: `scale` (la scala, con N variabile), `numbers`, `words`.
- `getCurrentSymbols` (o una funzione affiancata) ritorna:
  - per la scala: `telepathySymbols.slice(0, N)`;
  - per `numbers`/`words`: l'array completo come oggi (N rispettivamente 9 e 6).
- **UI selezione livello:** presentare la scala 3/5/7/9 come scelta principale ("Livello 1 — 3 simboli" … "Livello 4 — 9 simboli") e Numeri/Lettere come modalità extra. Aggiornare etichette e traduzioni IT/EN.

### 2. Set di 9 simboli

- Estendere `telepathySymbols` con: `water` 💧, `fire` 🔥, `crystalball` 🔮.
- Ordine del set (determina cosa appare ai livelli bassi — i primi 3 sono i più distinti):
  `star`, `moon`, `sun`(SVG), `heart`, `eye`, `infinity`, `water`, `fire`, `crystalball`.
  *(L'ordine esatto dei primi 3 è una rifinitura: garantire che il Livello 1 abbia 3 forme nettamente diverse.)*
- `infinity`: rendere l'icona con colore chiaro dedicato (span con `style={{color:'#e9d5ff'}}` oppure regola CSS mirata) senza alterare le emoji.
- Nessuna conversione SVG di massa: solo il sole resta SVG.

### 3. Raccolta dati: tabella `telepathy_trials` (append-only)

Nuova tabella, **mai cancellata né purgata**, popolata appena un round si conclude (prima che `telepathy_matches` venga cancellato in `endSession`, ~riga 2202).

Schema (indicativo):
- `id` — chiave primaria (bigserial/uuid)
- `created_at` — timestamptz, default now()
- `match_id` / `pair_id` — per ricondurre i due tentativi dello stesso round/coppia
- `round_number` — int
- `sender_id`, `receiver_id` — testo (email per iscritti, codice ospite per i guest)
- `sender_is_guest`, `receiver_is_guest` — boolean
- `mode` — testo (`scale` | `numbers` | `words`)
- `card_count` (**N**) — int (il dato d'oro per la statistica)
- `target_symbol` — testo (id del simbolo inviato dal sender)
- `guess_symbol` — testo (id indovinato dal receiver)
- `is_hit` — boolean (target == guess)

**Sicurezza (coerente con la posizione già adottata nel progetto — RPC SECURITY DEFINER, niente SELECT pubbliche):**
- Inserimento tramite RPC `log_telepathy_trial(...)` **SECURITY DEFINER** (l'app non scrive direttamente in tabella).
- **Nessuna policy SELECT** per i client: i dati non sono leggibili dal browser; l'analisi si fa da Supabase Studio. Append-only (nessun UPDATE/DELETE dai client).
- Validazione lato RPC dei parametri (mode ammesso, N coerente, simboli appartenenti al set).

In app: nessun nuovo dato mostrato; resta solo la "% di match" già esistente.

### 4. Codice anonimo riconoscibile per gli ospiti

- Alla prima entrata come ospite, generare un codice leggibile e stabile, formato `aggettivo-animale-NN` (es. `aurora-lince-72`), da liste di parole locali. Salvarlo in `localStorage` (es. `ga_guest_code`) e **mostrarlo all'ospite** (così se ne ricorda e può farsi avanti).
- Usare il codice come **chiave stabile dell'ospite** nei dati dei tentativi (`sender_id`/`receiver_id` quando guest), al posto del `sessionId` casuale.
- La classifica resta invariata (mostra il `nickname`); il codice serve all'identità stabile per i dati e all'eventuale appello pubblico.
- Compatibilità con la fusione guest→account esistente (`merge_telepathy_scores`): la fusione del punteggio aggregato resta com'è; i `telepathy_trials` restano append-only e non vengono fusi (sono dato grezzo storico).

## Architettura e punti di innesto

- **Frontend:** `src/app.jsx` — array dei simboli (~59), `getCurrentSymbols` (~778), UI selezione livello e griglie simboli (~3581–3607), `endSession` (~2202) per il punto di logging, generazione/lettura codice ospite vicino alla gestione `sessionId`/`nickname` (~694, ~840). CSS `symbol-btn` in `app.html` (~425) per l'eventuale colore dell'infinito.
- **Backend:** nuovo file SQL incrementale (prossimo numero progressivo in `supabase/sql/`) con: creazione tabella `telepathy_trials`, RLS append-only, RPC `log_telepathy_trial` SECURITY DEFINER. Da applicare in Studio **solo dopo ok esplicito**.

## Gestione errori

- Il logging dei tentativi non deve mai bloccare o rallentare il gioco: la chiamata a `log_telepathy_trial` è **best-effort** (fallimento silenzioso lato UX, eventuale log tecnico). Un tentativo non registrato è un dato perso, non un errore per l'utente.
- Generazione codice ospite robusta a `localStorage` non disponibile (fallback: codice in memoria per la sessione).

## Testing

- **Formula livelli/card:** test unitari che verificano `slice(0,N)` per N ∈ {3,5,7,9} e l'associazione livello→N.
- **Set simboli:** test che il set abbia 9 elementi, id univoci, e che ogni modalità ritorni il numero di card atteso (scale: N; numbers: 9; words: 6).
- **Logging tentativi:** test della RPC `log_telepathy_trial` (hit/miss corretto, N registrato, validazione parametri, rifiuto SELECT pubblica) — sullo schema dei test SQL esistenti (`test-*.js`). I test non auto-puliscono i dati append-only: prevedere purga manuale/namespacing dei dati di test.
- **No-regress:** suite telepatia esistente (`test-telepathy.js`) resa compatibile con la nuova modalità `scale`; classifica invariata.

## Confini — cosa NON fare

- **Niente conversione SVG di massa** dei simboli: solo il sole resta SVG; le altre restano emoji finché non emergono problemi concreti.
- **Niente calcoli statistici in app**: si registra N e l'esito, l'analisi è fuori app.
- **Niente modifiche alla classifica** pubblica.
- **Niente refactor** non collegato (telepatia o altro).
- **Niente nuove SELECT pubbliche** sui dati dei tentativi.

## Fasi di implementazione suggerite

1. **Simboli + livelli (parte visibile, no DB):** 9 simboli, scala 3/5/7/9, infinito schiarito, etichette/traduzioni, test formula. Rilasciabile da solo.
2. **Raccolta dati (DB):** tabella `telepathy_trials` + RPC `log_telepathy_trial` + innesto in `endSession`. Solo dopo ok DB.
3. **Codice ospite riconoscibile:** generazione/persistenza/visualizzazione + uso come chiave nei tentativi. Separabile.
