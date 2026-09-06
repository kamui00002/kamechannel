#!/usr/bin/env node
/*
 * 層1 日次 — ~/.claude を棚卸しして queue.yaml を作る ☀️
 *
 * ■ これが「続く仕組み」の心臓
 *   旧サイトは半年で 92 本書いて 1 年 5 ヶ月止まりました。手で書き続ける前提だったからです。
 *   ここでは **素材を機械が集め、人は一言だけ書く**。素材は運営者自身の ~/.claude で、
 *   これは日々の作業で勝手に増減するので、ネタ切れという状態になりません。
 *
 * ■ 読む範囲は catalog.yaml が決める（allowlist-in）
 *   catalog に無い項目は **開きません**。未登録は件数だけ出します。
 *   リポジトリが public なので、名前の混入すら事故になるためです。
 *
 * ■ 本文をリポジトリへ持ち込まない
 *   queue.yaml に入れるのは frontmatter の description と **本文の hash** だけです。
 *   本文を持ち込むと、記事にする前の生データが public リポジトリに残ります。
 *   「変わったかどうか」は hash で十分わかります。
 *
 * 使い方: npm run harvest [-- --dry-run]
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readdirSync, statSync } from 'node:fs';
import yaml from 'js-yaml';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CLAUDE_DIR = process.env.CLAUDE_HOME ?? join(homedir(), '.claude');
const CATALOG = join(ROOT, 'src/data/catalog.yaml');
const QUEUE = join(ROOT, 'src/data/queue.yaml');

const dryRun = process.argv.includes('--dry-run');

/** frontmatter の description だけ抜く。本文は返さない（意図的）。 */
function readFrontmatter(text) {
  if (!text.startsWith('---')) return {};
  const end = text.indexOf('\n---', 3);
  if (end === -1) return {};
  try {
    return yaml.load(text.slice(4, end)) ?? {};
  } catch {
    return {};
  }
}

/** catalog に載っていない項目が ~/.claude にいくつあるか。**名前は数えるだけで返さない。** */
function countUnregistered(registeredPaths) {
  const buckets = [
    ['skills', (d) => join('skills', d, 'SKILL.md')],
    ['commands', null],
    ['rules', null],
    ['agents', null],
  ];
  let n = 0;
  for (const [dir, mapper] of buckets) {
    const abs = join(CLAUDE_DIR, dir);
    if (!existsSync(abs)) continue;
    for (const name of readdirSync(abs)) {
      if (name.startsWith('_') || name.startsWith('.')) continue;
      const rel = mapper
        ? mapper(name)
        : join(dir, name);
      if (mapper && !existsSync(join(CLAUDE_DIR, rel))) continue;
      if (!mapper && !name.endsWith('.md')) continue;
      if (!registeredPaths.has(rel)) n += 1;
    }
  }
  return n;
}

const catalog = yaml.load(readFileSync(CATALOG, 'utf8'));
const items = catalog?.items ?? [];
if (items.length === 0) {
  console.error('catalog.yaml に項目がありません。allowlist が空では素材が集まりません。');
  process.exit(1);
}

/** 前回の hash。差分（changed）を出すために読む。無ければ全件 new。 */
const prev = existsSync(QUEUE)
  ? Object.fromEntries((yaml.load(readFileSync(QUEUE, 'utf8'))?.items ?? []).map((i) => [i.id, i]))
  : {};

const out = [];
const missing = [];
for (const item of items) {
  const abs = join(CLAUDE_DIR, item.path);
  if (!existsSync(abs)) {
    // ⚠ 消えた項目を黙って落とさない。人が catalog を直すまで報告し続ける。
    missing.push(item.id);
    continue;
  }
  const text = readFileSync(abs, 'utf8');
  const fm = readFrontmatter(text);
  const hash = createHash('sha256').update(text).digest('hex').slice(0, 16);
  const before = prev[item.id];
  out.push({
    id: item.id,
    kind: item.kind,
    path: item.path,
    description: (fm.description ?? '').trim(),
    bytes: Buffer.byteLength(text),
    hash,
    // new    … catalog に足したばかり。まだ記事が無い
    // changed… 本文が変わった。記事の註を見直す合図
    // same   … 変化なし
    state: !before ? 'new' : before.hash !== hash ? 'changed' : 'same',
    seenAt: new Date().toISOString().slice(0, 10),
  });
}

const registeredPaths = new Set(items.map((i) => i.path));
const doc = {
  // ⚠ 生成物。手で編集しない（`npm run harvest` で作り直す）
  generatedAt: new Date().toISOString().slice(0, 10),
  // 名前は出さない。「まだ登録していない素材がこれだけある」という目安だけ。
  unregisteredCount: countUnregistered(registeredPaths),
  items: out,
};

const banner = `# ⚠ 生成物。手で編集しない（\`npm run harvest\` が作り直します）。
# 素材の出どころは src/data/catalog.yaml の allowlist だけです。
# 本文はここに持ち込みません（public リポジトリなので hash だけ持ちます）。
`;

if (missing.length > 0) {
  console.error(`⚠ catalog にあるが ~/.claude に無い: ${missing.join(', ')}`);
  console.error('  catalog.yaml の path を直すか、行を消してください。');
}

const text = banner + yaml.dump(doc, { lineWidth: 100, noRefs: true });
if (dryRun) {
  console.log(text);
} else {
  writeFileSync(QUEUE, text);
}

const counts = out.reduce((a, i) => ({ ...a, [i.state]: (a[i.state] ?? 0) + 1 }), {});
console.log(
  `harvest: ${out.length} 件（new ${counts.new ?? 0} / changed ${counts.changed ?? 0} / same ${counts.same ?? 0}）` +
    ` 未登録 ${doc.unregisteredCount} 件${dryRun ? ' [dry-run]' : ''}`
);
if (missing.length > 0) process.exit(1);
