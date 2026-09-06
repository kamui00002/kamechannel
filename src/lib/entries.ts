/*
 * 記事データの読み出し口 — ここが唯一の出典。
 *
 * ページ側から src/data/ を直接 import しないこと。
 * **queue.yaml を import しないこと**（まだ記事になっていない素材が誌面へ出ます）。
 */
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

export interface Entry {
  slug: string;
  /** catalog.yaml の id。ここに無いものは記事にできない（検証 K3） */
  sourceId: string;
  title: string;
  publishedAt: string;
  /** 運営者が読み返して確認したか。false の記事は一覧で印が付く */
  reviewed?: boolean;
  /** 人が書いた註。**このサイトの値打ちの実体**（検証 K4 が 300 字未満で落とす） */
  note: string;
}

export interface CatalogItem {
  id: string;
  kind: 'skill' | 'command' | 'rule' | 'agent' | 'hook';
  path: string;
  /** 元になった他人の仕事があるなら、その出典。記事にも出す */
  credit?: string;
}

const DATA = path.resolve('src/data');

export const catalog: CatalogItem[] = (
  yaml.load(fs.readFileSync(path.join(DATA, 'catalog.yaml'), 'utf8')) as { items: CatalogItem[] }
).items;

export const entries: Entry[] = fs
  .readdirSync(path.join(DATA, 'entries'))
  .filter((f) => f.endsWith('.yaml'))
  .map((f) => yaml.load(fs.readFileSync(path.join(DATA, 'entries', f), 'utf8')) as Entry)
  // 新しい順。同日は slug で安定させる（ビルドのたびに順が入れ替わらないように）
  .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.slug.localeCompare(b.slug));

export const findItem = (id: string) => catalog.find((c) => c.id === id);

/** kind の日本語表示。文字列を各所に散らさない。 */
export const KIND_LABEL: Record<CatalogItem['kind'], string> = {
  skill: 'スキル',
  command: 'スラッシュコマンド',
  rule: 'ルール',
  agent: 'サブエージェント',
  hook: 'フック',
};
