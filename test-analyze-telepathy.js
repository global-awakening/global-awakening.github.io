/**
 * Test della matematica statistica di scripts/analyze-telepathy.js.
 * Verifica normalCDF / binomTailGE / poissonBinomTailGE con valori noti, così
 * le conclusioni dell'indagine poggiano su funzioni corrette. Niente DB.
 *
 * Uso: node test-analyze-telepathy.js
 */
const { normalCDF, binomTailGE, poissonBinomTailGE } = require('./scripts/analyze-telepathy');

let passed = 0, failed = 0;
function approx(got, exp, tol, msg) {
  if (Math.abs(got - exp) <= tol) { console.log(`  ✅ ${msg} (${got.toFixed(5)} ≈ ${exp})`); passed++; }
  else { console.log(`  ❌ ${msg}: ottenuto ${got.toFixed(5)}, atteso ${exp} (tol ${tol})`); failed++; process.exitCode = 1; }
}

console.log('— normalCDF (valori noti) —');
approx(normalCDF(0), 0.5, 1e-6, 'Φ(0) = 0.5');
approx(normalCDF(1.645), 0.95, 2e-3, 'Φ(1.645) ≈ 0.95');
approx(normalCDF(1.96), 0.975, 2e-3, 'Φ(1.96) ≈ 0.975');
approx(normalCDF(-1.96), 0.025, 2e-3, 'Φ(-1.96) ≈ 0.025');
approx(normalCDF(2.576), 0.995, 2e-3, 'Φ(2.576) ≈ 0.995');

console.log('— binomTailGE P(X≥k), X~Binom(n,p) (valori esatti noti) —');
approx(binomTailGE(0, 10, 0.5), 1, 1e-9, 'P(X≥0) = 1');
approx(binomTailGE(10, 10, 0.5), Math.pow(0.5, 10), 1e-9, 'P(X≥10 | 10,0.5) = 0.5^10');
approx(binomTailGE(1, 10, 0.5), 1 - Math.pow(0.5, 10), 1e-9, 'P(X≥1 | 10,0.5) = 1 - 0.5^10');
approx(binomTailGE(5, 10, 0.5), 0.623046875, 1e-6, 'P(X≥5 | 10,0.5) = 0.6230 (fair coin)');
approx(binomTailGE(11, 10, 0.5), 0, 1e-9, 'P(X≥11 | n=10) = 0 (k>n)');
// Dado a 6 facce, 12 lanci: P(almeno 4 volte la faccia giusta), p=1/6
// P(X>=4) con Binom(12,1/6) ≈ 0.1252 (riferimento calcolato indipendentemente)
approx(binomTailGE(4, 12, 1 / 6), 0.1252, 2e-3, 'P(X≥4 | 12,1/6) ≈ 0.1252');

console.log('— poissonBinomTailGE (approssimazione normale) —');
// Con p costante coincide ~ con la normale del binomiale: n=100, p=0.5, k=60
// μ=50, σ=5, z=(60-0.5-50)/5=1.9 → 1-Φ(1.9)≈0.0287
approx(poissonBinomTailGE(60, 50, 25), 1 - normalCDF(1.9), 1e-9, 'PB(k=60, μ=50, σ²=25) coerente con normale');
// k = μ → ~0.5 (con correzione di continuità leggermente sopra)
approx(poissonBinomTailGE(50, 50, 25), 1 - normalCDF(-0.1), 1e-9, 'PB(k=μ) ≈ 0.54 (continuità)');

console.log(`\nRisultato: ${passed} passati, ${failed} falliti`);
