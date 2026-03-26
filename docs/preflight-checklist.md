# 上线前核查清单

本文档用于在 `fm.snacktruckmall.shop` 现网灰度前，逐项确认兼容性、安全性和回滚准备是否到位。

目标：

- 不影响 `cc.snacktruckmall.shop` 当前批量注册与域名批量选择
- 不影响 Freemail 管理员 Bearer 调用
- 在启用 retention cleanup 前先完成人工验证

## 一、配置核查

上线前先确认这些配置项状态：

- `ADMIN_PASSWORD` 已准备好
- `JWT_TOKEN` 或 `JWT_SECRET` 已准备好
- `CLOUDFLARE_API_TOKEN` 已准备好，并确认会指向正确 Cloudflare 账号
- `MAIL_DOMAIN` 已确认包含现有可用域名
- `ENABLE_RETENTION_CLEANUP` 是否按本次现网计划显式开启，已确认
- `DELETE_BATCH_SIZE` 未设置过大，建议先保持 `100`

如果准备切到 Secret，先看：

- [Secret 切换与回滚手册](./secret-rotation-playbook.md)

建议先执行：

```bash
export CLOUDFLARE_API_TOKEN="<你的 Cloudflare API Token>"
npx wrangler whoami
```

确认当前凭据命中的就是要操作的 Cloudflare 账号，再继续后面的 Secret / deploy。

## 二、接口兼容性核查

这些接口是 `cc` 当前兼容红线，灰度前必须手测：

```bash
curl -H "Authorization: Bearer <JWT_TOKEN>" https://fm.snacktruckmall.shop/api/domains
curl -H "Authorization: Bearer <JWT_TOKEN>" "https://fm.snacktruckmall.shop/api/generate?domainIndex=0"
curl -H "Authorization: Bearer <JWT_TOKEN>" "https://fm.snacktruckmall.shop/api/mailboxes?limit=5"
```

期望结果：

- `/api/domains` 返回现有域名数组
- `/api/generate` 能返回 `email`
- `/api/mailboxes` 能正常列出邮箱，不报 401/403/500

## 三、管理员能力核查

### 1. Bearer 鉴权

```bash
curl -i \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  https://fm.snacktruckmall.shop/api/session
```

确认：

- HTTP 200
- `role=admin`
- `strictAdmin=true`

### 2. 管理员登录

```bash
curl -i \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"<ADMIN_PASSWORD>"}' \
  https://fm.snacktruckmall.shop/api/login
```

确认：

- HTTP 200
- 返回 `success: true`
- 返回 `Set-Cookie`

## 四、cc 侧最小链路核查

如果 `cc.snacktruckmall.shop` 正在调用该 Freemail 服务，至少做一次最小验证：

1. 在 `cc` 中选中当前 Freemail 服务
2. 触发一次最小规模注册或测试任务
3. 确认能成功创建邮箱
4. 确认能轮询到验证码
5. 确认任务最终正常结束

重点观察：

- 是否出现 401
- 是否出现 403
- 是否出现取码超时
- 是否出现域名选择异常

## 五、retention 灰度前核查

先不要直接打开自动清理。

先执行：

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

确认：

- 接口能返回 200
- 不报 SQL 错误
- 不报 R2 绑定错误
- 返回结构符合预期

只有这一步正常后，再考虑设置：

```toml
ENABLE_RETENTION_CLEANUP = "true"
MAILBOX_RETENTION_HOURS = "72"
MESSAGE_RETENTION_HOURS = "72"
SENT_EMAIL_RETENTION_DAYS = "15"
RETENTION_CLEANUP_INTERVAL_SECONDS = "900"
DELETE_BATCH_SIZE = "100"
```

## 六、日志核查

灰度期间建议重点看 Worker 日志里是否出现这些告警：

- `[security] 管理员密码仍为默认值 admin`
- `[security] 未配置 JWT_TOKEN/JWT_SECRET`
- `[security] 自动 retention cleanup 当前未启用`
- `手动执行 retention cleanup 失败`
- `删除保留期外 R2 对象失败`

如果出现 401/403/500，优先看：

- 管理员 Bearer 是否正确
- Secret 是否已生效
- 是否误删了 toml 中的旧值
- retention 是否过早开启

## 七、回滚准备

上线前必须先准备好回滚信息：

- 旧 `ADMIN_PASSWORD`
- 旧 `JWT_TOKEN`
- 当前使用的 `wrangler` 配置版本
- 一条可立即执行的 `npx wrangler deploy -c wrangler.mailfree2.toml`

如果 Secret 切换也一起做，回滚按这里执行：

- [Secret 切换与回滚手册](./secret-rotation-playbook.md)

## 八、建议执行顺序

1. 先验证管理员 Bearer
2. 再验证管理员登录
3. 再验证 `cc` 最小注册链路
4. 再手动验证 retention 状态和手动运行
5. 最后才开启自动 retention cleanup

## 九、上线通过标准

满足以下条件再算通过：

- `cc.snacktruckmall.shop` 最小注册链路正常
- 管理员登录正常
- 管理员 Bearer 正常
- retention 手动执行正常
- 无新的 401/403/500 异常
- 未发现域名选择或验证码轮询回归
