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
  /*
   * ループちゃんの一言。記事の頭と、トップの一覧の吹き出しに出る（2026-09-14 追加）。
   * ⚠ 口調はループちゃんのもの（「〜だよ」「〜しよう」）。註と用語の説明は「です・ます」のまま。
   * ⚠ 無くても吹き出しが消えるだけで、誌面は普通に見えます。だから読み込み時に止めます（下）。
   */
  loopSays: string;
  /** 図。註のどの段落の後ろに置くかだけをデータに持つ（絵そのものは部品側） */
  figures?: Figure[];

  /*
   * あわせて読む。他の記事の slug を並べる。
   * ⚠ 指した先が無いとリンク切れが誌面へ出ます。誌面は正常に見えるので気づけません。
   *    検証 K11 が「その slug の記事が実在するか」を見て落とします。
   */
  seeAlso?: string[];
}

/**
 * 図の指定。
 *
 * ⚠ **データに絵を持たせません。** SVG の中身を yaml に書くと、記事データが
 *    生の HTML 置き場になり、`toSegments` で守っている一線（生の HTML を
 *    テンプレートに入れない）が崩れます。データが持つのは「どこに・どの図を・
 *    どういう説明で」の 3 つだけで、絵は src/components/Figure.astro にあります。
 */
export interface Figure {
  /** 註の何段落目の後ろに置くか（1 始まり） */
  after: number;
  /** どの絵か。Figure.astro が知っている名前だけ */
  kind: (typeof FIGURE_KINDS)[number];
  /** 図の下に出る一行。図だけ見て意味が取れるように書く */
  caption: string;
}

const FIGURE_KINDS = ['bytes', 'write-edit', 'reading-order', 'md-tree', 'aikotoba', 'atmark', 'hyoshiki', 'namae'] as const;

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
  /**
   * builtin-command＝スラッシュコマンド（/init など）／builtin-feature＝名前のない仕組み
   * （CLAUDE.md の読み込みなど。誌面の札は「番外編」）。2026-09-14 に builtin を 2 つに分けた。
   */
  kind: 'builtin-command' | 'builtin-feature';
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

/*
 * 図の指定を読み込み時に確かめる。
 *
 * ⚠ ここで落とさないと、`after` の打ち間違いや `kind` の綴り間違いが
 *    「図が出ないだけ」で黙って通ります。誌面は正常に見えるので誰も気づきません。
 *    ビルドを止めるのが唯一の気づき方です。
 */
/** ループちゃんの一言の上限。吹き出しに収まる長さ（一覧で 1〜2 行） */
const LOOP_SAYS_MAX = 60;

for (const e of entries) {
  /*
   * ループちゃんの一言（2026-09-14 追加）。
   * ⚠ 無い・綴り違いのときに**吹き出しが黙って消える**のがいちばんまずい形です。誌面は
   *    普通に見え、検証もページの形しか見ないので気づけません。だからビルドを止めます。
   * ⚠ 素の文章として出ます。記法は効かないので、記号がそのまま見えます。
   */
  const says = typeof e.loopSays === 'string' ? e.loopSays.trim() : '';
  if (!says)
    throw new Error(`${e.slug}: loopSays（ループちゃんの一言）がありません。記事の頭と一覧の吹き出しに出ます`);
  if (says.length > LOOP_SAYS_MAX)
    throw new Error(`${e.slug}: loopSays が ${says.length} 字あります（${LOOP_SAYS_MAX} 字まで）。吹き出しに収まりません`);
  if (/[`*\n]|\{\{/.test(says))
    throw new Error(`${e.slug}: loopSays に記法の記号か改行があります → 「${says.slice(0, 30)}…」`);

  const paragraphs = e.note.trim().split(/\n{2,}/).length;
  for (const f of e.figures ?? []) {
    if (!FIGURE_KINDS.includes(f.kind))
      throw new Error(`${e.slug}: 知らない図の名前「${f.kind}」。使えるのは ${FIGURE_KINDS.join(' / ')}`);
    if (!Number.isInteger(f.after) || f.after < 1 || f.after > paragraphs)
      throw new Error(`${e.slug}: 図の after が範囲外（${f.after}）。註は ${paragraphs} 段落しかありません`);
    if (!f.caption?.trim())
      throw new Error(`${e.slug}: 図に caption がありません（図だけ見て意味が取れる一行を書くこと）`);
    /* 図の説明も素の文章として出ます。記法は効かないので記号がそのまま見えます。 */
    if (/[`*]|\{\{/.test(f.caption))
      throw new Error(
        `${e.slug}: 図「${f.kind}」の説明に記法の記号があります → 「${f.caption.trim().slice(0, 30)}…」\n` +
        '  ⚠ 説明は素の文章として出ます。「」で囲むなどしてください。'
      );
  }

  /*
   * ⚠ 言い換え記法の取りこぼしを落とす（2026-09-09 に実際に踏んだ）。
   *   `**「{{用語|説明}}のやつ」**` と入れ子にすると、太字の枝が先に当たって
   *   `{{ }}` ごと太字の中身として飲み込まれ、**中括弧が誌面にそのまま出ます**。
   *   ビルドは通り、検証 K4/K9 も字数と段落を見るだけなので通ります。
   *   気づけるのは目で見たときだけ、という状態でした。だからここで落とします。
   *   → 言い換えは太字の**外**に書くこと。
   */
  for (const p of e.note.trim().split(/\n{2,}/))
    for (const seg of toSegments(p)) {
      if (seg.text.includes('{{') || seg.text.includes('}}'))
        throw new Error(
          `${e.slug}: 言い換え記法が組まれずに誌面へ出ます → 「${seg.text.slice(0, 30)}…」\n` +
          '  ⚠ **太字** の中に {{用語|説明}} を入れ子にできません。外に出してください。'
        );
      /*
       * 組まれ残ったバッククォートも同じ形の事故です。**太字の中の `コード`** は
       * 太字の枝が先に当たるので、バッククォートが生のまま誌面に出ます。
       * code の枝を通った文字列からは既に取り除かれているので、
       * ここに残っている ` は「組まれなかった」印だけです。
       */
      if (seg.text.includes('`'))
        throw new Error(
          `${e.slug}: バッククォートが生のまま誌面へ出ます → 「${seg.text.slice(0, 30)}…」\n` +
          '  ⚠ **太字の中の `コード`** は組まれません。太字の外に出してください。'
        );
      /* 言い換えの本文は素の文章として出ます。記法は効きません。 */
      if (seg.gloss?.includes('`'))
        throw new Error(
          `${e.slug}: 言い換えの説明にバッククォートがあります（「${seg.text}」の説明）。\n` +
          '  ⚠ 説明は素の文章として出るので、記号がそのまま見えます。「」で囲むなどしてください。'
        );
    }
}

export const findItem = (id: string): Item | undefined =>
  catalog.find((c) => c.id === id) ?? builtins.find((b) => b.id === id);

/** kind の日本語表示。文字列を各所に散らさない。 */
export const KIND_LABEL: Record<Item['kind'], string> = {
  skill: 'スキル',
  command: 'スラッシュコマンド',
  rule: 'ルール',
  agent: 'サブエージェント',
  hook: 'フック',
  'builtin-command': 'スラッシュコマンド',
  // サイト名が「スラッシュコマンド教室」なので、コマンドでない組み込み機能は正直に番外編と出す
  'builtin-feature': '番外編',
};

/**
 * 註の中の `**強調**` と `` `コード` `` だけを組で解釈する。
 *
 * Markdown レンダラを入れていないのは、註に載せてよい記法を意図的に絞るためです。
 * 見出しやリストを書けるようにすると、註が「もう一つの本文」になって長くなります。
 * 註は散文で、強調とコードと**用語の言い換え**だけあれば足ります。
 *
 * ■ 言い換え `{{用語|かみ砕いた一言}}`（2026-09-08 追加）
 *   誌面では用語に点線が引かれ、**押したときだけ**言い換えが出ます。
 *   足した理由は、註が「その言葉を知っている人にしか読めない」状態だったからです。
 *   ⚠ 見出しやリストと違って、これは**本文を増やしません**。1 語を言い換えるだけで、
 *      註が「もう一つの本文」に膨らむ心配がない。だから 3 つ目として許しています。
 *   ⚠ 常時表示にしない理由: 註の地の文に小さな札が並ぶと、目が文でなく札を追います。
 *      言い換えは「知らない人だけが要る」ものなので、既定は畳んでおきます。
 *   用語は `` ` `` で囲めばコードとして出ます（例: {{`Edit`|直す所だけ触る}}）。
 *
 * ⚠ HTML 文字列を作って差し込むのではなく、**断片の配列を返します**。
 *    ページ側が要素として組むので、生の HTML がテンプレートに入りません。
 */
export type Segment = { text: string; strong?: boolean; code?: boolean; gloss?: string };

/*
 * 日本語のあいだに入った「行送りの空白」を詰める。
 *
 * ⚠ なぜ要るか: 本文は YAML に読みやすい幅で折り返して書いてある。段落を割るのは
 *    空行（\n{2,}）だけなので、段落の中の改行はそのままブラウザへ渡り、ブラウザは
 *    それを半角スペース 1 個として組む。英語なら単語の切れ目だが、日本語には単語の
 *    あいだに空白を置く習慣がないので、ただの隙間として出てしまう。
 *    図の説明は `>-` で書くので YAML の時点で空白へ畳まれており、改行ではなく
 *    空白として届く。両方をここでまとめて詰める。
 *
 * ⚠ 英数字が絡む所は詰めない。「`Edit` を 3 回」のように、記事は英数字の前後に
 *    空白を置く書き方で揃えてある。片側でも ASCII なら空白を残すこと。
 */
const TIGHTEN = /([^\x00-\x7F])\s+(?=[^\x00-\x7F])/g;

export function tighten(text: string): string {
  return text.replace(TIGHTEN, '$1');
}

/*
 * かたまり（Segment）の境目に残った行送りの空白を落とす。
 *
 * ⚠ tighten() だけでは足りない。**太字** や {{用語|説明}} の記号は ASCII なので、
 *    「…ありません。⏎{{起動したフォルダ|…}}から」のような所を素通りしてしまう。
 *    誌面に出るのは記号ではなく「用語」のほうなので、記号を正規表現で追いかけず、
 *    組み終えたかたまりの左右で判断する。
 *
 * ⚠ コードのかたまりは中身を書き換えない（原文どおりに組むため）。
 *    境目の判定には使う。「`Edit` を」のように片側が ASCII なら空白は残る。
 */
export function tightenSegments(segs: Segment[]): Segment[] {
  const endsJP = /[^\x00-\x7F]\s*$/;    // 右端が（空白を挟んで）日本語
  const startsJP = /^\s*[^\x00-\x7F]/;  // 左端が（空白を挟んで）日本語
  const out = segs.map((s) => (s.code ? s : { ...s, text: tighten(s.text) }));
  for (let i = 0; i < out.length - 1; i++) {
    if (endsJP.test(out[i].text) && startsJP.test(out[i + 1].text)) {
      out[i] = { ...out[i], text: out[i].text.replace(/\s+$/, '') };
      out[i + 1] = { ...out[i + 1], text: out[i + 1].text.replace(/^\s+/, '') };
    }
  }
  return out;
}

export function toSegments(line: string): Segment[] {
  const out: Segment[] = [];
  // ** … ** と ` … ` と {{用語|言い換え}} を1本の正規表現で拾い、間の地の文と交互に積む
  const re = /\*\*([^*]+)\*\*|`([^`]+)`|\{\{([^}|]+)\|([^}]+)\}\}/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    if (m.index > last) out.push({ text: line.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ text: m[1], strong: true });
    else if (m[2] !== undefined) out.push({ text: m[2], code: true });
    else {
      // 用語が ` ` で囲まれていればコードとして組む
      const t = m[3].trim();
      const isCode = t.startsWith('`') && t.endsWith('`') && t.length > 2;
      out.push({ text: isCode ? t.slice(1, -1) : t, code: isCode, gloss: m[4].trim() });
    }
    last = m.index + m[0].length;
  }
  if (last < line.length) out.push({ text: line.slice(last) });
  return out;
}

/** meta description 用。記法の記号を落とした素の文。 */
export const plain = (s: string) =>
  s.replace(/\{\{([^}|]+)\|[^}]+\}\}/g, '$1').replace(/\*\*|`/g, '');
