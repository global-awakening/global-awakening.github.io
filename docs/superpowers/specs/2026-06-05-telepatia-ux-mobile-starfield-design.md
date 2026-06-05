# UX telepatia mobile + starfield warp + fix riepilogo — Design

**Data:** 2026-06-05 · **Origine:** test dal vivo dell'utente (browser + PWA), 5 osservazioni.
**Vincolo trasversale:** app **precompilata** → la logica si modifica in `src/app.jsx`, poi `node build.js` rigenera `app.js` e ricalcola gli hash CSP degli script inline di `app.html`. Lo starfield è uno script **inline** in `app.html` → modificandolo, la build aggiorna da sola il suo hash CSP.

## Obiettivo
Rendere la schermata di **sessione** telepatia usabile su mobile e correggere un bug del riepilogo. Desktop sostanzialmente invariato (i cambi mobile sono guidati da media query). Suite E2E (che gira a viewport desktop) deve restare verde.

## Stato attuale (rilevato)
Schermata sessione (`src/app.jsx`): container 3-colonne `display:flex; flex-wrap:wrap` (`~:3441`) →
- **INFO** `flex:0 0 180px` (`~:3480`): card Partner+Ruolo + card Round/Match/Livello/Precisione.
- **GIOCO** `flex:1 1 280px` (`~:3510`): banda stato + picker simboli / risultato.
- **CHAT** `flex:0 0 200px` (`~:3646`).
Su mobile impilano nell'ordine DOM: INFO → GIOCO → CHAT → l'azione (simboli) finisce in mezzo, la chat in fondo. Lo starfield è un canvas (`#starfield`) animato da una IIFE inline (`app.html ~:493`).

## Design (5 interventi)

### A. Layout mobile "azione prima" (solo `≤768px`, desktop invariato)
Assegno classi alle 3 colonne (`tele-col-info`, `tele-col-game`, `tele-col-chat`) e al container (`tele-session`). In `@media(max-width:768px)`: container `flex-direction:column`; `order` → GIOCO 1, INFO 2, CHAT 3. La card INFO su mobile diventa una **striscia compatta su una riga** (ruolo · round · match · livello, font ~0.78rem) — su desktop resta la card attuale (gestito con una variante mobile via CSS o un blocco condizionale a classe). Header sessione ("Telepathy Training" + sottotitolo) ridotto/nascosto su mobile durante sessione attiva.

### B. Simboli del receiver bloccati fino all'invio del sender
Esiste già `senderHasSent` (`:748`). Nel blocco render receiver (`~:3569`): finché `!senderHasSent`, la griglia simboli ha `opacity:.3; filter:grayscale(1); pointer-events:none` (classe `symbols-locked`) e il messaggio è "Aspetta che {partner} invii…"; a `senderHasSent` la griglia torna piena/cliccabile e il messaggio "✨ Simbolo inviato! Quale ricevi?". Rimuovo la copy fuorviante `waitingForSend` "puoi già scegliere" → nuovo testo d'attesa. Il bottone "Conferma" resta disabilitato finché `!guessedSymbol` (già così).

### C. Swap ruoli evidente al centro
Nuovo overlay centrato (non un banner inline): quando i ruoli cambiano (inizio round con `roundCount>0 && roundCount%3===0`), mostra una card centrale grande "🔄 Ruoli invertiti! / Ora sei il **MITTENTE/RICEVENTE**", animazione scale+fade-in, **auto-dismiss ~2,2s** + tap-to-dismiss. Stato dedicato `roleSwapOverlay` (settato quando si entra in un round multiplo di 3 con ruolo cambiato; `setTimeout` 2200ms per chiudere; clear su fine sessione/unmount). Non blocca il gioco sotto. Sostituisce/affianca l'attuale avviso derivato timido. i18n: riuso `t.telepathy.roleSwapped*` se presenti, altrimenti nuove chiavi `roleSwapTitle`/`roleSwapNowSender`/`roleSwapNowReceiver` IT/EN.

### D. Starfield "warp" (viaggio nello spazio)
Riscrivo la IIFE dello starfield (`app.html`) come campo di stelle in prospettiva: ogni stella ha (x,y,z); a ogni frame `z` decresce (si avvicina), proiezione `screenX = cx + x/z*scale`; quando `z<=0` la stella si rigenera in fondo (z=max) con x,y casuali. Scia leggera (linea dal frame precedente) per senso di velocità. **~180 stelle**, `requestAnimationFrame`, **pausa su `document.hidden`** (`visibilitychange`) per batteria/perf, resize-aware. Velocità moderata (non epilettica). Resta dietro tutto (`z-index:-1`). Rispetta `prefers-reduced-motion`: se attivo, stelle quasi ferme (no warp) per accessibilità.

### E. Fix bug riepilogo (icona inviato/ricevuto a volte vuota)
Causa probabile: nel recap l'icona si ricava con `getCurrentSymbols(currentLevel).find(s=>s.id===…)?.icon`, ma `currentLevel` può essere cambiato (cambio modalità) rispetto a quando il simbolo è stato scelto → `find` fallisce → `undefined` → vuoto. Fix: **congelare la modalità del round risolto** in uno stato dedicato (`resultLevel`) impostato insieme a `setShowResult(true)` in `pollResult`, e nel recap usare `getCurrentSymbols(resultLevel)` invece di `currentLevel`. Fallback: se l'icona resta non trovata, mostrare un placeholder neutro ("·") invece di vuoto. Da confermare con debugging prima del fix definitivo.

## File toccati
- `src/app.jsx`: render sessione (A: classi/ordine, info compatta; B: gating; C: overlay+stato; E: resultLevel + recap), eventuali nuove chiavi i18n (C).
- `app.html`: CSS (A: media query/order/striscia, B: `.symbols-locked`, C: overlay+keyframe); starfield inline (D).
- `build.js`: nessuna modifica (ricalcola hash CSP da solo).
- `test-telepathy.js`: nuovi check (B: receiver bloccato fino a senderHasSent; E: recap mostra icone non vuote, se testabile in modo stabile).

## Test & verifica
- E2E `test-telepathy`/`messaggi`/`rituali` verdi (girano a viewport desktop → A/C/D invariati lì).
- Smoke: build idempotente, 0 errori console, 0 violazioni CSP (la nuova starfield inline rientra negli hash), app.js 200, SW ok.
- Screenshot mobile (390px) per A/B/C; verifica visiva starfield.
- Code review del diff (codex/requesting-code-review) prima del deploy.

## Fuori scope
- Riscrittura del client Supabase / realtime. Nessuna modifica DB. Nessun cambio al flusso a turni del cambio-modalità (solo la sua *presentazione*, punto C).

## Rischi
- **Duplicazione layout mobile/desktop** della card INFO → gestire con CSS, evitare due blocchi JSX divergenti se possibile.
- **Bug E (race)**: se la causa reale è diversa (es. `partnerSymbol` null al render), il fix `resultLevel` non basta → diagnosticare con log prima di committare.
- **Starfield perf**: tenere conteggio stelle basso + pausa background; rispettare reduced-motion.
- **CSP**: cambiare lo starfield inline cambia l'hash → DEVE girare `node build.js` o lo script viene bloccato (lezione 06-05).
