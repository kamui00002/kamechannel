# 切替とドメインの判断 — 期限つき ⭐️

**2026-09-06 時点。** ここは「まだやっていないこと」の置き場です。
判断が済むまで DNS 切替の作業をしないこと（捨て仕事になります）。

---

## 1. ドメインの判断（いちばん先）

| | |
|---|---|
| ドメイン | `kamechannel.com` |
| **失効** | **2026-10-30 07:14 UTC**（= 日本時間 10-30 16:14） |
| レジストラ | GMO Internet Group / **お名前.com** |
| 登録 | 2024-10-30 / 最終更新 2025-10-23 |
| 出典 | `whois kamechannel.com` の **実測**（2026-09-06） |
| 状態 | 運営者の判断で **10 月上旬に再判断**（保留中） |

### ⏰ 判断の期限: **2026-10-20**

失効の 10 日前に置いています。失効させると復旧（レデンプション）に追加費用がかかり、
期間によっては第三者に取られます。**期限を過ぎたら「保留」は「手放す」になります。**

判断が「更新する」なら、そのあと §2 へ進みます。
判断が「手放す」なら、配信先のドメインを別途決め、§2 は組み直しになります。

## 2. 切替手順（ドメインを更新すると決めてから）

順番を守ること。**`routes` を先に有効にして deploy すると失敗します。**

1. **お名前.com でネームサーバーを Cloudflare に変更**
   - ⚠ これは**ネームサーバー変更**であって、**レジストラ移管ではありません**。
     `clientTransferProhibited` が付いていますが、これは移管を止めるロックなので
     ネームサーバー変更の障害にはなりません
   - Cloudflare 側でゾーンを作り、提示された 2 本のネームサーバーを設定する
2. **伝播を確認**（`dig NS kamechannel.com +short` が Cloudflare のものになるまで）
3. **`wrangler.jsonc` の `routes` のコメントを外す**
   ```jsonc
   "routes": [ { "pattern": "kamechannel.com", "custom_domain": true } ]
   ```
4. **`npm run validate && npm run build && npm run validate:dist`**（緑を確認）
5. **`npm run deploy`**
6. **本番の応答が新サイトになったことを確認**してから **ConoHa を解約**
   - 旧サーバー: ConoHa（IP は旧構成のもの。解約前に控えを取る）
   - **メールは使っていないので解約可**（2026-09-01 確認済み）
   - ⚠ 解約は不可逆。旧記事のバックアップ（`../kamechannel-backup/posts.json`）が
     手元にあることを先に確かめること

## 3. GitHub Actions のデプロイを有効にするとき

`.github/workflows/deploy.yml` は **`workflow_dispatch` 専用のまま**にしてあります。
ドメインの判断が済むまで自動デプロイしません。

有効にするときに要る秘密情報:

```bash
gh secret set CLOUDFLARE_API_TOKEN   # 値は対話プロンプトで入れる
gh secret set CLOUDFLARE_ACCOUNT_ID
```

⚠ **`--body <値>` で値を引数に直書きしないこと**（履歴・ログ・transcript に残る。
`~/.claude/rules/secrets.md`「引数経路」）。
