/*
 * 秘匿値の検知パターン ⭐️
 *
 * 出典: ~/.claude/hooks/_secret_patterns.py（2026-09-06 時点）を JS へ移した。
 * **このファイルがこのリポジトリでの唯一の出典。** 他所に正規表現を書き写さないこと。
 *
 * なぜ要るか:
 *   このサイトの素材は運営者自身の ~/.claude で、リポジトリは **public**。
 *   秘匿値が dist/ に 1 度でも出れば、公開・索引され、取り消せない。
 *   検証 K6 がここを使って生成物を実走査する。
 *
 * ⚠ 「プロバイダは鍵の書式を黙って変える」（rules/secrets.md「検知器そのものが腐る」）。
 *   四半期ごとに _secret_patterns.py 側と突き合わせ、足したら必ず
 *   `npm run validate:dist -- --self-test`（陽性対照）で発火を確かめること。
 */

export const SECRET_VALUE_PATTERNS = [
  [/sk-ant-[a-zA-Z0-9_-]{40,}/, 'Anthropic API key'],
  [/sk-proj-[a-zA-Z0-9_-]{40,}/, 'OpenAI project key'],
  [/sk-[a-zA-Z0-9]{40,}/, 'OpenAI legacy key'],
  [/ghp_[A-Za-z0-9]{36}/, 'GitHub Personal Access Token'],
  [/gho_[A-Za-z0-9]{36}/, 'GitHub OAuth token'],
  [/ghs_[A-Za-z0-9]{36}/, 'GitHub server-to-server token'],
  [/ghu_[A-Za-z0-9]{36}/, 'GitHub user-to-server token'],
  [/ghr_[A-Za-z0-9]{36}/, 'GitHub refresh token'],
  [/github_pat_[a-zA-Z0-9_]{80,}/, 'GitHub fine-grained PAT'],
  [/AKIA[0-9A-Z]{16}/, 'AWS access key ID'],
  [/aws_secret_access_key\s*=\s*['"][A-Za-z0-9/+=]{40}['"]/, 'AWS Secret Key'],
  [/AIza[0-9A-Za-z_-]{35}/, 'Google API key'],
  // Google は AI Studio の鍵書式を AIza… から AQ.… へ移行済み（2026-09-02 追加分）
  [/AQ\.[A-Za-z0-9_-]{30,}/, 'Google AI Studio API key'],
  [/GOCSPX-[a-zA-Z0-9_-]{28}/, 'Google OAuth Client Secret'],
  [/xoxb-[0-9a-zA-Z-]{50,}/, 'Slack bot token'],
  [/xoxp-[0-9a-zA-Z-]{50,}/, 'Slack user token'],
  [/xox[abprs]-[0-9]{10,13}-[0-9]{10,13}-[a-zA-Z0-9]{24}/, 'Slack token (workspace format)'],
  [/glpat-[0-9a-zA-Z_-]{20,}/, 'GitLab Personal Access Token'],
  [/AAAA[A-Za-z0-9_-]{40,}:[A-Za-z0-9_-]{100,}/, 'Firebase server key'],
  [/-----BEGIN (RSA |DSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/, 'Private key'],
  [/sk_live_[0-9a-zA-Z]{24,}/, 'Stripe secret key'],
  [/rk_live_[0-9a-zA-Z]{24,}/, 'Stripe restricted key'],
  [/[MNO][A-Za-z\d_-]{23,25}\.[A-Za-z\d_-]{6}\.[A-Za-z\d_-]{27,}/, 'Discord bot token'],
  [/1\/\/0[A-Za-z0-9_-]{28,}/, 'Google OAuth refresh token'],
  [/npm_[A-Za-z0-9]{36}/, 'npm access token'],
  [/SG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}/, 'SendGrid API key'],
  [/xapp-\d-[A-Za-z0-9]+-\d{10,13}-[a-f0-9]{64}/, 'Slack app-level token'],
];

/*
 * 素性の割れる文字列。秘匿値ではないが public サイトに出したくないもの。
 * ホームパスは ~/.claude 由来の素材に頻出する（slash command が Vault パスを直書きしている）。
 */
export const PRIVATE_STRING_PATTERNS = [
  [/\/Users\/[a-z0-9_.-]+\//i, 'ローカルの絶対パス（利用者名が出る）'],
  [/com~apple~CloudDocs/, 'iCloud Drive の実パス'],
  [/\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/, 'メールアドレス'],
  [/\b(?:\d{1,3}\.){3}\d{1,3}\b/, 'IP アドレス'],
];

/*
 * 陽性対照（rules/workflow.md「検証の作法」）。
 * pass を証拠に使う前に、**先に fail を確かめる**ための既知の陽性サンプル。
 * 本物ではなく、書式だけ合わせたダミー。
 */
export const POSITIVE_CONTROLS = [
  ['sk-ant-' + 'A'.repeat(45), 'Anthropic API key'],
  ['AIza' + 'B'.repeat(35), 'Google API key'],
  ['AQ.' + 'C'.repeat(32), 'Google AI Studio API key'],
  ['/Users/example/.claude/', 'ローカルの絶対パス（利用者名が出る）'],
];
