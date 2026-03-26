# 现网执行命令手册

本文档是最短命令版，适合你在现网按顺序直接执行。

前提：

- 当前目录位于 Freemail 项目根目录
- 目标站点是 `https://fm.snacktruckmall.shop`
- 现网路由配置位于 `wrangler.mailfree2.toml`
- 你已经准备好新的 `ADMIN_PASSWORD` 和 `JWT_TOKEN`

当前实际执行前还有 3 个阻塞项必须满足：

- `CLOUDFLARE_API_TOKEN` 必须可用，否则 `npx wrangler` 无法操作正确账号下的 Worker
- `ADMIN_PASSWORD` 必须是这次准备写入的真实值，否则无法完成 Secret 写入和 `/api/login` 验证
- `JWT_TOKEN` 必须是这次准备写入的真实值，否则无法完成 Secret 写入和管理员 Bearer 验证

## 零、先准备 Cloudflare API Token

推荐直接使用 `CLOUDFLARE_API_TOKEN`，不要依赖交互式 `wrangler login`。

最小执行方式：

```bash
export CLOUDFLARE_API_TOKEN="<你的 Cloudflare API Token>"
```

之后所有命令都沿用同一个 shell 执行：

```bash
npx wrangler secret put ADMIN_PASSWORD -c wrangler.mailfree2.toml
npx wrangler secret put JWT_TOKEN -c wrangler.mailfree2.toml
npx wrangler deploy -c wrangler.mailfree2.toml
```

权限建议：

- 至少包含该 Worker 所在账号的 Workers 编辑权限
- 至少包含对应 Zone 的 Workers Route / 域名相关权限
- 如果 Worker 绑定了 D1 / R2，Token 也应覆盖对应资源的读写权限

## 零点一、整段可复制的非交互执行版

如果你已经准备好 3 个值，可以直接在同一个 shell 中执行下面整段：

```bash
cd /root/freemail

export CLOUDFLARE_API_TOKEN="<你的 Cloudflare API Token>"
export ADMIN_PASSWORD="<新的管理员密码>"
export JWT_TOKEN="<新的严格管理员 Token>"

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

说明：

- `printf '%s' ... | npx wrangler secret put ...` 可以避免再次交互输入 Secret
- `npx wrangler whoami` 必须先过，确保当前 API Token 命中的是正确账号
- 若 `ADMIN_PASSWORD` 或 `JWT_TOKEN` 中包含特殊字符，优先用单引号包住 `export` 右侧值
- 如果这 3 个值里任意一个还没有最终值，不要先跑后面的 `secret put` / `deploy` / `curl`

## 一、先写入 Secret

```bash
npx wrangler secret put ADMIN_PASSWORD -c wrangler.mailfree2.toml
npx wrangler secret put JWT_TOKEN -c wrangler.mailfree2.toml
```

如果历史兼容需要，也可以补：

```bash
npx wrangler secret put ADMIN_PASS -c wrangler.mailfree2.toml
npx wrangler secret put JWT_SECRET -c wrangler.mailfree2.toml
```

## 二、先部署，但暂时不要删 toml 明文

```bash
npx wrangler deploy -c wrangler.mailfree2.toml
```

## 三、验证管理员 Bearer

```bash
curl -i \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  https://fm.snacktruckmall.shop/api/session
```

通过标准：

- HTTP 200
- 返回 `role=admin`
- 返回 `strictAdmin=true`

## 四、验证管理员登录

```bash
curl -i \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"<ADMIN_PASSWORD>"}' \
  https://fm.snacktruckmall.shop/api/login
```

通过标准：

- HTTP 200
- 返回 `success: true`

## 五、验证 cc 兼容红线接口

```bash
curl -H "Authorization: Bearer <JWT_TOKEN>" \
  https://fm.snacktruckmall.shop/api/domains

curl -H "Authorization: Bearer <JWT_TOKEN>" \
  "https://fm.snacktruckmall.shop/api/generate?domainIndex=0"

curl -H "Authorization: Bearer <JWT_TOKEN>" \
  "https://fm.snacktruckmall.shop/api/mailboxes?limit=5"
```

通过标准：

- 域名列表正常
- 能生成邮箱
- 能列出邮箱

## 六、手动验证 retention

```bash
curl -i \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  https://fm.snacktruckmall.shop/api/admin/retention/status

curl -i \
  -X POST \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  https://fm.snacktruckmall.shop/api/admin/retention/run
```

通过标准：

- 都返回 HTTP 200
- 没有 SQL / R2 错误

## 七、自动清理最终配置

当前现网最终建议值如下；确认管理员接口和 `cc` 最小链路都通过后，按这组值部署：

```toml
ENABLE_RETENTION_CLEANUP = "true"
MAILBOX_RETENTION_HOURS = "72"
MESSAGE_RETENTION_HOURS = "72"
SENT_EMAIL_RETENTION_DAYS = "15"
RETENTION_CLEANUP_INTERVAL_SECONDS = "900"
DELETE_BATCH_SIZE = "100"
```

```bash
npx wrangler deploy -c wrangler.mailfree2.toml
```

## 八、确认 cc 最小注册链路

手工在 `cc.snacktruckmall.shop` 做一次最小任务，确认：

- 能建邮箱
- 能收验证码
- 能完成流程
- 没有 401/403/500

## 九、最后再移除 toml 明文

确认全部正常后，再删：

- `ADMIN_PASSWORD = "..."`
- `JWT_TOKEN = "..."`
- `JWT_SECRET = "..."`

然后重新部署：

```bash
npx wrangler deploy -c wrangler.mailfree2.toml
```

## 十、回滚最短命令

如果异常，优先回滚到“保留明文 + 重新部署”的状态：

```bash
npx wrangler deploy -c wrangler.mailfree2.toml
```

如果 Secret 被误删或值错误，重新写入：

```bash
npx wrangler secret put ADMIN_PASSWORD -c wrangler.mailfree2.toml
npx wrangler secret put JWT_TOKEN -c wrangler.mailfree2.toml
npx wrangler deploy -c wrangler.mailfree2.toml
```

## 十一、配套文档

- [API Token 现网 Runbook](./api-token-runbook.md)
- [安全加固与 Secret 迁移](./security-hardening.md)
- [Secret 切换与回滚手册](./secret-rotation-playbook.md)
- [上线前核查清单](./preflight-checklist.md)
