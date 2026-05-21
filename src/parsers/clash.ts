// Clash YAML 输入解析：从 Clash/Clash Meta 配置中抽取 proxies
import yaml from "js-yaml";
import type { ProxyNode } from "../types";

export function parseClashYaml(text: string): ProxyNode[] {
  let doc: any;
  try {
    doc = yaml.load(text);
  } catch {
    return [];
  }
  if (!doc || typeof doc !== "object") return [];
  const proxies = (doc as any).proxies || (doc as any).Proxy || [];
  if (!Array.isArray(proxies)) return [];
  const out: ProxyNode[] = [];
  for (const p of proxies) {
    const n = clashProxyToNode(p);
    if (n) out.push(n);
  }
  return out;
}

function clashProxyToNode(p: any): ProxyNode | null {
  if (!p || typeof p !== "object" || !p.type) return null;
  const name = String(p.name || `${p.server}:${p.port}`);
  const server = String(p.server || "");
  const port = parseInt(String(p.port || 0), 10);
  if (!server || !port) return null;

  const type = String(p.type).toLowerCase();
  switch (type) {
    case "vmess":
      return {
        type: "vmess",
        name,
        server,
        port,
        uuid: String(p.uuid || ""),
        alterId: parseInt(String(p.alterId ?? p.aid ?? 0), 10),
        cipher: String(p.cipher || "auto"),
        network: p.network || "tcp",
        path:
          p.network === "ws"
            ? p["ws-opts"]?.path || p.path
            : p.network === "h2"
              ? p["h2-opts"]?.path
              : undefined,
        host:
          p.network === "ws"
            ? p["ws-opts"]?.headers?.Host || p["ws-opts"]?.headers?.host
            : undefined,
        serviceName: p["grpc-opts"]?.["grpc-service-name"],
        tls: !!p.tls,
        sni: p.servername || p.sni,
        alpn: p.alpn,
        fingerprint: p["client-fingerprint"],
        skipCertVerify: !!p["skip-cert-verify"],
        udp: !!p.udp,
        raw: undefined,
      };
    case "vless":
      return {
        type: "vless",
        name,
        server,
        port,
        uuid: String(p.uuid || ""),
        encryption: "none",
        flow: p.flow,
        network: p.network || "tcp",
        path:
          p.network === "ws"
            ? p["ws-opts"]?.path
            : p.network === "h2"
              ? p["h2-opts"]?.path
              : undefined,
        host: p["ws-opts"]?.headers?.Host || p["ws-opts"]?.headers?.host,
        serviceName: p["grpc-opts"]?.["grpc-service-name"],
        tls: !!p.tls,
        reality: !!p["reality-opts"],
        sni: p.servername || p.sni,
        alpn: p.alpn,
        fingerprint: p["client-fingerprint"],
        publicKey: p["reality-opts"]?.["public-key"],
        shortId: p["reality-opts"]?.["short-id"],
        skipCertVerify: !!p["skip-cert-verify"],
        udp: !!p.udp,
      };
    case "trojan":
      return {
        type: "trojan",
        name,
        server,
        port,
        password: String(p.password || ""),
        network: p.network || "tcp",
        path:
          p.network === "ws"
            ? p["ws-opts"]?.path
            : p.network === "grpc"
              ? p["grpc-opts"]?.["grpc-service-name"]
              : undefined,
        host: p["ws-opts"]?.headers?.Host,
        serviceName: p["grpc-opts"]?.["grpc-service-name"],
        tls: true,
        sni: p.sni || p.servername,
        alpn: p.alpn,
        fingerprint: p["client-fingerprint"],
        skipCertVerify: !!p["skip-cert-verify"],
        udp: !!p.udp,
      };
    case "ss":
      return {
        type: "ss",
        name,
        server,
        port,
        cipher: String(p.cipher || ""),
        password: String(p.password || ""),
        plugin: p.plugin,
        pluginOpts: p["plugin-opts"],
        udp: !!p.udp,
      };
    case "ssr":
      return {
        type: "ssr",
        name,
        server,
        port,
        cipher: String(p.cipher || ""),
        password: String(p.password || ""),
        protocol: String(p.protocol || ""),
        protocolParam: p["protocol-param"],
        obfs: String(p.obfs || ""),
        obfsParam: p["obfs-param"],
        udp: !!p.udp,
      };
    case "hysteria2":
    case "hy2":
      return {
        type: "hysteria2",
        name,
        server,
        port,
        password: String(p.password || p.auth || ""),
        sni: p.sni,
        alpn: p.alpn,
        obfs: p.obfs,
        obfsPassword: p["obfs-password"],
        skipCertVerify: !!p["skip-cert-verify"],
        udp: true,
      };
    case "tuic":
      return {
        type: "tuic",
        name,
        server,
        port,
        uuid: String(p.uuid || ""),
        password: String(p.password || ""),
        sni: p.sni,
        alpn: p.alpn,
        congestionControl: p["congestion-controller"],
        udpRelayMode: p["udp-relay-mode"],
        skipCertVerify: !!p["skip-cert-verify"],
        udp: true,
      };
    default:
      return null;
  }
}
