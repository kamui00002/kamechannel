#!/usr/bin/env node
/*
 * 層2 手動 — 素材から記事の雛形を起こす
 *
 * ■ 雛形の note は TODO のまま出します（わざとです）
 *   `npm run validate` の K4 が TODO と 300 字未満を落とすので、
 *   **人が註を書くまでビルドが通らない**状態になります。
 *   おなけんブログが AdSense に 2 回落ちたときの答えが「オリジナル文章の追加」
 *   だったので、集めただけのページが黙って公開される道を塞いであります。
 *
 * 使い方: npm run new:entry -- --id <catalog の id> [--slug <slug>] [--title "…"]
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const get = (name) => { const i = args.indexOf(`--${name}`); return i === -1 ? undefined : args[i + 1]; };

const id = get('id');
if (!id) {
  console.error('使い方: npm run new:entry -- --id <catalog の id> [--slug …] [--title "…"]');
  process.exit(1);
}

const catalog = yaml.load(readFileSync(join(ROOT, 'src/data/catalog.yaml'), 'utf8'));
const item = (catalog?.items ?? []).find((i) => i.id === id);
if (!item) {
  // allowlist-in。catalog に無いものは記事にできません（検証 K3 と同じ一線）。
  console.error(`catalog.yaml に "${id}" がありません。まず allowlist に足してください。`);
  console.error('（足す前に「自分が書いたものか」「案件名が入っていないか」を確かめること）');
  process.exit(1);
}

const slug = get('slug') ?? id;
const out = join(ROOT, 'src/data/entries', `${slug}.yaml`);
if (existsSync(out)) { console.error(`${out} は既にあります。`); process.exit(1); }

writeFileSync(out, `slug: ${slug}
sourceId: ${id}
title: ${get('title') ?? `TODO（題を書く）`}
publishedAt: '${new Date().toISOString().slice(0, 10)}'
reviewed: false
# ⚠ ここが記事の値打ちの実体です。300 字以上。TODO のままでは validate が通りません。
#   書くこと: なぜそう作ったか / どこで詰まったか / いつ使わないと決めたか
#   書かないこと: ファイルの中身の引き写し（それは素材であって記事ではない）
note: |
  TODO（人が書く）
`);
console.log(`起こしました: src/data/entries/${slug}.yaml`);
console.log('note を書くまで `npm run validate` は通りません（そういう設計です）。');
