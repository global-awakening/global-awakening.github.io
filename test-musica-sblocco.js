/**
 * Avvio della musica quando il browser non la lascia partire. node test-musica-sblocco.js
 *
 * Perché questo test esiste, e perché NON usa un browser vero:
 *
 * Il 22/09/2026, sul telefono di Irene, la musica dei rituali non partiva. La causa è emersa
 * solo dal vivo: aprendo l'app da una notifica push, la pagina è appena nata e la persona non
 * ha ancora toccato niente, e Chrome su Android si rifiuta di far uscire audio finché non c'è
 * un gesto. L'app chiedeva `play()`, si sentiva dire di no, e buttava via il rifiuto
 * (`p.catch(() => {})`): nessun suono, nessun messaggio, nessun modo di accorgersene.
 *
 * test-musica.js non poteva prenderlo e non lo prenderà mai: Playwright avvia Chromium con
 * `--autoplay-policy=no-user-gesture-required`, cioè con la regola che causa il problema
 * disattivata. Un browser vero qui mentirebbe. Quindi l'elemento audio è finto e il rifiuto
 * è deciso dal test: così la regressione è deterministica e gira ovunque, senza rete.
 *
 * Quello che il browser vero deve fare — riconoscere il nostro ascolto come "gesto" — è
 * compito suo e si verifica dal telefono, non da qui.
 */
const { avviaMusica, fermaMusica } = require('./music-helpers.js');

let passati = 0, falliti = 0;
const ok = (n) => { console.log('✅ ' + n); passati++; };
const ko = (n, d) => { console.error('❌ ' + n + ' — ' + d); falliti++; process.exitCode = 1; };
const atteso = (n, ottenuto, voluto) => (ottenuto === voluto
  ? ok(n)
  : ko(n, `atteso ${JSON.stringify(voluto)}, ottenuto ${JSON.stringify(ottenuto)}`));
const attendi = (ms) => new Promise((r) => setTimeout(r, ms));

// Un elemento audio finto. `esitoPlay` decide cosa risponde il browser, così possiamo
// riprodurre a comando il rifiuto che sul PC non si verifica mai.
function audioFinto({ esitoPlay = 'ok', volumeBloccato = false, nomeErrore = 'NotAllowedError' } = {}) {
  const el = {
    paused: true,
    _volume: 1,
    chiamatePlay: 0,
    chiamatePause: 0,
    ascolti: {},
    risolviPlay: null,          // valorizzato con esitoPlay: 'pendente'
    get volume() { return this._volume; },
    set volume(v) { if (!volumeBloccato) this._volume = v; },
    play() {
      this.chiamatePlay++;
      if (esitoPlay === 'rifiuta') return Promise.reject(new DOMExceptionFinta(nomeErrore));
      if (esitoPlay === 'solleva') throw new DOMExceptionFinta(nomeErrore);
      if (esitoPlay === 'pendente') {
        // Il brano da 18 MB ci mette: la promise resta in volo finché non la sciogliamo noi.
        return new Promise((r) => { this.risolviPlay = () => { this.paused = false; r(); }; });
      }
      this.paused = false;
      return Promise.resolve();
    },
    pause() { this.chiamatePause++; this.paused = true; },
    addEventListener(tipo, fn) { (this.ascolti[tipo] = this.ascolti[tipo] || []).push(fn); },
    removeEventListener(tipo, fn) {
      this.ascolti[tipo] = (this.ascolti[tipo] || []).filter((f) => f !== fn);
    },
    // simula il browser che mette in pausa da solo
    pausaDalBrowser() { this.paused = true; (this.ascolti.pause || []).forEach((f) => f()); }
  };
  return el;
}
class DOMExceptionFinta extends Error {
  constructor(nome) {
    super('play() failed because the user didn\'t interact with the document first');
    this.name = nome || 'NotAllowedError';
  }
}

// Un documento finto: registra gli ascolti e sa simulare un tocco.
function documentoFinto() {
  return {
    ascolti: [],
    addEventListener(tipo, fn, opz) { this.ascolti.push({ tipo, fn, opz }); },
    removeEventListener(tipo, fn) { this.ascolti = this.ascolti.filter((a) => a.fn !== fn); },
    tocca() { this.ascolti.filter((a) => a.tipo === 'pointerdown').forEach((a) => a.fn()); }
  };
}

const opzioni = (doc, stati, gesti) => ({
  volume: 0.35, passo: 0.05, intervallo: 1, documento: doc,
  onStato: (s) => stati.push(s),
  onGesto: () => { if (gesti) gesti.push('gesto'); }
});

(async () => {
  // 1. Il caso normale: il browser dice di sì, il volume sale fino a destinazione.
  {
    const el = audioFinto(), doc = documentoFinto(), stati = [];
    avviaMusica(el, opzioni(doc, stati));
    await attendi(400);
    atteso('play() accettato → riproduce', el.paused, false);
    atteso('play() accettato → il volume arriva a destinazione', +el.volume.toFixed(2), 0.35);
    atteso('play() accettato → stato riportato', stati[stati.length - 1], 'in-riproduzione');
    atteso('play() accettato → nessun ascolto lasciato appeso', doc.ascolti.length, 0);
  }

  // 2. Il caso del telefono: rifiuto. Deve restare in attesa, non arrendersi in silenzio.
  {
    const el = audioFinto({ esitoPlay: 'rifiuta' }), doc = documentoFinto(), stati = [];
    avviaMusica(el, opzioni(doc, stati));
    await attendi(20);
    atteso('play() rifiutato → lo stato lo dichiara', stati[stati.length - 1], 'in-attesa-di-gesto');
    atteso('play() rifiutato → resta in ascolto del primo gesto', doc.ascolti.length > 0, true);
    atteso('play() rifiutato → non dichiara mai di star suonando', stati.indexOf('in-riproduzione'), -1);
  }

  // 3. E al primo gesto riparte da sola: è tutto il punto della correzione.
  {
    const el = audioFinto({ esitoPlay: 'rifiuta' }), doc = documentoFinto(), stati = [], gesti = [];
    avviaMusica(el, opzioni(doc, stati, gesti));
    await attendi(20);
    el.play = audioFinto().play.bind(el);   // col gesto il browser ora accetta
    doc.tocca();
    // Dentro il gesto, prima di qualsiasi attesa: dallo stesso tocco nascerà un `click`, e il
    // pulsante 🔊 deve poterlo riconoscere per non silenziare quello che si è appena sbloccato.
    atteso('al primo tocco → l\'avviso arriva subito, dentro il gesto', gesti.length, 1);
    await attendi(400);
    atteso('al primo tocco → riparte', el.paused, false);
    atteso('al primo tocco → il volume sale', +el.volume.toFixed(2), 0.35);
    atteso('al primo tocco → stato aggiornato', stati[stati.length - 1], 'in-riproduzione');
    atteso('al primo tocco → l\'ascolto viene smontato', doc.ascolti.length, 0);
  }

  // 4. play() che solleva invece di rifiutare (browser vecchi): stessa strada, non un crash.
  {
    const el = audioFinto({ esitoPlay: 'solleva' }), doc = documentoFinto(), stati = [];
    avviaMusica(el, opzioni(doc, stati));
    await attendi(20);
    atteso('play() che solleva → trattato come rifiuto', stati[stati.length - 1], 'in-attesa-di-gesto');
  }

  // 5. Il secondo modo in cui il telefono ci blocca, ed è quello invisibile: play() passa —
  //    partiamo a volume zero, e per il browser "volume zero" è "muto" — e la pausa arriva
  //    dopo, nel momento in cui la dissolvenza rialza il volume. Qui la dissolvenza è lenta
  //    apposta: la pausa deve cadere mentre è IN CORSO, non a caso.
  {
    const el = audioFinto(), doc = documentoFinto(), stati = [];
    avviaMusica(el, { volume: 0.35, passo: 0.05, intervallo: 30, documento: doc, onStato: (s) => stati.push(s) });
    await attendi(70);
    atteso('la dissolvenza è davvero ancora in corso', el.volume < 0.35, true);
    el.pausaDalBrowser();
    await attendi(30);
    atteso('pausa durante la dissolvenza → torna in attesa di un gesto', stati[stati.length - 1], 'in-attesa-di-gesto');
    atteso('pausa durante la dissolvenza → resta in ascolto', doc.ascolti.length > 0, true);
  }

  // 5-bis. A dissolvenza finita una pausa non è più il browser: è la persona, dai comandi
  //    multimediali della schermata di blocco, o una telefonata in arrivo. Farla ripartire al
  //    primo tocco sarebbe andarle contro.
  {
    const el = audioFinto(), doc = documentoFinto(), stati = [];
    avviaMusica(el, opzioni(doc, stati));
    await attendi(400);
    el.pausaDalBrowser();
    await attendi(30);
    atteso('pausa a dissolvenza finita → non rimette nessun ascolto', doc.ascolti.length, 0);
    atteso('pausa a dissolvenza finita → non si dichiara in attesa', stati.indexOf('in-attesa-di-gesto'), -1);
  }

  // 6. Un brano che non arriva — offline il service worker tiene gli mp3 fuori dalla cache —
  //    non è un problema che un gesto possa risolvere. Riprovare a ogni tocco vorrebbe dire
  //    chiedere 18 MB a ogni tocco, e lasciare un pulsante che non risponde mai più.
  {
    const el = audioFinto({ esitoPlay: 'rifiuta', nomeErrore: 'NotSupportedError' });
    const doc = documentoFinto(), stati = [];
    avviaMusica(el, opzioni(doc, stati));
    await attendi(20);
    atteso('brano non disponibile → lo dichiara', stati[stati.length - 1], 'non-disponibile');
    atteso('brano non disponibile → non resta in ascolto di gesti', doc.ascolti.length, 0);
  }

  // 7. Annullamento mentre play() è ancora in volo — il brano pesa 18 MB, succede davvero.
  //    Senza la pausa esplicita l'audio parte un istante DOPO, in loop, senza più nessuno
  //    che lo sorvegli: musica che suona a rituale finito e non si spegne.
  {
    const el = audioFinto({ esitoPlay: 'pendente' }), doc = documentoFinto(), stati = [];
    const annulla = avviaMusica(el, opzioni(doc, stati));
    await attendi(20);
    annulla();
    el.risolviPlay();            // il browser dice di sì, ma ormai è tardi
    await attendi(30);
    atteso('annullato con play in volo → mette in pausa', el.chiamatePause > 0, true);
    atteso('annullato con play in volo → non resta in riproduzione', el.paused, true);
  }

  // 8. Smontando tutto non devono restare ascolti che risvegliano la musica a sorpresa
  //    dentro un rituale finito.
  {
    const el = audioFinto({ esitoPlay: 'rifiuta' }), doc = documentoFinto(), stati = [];
    const annulla = avviaMusica(el, opzioni(doc, stati));
    await attendi(20);
    annulla();
    atteso('annullando → nessun ascolto sul documento', doc.ascolti.length, 0);
    const primaDelTocco = el.chiamatePlay;
    doc.tocca();
    await attendi(20);
    atteso('annullando → un tocco non fa ripartire niente', el.chiamatePlay, primaDelTocco);
  }

  // 9. Lo spegnimento: dissolvenza e pausa vera.
  {
    const el = audioFinto();
    el.paused = false; el.volume = 0.35;
    fermaMusica(el, { passo: 0.05, intervallo: 1 });
    await attendi(400);
    atteso('spegnimento → mette in pausa', el.paused, true);
    atteso('spegnimento → a volume zero', +el.volume.toFixed(2), 0);
  }

  // 10. Ci sono telefoni dove il volume via codice non si può cambiare. Lì la dissolvenza non
  //    scenderà mai, e senza questa guardia `pause()` non verrebbe chiamato MAI: la musica
  //    continuerebbe a suonare a rituale finito, senza modo di spegnerla.
  {
    const el = audioFinto({ volumeBloccato: true });
    el.paused = false;
    fermaMusica(el, { passo: 0.05, intervallo: 1 });
    await attendi(400);
    atteso('volume non modificabile → mette in pausa lo stesso', el.paused, true);
  }

  console.log(`\n${passati} passati, ${falliti} falliti`);
})();
