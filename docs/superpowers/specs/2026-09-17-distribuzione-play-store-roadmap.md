# Distribuzione su Google Play Store — Roadmap · Design

Data: 2026-09-17
Stato: in revisione
Tipo: documento ombrello (decompone in 3 sotto-progetti)

## Obiettivo

Portare Global Awakening sul Google Play Store come **TWA** (Trusted Web Activity):
un guscio Android che apre la PWA esistente a schermo intero. Il sito resta
`https://global-awakening.github.io/`, il codice applicativo resta lo stesso.

## Vincolo dominante: 12 tester / 14 giorni

L'account Play sarà **personale e nuovo** (decisione utente, 2026-09-17), quindi
ricade in pieno nella regola per gli account personali creati dopo il 13/11/2023:

- almeno **12 tester** iscritti (opt-in) al closed testing alla richiesta di produzione;
- iscritti **ininterrottamente nei 14 giorni precedenti** (un drop-out azzera il contatore);
- dal 2026 Google verifica anche l'**uso reale** dell'app e chiede quale feedback è
  stato raccolto e quali modifiche ne sono seguite;
- i tester devono avere **Android** (o tablet Android / Chromebook): iPhone non conta.

Bacino tester identificato: ~5-6 (Francesco prete, fratello, mamma, Francesco capo,
Dario, Claudio) più reclutamento dalla cerchia personale e dalla community spirituale.
Nicolas (iPhone) resta tester della PWA ma **non conta** per il contatore.

Il vincolo è di calendario, non tecnico: è il cammino critico dell'intero progetto.

## Decomposizione in sotto-progetti

### SP1 — Moderazione: segnalazione e blocco (l'unico sviluppo vero)

Google Play richiede, per le app con contenuti generati dagli utenti e interazione fra
utenti, un meccanismo **in-app** per segnalare contenuti o utenti e per **bloccare**
altri utenti. Oggi l'app non ha né l'uno né l'altro.

Superfici UGC presenti: `consciousness_posts`, `consciousness_comments`, `rituals`,
`ritual_comments`, `private_messages`, `telepathy_chat`, `profiles.bio` più il nickname.

→ Spec dedicata: `2026-09-17-moderazione-segnalazione-blocco-design.md`

**Va completato prima che i 12 tester inizino**: è codice che i tester devono provare.

### SP2 — Prerequisiti web (poche ore)

File nuovi accanto al sito, nessuna modifica alla logica applicativa:

| File | Scopo |
|---|---|
| `.well-known/assetlinks.json` | Digital Asset Links: prova a Chrome che l'app Android e il dominio sono la stessa entità. Senza, la TWA mostra la barra del browser. |
| `privacy.html` | Informativa privacy raggiungibile **senza login e senza installare l'app** (URL obbligatorio in Play Console). Oggi la privacy esiste solo dentro l'app. |
| `elimina-account.html` | Pagina web per richiedere la cancellazione account, obbligatoria per le app con registrazione. L'eliminazione in-app esiste già (`delete_my_account`). |
| `regole.html` | Regolamento contenuti: cosa è inaccettabile e come si segnala. Richiesto dalla policy UGC, referenziato da SP1. |
| `manifest.webmanifest` | Aggiunta del campo `id` e degli `screenshots` (migliorano scheda e installazione). |

Il repo è `global-awakening/global-awakening.github.io`, quindi il sito sta sulla radice
del dominio: `.well-known/` è collocabile senza problemi.

### SP3 — Play Console e pubblicazione (4-6 settimane di calendario)

1. Apertura account developer personale (25 USD una tantum) con l'identità neutra
   `global.awakening.app@gmail.com`.
2. **Verifica d'identità** Google (documento; richiede giorni, non ore).
3. Packaging TWA con **PWABuilder** (da browser, nessun tool locale) → `.aab` +
   `assetlinks.json`. Piano B: Bubblewrap CLI, scartato per non installare JDK e Android
   SDK sul portatile aziendale (attriti CrowdStrike già sperimentati sul launcher).
4. Scheda store: descrizione breve e lunga, screenshot telefono, icona 512, feature
   graphic 1024×500, categoria, contatti.
5. Moduli obbligatori: **Data safety** (l'app raccoglie email, nickname e messaggi via
   Supabase), **content rating**, target audience, dichiarazione UGC.
6. **Closed testing**: creazione del track, invito dei 12+, 14 giorni pieni, raccolta
   del feedback.
7. Richiesta di accesso alla produzione più revisione manuale di Google.

## Ordine di esecuzione

SP1 e SP2 sono indipendenti e possono procedere in parallelo. SP3 passi 1-2 conviene
avviarli **subito**, in parallelo a SP1, perché la verifica d'identità è lenta e non
dipende da nulla. Il closed testing (SP3 passo 6) parte solo quando SP1 e SP2 sono in
produzione, altrimenti i tester proverebbero un'app destinata al rifiuto.

```
subito        SP3.1 SP3.2 (account + verifica identità)   [attesa Google]
in parallelo  SP1 (moderazione)  +  SP2 (pagine web)
poi           SP3.3 SP3.4 SP3.5 (packaging + scheda)
poi           SP3.6 closed testing ──── 14 giorni pieni ────
infine        SP3.7 richiesta produzione + revisione Google
```

## Fuori scope

- iOS e App Store (la PWA su iPhone resta installabile da Safari).
- Notifiche push native.
- Monetizzazione, acquisti in-app, abbonamenti.
- Refactor di `src/app.jsx` oltre a quanto serve a SP1.

## Fonti

- https://support.google.com/googleplay/android-developer/answer/14151465
