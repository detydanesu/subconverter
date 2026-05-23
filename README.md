# Subconverter

基于 **Cloudflare Worker** 的轻量订阅转换工具。输入订阅链接 → 输出 Clash / Clash Verge Rev / sing-box / v2ray 等客户端可直接使用的配置。

- 一个 Worker 即承载 **API + 静态页**，无需额外服务
- 支持 **KV 配置多个访问密钥**，推荐 `Authorization: Bearer` 头鉴权（避免链接泄露）
- 静态页**纯浏览器拼接** URL，密钥默认仅在内存 / sessionStorage
- 内置 **SSRF 防护**：拒绝内网/链路本地/回环目标，默认仅 HTTPS
- 内置 **响应大小上限** 5MB，防止恶意订阅源 OOM/CPU DoS
- 支持订阅源：节点 URI 列表（明文/Base64）、Clash YAML
- 支持目标格式：`clash`、`clash-meta`、`singbox`、`v2ray`、`uri`
- 支持协议：vmess / vless（含 Reality）/ trojan / ss / ssr / hysteria2 / tuic

## 接口

```
GET /api/sub?url=<订阅链接>&target=<目标>
GET /api/health
```

### 鉴权（二选一，推荐 Header）

```
# 推荐：HTTP 头（不会出现在地址栏 / 浏览器历史 / 大多数日志中）
Authorization: Bearer <密钥>

# 兼容：URL 查询参数（密钥会随 URL 流入日志、历史、客户端日志）
GET /api/sub?...&pass=<密钥>
```

> ⚠️ `?pass=` 的密钥**会被客户端、浏览器、CDN 日志记录**。仅在客户端不支持自定义请求头时使用。

### `target` 取值

| target        | 适用客户端                                    |
| ------------- | --------------------------------------------- |
| `clash`       | Clash / Clash Verge / Clash Verge Rev / Mihomo |
| `clash-meta`  | Clash.Meta / Mihomo                           |
| `singbox`     | sing-box / NekoBox / SFI / SFA                |
| `v2ray`       | v2rayN / v2rayNG / NekoRay（Base64 订阅）     |
| `uri`         | 任意支持节点 URI 的客户端（明文）             |

### 错误码

| 状态 | 含义                                           |
| ---- | ---------------------------------------------- |
| 400  | 参数缺失/非法、订阅 URL 校验失败（含内网拦截） |
| 401  | 缺少或无效的密钥                               |
| 405  | 非 GET/HEAD 方法                               |
| 413  | 上游响应超过 5MB                               |
| 422  | 订阅源解析后无可用节点                         |
| 502  | 上游不可达 / 非 2xx                            |

## 部署

### 一键部署（推荐）

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/dianbanjiu/subconverter)

点击按钮后，Cloudflare 会自动 fork 本仓库到你的 GitHub、创建 `AUTH_KV` 命名空间、写回 ID 并完成首次部署。部署后只需按下文 **步骤 3** 配置访问密钥即可使用。

### 手动部署

#### 1. 安装依赖

```bash
npm install
```

#### 2. 创建 KV 命名空间

```bash
npx wrangler kv namespace create AUTH_KV
```

把命令输出的 `id` 粘贴到 `wrangler.toml`，替换占位符 `REPLACE_WITH_YOUR_KV_ID`：

```toml
[[kv_namespaces]]
binding = "AUTH_KV"
id = "你刚拿到的 id"
```

> 仓库自带的 `wrangler.toml` 故意只放占位符，方便 fork 后各自填写自己的 KV ID。**KV ID 不是密钥**，写进自己 fork 的仓库里没有安全问题。

#### 3. 配置访问密钥（任选一种或多种组合）

> 强烈建议密钥使用 ≥ 24 字符的随机串，例如 `openssl rand -hex 32`。

**方式 A：KV 单条密钥**（推荐，最快查询）

```bash
npx wrangler kv key put --binding=AUTH_KV "key:<your-key>" "1"
npx wrangler kv key put --binding=AUTH_KV "key:<another-key>" "用户A 备注"
```

**方式 B：KV 列表**

```bash
npx wrangler kv key put --binding=AUTH_KV "keys" '["k1","k2","k3"]'
```

**方式 C：环境变量兜底**

```bash
npx wrangler secret put STATIC_KEYS
# 输入：k1,k2,k3
```

> 三种方式可同时存在，任一命中即放行。

#### 4. （可选）开启 HTTP 订阅源支持

默认仅允许 `https://` 上游订阅源。如需放开：

```bash
npx wrangler secret put ALLOW_HTTP_SUBSCRIPTION
# 输入：true
```

> 不推荐：HTTP 上游订阅会让节点凭据在公网明文传输。

#### 5. 推荐：在 Cloudflare Dashboard 配置速率限制

密钥一旦泄露，攻击者可滥用 Worker 当作出站代理。建议在 **Worker 路由 / 自定义域** 上加 WAF 速率限制：

1. Cloudflare Dashboard → 选择 Worker 所属域 → **Security → WAF → Rate limiting rules**
2. 新建规则，匹配条件：`URI Path contains /api/sub`
3. 限制：例如 `60 requests per 1 minute per IP`，超出动作 `Block`（或 `Managed challenge`）

> 免费版每域 1 条免费规则；Workers Paid Plan 推荐配合 [Workers Rate Limiting API](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/) 做按密钥粒度限速。

#### 6. 本地开发

```bash
npm run dev          # 默认端口 8787
npm run typecheck    # 类型检查
```

#### 7. 部署到 Cloudflare

```bash
npm run deploy
```

部署完成后会拿到一个 `https://subconverter-web.<子域>.workers.dev` 的链接，前端页面与 API 都在该域名下。

## 使用流程

1. 访问 Worker 的根路径，进入静态页
2. 填入：原始订阅链接、目标格式、访问密钥
3. **保留默认勾选的"使用 Authorization 请求头"**（更安全）
4. 点击"生成订阅链接"，得到：
   - 一段不含密钥的 URL
   - 一段 `Authorization: Bearer ...` 请求头
5. 在客户端的"订阅"中：
   - URL 填入第 1 段
   - "请求头/Headers" 填入第 2 段
6. 客户端不支持自定义 Header 时，取消勾选，密钥会回退到 `?pass=` 形式

## 目录结构

```
.
├── public/
│   └── index.html        前端单页（纯浏览器，无后端依赖）
├── src/
│   ├── index.ts          Worker 入口与路由
│   ├── auth.ts           KV / env 鉴权（常量时间比较）
│   ├── fetcher.ts        订阅源抓取（5MB 上限）
│   ├── types.ts          代理节点中间表示
│   ├── parsers/
│   │   ├── index.ts      自动识别（base64 / yaml / uri）
│   │   ├── uri.ts        各协议 URI 解析
│   │   └── clash.ts      Clash YAML 解析
│   ├── converters/
│   │   ├── index.ts      调度
│   │   ├── clash.ts      → Clash Meta YAML
│   │   ├── singbox.ts    → sing-box JSON
│   │   └── uri.ts        → 节点 URI / Base64
│   └── utils/
│       ├── base64.ts
│       └── url-guard.ts  SSRF / 内网黑名单 / 协议白名单
├── wrangler.toml
├── tsconfig.json
└── package.json
```

## 安全模型

| 风险                              | 缓解措施                                                       |
| --------------------------------- | -------------------------------------------------------------- |
| 未授权调用                        | KV / env 配置密钥；常量时间比较；最小输入长度校验              |
| 密钥经 URL 泄露                   | 静态页默认推 Header 鉴权；密钥不写 localStorage（除非显式勾选）|
| SSRF（内网/元数据/回环）          | `url-guard.ts` 拒绝 RFC1918 / loopback / link-local / `*.local` 等 |
| 协议混用攻击                      | 仅放行 `http(s)`；默认禁 `http`，需 env 显式开启               |
| 大响应 OOM / YAML 锚点炸弹 DoS    | Content-Length 预检 + 流式 5MB 上限                            |
| 错误信息回显内部细节              | 上游错误统一脱敏，详细信息仅 `console.warn` 到 Worker 日志     |
| 指纹暴露                          | `/api/health` 仅返回 `ok`；不再列出支持的 target               |
| 时序旁路                          | 列表/env 鉴权使用常量时间比较                                  |
| 滥用为出站代理（密钥泄露后放大） | 推荐配合 Cloudflare WAF 速率限制（见部署步骤 5）              |

### 仍需用户警惕

- **原始订阅 URL 自带 token**——把它放进 `url=` 参数后，本服务的访问密钥泄露 ≈ 你订阅商的 token 一同泄露。建议：① 仅给可信用户分发密钥；② 一密钥一人，便于撤销
- **共享设备**：默认密钥放 sessionStorage，关页面即清；但勾选了"在本机记住密钥"后会写 localStorage，请谨慎
- **客户端日志**：Clash Verge / sing-box 等客户端可能会把订阅 URL 写进自己的 log；用 Header 鉴权可避免

## 常见问题

**Q：返回 401？**
密钥未配置或拼错。检查 KV 中是否有 `key:<your-key>`、`keys` 列表，或确认 `STATIC_KEYS` 已设置。Header 鉴权请确保格式 `Authorization: Bearer <key>`，不接受裸 token。

**Q：返回 400 "禁止访问内网"？**
SSRF 防护拦截了。订阅 URL 指向了 `127.0.0.1` / `192.168.x.x` / `localhost` / `*.local` 等内部目标。订阅源应当是公网可达的服务。

**Q：返回 400 "默认仅允许 https"？**
明文 HTTP 上游被默认拒绝。如确需放开（不推荐），见部署步骤 4。

**Q：返回 413 "订阅响应过大"？**
上游返回超过 5MB。正常订阅文件远小于此，请检查上游是否正确返回订阅而非 HTML 页面。

**Q：返回 422 "未解析出任何节点"？**
- 订阅源走了反爬（试着改 `DEFAULT_UA`）
- 订阅源不是支持的格式（base64 / Clash YAML / URI 列表之一）
- 订阅链接需要登录态/IP 白名单

**Q：sing-box 配置中没有某个节点？**
sing-box 不支持 SSR，相关节点会被自动忽略。其它协议都有覆盖。

**Q：能加新格式吗？**
在 `src/converters/` 下新增一个文件并在 `converters/index.ts` 注册即可。

## License

MIT
