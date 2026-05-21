// 反向：节点 → URI；用于 v2ray/uri 输出
import { b64Encode, b64EncodeUrlSafe } from "../utils/base64";
import type { ProxyNode } from "../types";

export function nodeToUri(n: ProxyNode): string {
  switch (n.type) {
    case "vmess":
      return vmessToUri(n);
    case "vless":
      return vlessToUri(n);
    case "trojan":
      return trojanToUri(n);
    case "ss":
      return ssToUri(n);
    case "ssr":
      return ssrToUri(n);
    case "hysteria2":
      return hy2ToUri(n);
    case "tuic":
      return tuicToUri(n);
  }
}

export function nodesToUriList(nodes: ProxyNode[]): string {
  return nodes
    .map(nodeToUri)
    .filter(Boolean)
    .join("\n");
}

export function nodesToBase64Sub(nodes: ProxyNode[]): string {
  return b64Encode(nodesToUriList(nodes));
}

function vmessToUri(n: any): string {
  const j = {
    v: "2",
    ps: n.name,
    add: n.server,
    port: String(n.port),
    id: n.uuid,
    aid: String(n.alterId ?? 0),
    scy: n.cipher || "auto",
    net: n.network || "tcp",
    type: "none",
    host: n.host || "",
    path: n.path || "",
    tls: n.tls ? "tls" : "",
    sni: n.sni || "",
    alpn: (n.alpn || []).join(","),
    fp: n.fingerprint || "",
  };
  return "vmess://" + b64Encode(JSON.stringify(j));
}

function vlessToUri(n: any): string {
  const params = new URLSearchParams();
  params.set("encryption", n.encryption || "none");
  if (n.flow) params.set("flow", n.flow);
  params.set("type", n.network || "tcp");
  if (n.path) params.set("path", n.path);
  if (n.host) params.set("host", n.host);
  if (n.serviceName) params.set("serviceName", n.serviceName);
  if (n.tls) {
    params.set("security", n.reality ? "reality" : "tls");
    if (n.sni) params.set("sni", n.sni);
    if (n.alpn) params.set("alpn", n.alpn.join(","));
    if (n.fingerprint) params.set("fp", n.fingerprint);
    if (n.publicKey) params.set("pbk", n.publicKey);
    if (n.shortId) params.set("sid", n.shortId);
  }
  return `vless://${n.uuid}@${formatHost(n.server)}:${n.port}?${params}#${encodeURIComponent(n.name)}`;
}

function trojanToUri(n: any): string {
  const params = new URLSearchParams();
  params.set("type", n.network || "tcp");
  if (n.path) params.set("path", n.path);
  if (n.host) params.set("host", n.host);
  if (n.sni) params.set("sni", n.sni);
  if (n.alpn) params.set("alpn", n.alpn.join(","));
  if (n.fingerprint) params.set("fp", n.fingerprint);
  if (n.skipCertVerify) params.set("allowInsecure", "1");
  return `trojan://${encodeURIComponent(n.password)}@${formatHost(n.server)}:${n.port}?${params}#${encodeURIComponent(n.name)}`;
}

function ssToUri(n: any): string {
  const userinfo = b64EncodeUrlSafe(`${n.cipher}:${n.password}`);
  let url = `ss://${userinfo}@${formatHost(n.server)}:${n.port}`;
  if (n.plugin) {
    const opts = n.pluginOpts
      ? Object.entries(n.pluginOpts)
          .map(([k, v]) => (v === true ? k : `${k}=${v}`))
          .join(";")
      : "";
    url += `?plugin=${encodeURIComponent(`${n.plugin}${opts ? ";" + opts : ""}`)}`;
  }
  url += `#${encodeURIComponent(n.name)}`;
  return url;
}

function ssrToUri(n: any): string {
  const main = `${n.server}:${n.port}:${n.protocol}:${n.cipher}:${n.obfs}:${b64EncodeUrlSafe(n.password)}`;
  const params = new URLSearchParams();
  if (n.obfsParam) params.set("obfsparam", b64EncodeUrlSafe(n.obfsParam));
  if (n.protocolParam) params.set("protoparam", b64EncodeUrlSafe(n.protocolParam));
  params.set("remarks", b64EncodeUrlSafe(n.name));
  const body = `${main}/?${params.toString()}`;
  return "ssr://" + b64EncodeUrlSafe(body);
}

function hy2ToUri(n: any): string {
  const params = new URLSearchParams();
  if (n.sni) params.set("sni", n.sni);
  if (n.alpn) params.set("alpn", n.alpn.join(","));
  if (n.obfs) params.set("obfs", n.obfs);
  if (n.obfsPassword) params.set("obfs-password", n.obfsPassword);
  if (n.skipCertVerify) params.set("insecure", "1");
  return `hysteria2://${encodeURIComponent(n.password)}@${formatHost(n.server)}:${n.port}?${params}#${encodeURIComponent(n.name)}`;
}

function tuicToUri(n: any): string {
  const params = new URLSearchParams();
  if (n.sni) params.set("sni", n.sni);
  if (n.alpn) params.set("alpn", n.alpn.join(","));
  if (n.congestionControl) params.set("congestion_control", n.congestionControl);
  if (n.udpRelayMode) params.set("udp_relay_mode", n.udpRelayMode);
  if (n.skipCertVerify) params.set("allow_insecure", "1");
  return `tuic://${n.uuid}:${encodeURIComponent(n.password)}@${formatHost(n.server)}:${n.port}?${params}#${encodeURIComponent(n.name)}`;
}

function formatHost(host: string): string {
  // IPv6 加方括号
  return host.includes(":") ? `[${host}]` : host;
}
