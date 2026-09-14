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
 *   npm run validate              データ検証 K1〜K5・K11
 *   npm run validate:dist         生成物検証 K6〜K9・K12（dist/ が無ければスキップではなく FAIL）
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
// 組み込み機能は別の名簿。path を持たないので K1 の実在確認の対象外です。
const catalogBuiltins = catalog?.builtins ?? [];
// K3 / K8 が使う「記事が指してよい id」は両方の合併。
const catalogIds = new Set([...catalogItems, ...catalogBuiltins].map((i) => i.id));

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

/*
 * 畳まれた用語カード（popover）を、入れ子の span ごと取り除く。
 *
 * ⚠ 非貪欲な /<span class="gl-t">[\s\S]*?<\/span>/ で済ませないこと。カードの中には
 *    <span class="gl-b"> が入れ子で入っているので、最初の </span> で止まります。
 *    いまは gl-b がカードの最後の子なので**たまたま**合いますが、要素が 1 つ増えた
 *    瞬間に黙ってずれます。開閉を数えて確実に飛ばします。
 */
function dropPopovers(html) {
  const open = /<span class="gl-t"[^>]*>/g;
  let out = '', i = 0, m;
  while ((m = open.exec(html))) {
    out += html.slice(i, m.index);
    const tag = /<(\/?)span\b[^>]*>/g;
    tag.lastIndex = open.lastIndex;
    let depth = 1, j = open.lastIndex, t;
    while (depth > 0 && (t = tag.exec(html))) { depth += t[1] ? -1 : 1; j = tag.lastIndex; }
    i = j;
    open.lastIndex = j;
  }
  return out + html.slice(i);
}

/*
 * 和文どうしのあいだに残った「行送りの空白」を拾う。K12 と陽性対照が共用します。
 *
 * ⚠ 片側でも英数字なら拾いません。記事は「`Edit` を 3 回」のように英数字の前後へ
 *    空白を置く書き方で揃えてあり、そこは**残すのが正しい**からです。
 * ⚠ 畳まれた用語の中身は誌面に出ません。素で数えると隠れているカードの中身まで
 *    拾って偽の隙間を数えます（2026-09-11 に踏んだ罠）。先に落とします。
 */
const JP_GAP = /[^\x00-\x7F]\s+[^\x00-\x7F]/g;

/** K12 の対照データ。[見本, 鳴るべきか, 何を見ているか] */
const K12_CONTROLS = [
  ['組む側で\n詰める', true, '和文のあいだの改行（YAML の折り返しがそのまま届いた形）'],
  ['組む側で 詰める', true, '和文のあいだの空白（>- で畳まれて届いた形）'],
  ['組む側で詰める', false, '正しく詰まった和文'],
  ['<code>Edit</code> を 3 回', false, '英数字の前後の空白（ここは残すのが正しい）'],
  ['手元には<span class="gl-t" popover><b>CLAUDE.md</b><span class="gl-b">説明の 文</span></span>が', false, '畳まれた用語カードの中身（誌面に出ない）'],
];

function jpGaps(fragment) {
  const text = dropPopovers(fragment).replace(/<[^>]+>/g, '');
  return [...text.matchAll(JP_GAP)].map((m) => m[0].trim());
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

  /*
   * K12 の検知器。**先に fail を確かめる**ためのもの。
   * 鳴るべきものが鳴るか（陽性）と、鳴ってはいけないものが黙るか（陰性）の両方を見ます。
   * 陰性を置かないと「何にでも鳴る検知器」が緑を偽装できます。
   */
  for (const [sample, shouldFire, why] of K12_CONTROLS) {
    const fired = jpGaps(sample).length > 0;
    if (fired === shouldFire) ok('対照', `${shouldFire ? '鳴った' : '黙った'}: ${why}`);
    else { console.error(`  ✗ 対照 ${why} — ${shouldFire ? '鳴りませんでした' : '誤って鳴りました'}（検知器が壊れています）`); bad += 1; }
  }
  if (bad > 0) { console.error(`\n陽性対照 FAIL: ${bad} 件。K6/K7・K12 の結果を「検証済み」と書かないこと。`); process.exit(1); }
  console.log('\n陽性対照 PASS。検知器は生きています。\n');
  process.exit(0);
}

// ══════════════════════════════════════════════════
if (!distMode) {
  console.log(requireReviewed ? 'データ検証 K1〜K5・K11 + K10（公開直前）' : 'データ検証 K1〜K5・K11');

  // K1 — 名簿の形（path の有無）と、path の実在。推測で書かれた path を通さない。
  //
  // ⚠ 形の検査は ~/.claude が無い環境（CI）でも必ず走らせます。実在確認と一緒に
  //   skip してしまうと、items 側の **path 書き忘れが CI で素通り**します。
  //   それは「組み込みだから path が無いのだろう」と読める状態で、
  //   items と builtins を分けた意味がなくなります。
  const shapeBad = [
    ...catalogItems.filter((i) => !i.path).map((i) => `${i.id}（items なのに path が無い）`),
    ...catalogBuiltins.filter((i) => i.path).map((i) => `${i.id}（builtins なのに path がある）`),
  ];
  if (shapeBad.length) ng('K1', `名簿の形が違う: ${shapeBad.join(' / ')}`);

  if (!existsSync(CLAUDE_DIR)) {
    skip('K1', `${CLAUDE_DIR} が無い環境（CI 等）。実在確認はローカルの harvest 時。形の検査は上で済んでいます`);
  } else {
    const missing = catalogItems.filter((i) => i.path && !existsSync(join(CLAUDE_DIR, i.path)));
    if (missing.length) ng('K1', `~/.claude に無い path: ${missing.map((i) => i.id).join(', ')}`);
    else if (!shapeBad.length)
      ok('K1', `items ${catalogItems.length} 件の path が実在／builtins ${catalogBuiltins.length} 件は path 無し`);
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

  /*
   * K11 — 記事どうしのリンク切れを止める。
   * ⚠ 無い記事を指してもビルドは通り、誌面も普通に見えます。押して初めて 404 になるので、
   *    書いた本人は気づけません。だから指した時点で落とします。
   */
  const slugSet = new Set(entries.map((e) => e.data?.slug));
  const broken = [];
  for (const e of entries) {
    const list = e.data?.seeAlso ?? [];
    if (!Array.isArray(list)) { broken.push(`${e.file}: seeAlso が配列ではない`); continue; }
    for (const s of list) {
      if (s === e.data?.slug) broken.push(`${e.file}: 自分自身を指している（${s}）`);
      else if (!slugSet.has(s)) broken.push(`${e.file}: 無い記事を指している（${s}）`);
    }
  }
  if (broken.length) ng('K11', broken.join(' / '));
  else ok('K11', `entry ${entries.length} 件の「あわせて読む」にリンク切れは無い`);

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
  console.log('生成物検証 K6〜K9・K12');
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

  // K8 — allowlist の破れを **生成物側** で確かめる。
  //
  // ⚠ K3 と役割が違います。K3 は src/data/ の中だけを見ます（entry の sourceId ⊂ catalog）。
  //   K8 は dist/ の HTML を読み、**誌面に実際に出た id** を catalog と突き合わせます。
  //   だから K3 から見えないもの — テンプレートの書き換え、dist/ や public/ への手置き、
  //   catalog を縮めたあとに残った古い dist — がここで落ちます。
  //   逆向き（entry にページがあるか）は K9 が見ます。K8 は前向き（ページに entry があるか）です。
  //
  // ⚠ 誌面の id は **<span class="sid"> という専用の印**で拾います。
  //   以前は <p class="row-m"> の中の <code> を見ていましたが、<code> は註の `…` にも
  //   出るうえ、意匠を変えると簡単に消えます（2026-09-08 に台帳の意匠へ替えて実際に消えた）。
  //   拾う対象が「たまたまその形をしていたもの」だと、意匠の変更で毎回この検査が壊れます。
  //   だから **この検査のためだけの class** を置き、テンプレート側もそれを使います。
  //   ⚠ sid を消す・改名するなら、この検査も同時に直すこと。片方だけ変えると
  //      「0 個 ＝ 違反なし」ではなく「0 個 ＝ 違反」で落ちます（下の判定がそうなっています）。
  // ⚠ 判定は **dist/ からの相対パス** で行うこと。絶対パスに正規表現を当てると、
  //   形の違うページ（階層が 1 つ深い等）が pages から静かに落ちます。落ちた分は
  //   検査もされず違反にもならないので、また「検査せず緑」になります。
  //   だから claude/ 配下の HTML を**全部拾ってから**、形の違うものを違反として落とします。
  const entrySlugs = new Set(entries.map((e) => e.data?.slug));
  const pages = files
    .map((abs) => ({ abs, rel: relative(DIST, abs) }))
    .filter(({ rel }) => rel.startsWith('claude/') && rel.endsWith('.html'));
  let k8 = 0;
  for (const { abs, rel } of pages) {
    const m = rel.match(/^claude\/([^/]+)\/index\.html$/);
    if (!m) { ng('K8', `想定外の場所に記事ページがある: ${rel}`); k8 += 1; continue; }
    const slug = m[1];

    // (2) 記事になっていない素材のページが誌面に出ていないか（queue.yaml を import する事故）
    if (!entrySlugs.has(slug)) {
      ng('K8', `entry の無いページが生成されている: ${rel}`); k8 += 1; continue;
    }

    // (1) 誌面に出ている sourceId が catalog の範囲内か
    const ids = [...readFileSync(abs, 'utf8').matchAll(/<span class="sid">([^<]*)<\/span>/g)]
      .map((m) => m[1].trim());

    // ⚠ 0 個を通さない。テンプレートが <code> を落としたとき、当たりを filter するだけの
    //   書き方だと「1 件も見つからない ＝ 違反なし」で緑になります。それは検査していないのと同じ。
    if (ids.length !== 1) {
      ng('K8', `${rel} の見出し欄の sourceId が ${ids.length} 個（1 個であるはず）`); k8 += 1; continue;
    }
    if (!catalogIds.has(ids[0])) {
      ng('K8', `catalog 外の id が誌面に出ている: ${rel} の ${ids[0]}`); k8 += 1;
    }
  }
  if (pages.length === 0) { ng('K8', '記事ページが 1 つも生成されていない'); k8 += 1; }
  if (k8 === 0) ok('K8', `生成された ${pages.length} ページの id はすべて catalog の範囲内`);

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

  /*
   * K12 — 和文のあいだに「行送りの空白」が戻っていないか。
   *
   * ■ なぜ要るか
   *   本文は YAML に読みやすい幅で折り返して書いてあります。段落を割るのは空行だけなので、
   *   段落の中の改行はそのままブラウザへ渡り、半角スペース 1 個として組まれます。英語なら
   *   単語の切れ目ですが、日本語には単語のあいだに空白を置く習慣がないので、ただの隙間
   *   として誌面に出ます。これを組む側（entries.ts の tighten / tightenSegments）で詰めています。
   *
   *   ⚠ その配線は [slug].astro のたった 6 行です。**外しても K1〜K11 は全部緑のまま**
   *      でした（2026-09-12 に実測。隙間が claude-md 115 件・init 49 件に戻っても PASS）。
   *      だからこの検査が要ります。配線が将来剥がれたときに気づける唯一の目です。
   *
   * ■ なぜ dist を見るか
   *   src/data/ の側は改行が入っているのが**正しい**執筆スタイルです。そこで測ると
   *   正しい原稿を叱ることになります。見るべきは「組み終えた誌面」のほうです。
   *
   * ■ なぜ範囲を 3 面に絞るか（閾値を置かないため）
   *   ページ全体を見ると「★ 別枠」「標識 ＝ CLAUDE.md」「← 一覧へ」など、**意図して
   *   空けた空白**が混ざります（claude-md 6 件・init 4 件）。ここで「6 件以下なら緑」と
   *   閾値を置くと数字が腐ります。代わりに、組む側が実際に詰めている人の文章の 3 面
   *   — 本文・図の説明・検索用の説明文 — だけを見ます。実測でどれも 0 件です。
   */
  let k12 = 0;
  for (const e of entries) {
    const page = join(DIST, 'claude', e.data.slug, 'index.html');
    // ページが無い件は K9 が既に鳴らしています。ここで二重に鳴らしません。
    if (!existsSync(page)) continue;
    const html = readFileSync(page, 'utf8');

    const surfaces = [
      ['本文', /<p class="note">([\s\S]*?)<\/p>/g],
      ['図の説明', /<figcaption>([\s\S]*?)<\/figcaption>/g],
      ['説明文', /<meta (?:name|property)="(?:og:)?description" content="([^"]*)"/g],
    ];
    for (const [label, re] of surfaces) {
      const hits = [...html.matchAll(re)].flatMap((m) => jpGaps(m[1]));
      if (hits.length === 0) continue;
      // 壊れると 100 件超えるので、件数と見本だけ出します（全部出すと読めません）
      const sample = hits.slice(0, 3).map((h) => `「${h}」`).join(' ');
      ng('K12', `${e.data.slug} の${label}に和文どうしの隙間 ${hits.length} 件: ${sample}${hits.length > 3 ? ' …' : ''}`);
      k12 += 1;
    }
  }
  if (k12 === 0) ok('K12', `entry ${entries.length} 件の本文・図の説明・説明文に和文どうしの隙間は無い`);
}

console.log(failed === 0 ? '\nPASS' : `\nFAIL: ${failed} 件`);
process.exit(failed === 0 ? 0 : 1);
