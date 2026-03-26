# Secret 切换与回滚手册

本文档用于在不影响 `fm.snacktruckmall.shop` 和 `cc.snacktruckmall.shop` 现有调用链路的前提下，安全完成敏感配置迁移。

适用场景：

- `ADMIN_PASSWORD` 仍在 `wrangler.toml` / `wrangler.mailfree2.toml` 中明文存在
- `JWT_TOKEN` / `JWT_SECRET` 准备用于严格管理员 Bearer 鉴权
- 希望先灰度验证，再移除配置文件中的明文值

## 迁移原则

1. 先新增 Secret，不立即删除旧值
2. 先验证管理员登录和管理员 Bearer 调用
3. 再验证 retention 管理接口
4. 最后才清理 toml 中的明文敏感项

这样即使中途出错，也不会直接把现网管理能力切断。

## 执行凭据建议

推荐使用 `CLOUDFLARE_API_TOKEN` 执行，不要把流程建立在交互式 `wrangler login` 上。

```bash
export CLOUDFLARE_API_TOKEN="<你的 Cloudflare API Token>"
```

之后所有命令都在同一个 shell 中执行：

```bash
npx wrangler whoami
```

如果这里仍提示未登录，优先检查 `CLOUDFLARE_API_TOKEN` 是否生效，而不是继续使用默认配置文件或错误账号。

## 第一步：新增 Secret

### 1. 设置管理员密码

```bash
npx wrangler secret put ADMIN_PASSWORD -c wrangler.mailfree2.toml
```

如果历史配置用的是 `ADMIN_PASS`，也可以补一份兼容：

```bash
npx wrangler secret put ADMIN_PASS -c wrangler.mailfree2.toml
```

### 2. 设置严格管理员 Token

```bash
npx wrangler secret put JWT_TOKEN -c wrangler.mailfree2.toml
```

或者：

```bash
npx wrangler secret put JWT_SECRET -c wrangler.mailfree2.toml
```

## 第二步：部署但暂不删除 toml 明文

先部署一次，让 Worker 同时具备：

- Secret 中的新值
- toml 中的旧值

```bash
npx wrangler deploy -c wrangler.mailfree2.toml
```

说明：

- 这一阶段的目的不是立刻切换，而是确认 Secret 已经生效
- 不建议在这一步就删除 `wrangler.mailfree2.toml` 里的明文值

## 第三步：验证关键能力

### A. 验证管理员 Bearer 接口

```bash
curl -i \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  https://fm.snacktruckmall.shop/api/session
```

期望结果：

- HTTP 200
- 返回里包含：
  - `"role":"admin"`
  - `"strictAdmin":true`

### B. 验证管理员登录

```bash
curl -i \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"<ADMIN_PASSWORD>"}' \
  https://fm.snacktruckmall.shop/api/login
```

期望结果：

- HTTP 200
- 返回 `success: true`
- 返回 `Set-Cookie: iding-session=...`

### C. 验证 retention 管理接口

```bash
curl -i \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  https://fm.snacktruckmall.shop/api/admin/retention/status
```

```bash
curl -i \
  -X POST \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  https://fm.snacktruckmall.shop/api/admin/retention/run
```

### D. 验证 cc 依赖的 Freemail 基础能力

建议至少手工验证以下接口：

```bash
curl -H "Authorization: Bearer <JWT_TOKEN>" https://fm.snacktruckmall.shop/api/domains
curl -H "Authorization: Bearer <JWT_TOKEN>" "https://fm.snacktruckmall.shop/api/generate?domainIndex=0"
curl -H "Authorization: Bearer <JWT_TOKEN>" "https://fm.snacktruckmall.shop/api/mailboxes?limit=5"
```

如果你在 `cc.snacktruckmall.shop` 里已经配置了该 Freemail 服务，建议再跑一次最小批量注册验证。

## 第四步：移除 toml 中的明文

确认以上验证全部通过后，再清理配置文件中的明文敏感项。

建议清理：

- `ADMIN_PASSWORD = "..."`
- `JWT_TOKEN = "..."`
- `JWT_SECRET = "..."`

然后再次部署：

```bash
npx wrangler deploy -c wrangler.mailfree2.toml
```

## 回滚方案

如果新增 Secret 后出现异常，按下面顺序回滚：

1. 不先删 toml 中的旧值
2. 直接重新部署旧配置
3. 用旧管理员密码重新验证 `/api/login`
4. 用旧 Bearer Token 重新验证 `/api/session`

如果你已经删除了 toml 明文，再出现异常：

1. 立即重新执行：

```bash
npx wrangler secret put ADMIN_PASSWORD -c wrangler.mailfree2.toml
npx wrangler secret put JWT_TOKEN -c wrangler.mailfree2.toml
```

2. 然后重新部署：

```bash
npx wrangler deploy -c wrangler.mailfree2.toml
```

## 不建议的做法

- 不要先删 `wrangler.mailfree2.toml` 里的明文，再去补 Secret
- 不要把 Bearer Token 放到 URL Query 参数
- 不要在未验证 `/api/session` 前直接全量开启 retention cleanup

## 推荐的最终状态

- `ADMIN_PASSWORD` 仅保存在 Cloudflare Secret
- `JWT_TOKEN` 或 `JWT_SECRET` 仅保存在 Cloudflare Secret
- 配置文件中只保留非敏感参数
- retention cleanup 先人工验证，再灰度开启
