# Telepatia — auto-avanzamento round (no "Ancora") · Design

Data: 2026-06-03
Stato: approvato (definito in conversazione con l'utente)

## Obiettivo

Dopo ogni round (match o no) il gioco **riparte da solo** dopo una breve pausa, invece
di richiedere che ENTRAMBI clicchino "Ancora". Si ferma solo quando uno dei due clicca
"Termina sessione". Elimina la situazione goffa in cui uno è già pronto e l'altro è
fermo a decidere.

## Contesto

- Schermata risultato (`app.html:4115-4139`): mostra esito + simboli, poi griglia 2
  bottoni: **"Ancora"** (`:4135`) e **"Termina sessione"** (`:4136`).
- **Scoperta chiave:** "Ancora" fa solo un **reset LOCALE** (`setShowResult(false)` +
  azzera simboli + `setWaitingForPartner(false)`). NON sincronizza col server.
  L'avanzamento vero del round è già gestito da `round_count` condiviso + il sender che
  pulisce i simboli dopo 4s (`:2255`). Quindi "Ancora" è solo un cancelletto UX, non
  parte della macchina di sincronizzazione → cambiarlo è a basso rischio.

## Design

**Auto-avanzamento:** quando `showResult` diventa true (e non c'è un banner che richiede
scelta, né sessione finita/partner disconnesso), parte un countdown di **4 secondi**; allo
scadere si esegue lo stesso reset che faceva "Ancora", tornando alla schermata di gioco.

**Perché 4s:** combacia col delay con cui il sender pulisce i simboli del round (`:2255`).
Ripartire prima rischierebbe di iniziare il round nuovo con i dati vecchi ancora nel DB.
4s è quindi anche il minimo tecnicamente sicuro, oltre che il tempo per "assaporare" l'esito.

**Indicatore:** al posto del pulsante "Ancora", la scritta **"Nuovo match tra {n}"** con
conto alla rovescia 4→3→2→1, così il cambio schermo non sembra un bug. "Termina sessione"
resta.

**Gate banner cambio livello:** ogni 7 round appare il banner "vuoi cambiare tipo di
telepatia?" che richiede una scelta. L'auto-avanzamento **non deve** scattare mentre
`showLevelBanner` è attivo (verificare il flag esatto in fase di impl).

## Componenti

### `app.html`
- Stato `resultCountdown` (number|null).
- `useEffect([showResult, showLevelBanner, sessionEnded, partnerDisconnected])`: se
  `showResult && !showLevelBanner && !sessionEnded && !partnerDisconnected` → set
  `resultCountdown=4`, `setInterval` 1s che decrementa fino a 1, `setTimeout` 4s che fa il
  reset (identico all'onClick "Ancora") + azzera countdown. Cleanup di interval/timeout
  nel return. Altrimenti `resultCountdown=null`.
- UI (`:4134-4137`): sostituire il bottone "Ancora" con un riquadro "Nuovo match tra
  {resultCountdown ?? 4}"; lasciare "Termina sessione".
- i18n `t.telepathy.nextMatchIn` ("New match in" / "Nuovo match tra").

### `test-telepathy.js`
I due loop a 7 round oggi cliccano "Ancora" dopo ogni round. Con l'auto-avanzamento il
bottone non c'è più: sostituire il click con un'**attesa dell'auto-avanzamento** (~4.5-5s,
finché ricompare il picker simboli / sparisce il risultato). Mantenere il test role-aware
già introdotto.

## Error handling / edge
- Reset locale identico a "Ancora" → comportamento del round successivo invariato (sicuro).
- I due client auto-avanzano in modo indipendente, leggermente sfasati (come prima coi
  click): il round successivo resta governato da `round_count` condiviso.
- Banner cambio livello (7 round) e banner ruoli (3 round, solo informativo auto-dismiss):
  il primo blocca l'auto-avanzamento, il secondo no.

## Testing
- Montaggio JSX pulito.
- `test-telepathy.js` aggiornato (no click "Ancora", attesa auto-avanzamento) → verde,
  incluso il check ruoli al round 4 e il banner cambio livello a 7.
- Verifica live dall'utente: il gioco scorre da solo, countdown visibile, "Termina" ferma.

## Out of scope (YAGNI)
- Pausa differenziata match/non-match. Animazioni elaborate. Countdown configurabile.
- Mantenere "Ancora" come "salta attesa" (scartato: l'utente vuole meno bottoni).
