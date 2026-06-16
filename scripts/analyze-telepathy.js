/**
 * Analisi statistica dell'indagine telepatia — Global Awakening
 * ============================================================================
 * Risponde a due domande sui dati di `telepathy_trials`:
 *   1) I match telepatici superano il PURO CASO? (ogni tentativo ha probabilità
 *      casuale 1/N, dove N = card_count = numero di figure tra cui scegliere)
 *   2) Ci sono riceventi particolarmente dotati? (tasso di successo individuale
 *      significativamente sopra il caso, con abbastanza tentativi)
 *
 * Modello nullo ("è solo fortuna"): ogni tentativo i è una prova di Bernoulli con
 * probabilità di successo p_i = 1/N_i. Gli N possono differire tra tentativi, quindi
 * il numero totale di azzeccati sotto il caso segue una Poisson-binomiale:
 *   attesi  μ = Σ p_i      varianza σ² = Σ p_i(1-p_i)
 * Si misura quanto gli azzeccati OSSERVATI si discostano da μ (z-score → p-value).
 * Per ogni singolo N usiamo invece il test binomiale ESATTO.
 *
 * IMPORTANTE (onestà statistica):
 *   - sotto MIN_TRIALS_GLOBAL tentativi NON si conclude nulla (anche un p basso è rumore);
 *   - un ricevente è valutato solo con almeno MIN_TRIALS_RECEIVER tentativi;
 *   - con più riceventi testati il rischio di falsi positivi cresce → soglia di
 *     significatività corretta con Bonferroni.
 *
 * Uso: node scripts/analyze-telepathy.js
 * Richiede SUPABASE_SERVICE_KEY in .env.test (telepathy_trials ha RLS senza policy).
 */
const fs = require('fs');
const path = require('path');

const SB = 'https://vxzxdkcluyrcftsnxxza.supabase.co';
const MIN_TRIALS_GLOBAL = 30;   // sotto questo: nessuna conclusione
const MIN_TRIALS_RECEIVER = 20; // tentativi minimi per valutare un singolo ricevente
const ALPHA = 0.05;             // soglia di significatività

function serviceKey() {
  const envPath = path.join(__dirname, '..', '.env.test');
  if (!fs.existsSync(envPath)) return null;
  const m = fs.readFileSync(envPath, 'utf8').match(/SUPABASE_SERVICE_KEY\s*=\s*(.+)/);
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : null;
}

// CDF normale standard via approssimazione di erf (Abramowitz-Stegun 7.1.26).
function normalCDF(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp(-z * z / 2);
  const p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z > 0 ? 1 - p : p;
}

// P(X >= k) per X ~ Binomiale(n, p). Esatto per n moderato; normale per n grande.
function binomTailGE(k, n, p) {
  if (k <= 0) return 1;
  if (k > n) return 0;
  if (n <= 1000) {
    let term = Math.pow(1 - p, n); // i = 0
    let cdf = term;
    for (let i = 1; i < k; i++) { term *= ((n - i + 1) / i) * (p / (1 - p)); cdf += term; }
    return Math.max(0, Math.min(1, 1 - cdf));
  }
  const mu = n * p, sigma = Math.sqrt(n * p * (1 - p));
  return 1 - normalCDF((k - 0.5 - mu) / sigma); // correzione di continuità
}

// p-value Poisson-binomiale (probabilità eterogenee) via approssimazione normale.
function poissonBinomTailGE(k, mu, varSum) {
  if (varSum <= 0) return k > mu ? 0 : 1;
  return 1 - normalCDF((k - 0.5 - mu) / Math.sqrt(varSum));
}

const pct = (x) => (x * 100).toFixed(1) + '%';
const fmtP = (p) => p < 0.0001 ? '< 0.0001' : p.toFixed(4);

// Esportate per il test della matematica (test-analyze-telepathy.js).
module.exports = { normalCDF, binomTailGE, poissonBinomTailGE };

async function main() {
  const key = serviceKey();
  if (!key) { console.error('❌ SUPABASE_SERVICE_KEY mancante in .env.test'); process.exit(1); }

  const res = await fetch(`${SB}/rest/v1/telepathy_trials?select=card_count,is_hit,receiver_id,mode,created_at`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  const trials = await res.json();
  if (!Array.isArray(trials)) { console.error('❌ Risposta inattesa:', JSON.stringify(trials)); process.exit(1); }

  // Considera solo i tentativi con N >= 2 valido (1/N ben definito).
  const valid = trials.filter(t => Number.isFinite(t.card_count) && t.card_count >= 2);

  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  INDAGINE TELEPATIA — Analisi statistica');
  console.log('══════════════════════════════════════════════════════════');
  console.log(`Tentativi totali registrati: ${trials.length}  (validi con N≥2: ${valid.length})`);
  const receivers = [...new Set(valid.map(t => t.receiver_id))];
  console.log(`Riceventi distinti: ${receivers.length}`);
  if (valid.length) {
    const dates = valid.map(t => t.created_at).sort();
    console.log(`Periodo: ${dates[0]?.slice(0, 10)} → ${dates[dates.length - 1]?.slice(0, 10)}`);
  }

  if (valid.length === 0) {
    console.log('\nNessun tentativo valido: la raccolta è attiva ma in attesa di partite reali.');
    return;
  }

  // ── 1) Complessivo: osservato vs caso ──────────────────────────────────────
  const hits = valid.filter(t => t.is_hit).length;
  const mu = valid.reduce((s, t) => s + 1 / t.card_count, 0);
  const varSum = valid.reduce((s, t) => s + (1 / t.card_count) * (1 - 1 / t.card_count), 0);
  const pGlobal = poissonBinomTailGE(hits, mu, varSum);

  console.log('\n── 1) I match superano il caso? ───────────────────────────');
  console.log(`Azzeccati osservati: ${hits} su ${valid.length} (${pct(hits / valid.length)})`);
  console.log(`Attesi dal puro caso: ${mu.toFixed(1)} (${pct(mu / valid.length)})`);
  console.log(`Lift sul caso: ${mu > 0 ? '×' + (hits / mu).toFixed(2) : 'n/d'}`);
  console.log(`p-value (prob. che sia fortuna): ${fmtP(pGlobal)}`);

  if (valid.length < MIN_TRIALS_GLOBAL) {
    console.log(`\n⚠️  CAMPIONE INSUFFICIENTE (${valid.length} < ${MIN_TRIALS_GLOBAL}): nessuna conclusione affidabile.`);
    console.log('    Servono più partite reali. Il p-value sopra è puramente indicativo.');
  } else if (pGlobal < ALPHA && hits > mu) {
    console.log(`\n✅ SEGNALE: gli azzeccati superano il caso in modo statisticamente significativo (p < ${ALPHA}).`);
  } else {
    console.log(`\n➖ Nessuna evidenza che si superi il caso (p ≥ ${ALPHA}).`);
  }

  // ── per numero di figure (N) ────────────────────────────────────────────────
  console.log('\n── Dettaglio per numero di figure (N) ─────────────────────');
  const byN = {};
  for (const t of valid) { (byN[t.card_count] ||= { tot: 0, hit: 0 }).tot++; if (t.is_hit) byN[t.card_count].hit++; }
  for (const n of Object.keys(byN).map(Number).sort((a, b) => a - b)) {
    const { tot, hit } = byN[n];
    const p = binomTailGE(hit, tot, 1 / n);
    console.log(`  N=${n}: ${hit}/${tot} = ${pct(hit / tot)} (caso ${pct(1 / n)})  p=${fmtP(p)}`);
  }

  // ── 2) Riceventi dotati ─────────────────────────────────────────────────────
  console.log('\n── 2) Riceventi particolarmente dotati? ───────────────────');
  const perRecv = {};
  for (const t of valid) {
    const r = (perRecv[t.receiver_id] ||= { tot: 0, hit: 0, mu: 0, varSum: 0 });
    r.tot++; if (t.is_hit) r.hit++;
    r.mu += 1 / t.card_count; r.varSum += (1 / t.card_count) * (1 - 1 / t.card_count);
  }
  const eligible = Object.entries(perRecv).filter(([, r]) => r.tot >= MIN_TRIALS_RECEIVER);
  if (eligible.length === 0) {
    console.log(`Nessun ricevente ha ancora ≥ ${MIN_TRIALS_RECEIVER} tentativi: troppo presto per individuare i "dotati".`);
  } else {
    const alphaCorr = ALPHA / eligible.length; // Bonferroni
    console.log(`Soglia significatività corretta (Bonferroni, ${eligible.length} testati): p < ${alphaCorr.toFixed(4)}\n`);
    const ranked = eligible.map(([id, r]) => ({ id, ...r, p: poissonBinomTailGE(r.hit, r.mu, r.varSum), lift: r.hit / r.mu }))
      .sort((a, b) => a.p - b.p);
    for (const r of ranked) {
      const flag = (r.p < alphaCorr && r.hit > r.mu) ? '⭐ SOPRA IL CASO (significativo)' : (r.p < ALPHA && r.hit > r.mu ? '↑ sopra il caso (non sig. dopo correzione)' : '—');
      console.log(`  ${r.id}: ${r.hit}/${r.tot} (${pct(r.hit / r.tot)}), atteso ${r.mu.toFixed(1)}, ×${r.lift.toFixed(2)}, p=${fmtP(r.p)}  ${flag}`);
    }
  }

  console.log('\n══════════════════════════════════════════════════════════\n');
}

if (require.main === module) main();
