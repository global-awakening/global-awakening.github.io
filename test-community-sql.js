/**
 * test-community-sql.js — 38: post e commenti della Community non si modificano né si cancellano
 * più con la chiave pubblica; si leggono e si scrivono come fa l'app.
 *
 * Niente Supabase: PGlite con le tabelle com'erano sul DB vero (catalogo 12/10) e la migration vera.
 * Esecuzione: node test-community-sql.js
 */
const fs = require('fs');
const path = require('path');

const F38 = 'supabase/sql/38_chiudi_community.sql';
const F38_R = 'supabase/sql/38_ritorno.sql';

let passati = 0, falliti = 0;
const check = (c, m, d) => { if (c) { console.log(`  ✅ ${m}`); passati++; } else { console.log(`  ❌ ${m}${d === undefined ? '' : ' — ' + JSON.stringify(d)}`); falliti++; process.exitCode = 1; } };
const applica = (db, rel) => db.exec(fs.readFileSync(path.join(__dirname, rel), 'utf8'));
const come = async (db, ruolo, sql) => {
  await db.query(`SET ROLE ${ruolo}`);
  try { const r = await db.query(sql); return { righe: r.rows, n: r.affectedRows }; }
  catch (e) { return { errore: e.code || e.message }; }
  finally { await db.query('RESET ROLE'); }
};
const conta = async (db, t) => (await db.query(`SELECT count(*)::int n FROM ${t}`)).rows[0].n;

(async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  // Com'erano il 12/10: post con "allow all", commenti con RLS spenta, ritual_comments in sola
  // lettura via RLS; anon e authenticated con tutti i privilegi sulle tre tabelle.
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE TABLE consciousness_posts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), author_nickname text,
      content text, created_at timestamptz DEFAULT now());
    CREATE TABLE consciousness_comments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), post_id uuid,
      author_nickname text, content text, created_at timestamptz DEFAULT now());
    CREATE TABLE ritual_comments (id bigserial PRIMARY KEY, ritual_id bigint, author_nickname text,
      content text, created_at timestamptz DEFAULT now());
    ALTER TABLE consciousness_posts ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "allow all" ON consciousness_posts FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
    ALTER TABLE ritual_comments ENABLE ROW LEVEL SECURITY;
    CREATE POLICY ritual_comments_select_public ON ritual_comments FOR SELECT TO anon USING (true);
    GRANT ALL ON consciousness_posts, consciousness_comments, ritual_comments TO anon, authenticated;
    GRANT USAGE ON SEQUENCE ritual_comments_id_seq TO anon, authenticated;
    INSERT INTO consciousness_posts (id, author_nickname, content)
      VALUES ('00000000-0000-0000-0000-000000000001', 'Luna', 'post di Luna');
    INSERT INTO consciousness_comments (post_id, author_nickname, content)
      VALUES ('00000000-0000-0000-0000-000000000001', 'Sole', 'commento di Sole');
    INSERT INTO ritual_comments (ritual_id, author_nickname, content) VALUES (1, 'Sole', 'nel rituale');
    -- Come delete_my_account: SECURITY DEFINER del proprietario, rinomina i post di chi se ne va.
    CREATE FUNCTION rinomina_autore(p_da text) RETURNS integer LANGUAGE sql SECURITY DEFINER AS $f$
      WITH u AS (UPDATE consciousness_posts SET author_nickname = 'Utente eliminato' WHERE author_nickname = p_da RETURNING 1)
      SELECT count(*)::int FROM u $f$;
    GRANT EXECUTE ON FUNCTION rinomina_autore(text) TO anon;
  `);

  console.log('— Prima della 38 —');
  const prima = await come(db, 'anon', `UPDATE consciousness_posts SET content = 'riscritto' WHERE true`);
  check(prima.n === 1, 'anon riscrive il post di un altro (la falla di oggi)', prima);
  await db.query(`UPDATE consciousness_posts SET content = 'post di Luna'`);

  console.log('— 38 —');
  await applica(db, F38);
  await applica(db, F38);   // idempotente

  for (const ruolo of ['anon', 'authenticated']) {
    const upd = await come(db, ruolo, `UPDATE consciousness_posts SET content = 'riscritto'`);
    check(upd.errore === '42501', `${ruolo} non modifica i post`, upd);
    const del = await come(db, ruolo, `DELETE FROM consciousness_posts`);
    check(del.errore === '42501', `${ruolo} non cancella i post`, del);
    const updC = await come(db, ruolo, `UPDATE consciousness_comments SET content = 'riscritto'`);
    check(updC.errore === '42501', `${ruolo} non modifica i commenti`, updC);
    const delC = await come(db, ruolo, `DELETE FROM consciousness_comments`);
    check(delC.errore === '42501', `${ruolo} non cancella i commenti`, delC);
    const tr = await come(db, ruolo, `TRUNCATE consciousness_comments`);
    check(tr.errore === '42501', `${ruolo} non svuota i commenti (TRUNCATE)`, tr);
    const delR = await come(db, ruolo, `DELETE FROM ritual_comments`);
    check(delR.errore === '42501', `${ruolo} non cancella i commenti dei rituali`, delR);
    const insR = await come(db, ruolo, `INSERT INTO ritual_comments (ritual_id, author_nickname, content) VALUES (1, 'x', 'y')`);
    check(insR.errore === '42501', `${ruolo} non scrive direttamente i commenti dei rituali`, insR);
  }
  check(await conta(db, 'consciousness_posts') === 1 && await conta(db, 'consciousness_comments') === 1
        && await conta(db, 'ritual_comments') === 1, 'nessuna riga toccata');
  check((await db.query(`SELECT content FROM consciousness_posts`)).rows[0].content === 'post di Luna', 'il post di Luna è intatto');

  // Quello che fa l'app: insert con return=representation, select di tutto.
  const nuovo = await come(db, 'anon', `INSERT INTO consciousness_posts (author_nickname, content) VALUES ('Stella', 'ciao a tutti') RETURNING *`);
  check(nuovo.righe && nuovo.righe[0].id && nuovo.righe[0].created_at, 'anon scrive un post e lo riceve indietro (id e data dal DB)', nuovo);
  const com = await come(db, 'anon', `INSERT INTO consciousness_comments (post_id, author_nickname, content) VALUES ('00000000-0000-0000-0000-000000000001', 'Stella', 'bello') RETURNING *`);
  check(com.righe && com.righe.length === 1, 'anon scrive un commento', com);
  const auth = await come(db, 'authenticated', `INSERT INTO consciousness_comments (post_id, author_nickname, content) VALUES ('00000000-0000-0000-0000-000000000001', 'Iscritta', 'anche io') RETURNING id`);
  check(auth.righe && auth.righe.length === 1, 'authenticated scrive un commento', auth);
  const lett = await come(db, 'anon', `SELECT * FROM consciousness_posts`);
  check(lett.righe && lett.righe.length === 2, 'anon legge tutti i post', lett);
  const lettC = await come(db, 'anon', `SELECT * FROM consciousness_comments WHERE post_id = '00000000-0000-0000-0000-000000000001' ORDER BY created_at`);
  check(lettC.righe && lettC.righe.length === 3, 'anon legge i commenti di un post', lettC);
  const lettR = await come(db, 'anon', `SELECT * FROM ritual_comments`);
  check(lettR.righe && lettR.righe.length === 1, 'anon legge i commenti dei rituali', lettR);

  const retro = await come(db, 'anon', `INSERT INTO consciousness_posts (author_nickname, content, created_at) VALUES ('X', 'vecchio', '2020-01-01')`);
  check(retro.errore === '42501', 'anon non sceglie la data del post', retro);
  const sceltoId = await come(db, 'anon', `INSERT INTO consciousness_posts (id, author_nickname, content) VALUES (gen_random_uuid(), 'X', 'y')`);
  check(sceltoId.errore === '42501', 'anon non sceglie l\'id del post', sceltoId);

  const rin = await come(db, 'anon', `SELECT rinomina_autore('Luna') AS n`);
  check(rin.righe && rin.righe[0].n === 1, 'le funzioni SECURITY DEFINER (cancella account) modificano ancora i post', rin);

  console.log('— Ritorno —');
  await applica(db, F38_R);
  const dopoR = await come(db, 'anon', `UPDATE consciousness_comments SET content = content`);
  check(dopoR.n === 3, '38_ritorno: anon torna a modificare i commenti (com\'era)', dopoR);
  const rls = (await db.query(`SELECT relrowsecurity r FROM pg_class WHERE relname = 'consciousness_comments'`)).rows[0].r;
  check(rls === false, '38_ritorno: RLS dei commenti di nuovo spenta');
  await applica(db, F38);
  check((await come(db, 'anon', `DELETE FROM consciousness_posts`)).errore === '42501', 'riapplicata dopo il ritorno: di nuovo chiusa');

  console.log(`\nRisultato: ${passati} passati, ${falliti} falliti`);
})().catch((e) => { console.error(e); process.exitCode = 1; });
