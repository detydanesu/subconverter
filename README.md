# Subconverter Web

基于 **Cloudflare Worker** 的轻量订阅转换工具。输入订阅链接 → 输出 Clash / Clash Verge Rev / sing-box / v2ray 等客户端可直接使用的配置。

- 一个 Worker 即承载 **API + 静态页**，无需额外服务
- 支持 **KV 配置多个访问密钥**，同时支持 `?pass=` 与 `Authorization: Bearer` 头
- 静态页**纯浏览器拼接** URL，密钥不会上送任何第三方
- 支持订阅源：节点 URI 列表（明文/Base64）、Clash YAML
- 支持目标格式：`clash`、`clash-meta`、`singbox`、`v2ray`、`uri`
- 支持协议：vmess / vless（含 Reality）/ trojan / ss / ssr / hysteria2 / tuic

## 接口

```
GET /api/sub?url=<订阅链接>&target=<目标>&pass=<密钥>
GET /api/health
```

也可使用请求头鉴权（与 `pass` 二选一即可）：

```
Authorization: Bearer <密钥>
```

`target` 取值：

| target        | 适用客户端                                    |
| ------------- | --------------------------------------------- |
| `clash`       | Clash / Clash Verge / Clash Verge Rev / Mihomo |
| `clash-meta`  | Clash.Meta / Mihomo                           |
| `singbox`     | sing-box / NekoBox / SFI / SFA                |
| `v2ray`       | v2rayN / v2rayNG / NekoRay（Base64 订阅）     |
| `uri`         | 任意支持节点 URI 的客户端（明文）             |

## 部署

### 1. 安装依赖

```bash
npm install
```

### 2. 创建 KV 命名空间

```bash
npx wrangler kv namespace create AUTH_KV
```

把命令输出的 `id` 粘贴到 `wrangler.toml` 的 `[[kv_namespaces]]` 段。

### 3. 配置访问密钥（任选其一或多种组合）

**方式 A：KV 单条密钥**（推荐，最快查询）

```bash
npx wrangler kv key put --binding=AUTH_KV "key:my-secret-key" "1"
npx wrangler kv key put --binding=AUTH_KV "key:another-key" "用户A"
```

**方式 B：KV 列表**

```bash
npx wrangler kv key put --binding=AUTH_KV "keys" '["k1","k2","k3"]'
```

**方式 C：环境变量**（适合临时/简易场景）

```bash
npx wrangler secret put STATIC_KEYS
# 输入: k1,k2,k3
```

> 三种方式可同时存在，任一命中即放行。

### 4. 本地开发

```bash
npm run dev
```

访问 http://127.0.0.1:8787 即可看到前端页面。

### 5. 部署到 Cloudflare

```bash
npm run deploy
```

部署完成后会拿到一个 `https://subconverter-web.<子域>.workers.dev` 的链接，前端页面与 API 都在该域名下。

## 使用流程

1. 访问 Worker 的根路径，进入静态页
2. 填入：原始订阅链接、目标格式、访问密钥
3. 页面自动拼好形如 `https://your-worker.dev/api/sub?url=...&target=clash&pass=...` 的链接
4. 把这个链接粘贴到 Clash Verge Rev / sing-box / v2rayN 等客户端的"订阅"中即可

## 目录结构

```
.
├── public/
│   └── index.html        前端单页（纯浏览器，无后端依赖）
├── src/
│   ├── index.ts          Worker 入口与路由
│   ├── auth.ts           KV / env 鉴权
│   ├── fetcher.ts        订阅源抓取
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
│       └── base64.ts
├── wrangler.toml
├── tsconfig.json
└── package.json
```

## 设计说明

- **解析与转换严格分离**：所有解析器先把节点归一化为 `ProxyNode` 中间结构，再由转换器输出目标格式，方便后续扩展（新增 Surge / Quantumult X 仅需写一个 converter）
- **鉴权层级**：`KV key:<value>` (O(1)) → `KV keys` (列表) → `STATIC_KEYS` (env)，前者命中后短路，避免多次 KV 查询
- **CORS 默认放开**：`Access-Control-Allow-Origin: *`，方便部分客户端的预检请求
- **抓取 UA**：默认 `ClashforWindows/0.20.39`，可在 `wrangler.toml` 的 `[vars]` 内通过 `DEFAULT_UA` 调整

## 安全建议

- 不要把 KV 命名空间设为 public；密钥永远不要写进前端代码
- 推荐启用 Cloudflare 的 Workers 自定义域名 + WAF 规则限制单 IP 速率
- 静态页保存到 `localStorage` 的字段仅在用户当前浏览器，不会回传

## 常见问题

**Q：返回 401？**
密钥未配置或拼错。检查 KV 中是否有 `key:<your-key>` 或 `keys` 列表，或确认 `STATIC_KEYS` 已设置。

**Q：返回 422 "未解析出任何节点"？**
- 订阅源走了反爬（试着改 `DEFAULT_UA`）
- 订阅源不是上述支持的格式
- 订阅链接需要登录态/IP 白名单

**Q：sing-box 配置中没有某个节点？**
sing-box 不支持 SSR，相关节点会被自动忽略。其它协议都有覆盖。

**Q：能加新格式吗？**
在 `src/converters/` 下新增一个文件并在 `converters/index.ts` 注册即可。

## License

MIT
