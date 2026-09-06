#!/usr/bin/env node
/*
 * 検証 — このサイトの安全装置 ⭐️
 *
 * ■ なぜ厳しくするか
 *   素材は運営者自身の ~/.claude、リポジトリは public、出力は公開・索引される。
 *   秘匿値やローカルの実パスが dist/ に 1 度出れば、取り消せません。
 *   だから「入口（K5）」と「出口（K6/K7）」の両方で見ます。片方では足りません。
 *
 * ■ おなけんブログの 30-validate.mjs を移植していません
 *   あちらは 92 記事の WP ベースラインに縛られた C0〜C17 で、ここには対応物がありません。
 *   「にあたるもの」を、この中身の形に合わせて作り直したのがこの K1〜K9 です。
 *
 * 使い方:
 *   npm run validate              データ検証 K1〜K5
 *   npm run validate:dist         生成物検証 K6〜K9（dist/ が無ければスキップではなく FAIL）
 *   npm run validate:dist -- --self-test   陽性対照。**先に fail を確かめる**
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { SECRET_VALUE_PATTERNS, PRIVATE_STRING_PATTERNS, POSITIVE_CONTROLS } from './lib/secret-patterns.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CLAUDE_DIR = process.env.CLAUDE_HOME ?? join(homedir(), '.claude');
const DIST = join(ROOT, 'dist');
const distMode = process.argv.includes('--dist');
const selfTest = process.argv.includes('--self-test');
/*
 * 公開の直前だけ「運営者が註を読み返したか」を要求する（K10）。
 *
 * K4 は長さしか見ません。**誰が書いたかを問わない**ので、機械が書いた註でも
 * 300 字あれば CI は緑になります。それは規約 §4 の「人が書くまで通らない」と
 * 食い違うので、デプロイ側でだけ `reviewed: true` を求めます。
 * 日々の CI（ci.yml）は下書きのまま通します。書きかけを push できないと不便なので。
 */
const requireReviewed = process.argv.includes('--require-reviewed');

/** 人の一言の最低文字数。これ未満は「集めただけのページ」なので通しません。 */
const NOTE_MIN = 300;

let failed = 0;
const ok = (id, msg) => console.log(`  ✓ ${id} ${msg}`);
const ng = (id, msg) => { console.error(`  ✗ ${id} ${msg}`); failed += 1; };
const skip = (id, msg) => console.log(`  – ${id} スキップ: ${msg}`);

const catalog = yaml.load(readFileSync(join(ROOT, 'src/data/catalog.yaml'), 'utf8'));
const catalogItems = catalog?.items ?? [];
const catalogIds = new Set(catalogItems.map((i) => i.id));

const ENTRY_DIR = join(ROOT, 'src/data/entries');
const entryFiles = existsSync(ENTRY_DIR)
  ? readdirSync(ENTRY_DIR).filter((f) => f.endsWith('.yaml'))
  : [];
const entries = entryFiles.map((f) => ({
  file: f,
  data: yaml.load(readFileSync(join(ENTRY_DIR, f), 'utf8')),
}));

/** テキストを走査して当たったパターンを返す。K5 / K6 / K7 が共用。 */
function scan(text, patterns) {
  const hits = [];
  for (const [re, name] of patterns) {
    const m = text.match(re);
    if (m) hits.push({ name, sample: m[0].slice(0, 12) + '…' });
  }
  return hits;
}

/** dist/ 配下のテキストファイルを全部読む。 */
function walkText(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    const st = statSync(abs);
    if (st.isDirectory()) out.push(...walkText(abs));
    else if (/\.(html|js|css|json|xml|txt|svg)$/.test(name)) out.push(abs);
  }
  return out;
}

// ══════════════════════════════════════════════════
if (selfTest) {
  // 陽性対照（rules/workflow.md「検証の作法」）。
  // pass を証拠として使う前に、**検知器が本当に鳴るか**を確かめる。
  // ここが1つでも鳴らなければ、K6/K7 の緑は「安全」ではなく「計測していない」の意味になる。
  console.log('陽性対照（検知器が鳴るかを先に確かめる）');
  let bad = 0;
  for (const [sample, expected] of POSITIVE_CONTROLS) {
    const hits = scan(sample, [...SECRET_VALUE_PATTERNS, ...PRIVATE_STRING_PATTERNS]);
    if (hits.some((h) => h.name === expected)) ok('対照', `${expected} を検知した`);
    else { console.error(`  ✗ 対照 ${expected} を検知できなかった（検知器が壊れています）`); bad += 1; }
  }
  if (bad > 0) { console.error(`\n陽性対照 FAIL: ${bad} 件。K6/K7 の結果を「検証済み」と書かないこと。`); process.exit(1); }
  console.log('\n陽性対照 PASS。検知器は生きています。\n');
  process.exit(0);
}

// ══════════════════════════════════════════════════
if (!distMode) {
  console.log(requireReviewed ? 'データ検証 K1〜K5 + K10（公開直前）' : 'データ検証 K1〜K5');

  // K1 — catalog の path が実在するか。推測で書かれた path を通さない。
  if (!existsSync(CLAUDE_DIR)) {
    skip('K1', `${CLAUDE_DIR} が無い環境（CI 等）。素材の実在確認はローカルの harvest 時に行われます`);
  } else {
    const missing = catalogItems.filter((i) => !existsSync(join(CLAUDE_DIR, i.path)));
    if (missing.length) ng('K1', `~/.claude に無い path: ${missing.map((i) => i.id).join(', ')}`);
    else ok('K1', `catalog ${catalogItems.length} 件すべての path が実在`);
  }

  // K2 — slug の健全性。URL そのものなので後から変えられない。
  const slugs = entries.map((e) => e.data?.slug);
  const dupes = slugs.filter((s, i) => slugs.indexOf(s) !== i);
  const badSlug = slugs.filter((s) => !/^[a-z0-9][a-z0-9-]*$/.test(s ?? ''));
  if (dupes.length) ng('K2', `slug が重複: ${[...new Set(dupes)].join(', ')}`);
  else if (badSlug.length) ng('K2', `slug に使えない文字: ${badSlug.join(', ')}`);
  else ok('K2', `entry ${entries.length} 件の slug が一意で URL 安全`);

  // K3 — allowlist-in の強制。catalog に無いものを記事にできない。
  const orphan = entries.filter((e) => !catalogIds.has(e.data?.sourceId));
  if (orphan.length) ng('K3', `catalog に無い sourceId: ${orphan.map((e) => e.file).join(', ')}`);
  else ok('K3', 'すべての entry が catalog の項目を指している');

  // K4 — 人の一言の強制。ここが「集めただけのページを作らない」の実体。
  const thin = entries.filter((e) => {
    const n = (e.data?.note ?? '').trim();
    return n.length < NOTE_MIN || n.includes('TODO');
  });
  if (thin.length) ng('K4', `note が ${NOTE_MIN} 字未満か TODO のまま: ${thin.map((e) => e.file).join(', ')}`);
  else if (entries.length === 0) ng('K4', 'entry が 1 件もありません');
  else ok('K4', `entry ${entries.length} 件すべてに ${NOTE_MIN} 字以上の note がある`);

  // K10 — 公開の直前だけ。運営者が註を読み返したか。
  if (requireReviewed) {
    const unread = entries.filter((e) => e.data?.reviewed !== true);
    if (unread.length) ng('K10', `reviewed がまだ true でない: ${unread.map((e) => e.data.slug).join(', ')}`);
    else ok('K10', `entry ${entries.length} 件すべてを運営者が読み返している`);
  }

  // K5 — 入口の検査。素材データの段階で秘匿値を止める。
  let k5 = 0;
  for (const [label, text] of [
    ['catalog.yaml', readFileSync(join(ROOT, 'src/data/catalog.yaml'), 'utf8')],
    ...entries.map((e) => [e.file, readFileSync(join(ENTRY_DIR, e.file), 'utf8')]),
  ]) {
    const hits = scan(text, [...SECRET_VALUE_PATTERNS, ...PRIVATE_STRING_PATTERNS]);
    for (const h of hits) { ng('K5', `${label} に ${h.name}（${h.sample}）`); k5 += 1; }
  }
  if (k5 === 0) ok('K5', '素材データに秘匿値・ローカルパスは無い');
}

// ══════════════════════════════════════════════════
if (distMode) {
  console.log('生成物検証 K6〜K9');
  if (!existsSync(DIST)) {
    // スキップではなく FAIL。検証していないものを「通った」と読ませないため。
    console.error('  ✗ dist/ がありません。先に npm run build を実行してください。');
    process.exit(1);
  }
  const files = walkText(DIST);

  // K6 — 出口の検査。**この検査がこのサイトでいちばん重い。**
  let k6 = 0;
  for (const abs of files) {
    for (const h of scan(readFileSync(abs, 'utf8'), SECRET_VALUE_PATTERNS)) {
      ng('K6', `${relative(DIST, abs)} に ${h.name}（${h.sample}）`); k6 += 1;
    }
  }
  if (k6 === 0) ok('K6', `${files.length} ファイルに秘匿値は無い`);

  // K7 — ローカルの実パス・メール・IP。~/.claude の素材に頻出する。
  let k7 = 0;
  for (const abs of files) {
    for (const h of scan(readFileSync(abs, 'utf8'), PRIVATE_STRING_PATTERNS)) {
      ng('K7', `${relative(DIST, abs)} に ${h.name}（${h.sample}）`); k7 += 1;
    }
  }
  if (k7 === 0) ok('K7', `${files.length} ファイルにローカルパス・メール・IP は無い`);

  // K8 — allowlist の破れを生成物側で確かめる。
  const html = files.filter((f) => f.endsWith('.html')).map((f) => readFileSync(f, 'utf8')).join('\n');
  const leaked = [...catalogIds].length === 0 ? [] : null;
  const entryIds = new Set(entries.map((e) => e.data?.sourceId));
  const notPublished = [...entryIds].filter((id) => !catalogIds.has(id));
  if (notPublished.length) ng('K8', `catalog 外の id が記事になっている: ${notPublished.join(', ')}`);
  else ok('K8', '生成物に出ている項目は catalog の範囲内');

  // K9 — 薄いページを出さない。note が実際に誌面へ出ているか。
  let k9 = 0;
  for (const e of entries) {
    const page = join(DIST, 'claude', e.data.slug, 'index.html');
    if (!existsSync(page)) { ng('K9', `${e.data.slug} のページが生成されていない`); k9 += 1; continue; }
    const html = readFileSync(page, 'utf8');

    // ⚠ ページ全体を対象にしてはいけない（2026-09-06 実測）。
    //    <meta name="description"> にも註の先頭が入っているので、本文の段落を
    //    まるごと消しても素通りします（実際にそうなっていた）。
    //    **註の段落だけ**を取り出して見ること。
    const paras = [...html.matchAll(/<p class="note">([\s\S]*?)<\/p>/g)]
      .map((m) => m[1].replace(/<[^>]+>/g, ''));
    const expected = (e.data.note ?? '').trim().split(/\n{2,}/).length;

    if (paras.length !== expected) {
      ng('K9', `${e.data.slug} の註が ${expected} 段落のはずが ${paras.length} 段落`); k9 += 1; continue;
    }
    // 註の記法（** と `）はページ側で要素になるので、比べる前に落とす。
    const head = (e.data.note ?? '').replace(/\*\*|`/g, '').trim().slice(0, 20);
    if (head && !paras.join('\n').includes(head)) {
      ng('K9', `${e.data.slug} の註の本文が誌面に出ていない`); k9 += 1;
    }
  }
  if (k9 === 0) ok('K9', `entry ${entries.length} 件のページに note が出ている`);
}

console.log(failed === 0 ? '\nPASS' : `\nFAIL: ${failed} 件`);
process.exit(failed === 0 ? 0 : 1);
