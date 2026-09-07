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

/**
 * Claude Code に最初から入っている機能（catalog.yaml の `builtins:` 節）。
 *
 * ⚠ `path` を持ちません。出どころのファイルが ~/.claude に無いからです。
 *    items と同じ名簿に混ぜて path を任意にすると、items 側の書き忘れが
 *    「組み込みだから無いのだろう」と黙って通ります。だから型ごと分けています。
 */
export interface BuiltinItem {
  id: string;
  kind: 'builtin';
  credit?: string;
}

/** 記事が指せるもの。catalog の項目か、組み込み機能か。 */
export type Item = CatalogItem | BuiltinItem;

const DATA = path.resolve('src/data');

const catalogDoc = yaml.load(
  fs.readFileSync(path.join(DATA, 'catalog.yaml'), 'utf8')
) as { items?: CatalogItem[]; builtins?: BuiltinItem[] };

export const catalog: CatalogItem[] = catalogDoc.items ?? [];

/** 組み込み機能の名簿。items とは別に持つ（path の有無で安全装置が変わるため） */
export const builtins: BuiltinItem[] = catalogDoc.builtins ?? [];

export const entries: Entry[] = fs
  .readdirSync(path.join(DATA, 'entries'))
  .filter((f) => f.endsWith('.yaml'))
  .map((f) => yaml.load(fs.readFileSync(path.join(DATA, 'entries', f), 'utf8')) as Entry)
  // 新しい順。同日は slug で安定させる（ビルドのたびに順が入れ替わらないように）
  .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.slug.localeCompare(b.slug));

export const findItem = (id: string): Item | undefined =>
  catalog.find((c) => c.id === id) ?? builtins.find((b) => b.id === id);

/** kind の日本語表示。文字列を各所に散らさない。 */
export const KIND_LABEL: Record<Item['kind'], string> = {
  skill: 'スキル',
  command: 'スラッシュコマンド',
  rule: 'ルール',
  agent: 'サブエージェント',
  hook: 'フック',
  builtin: '組み込みコマンド',
};

/**
 * 註の中の `**強調**` と `` `コード` `` だけを組で解釈する。
 *
 * Markdown レンダラを入れていないのは、註に載せてよい記法を意図的に 2 つへ絞るためです。
 * 見出しやリストを書けるようにすると、註が「もう一つの本文」になって長くなります。
 * 註は散文で、強調とコードだけあれば足ります。
 *
 * ⚠ HTML 文字列を作って差し込むのではなく、**断片の配列を返します**。
 *    ページ側が要素として組むので、生の HTML がテンプレートに入りません。
 */
export type Segment = { text: string; strong?: boolean; code?: boolean };

export function toSegments(line: string): Segment[] {
  const out: Segment[] = [];
  // ** … ** と ` … ` を1本の正規表現で拾い、間の地の文と交互に積む
  const re = /\*\*([^*]+)\*\*|`([^`]+)`/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    if (m.index > last) out.push({ text: line.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ text: m[1], strong: true });
    else out.push({ text: m[2], code: true });
    last = m.index + m[0].length;
  }
  if (last < line.length) out.push({ text: line.slice(last) });
  return out;
}

/** meta description 用。記法の記号を落とした素の文。 */
export const plain = (s: string) => s.replace(/\*\*|`/g, '');
