# 安全加固与 Secret 迁移

本文档用于在不破坏现有 Freemail 接口协议的前提下，逐步完成安全加固。

## 目标

- 不修改 `cc.snacktruckmall.shop` 当前依赖的 Freemail API 路径与返回结构
- 保留管理员 `Authorization: Bearer <JWT_TOKEN>` 调用方式
- 将明文敏感配置迁移到 Cloudflare Secrets
- 按开关灰度启用 retention cleanup，避免直接影响现网批量注册

## 建议先完成的配置迁移

完整的切换与回滚步骤见：

- [现网执行命令手册](./ops-commands.md)
- [Secret 切换与回滚手册](./secret-rotation-playbook.md)
- [上线前核查清单](./preflight-checklist.md)

### 推荐执行方式

推荐通过 `CLOUDFLARE_API_TOKEN` + `npx wrangler` 执行，避免本机 `wrangler login` 登录到错误账号。

```bash
export CLOUDFLARE_API_TOKEN="<你的 Cloudflare API Token>"
npx wrangler whoami
```

### 1. 管理员密码迁移到 Secret

```bash
npx wrangler secret put ADMIN_PASSWORD -c wrangler.mailfree2.toml
```

如果你历史上使用的是 `ADMIN_PASS`，也可以保留兼容：

```bash
npx wrangler secret put ADMIN_PASS -c wrangler.mailfree2.toml
```

### 2. 严格管理员 Token 迁移到 Secret

```bash
npx wrangler secret put JWT_TOKEN -c wrangler.mailfree2.toml
```

或者：

```bash
npx wrangler secret put JWT_SECRET -c wrangler.mailfree2.toml
```

说明：

- 代码仍然兼容 `JWT_TOKEN` / `JWT_SECRET`
- 严格管理员仍然使用 Header 方式：
  - `Authorization: Bearer <JWT_TOKEN>`
  - `X-Admin-Token: <JWT_TOKEN>`
- 已移除 URL Query `admin_token` 提权方式，避免令牌进入日志、浏览器历史和 Referer

## retention cleanup 灰度启用建议

默认不启用。建议先通过管理员接口观察，再灰度开启。

### 查看当前 retention 配置

```bash
curl -H "Authorization: Bearer <JWT_TOKEN>" \
  https://your.domain/api/admin/retention/status
```

### 手动执行一次清理

```bash
curl -X POST -H "Authorization: Bearer <JWT_TOKEN>" \
  https://your.domain/api/admin/retention/run
```

### 建议的首批配置

```toml
ENABLE_RETENTION_CLEANUP = "true"
MAILBOX_RETENTION_HOURS = "72"
MESSAGE_RETENTION_HOURS = "72"
SENT_EMAIL_RETENTION_DAYS = "15"
RETENTION_CLEANUP_INTERVAL_SECONDS = "900"
DELETE_BATCH_SIZE = "100"
```

## 推荐上线顺序

1. 先迁移 `ADMIN_PASSWORD` / `JWT_TOKEN` 到 Secret
2. 使用管理员 Header 验证现有管理能力正常
3. 调用 `/api/admin/retention/status` 和 `/api/admin/retention/run` 做人工验证
4. 最后再开启 `ENABLE_RETENTION_CLEANUP=true`

## 与 cc.snacktruckmall.shop 的兼容边界

以下接口保持不变：

- `GET /api/domains`
- `GET /api/generate`
- `POST /api/create`
- `GET /api/emails`
- `GET /api/email/:id`
- `GET /api/mailboxes`
- `DELETE /api/mailboxes`

因此不会影响 `cc.snacktruckmall.shop` 当前的：

- 域名批量选择
- 批量注册
- 管理员轮询验证码
- 管理员删除邮箱
