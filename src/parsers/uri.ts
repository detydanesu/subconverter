// URI 风格的代理链接解析器
// 支持：vmess:// vless:// trojan:// ss:// ssr:// hysteria2:// hy2:// tuic://

import { b64Decode } from "../utils/base64";
import type {
  Hysteria2Node,
  ProxyNode,
  SSNode,
  SSRNode,
  TrojanNode,
  TuicNode,
  VlessNode,
  VmessNode,
} from "../types";

// 入口：解析单条 URI；失败返回 null
export function parseUri(uri: string): ProxyNode | null {
  const trimmed = uri.trim();
  if (!trimmed) return null;
  try {
    if (trimmed.startsWith("vmess://")) return parseVmess(trimmed);
    if (trimmed.startsWith("vless://")) return parseVless(trimmed);
    if (trimmed.startsWith("trojan://")) return parseTrojan(trimmed);
    if (trimmed.startsWith("ss://")) return parseSS(trimmed);
    if (trimmed.startsWith("ssr://")) return parseSSR(trimmed);
    if (trimmed.startsWith("hysteria2://") || trimmed.startsWith("hy2://"))
      return parseHy2(trimmed);
    if (trimmed.startsWith("tuic://")) return parseTuic(trimmed);
  } catch (e) {
    // 单条解析失败不影响整体
    console.warn("parseUri failed:", uri.slice(0, 60), e);
  }
  return null;
}

// 批量解析订阅文本（每行一条 URI），跳过空行与注释行
export function parseUriList(text: string): ProxyNode[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#") && !l.startsWith("//"))
    .map((l) => parseUri(l))
    .filter((n): n is ProxyNode => n !== null);
}

// ---------------- vmess ----------------
// 标准格式：vmess://base64(JSON)
// JSON 字段：v, ps, add, port, id, aid, scy, net, type, host, path, tls, sni, alpn, fp
function parseVmess(uri: string): VmessNode | null {
  const payload = uri.slice("vmess://".length);
  const decoded = b64Decode(payload);
  if (!decoded) return null;
  let j: any;
  try {
    j = JSON.parse(decoded);
  } catch {
    return null;
  }
  if (!j.add || !j.port || !j.id) return null;
  return {
    type: "vmess",
    name: j.ps || `${j.add}:${j.port}`,
    server: String(j.add),
    port: parseInt(String(j.port), 10),
    uuid: String(j.id),
    alterId: parseInt(String(j.aid ?? "0"), 10),
    cipher: String(j.scy || "auto"),
    network: normalizeNet(j.net),
    path: j.path || undefined,
    host: j.host || undefined,
    serviceName: j.path && j.net === "grpc" ? j.path : undefined,
    tls: String(j.tls || "").toLowerCase() === "tls",
    sni: j.sni || undefined,
    alpn: parseAlpn(j.alpn),
    fingerprint: j.fp || undefined,
    raw: uri,
  };
}

// ---------------- vless ----------------
// vless://uuid@host:port?type=ws&security=tls&sni=...&path=/...&host=...&fp=...&pbk=...&sid=...&flow=...#name
function parseVless(uri: string): VlessNode | null {
  const u = parseAuthorityUri(uri, "vless://");
  if (!u) return null;
  const security = (u.params.get("security") || "").toLowerCase();
  return {
    type: "vless",
    name: u.fragment || `${u.host}:${u.port}`,
    server: u.host,
    port: u.port,
    uuid: u.userinfo,
    encryption: u.params.get("encryption") || "none",
    flow: u.params.get("flow") || undefined,
    network: normalizeNet(u.params.get("type") || "tcp"),
    path: u.params.get("path") || undefined,
    host: u.params.get("host") || undefined,
    serviceName: u.params.get("serviceName") || undefined,
    tls: security === "tls" || security === "reality",
    reality: security === "reality",
    sni: u.params.get("sni") || undefined,
    alpn: parseAlpn(u.params.get("alpn")),
    fingerprint: u.params.get("fp") || undefined,
    publicKey: u.params.get("pbk") || undefined,
    shortId: u.params.get("sid") || undefined,
    raw: uri,
  };
}

// ---------------- trojan ----------------
function parseTrojan(uri: string): TrojanNode | null {
  const u = parseAuthorityUri(uri, "trojan://");
  if (!u) return null;
  const security = (u.params.get("security") || "tls").toLowerCase();
  return {
    type: "trojan",
    name: u.fragment || `${u.host}:${u.port}`,
    server: u.host,
    port: u.port,
    password: decodeURIComponent(u.userinfo),
    network: normalizeNet(u.params.get("type") || "tcp"),
    path: u.params.get("path") || undefined,
    host: u.params.get("host") || undefined,
    serviceName: u.params.get("serviceName") || undefined,
    tls: security !== "none",
    sni: u.params.get("sni") || u.params.get("peer") || undefined,
    alpn: parseAlpn(u.params.get("alpn")),
    fingerprint: u.params.get("fp") || undefined,
    skipCertVerify: u.params.get("allowInsecure") === "1",
    raw: uri,
  };
}

// ---------------- ss ----------------
// 两种风格：
//   ss://base64(method:password)@server:port#name   （SIP002）
//   ss://base64(method:password@server:port)#name    （旧）
function parseSS(uri: string): SSNode | null {
  const noScheme = uri.slice("ss://".length);
  const hashIdx = noScheme.indexOf("#");
  const fragment = hashIdx >= 0 ? decodeURIComponent(noScheme.slice(hashIdx + 1)) : "";
  let body = hashIdx >= 0 ? noScheme.slice(0, hashIdx) : noScheme;

  // 拆 query
  let queryStr = "";
  const qIdx = body.indexOf("?");
  if (qIdx >= 0) {
    queryStr = body.slice(qIdx + 1);
    body = body.slice(0, qIdx);
  }
  const params = new URLSearchParams(queryStr);

  let method = "", password = "", server = "", port = 0;
  const atIdx = body.lastIndexOf("@");
  if (atIdx >= 0) {
    // SIP002
    const userinfoB64 = body.slice(0, atIdx);
    const hostport = body.slice(atIdx + 1);
    const decoded = b64Decode(userinfoB64) || decodeURIComponent(userinfoB64);
    const colon = decoded.indexOf(":");
    if (colon < 0) return null;
    method = decoded.slice(0, colon);
    password = decoded.slice(colon + 1);
    const m = /^\[?([^\]]+)\]?:(\d+)$/.exec(hostport);
    if (!m) return null;
    server = m[1];
    port = parseInt(m[2], 10);
  } else {
    // 旧格式：整体 base64
    const decoded = b64Decode(body);
    const m = /^([^:]+):(.+)@\[?([^\]]+)\]?:(\d+)$/.exec(decoded);
    if (!m) return null;
    method = m[1];
    password = m[2];
    server = m[3];
    port = parseInt(m[4], 10);
  }

  const node: SSNode = {
    type: "ss",
    name: fragment || `${server}:${port}`,
    server,
    port,
    cipher: method,
    password,
    raw: uri,
  };

  // SIP003 plugin
  const plugin = params.get("plugin");
  if (plugin) {
    const [pluginName, ...optsParts] = plugin.split(";");
    node.plugin = pluginName;
    const opts: Record<string, string | boolean> = {};
    for (const part of optsParts) {
      if (!part) continue;
      const eq = part.indexOf("=");
      if (eq < 0) opts[part] = true;
      else opts[part.slice(0, eq)] = part.slice(eq + 1);
    }
    node.pluginOpts = opts;
  }

  return node;
}

// ---------------- ssr ----------------
// ssr://base64(server:port:protocol:method:obfs:base64pass/?obfsparam=...&protoparam=...&remarks=base64name&group=...)
function parseSSR(uri: string): SSRNode | null {
  const decoded = b64Decode(uri.slice("ssr://".length));
  if (!decoded) return null;
  const qIdx = decoded.indexOf("/?");
  const main = qIdx >= 0 ? decoded.slice(0, qIdx) : decoded;
  const query = qIdx >= 0 ? decoded.slice(qIdx + 2) : "";
  const parts = main.split(":");
  if (parts.length < 6) return null;
  const [server, portStr, protocol, method, obfs, passB64] = parts;
  const password = b64Decode(passB64);
  const params = new URLSearchParams(query);
  return {
    type: "ssr",
    name: b64Decode(params.get("remarks") || "") || `${server}:${portStr}`,
    server,
    port: parseInt(portStr, 10),
    cipher: method,
    password,
    protocol,
    protocolParam: b64Decode(params.get("protoparam") || "") || undefined,
    obfs,
    obfsParam: b64Decode(params.get("obfsparam") || "") || undefined,
    raw: uri,
  };
}

// ---------------- hysteria2 ----------------
// hysteria2://password@host:port?sni=...&insecure=1&obfs=salamander&obfs-password=...&alpn=h3#name
function parseHy2(uri: string): Hysteria2Node | null {
  const scheme = uri.startsWith("hy2://") ? "hy2://" : "hysteria2://";
  const u = parseAuthorityUri(uri, scheme);
  if (!u) return null;
  return {
    type: "hysteria2",
    name: u.fragment || `${u.host}:${u.port}`,
    server: u.host,
    port: u.port,
    password: decodeURIComponent(u.userinfo),
    sni: u.params.get("sni") || undefined,
    alpn: parseAlpn(u.params.get("alpn")),
    obfs: u.params.get("obfs") || undefined,
    obfsPassword: u.params.get("obfs-password") || undefined,
    skipCertVerify: u.params.get("insecure") === "1",
    ports: u.params.get("mport") || undefined,
    raw: uri,
  };
}

// ---------------- tuic ----------------
// tuic://uuid:password@host:port?sni=...&alpn=h3&congestion_control=bbr#name
function parseTuic(uri: string): TuicNode | null {
  const u = parseAuthorityUri(uri, "tuic://");
  if (!u) return null;
  const colon = u.userinfo.indexOf(":");
  const uuid = colon >= 0 ? u.userinfo.slice(0, colon) : u.userinfo;
  const password = colon >= 0 ? decodeURIComponent(u.userinfo.slice(colon + 1)) : "";
  return {
    type: "tuic",
    name: u.fragment || `${u.host}:${u.port}`,
    server: u.host,
    port: u.port,
    uuid,
    password,
    sni: u.params.get("sni") || undefined,
    alpn: parseAlpn(u.params.get("alpn")) || ["h3"],
    congestionControl: u.params.get("congestion_control") || "bbr",
    udpRelayMode: u.params.get("udp_relay_mode") || "native",
    skipCertVerify: u.params.get("allow_insecure") === "1",
    raw: uri,
  };
}

// ---------------- 通用工具 ----------------

interface AuthorityUri {
  userinfo: string;
  host: string;
  port: number;
  params: URLSearchParams;
  fragment: string;
}

function parseAuthorityUri(uri: string, prefix: string): AuthorityUri | null {
  const noScheme = uri.slice(prefix.length);
  const hashIdx = noScheme.indexOf("#");
  const fragment = hashIdx >= 0 ? decodeURIComponent(noScheme.slice(hashIdx + 1)) : "";
  const beforeHash = hashIdx >= 0 ? noScheme.slice(0, hashIdx) : noScheme;
  const qIdx = beforeHash.indexOf("?");
  const auth = qIdx >= 0 ? beforeHash.slice(0, qIdx) : beforeHash;
  const queryStr = qIdx >= 0 ? beforeHash.slice(qIdx + 1) : "";
  const atIdx = auth.lastIndexOf("@");
  if (atIdx < 0) return null;
  const userinfo = auth.slice(0, atIdx);
  const hostport = auth.slice(atIdx + 1);
  // IPv6 处理：[::1]:443
  const m = /^\[([^\]]+)\]:(\d+)$/.exec(hostport) || /^([^:]+):(\d+)$/.exec(hostport);
  if (!m) return null;
  return {
    userinfo,
    host: m[1],
    port: parseInt(m[2], 10),
    params: new URLSearchParams(queryStr),
    fragment,
  };
}

function normalizeNet(net: any): "tcp" | "ws" | "grpc" | "h2" | "http" | "kcp" | "quic" {
  const v = String(net || "tcp").toLowerCase();
  if (v === "h2" || v === "http") return "h2";
  if (v === "ws" || v === "websocket") return "ws";
  if (v === "grpc") return "grpc";
  if (v === "kcp") return "kcp";
  if (v === "quic") return "quic";
  return "tcp";
}

function parseAlpn(v: any): string[] | undefined {
  if (!v) return undefined;
  if (Array.isArray(v)) return v.filter(Boolean).map(String);
  return String(v)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
