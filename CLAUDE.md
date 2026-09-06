# KaMeChannel — 運用規約

`https://kamechannel.com` の静的サイト。Astro + Cloudflare Workers。
**2026-09-01 に旧 WordPress（92記事）を捨てて作り直し。2026-09-06 に中身を決定。**

このファイルはこのリポジトリ固有の規約です。ここに書いてあることは、
一般的な良し悪しより優先します。

---

## 1. いまどこにいるか

| | |
|---|---|
| 中身 | **Claude Code の運用記録**。`~/.claude` の道具を 1 つずつ、註つきで置く（2026-09-06 決定） |
| リポジトリ | **public**（運営者の判断・2026-09-06） |
| 本番 | **まだ切り替えていない**。kamechannel.com は旧 WordPress（ConoHa）が応答中 |
| ドメイン | **2026-10-30 失効**（WHOIS 実測・お名前.com）。更新は **10 月上旬に再判断**（保留中） |
| 旧記事 | **捨てる**（運営者の判断・2026-09-01）。URL の転送も張らない |
| バックアップ | `../kamechannel-backup/posts.json`（92記事の全文）と `urls.txt` |

⚠ **ドメインの判断が済むまで DNS 切替・本番デプロイの作業をしないこと。**
手放す可能性のあるドメインに切替作業をしても捨て仕事になります（§7）。

## 2. 何を載せるか — 決めた理由

**運営者自身の `~/.claude`（skills / commands / rules / agents / hooks）を素材にする。**

検討した候補と、選ばなかった理由:

| 候補 | 判断 |
|---|---|
| **(a) Claude の運用解説（採用）** | 素材が **一次情報**（自分が書いた）で、**機械可読**で、**日々勝手に増える**。3 つとも揃うのはこれだけ |
| (b) n8n → Discord の定期ブログ化 | **不採用。** 実体を確認したら中身は *他人が書いた Zenn 記事* の中継（Zenn の AI/Unity/iOS/Swift RSS → Gemini 分類 → Discord）。ブログ化すると他人の記事のリンク集になり、著作権の問題と、おなけんブログが AdSense に 2 回落ちた「有用性の低いコンテンツ」と同じ形になる |

### 続く仕組み（旧サイトが止まった理由への答え）

⚠ 旧サイトは**半年で 92 本書いて、そのあと 1 年 5 ヶ月止まりました**。
手で書き続ける前提だったからです。ここでは**機械が素材を集め、人は註だけ書く**:

```
層1 日次   scripts/10-harvest.mjs   ~/.claude を棚卸し → queue.yaml（new / changed / same）
層2 手動   scripts/20-new-entry.mjs 素材から雛形を起こす → 人が註を書く
層3 検証   validate → build → validate:dist
```

素材は運営者の日々の作業で勝手に増減するので、ネタ切れという状態になりません。
**changed が出た項目は「道具を直した」＝書くことがある、の合図**です。

## 3. allowlist-in — このリポジトリでいちばん大事な一線 ⭐️

**リポジトリは public で、素材は運営者の private な設定です。**
だから「出さないものを除外する」方式は採りません。**`src/data/catalog.yaml` に
書いたものだけを読む**、という方式です。

除外リスト方式にすると、**新しく作った skill が黙って公開される**事故を必ず起こします。

- `10-harvest.mjs` は catalog に無い項目を**開きません**。未登録は**件数だけ**
  `queue.yaml` に出ます（名前はリポジトリに残らない）
- **本文をリポジトリに持ち込みません。** `queue.yaml` が持つのは frontmatter の
  description と本文の hash だけ。「変わったか」は hash で分かります
- catalog に無い `sourceId` の記事は作れません（検証 K3・`20-new-entry.mjs` の両方で止める）

### catalog に足すとき（1つでも当てはまるなら足さない）

1. **自分が書いたものか。** 他人の skill をそのまま載せるのは、他人の記事の転載と同じ。
   元ネタがあるなら `credit` に書く（記事にも出ます）
2. **案件名・顧客名・製品名が入っていないか**（`ads-*` / `asc-review-prep` / `mobai-*` 等）
3. **鍵・トークン・ボード ID・実パスが本文に無いか**
   （あっても K5/K6/K7 が止めますが、**そこは最後の砦であって入口ではない**）

## 4. 註（note）を必ず人が書く

`src/data/entries/*.yaml` の `note` が**このサイトの値打ちの実体**です。
おなけんブログが AdSense に 2 回落ちたときの唯一の解が「オリジナル文章の追加」でした。

- 検証 **K4 が 300 字未満と `TODO` を落とします**
- `npm run new:entry` が作る雛形の note は `TODO` で、**そのままでは検証が通りません**。
  人が書くまで通らない状態をわざと作っています
- 書くこと: **なぜそう作ったか / どこで詰まったか / いつ使わないと決めたか**
- 書かないこと: ファイルの中身の引き写し（それは素材であって記事ではない）
- `reviewed: false` は「運営者がまだ読み返していない」。公開はされますが誌面に「下書き」と出ます。
  読み返したら `true` にする

## 5. 検証 K1〜K9

**おなけんブログの `30-validate.mjs` は移植していません。** あちらは 92 記事の WP
ベースラインに縛られた C0〜C17 で、ここに対応物がありません。中身の形に合わせて作り直した
のが K1〜K9 です。

| | 何を見るか |
|---|---|
| K1 | catalog の `path` が `~/.claude` に実在する（推測で書かれた path を通さない）。CI には `~/.claude` が無いのでスキップし、理由を出す |
| K2 | 記事の slug が一意で URL 安全 |
| K3 | 記事の `sourceId` が catalog にある（**allowlist-in の強制**） |
| K4 | note が 300 字以上で `TODO` を含まない（**人の一言の強制**） |
| K5 | 素材データ（catalog / entries）に秘匿値・ローカルパスが無い（**入口**） |
| K6 | **`dist/` に秘匿値が無い**（**出口**。この検査がいちばん重い） |
| K7 | `dist/` にローカルの実パス・メール・IP が無い |
| K8 | 生成物に出ている項目が catalog の範囲内 |
| K9 | 記事ページが実在し、note が実際に誌面へ出ている（薄いページを出さない） |

### 陽性対照を先に取る（`rules/workflow.md`「検証の作法」）

**pass を証拠に使う前に、先に fail を確かめる。** 緑は「安全」と「測っていない」の
両方に読めます。

```bash
npm run validate:self-test
```

検知パターンの出典は `scripts/lib/secret-patterns.mjs` **1 箇所だけ**
（`~/.claude/hooks/_secret_patterns.py` から移した）。
⚠ **プロバイダは鍵の書式を黙って変えます**（Google は `AIza…` → `AQ.…`）。
四半期ごとに突き合わせ、足したら必ず陽性対照で発火を確かめること。

2026-09-06 の実測: 自己テスト 4 件すべて発火。dist にダミーを混ぜた通しの対照でも
K6/K7 が落ちる（終了コード 1）ことと、雛形の `TODO` で K4 が落ちることを確認済み。

## 6. 土台（おなけんブログと同じ）

- Astro（静的出力）→ `dist/` → Cloudflare Workers Static Assets
- `trailingSlash: 'always'` / `build.format: 'directory'`
- 記事の URL は `/claude/<slug>/`
- ⚠ `wrangler.jsonc` の `routes` は**コメントのまま**。
  **DNS を Cloudflare に向けてから**有効にすること（向ける前に deploy すると失敗する）

### npm script

| コマンド | 何をするか |
|---|---|
| `npm run harvest` | 層1。catalog の項目だけ `~/.claude` を棚卸し → `queue.yaml`。**ローカル専用**（CI に `~/.claude` は無い） |
| `npm run new:entry -- --id <catalog の id>` | 層2。記事の雛形。note は TODO なので**そのままでは通らない** |
| `npm run validate` | K1〜K5。commit 前に必ず |
| `npm run build` | Astro ビルド → `dist/` |
| `npm run validate:dist` | K6〜K9。`dist/` が無いと**スキップではなく FAIL** |
| `npm run validate:self-test` | 陽性対照。検知器が生きているかを先に確かめる |

`src/data/queue.yaml` は**生成物。手で編集しない。**
`src/` から `queue.yaml` を import しないこと（記事になっていない素材が誌面へ出ます）。

## 7. まだやっていないこと（期限つき）

| いつ | 何を |
|---|---|
| **2026-10-20 まで** | **ドメイン更新の判断**（失効は 10-30。失効すると復旧に追加費用）。`data/cutover-notes.md` |
| 判断のあと | DNS を Cloudflare へ → `wrangler.jsonc` の `routes` を有効化 → deploy → ConoHa 解約 |

⚠ DNS を Cloudflare に向けるのは**お名前.com のネームサーバー変更**であって、
レジストラ移管ではありません。`clientTransferProhibited` は障害になりません。

その他まだ無いもの: アフィリエイト（A8 にサイト003として登録済み。貼るなら開示文を
部品に持たせる）、アクセス解析（おなけん側は PostHog を Cookie なしで運用）、誌面の意匠
（**記事が数本たまってから**設計する。いまは最小限）。

## 8. Git

- コンベンショナルコミット（`feat:` / `fix:` / `docs:` / `chore:` / `refactor:`）。**日本語**
- **main へ直接コミットしない。** 作業ブランチ → main へ fast-forward マージ
- `git add` はパス指定。`git add -A` を使わない
- コミット前に必ず `npm run validate && npm run build && npm run validate:dist`
- ⚠ **public リポジトリです。** push する前に validate:dist が緑であることを確かめる
