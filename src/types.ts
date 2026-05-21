// 统一的代理节点中间表示（IR）
// 所有解析器解析输入后产出 ProxyNode[]，所有转换器消费 ProxyNode[] 产出目标格式

export type ProxyType =
  | "vmess"
  | "vless"
  | "trojan"
  | "ss"
  | "ssr"
  | "hysteria2"
  | "tuic";

export interface BaseNode {
  type: ProxyType;
  name: string;
  server: string;
  port: number;
  udp?: boolean;
  tfo?: boolean;
  // 跳过证书验证（仅 TLS 类）
  skipCertVerify?: boolean;
  // 备注（保留原始 fragment）
  raw?: string;
}

export interface TLSOptions {
  tls?: boolean;
  sni?: string;
  alpn?: string[];
  fingerprint?: string;
  // Reality
  publicKey?: string;
  shortId?: string;
}

export interface TransportOptions {
  network?: "tcp" | "ws" | "grpc" | "h2" | "http" | "kcp" | "quic";
  path?: string;
  host?: string;
  serviceName?: string; // grpc
  headers?: Record<string, string>;
}

export interface VmessNode extends BaseNode, TLSOptions, TransportOptions {
  type: "vmess";
  uuid: string;
  alterId: number;
  cipher: string; // auto / aes-128-gcm / chacha20-poly1305 / none
}

export interface VlessNode extends BaseNode, TLSOptions, TransportOptions {
  type: "vless";
  uuid: string;
  flow?: string;
  encryption?: string;
  // reality 标记
  reality?: boolean;
}

export interface TrojanNode extends BaseNode, TLSOptions, TransportOptions {
  type: "trojan";
  password: string;
}

export interface SSNode extends BaseNode {
  type: "ss";
  cipher: string;
  password: string;
  plugin?: string;
  pluginOpts?: Record<string, string | boolean | number>;
}

export interface SSRNode extends BaseNode {
  type: "ssr";
  cipher: string;
  password: string;
  protocol: string;
  protocolParam?: string;
  obfs: string;
  obfsParam?: string;
}

export interface Hysteria2Node extends BaseNode {
  type: "hysteria2";
  password: string;
  sni?: string;
  alpn?: string[];
  obfs?: string;
  obfsPassword?: string;
  // 端口跳跃
  ports?: string;
}

export interface TuicNode extends BaseNode {
  type: "tuic";
  uuid: string;
  password: string;
  sni?: string;
  alpn?: string[];
  congestionControl?: string; // bbr / cubic / new_reno
  udpRelayMode?: string; // native / quic
}

export type ProxyNode =
  | VmessNode
  | VlessNode
  | TrojanNode
  | SSNode
  | SSRNode
  | Hysteria2Node
  | TuicNode;

export interface Env {
  AUTH_KV: KVNamespace;
  ASSETS: Fetcher;
  DEFAULT_UA?: string;
  STATIC_KEYS?: string;
  // 设为 "true" 后允许 http:// 订阅源（默认仅允许 https）
  ALLOW_HTTP_SUBSCRIPTION?: string;
}

export type Target = "clash" | "clash-meta" | "singbox" | "v2ray" | "uri";
