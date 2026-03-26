# API Token 现网 Runbook

本文档只保留一种执行路径：

- 使用 `CLOUDFLARE_API_TOKEN`
- 使用 `npx wrangler`
- 显式指定 `-c wrangler.mailfree2.toml`
- 目标域名固定为 `fm.snacktruckmall.shop`

适用场景：

- 需要避免 `wrangler login` 登录到错误 Cloudflare 账号
- 需要把 `ADMIN_PASSWORD` / `JWT_TOKEN` 写入正确的现网 Worker
- 需要按固定顺序完成 deploy 与接口验收

## 一、准备 3 个值

在同一个 shell 中准备：

- `CLOUDFLARE_API_TOKEN`
- `ADMIN_PASSWORD`
- `JWT_TOKEN`

这 3 项都是阻塞项，缺一不可：

- `CLOUDFLARE_API_TOKEN` 缺失时，`npx wrangler whoami` / `secret put` / `deploy` 无法命中正确 Cloudflare 账号
- `ADMIN_PASSWORD` 缺失时，无法写入管理员密码 Secret，也无法验证 `/api/login`
- `JWT_TOKEN` 缺失时，无法写入严格管理员 Token Secret，也无法验证 Bearer 鉴权与 retention 管理接口

推荐写法：

```bash
cd /root/freemail

export CLOUDFLARE_API_TOKEN='<你的 Cloudflare API Token>'
export ADMIN_PASSWORD='<新的管理员密码>'
export JWT_TOKEN='<新的严格管理员 Token>'
```

说明：

- 如果值里包含特殊字符，优先使用单引号
- 不要把这 3 个值写回 `wrangler.mailfree2.toml`
- 当前现网配置文件固定是 `wrangler.mailfree2.toml`，不要误用默认 `wrangler.toml`
- 如果 3 个值中任意一个还没准备好，先停在这里，不要继续执行后面的命令

## 二、先确认当前 Cloudflare 账号

```bash
npx wrangler whoami
```

通过标准：

- 命中了预期的 Cloudflare 账号
- 没有出现 `You are not authenticated`

如果失败，先停，不要继续写 Secret 或 deploy。

## 三、写入 Secret

```bash
printf '%s' "$ADMIN_PASSWORD" | npx wrangler secret put ADMIN_PASSWORD -c wrangler.mailfree2.toml
printf '%s' "$JWT_TOKEN" | npx wrangler secret put JWT_TOKEN -c wrangler.mailfree2.toml
```

如果历史兼容仍需要，也可以补：

```bash
printf '%s' "$ADMIN_PASSWORD" | npx wrangler secret put ADMIN_PASS -c wrangler.mailfree2.toml
printf '%s' "$JWT_TOKEN" | npx wrangler secret put JWT_SECRET -c wrangler.mailfree2.toml
```

说明：

- 这里使用管道输入，避免 `wrangler secret put` 再次进入交互式输入
- 现阶段不要先删 `wrangler.mailfree2.toml` 中已有的明文值

## 四、部署现网 Worker

```bash
npx wrangler deploy -c wrangler.mailfree2.toml
```

通过标准：

- deploy 成功
- 没有把路由打到错误 Worker
- 输出中目标 Worker 仍为 `mailfree2`

## 五、验证管理员 Bearer

```bash
curl -i \
  -H "Authorization: Bearer $JWT_TOKEN" \
  https://fm.snacktruckmall.shop/api/session
```

通过标准：

- HTTP 200
- 返回里有 `role=admin`
- 返回里有 `strictAdmin=true`

## 六、验证管理员登录

```bash
curl -i \
  -X POST \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"admin\",\"password\":\"$ADMIN_PASSWORD\"}" \
  https://fm.snacktruckmall.shop/api/login
```

通过标准：

- HTTP 200
- 返回 `success: true`
- 返回 `Set-Cookie`

## 七、验证 cc 兼容红线接口

```bash
curl -H "Authorization: Bearer $JWT_TOKEN" \
  https://fm.snacktruckmall.shop/api/domains

curl -H "Authorization: Bearer $JWT_TOKEN" \
  "https://fm.snacktruckmall.shop/api/generate?domainIndex=0"

curl -H "Authorization: Bearer $JWT_TOKEN" \
  "https://fm.snacktruckmall.shop/api/mailboxes?limit=5"
```

通过标准：

- `/api/domains` 返回域名数组
- `/api/generate` 能返回邮箱
- `/api/mailboxes` 能列出邮箱
- 无 401 / 403 / 500

## 八、验证 retention 管理接口

```bash
curl -i \
  -H "Authorization: Bearer $JWT_TOKEN" \
  https://fm.snacktruckmall.shop/api/admin/retention/status

curl -i \
  -X POST \
  -H "Authorization: Bearer $JWT_TOKEN" \
  https://fm.snacktruckmall.shop/api/admin/retention/run
```

通过标准：

- 都返回 HTTP 200
- 没有 SQL 错误
- 没有 R2 绑定错误

## 九、现网最终 retention 配置

当前现网最终建议值：

```toml
ENABLE_RETENTION_CLEANUP = "true"
MAILBOX_RETENTION_HOURS = "72"
MESSAGE_RETENTION_HOURS = "72"
SENT_EMAIL_RETENTION_DAYS = "15"
RETENTION_CLEANUP_INTERVAL_SECONDS = "900"
DELETE_BATCH_SIZE = "100"
```

对应文件：

- [`wrangler.mailfree2.toml`](/root/freemail/wrangler.mailfree2.toml)

## 十、整段可复制执行版

```bash
cd /root/freemail

export CLOUDFLARE_API_TOKEN='<你的 Cloudflare API Token>'
export ADMIN_PASSWORD='<新的管理员密码>'
export JWT_TOKEN='<新的严格管理员 Token>'

npx wrangler whoami

printf '%s' "$ADMIN_PASSWORD" | npx wrangler secret put ADMIN_PASSWORD -c wrangler.mailfree2.toml
printf '%s' "$JWT_TOKEN" | npx wrangler secret put JWT_TOKEN -c wrangler.mailfree2.toml

npx wrangler deploy -c wrangler.mailfree2.toml

curl -i \
  -H "Authorization: Bearer $JWT_TOKEN" \
  https://fm.snacktruckmall.shop/api/session

curl -i \
  -X POST \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"admin\",\"password\":\"$ADMIN_PASSWORD\"}" \
  https://fm.snacktruckmall.shop/api/login

curl -H "Authorization: Bearer $JWT_TOKEN" \
  https://fm.snacktruckmall.shop/api/domains

curl -H "Authorization: Bearer $JWT_TOKEN" \
  "https://fm.snacktruckmall.shop/api/generate?domainIndex=0"

curl -H "Authorization: Bearer $JWT_TOKEN" \
  "https://fm.snacktruckmall.shop/api/mailboxes?limit=5"

curl -i \
  -H "Authorization: Bearer $JWT_TOKEN" \
  https://fm.snacktruckmall.shop/api/admin/retention/status

curl -i \
  -X POST \
  -H "Authorization: Bearer $JWT_TOKEN" \
  https://fm.snacktruckmall.shop/api/admin/retention/run
```

## 十一、回滚最短命令

如果现网异常，先不要删明文，优先重部署：

```bash
npx wrangler deploy -c wrangler.mailfree2.toml
```

如果 Secret 值错误，重新写入：

```bash
printf '%s' "$ADMIN_PASSWORD" | npx wrangler secret put ADMIN_PASSWORD -c wrangler.mailfree2.toml
printf '%s' "$JWT_TOKEN" | npx wrangler secret put JWT_TOKEN -c wrangler.mailfree2.toml
npx wrangler deploy -c wrangler.mailfree2.toml
```
