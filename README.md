# Subconverter

基于 **Cloudflare Worker** 的轻量订阅转换工具。输入订阅链接 → 输出 Clash / Clash Verge Rev / sing-box / v2ray 等客户端可直接使用的配置。

- 一个 Worker 即承载 **API + 静态页**，无需额外服务
- 公开访问，无需密钥或自定义请求头
- `/sub` 兼容常见 SubConverter 调用方式；`config=` 可加载 ACL4SSR/SubConverter INI
- 为 OpenClash/Mihomo 生成完整 YAML，并直接展开远程规则，避免第三方 `/getruleset` 缓存
- 静态页**纯浏览器拼接** URL
- 内置 **SSRF 防护**：拒绝内网/链路本地/回环目标，默认仅 HTTPS
- 内置 **响应大小上限** 5MB，防止恶意订阅源 OOM/CPU DoS
- 支持订阅源：节点 URI 列表（明文/Base64）、Clash YAML
- 支持目标格式：`clash`、`clash-meta`、`singbox`、`v2ray`、`uri`
- 支持协议：vmess / vless（含 Reality）/ trojan / ss / ssr / hysteria2 / tuic

## 接口

```
GET /sub?url=<订阅链接>&target=<目标>&config=<外部 INI>
GET /api/sub?url=<订阅链接>&target=<目标>&config=<外部 INI>
GET /api/health
```

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
| 405  | 非 GET/HEAD 方法                               |
| 413  | 上游响应超过 5MB                               |
| 422  | 订阅源解析后无可用节点                         |
| 502  | 上游不可达 / 非 2xx                            |

## 部署

### 一键部署（推荐）

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/detydanesu/subconverter)

点击按钮后，Cloudflare 会部署本仓库。

### 手动部署

#### 1. 安装依赖

```bash
npm install
```

#### 2. （可选）开启 HTTP 订阅源支持

默认仅允许 `https://` 上游订阅源。如需放开：

```bash
npx wrangler secret put ALLOW_HTTP_SUBSCRIPTION
# 输入：true
```

> 不推荐：HTTP 上游订阅会让节点凭据在公网明文传输。

#### 3. 推荐：在 Cloudflare Dashboard 配置速率限制

本服务是公开接口，建议在 **Worker 路由 / 自定义域** 上加 WAF 速率限制：

1. Cloudflare Dashboard → 选择 Worker 所属域 → **Security → WAF → Rate limiting rules**
2. 新建规则，匹配条件：`URI Path contains /sub`
3. 限制：例如 `60 requests per 1 minute per IP`，超出动作 `Block`（或 `Managed challenge`）

> 可以配合 [Workers Rate Limiting API](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/) 或 Cloudflare WAF 做滥用防护。

#### 4. 本地开发

```bash
npm run dev          # 默认端口 8787
npm run typecheck    # 类型检查
```

#### 5. 部署到 Cloudflare

```bash
npm run deploy
```

部署完成后会拿到一个 `https://subconverter-web.<子域>.workers.dev` 的链接，前端页面与 API 都在该域名下。

## 使用流程

1. 访问 Worker 的根路径，进入静态页
2. 填入原始订阅链接并选择目标格式
3. 点击"生成订阅链接"
4. 将生成的 URL 填入客户端的"订阅"中

### OpenClash 在线订阅转换

OpenClash 的“订阅转换服务地址”填写 Worker 的 `/sub` 地址，例如：

```text
https://clash.example.com/sub
```

Worker 的 `/version` 接口允许 OpenClash 检测后端版本。无需在"自定义参数（Custom Params）"中填写 `pass`。

## 目录结构

```
.
├── public/
│   └── index.html        前端单页（纯浏览器，无后端依赖）
├── src/
│   ├── index.ts          Worker 入口与路由
│   ├── fetcher.ts        订阅源抓取（5MB 上限）
│   ├── openclash.ts      外部 INI、策略组与规则展开
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
├── wrangler.jsonc
├── tsconfig.json
└── package.json
```

## 安全模型

| 风险                              | 缓解措施                                                       |
| --------------------------------- | -------------------------------------------------------------- |
| 公开接口被滥用                  | 建议为 `/sub` 配置 Cloudflare WAF 或速率限制             |
| SSRF（内网/元数据/回环）          | `url-guard.ts` 拒绝 RFC1918 / loopback / link-local / `*.local` 等 |
| 协议混用攻击                      | 仅放行 `http(s)`；默认禁 `http`，需 env 显式开启               |
| 大响应 OOM / YAML 锚点炸弹 DoS    | Content-Length 预检 + 流式 5MB 上限                            |
| 错误信息回显内部细节              | 上游错误统一脱敏，详细信息仅 `console.warn` 到 Worker 日志     |
| 指纹暴露                          | `/api/health` 仅返回 `ok`；不再列出支持的 target               |
| 滥用为出站代理                | 推荐配合 Cloudflare WAF 速率限制（见部署步骤 3）              |

### 仍需用户警惕

- **原始订阅 URL 自带 token**——把它放进公开转换 URL 后，客户端、浏览器或 CDN 日志可能会记录它，请不要公开分享生成的完整 URL

## 常见问题

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
