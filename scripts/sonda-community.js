/**
 * sonda-community.js — sul DB vero: con la chiave pubblica si possono ancora modificare o
 * cancellare post e commenti della Community?
 *
 * Scrive un post e un commento di prova (come fa l'app), prova a riscriverli e cancellarli con la
 * chiave pubblica, controlla con la chiave di servizio cos'è rimasto, poi pulisce.
 *   node scripts/sonda-community.js            prima della 38: le falle note escono con ⏳
 *   node scripts/sonda-community.js --dopo-38  dopo la 38: ogni scrittura fuori posto è un ❌
 * Serve SUPABASE_SERVICE_KEY (env o .env.test), come gli altri test.
 */
const { SUPABASE_URL, requireServiceKey, getServiceKey, purge } = require('../test-helpers');

const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4enhka2NsdXlyY2Z0c254eHphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzMzcyMTcsImV4cCI6MjA4NjkxMzIxN30.m_mzWHH1-ajVqeSFvuJAm8t5Kz7I7umcEKBrRPr5JXM';
const DOPO = process.argv.includes('--dopo-38');
const NICK = `SondaCom_${Date.now()}`;

let passati = 0, falliti = 0, attese = 0;
const check = (ok, m, d) => {
  if (ok) { console.log(`  ✅ ${m}`); passati++; return; }
  console.log(`  ❌ ${m}${d === undefined ? '' : ' — ' + JSON.stringify(d)}`); falliti++; process.exitCode = 1;
};
// Prima della 38 la falla c'è ancora: si segna senza far fallire.
const chiusa = (ok, m, d) => {
  if (ok || DOPO) return check(ok, m, d);
  console.log(`  ⏳ ${m} (falla nota, si chiude con la 38)`); attese++;
};

async function rest(chiave, path, opts = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: { apikey: chiave, Authorization: `Bearer ${chiave}`, 'Content-Type': 'application/json',
               Prefer: 'return=representation', ...opts.headers },
  });
  const testo = await r.text();
  let corpo; try { corpo = JSON.parse(testo); } catch { corpo = testo; }
  return { status: r.status, corpo };
}

(async () => {
  requireServiceKey();
  const SVC = getServiceKey();
  const e = encodeURIComponent;
  try {
    console.log(`— Scrittura come l'app (${NICK}) —`);
    const post = await rest(ANON, 'consciousness_posts', { method: 'POST', body: JSON.stringify({ author_nickname: NICK, content: 'post della sonda' }) });
    const pid = Array.isArray(post.corpo) && post.corpo[0] && post.corpo[0].id;
    check(post.status === 201 && pid, 'anon scrive un post e lo riceve indietro', post);
    const com = await rest(ANON, 'consciousness_comments', { method: 'POST', body: JSON.stringify({ post_id: pid, author_nickname: NICK, content: 'commento della sonda' }) });
    check(com.status === 201, 'anon scrive un commento', com);
    const lett = await rest(ANON, `consciousness_comments?post_id=eq.${pid}&select=*`);
    check(Array.isArray(lett.corpo) && lett.corpo.length === 1, 'anon legge il commento', lett);
    const lettP = await rest(ANON, 'consciousness_posts?select=*&order=created_at.desc&limit=50');
    check(Array.isArray(lettP.corpo) && lettP.corpo.some(p => p.id === pid), 'anon legge il feed dei post', lettP.status);

    console.log('— Scritture che non devono passare —');
    await rest(ANON, `consciousness_posts?id=eq.${pid}`, { method: 'PATCH', body: JSON.stringify({ content: 'riscritto' }) });
    await rest(ANON, `consciousness_comments?post_id=eq.${pid}`, { method: 'PATCH', body: JSON.stringify({ content: 'riscritto' }) });
    const p2 = await rest(SVC, `consciousness_posts?id=eq.${pid}&select=content`);
    chiusa(p2.corpo[0] && p2.corpo[0].content === 'post della sonda', 'anon non riscrive un post', p2.corpo);
    const c2 = await rest(SVC, `consciousness_comments?post_id=eq.${pid}&select=content`);
    chiusa(c2.corpo[0] && c2.corpo[0].content === 'commento della sonda', 'anon non riscrive un commento', c2.corpo);

    await rest(ANON, `consciousness_comments?post_id=eq.${pid}`, { method: 'DELETE' });
    const c3 = await rest(SVC, `consciousness_comments?post_id=eq.${pid}&select=id`);
    chiusa(Array.isArray(c3.corpo) && c3.corpo.length === 1, 'anon non cancella un commento', c3.corpo);
    await rest(ANON, `consciousness_posts?id=eq.${pid}`, { method: 'DELETE' });
    const p3 = await rest(SVC, `consciousness_posts?id=eq.${pid}&select=id`);
    chiusa(Array.isArray(p3.corpo) && p3.corpo.length === 1, 'anon non cancella un post', p3.corpo);

    const retro = await rest(ANON, 'consciousness_posts', { method: 'POST', body: JSON.stringify({ author_nickname: NICK, content: 'retrodatato', created_at: '2020-01-01T00:00:00Z' }) });
    chiusa(retro.status >= 400, 'anon non sceglie la data di un post', retro.status);

    // ritual_comments: id che non esiste, così non si tocca niente di vero nemmeno prima della 38.
    const rc = await rest(ANON, 'ritual_comments?id=eq.-1', { method: 'DELETE' });
    chiusa(rc.status === 401 || rc.status === 403, 'anon non ha più il permesso di cancellare commenti dei rituali', rc.status);
  } finally {
    await purge(SUPABASE_URL, [
      `consciousness_comments?author_nickname=eq.${e(NICK)}`,
      `consciousness_posts?author_nickname=eq.${e(NICK)}`,
    ], { label: 'sonda-community' });
  }
  console.log(`\nRisultato: ${passati} passati, ${falliti} falliti${attese ? `, ${attese} falle note in attesa della 38` : ''}`);
})().catch((err) => { console.error(err); process.exitCode = 1; });
