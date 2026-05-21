// 转换为 sing-box JSON 配置（适用于 sing-box / NekoBox / SFI 等）
import type { ProxyNode } from "../types";

export function toSingbox(nodes: ProxyNode[]): string {
  const outbounds = nodes
    .map((n) => toOutbound(n))
    .filter((o): o is Record<string, any> => o !== null);

  const tags = outbounds.map((o) => o.tag as string);

  const config = {
    log: { level: "info", timestamp: true },
    dns: {
      servers: [
        { tag: "google", address: "https://8.8.8.8/dns-query" },
        { tag: "local", address: "https://223.5.5.5/dns-query", detour: "direct" },
      ],
      rules: [{ outbound: "any", server: "local" }],
      strategy: "ipv4_only",
    },
    inbounds: [
      {
        type: "mixed",
        tag: "mixed-in",
        listen: "127.0.0.1",
        listen_port: 7890,
      },
    ],
    outbounds: [
      {
        type: "selector",
        tag: "PROXY",
        outbounds: ["AUTO", "direct", ...tags],
        default: "AUTO",
      },
      {
        type: "urltest",
        tag: "AUTO",
        outbounds: tags.length ? tags : ["direct"],
        url: "http://www.gstatic.com/generate_204",
        interval: "5m",
      },
      ...outbounds,
      { type: "direct", tag: "direct" },
      { type: "block", tag: "block" },
      { type: "dns", tag: "dns-out" },
    ],
    route: {
      rules: [
        { protocol: "dns", outbound: "dns-out" },
        { ip_is_private: true, outbound: "direct" },
        { geoip: ["cn"], outbound: "direct" },
      ],
      final: "PROXY",
      auto_detect_interface: true,
    },
  };

  return JSON.stringify(config, null, 2);
}

function toOutbound(n: ProxyNode): Record<string, any> | null {
  const base = { tag: n.name, server: n.server, server_port: n.port };
  switch (n.type) {
    case "vmess":
      return {
        type: "vmess",
        ...base,
        uuid: n.uuid,
        security: n.cipher || "auto",
        alter_id: n.alterId || 0,
        ...(n.tls
          ? {
              tls: {
                enabled: true,
                ...(n.sni ? { server_name: n.sni } : {}),
                ...(n.alpn ? { alpn: n.alpn } : {}),
                ...(n.skipCertVerify ? { insecure: true } : {}),
                ...(n.fingerprint
                  ? { utls: { enabled: true, fingerprint: n.fingerprint } }
                  : {}),
              },
            }
          : {}),
        ...transportSingbox(n),
      };
    case "vless":
      return {
        type: "vless",
        ...base,
        uuid: n.uuid,
        ...(n.flow ? { flow: n.flow } : {}),
        ...(n.tls
          ? {
              tls: {
                enabled: true,
                ...(n.sni ? { server_name: n.sni } : {}),
                ...(n.alpn ? { alpn: n.alpn } : {}),
                ...(n.skipCertVerify ? { insecure: true } : {}),
                ...(n.fingerprint
                  ? { utls: { enabled: true, fingerprint: n.fingerprint } }
                  : {}),
                ...(n.reality && n.publicKey
                  ? {
                      reality: {
                        enabled: true,
                        public_key: n.publicKey,
                        ...(n.shortId ? { short_id: n.shortId } : {}),
                      },
                    }
                  : {}),
              },
            }
          : {}),
        ...transportSingbox(n),
      };
    case "trojan":
      return {
        type: "trojan",
        ...base,
        password: n.password,
        tls: {
          enabled: true,
          ...(n.sni ? { server_name: n.sni } : {}),
          ...(n.alpn ? { alpn: n.alpn } : {}),
          ...(n.skipCertVerify ? { insecure: true } : {}),
          ...(n.fingerprint
            ? { utls: { enabled: true, fingerprint: n.fingerprint } }
            : {}),
        },
        ...transportSingbox(n),
      };
    case "ss":
      return {
        type: "shadowsocks",
        ...base,
        method: n.cipher,
        password: n.password,
      };
    case "ssr":
      // sing-box 不支持 SSR，跳过
      return null;
    case "hysteria2":
      return {
        type: "hysteria2",
        ...base,
        password: n.password,
        ...(n.obfs
          ? { obfs: { type: n.obfs, password: n.obfsPassword || "" } }
          : {}),
        tls: {
          enabled: true,
          ...(n.sni ? { server_name: n.sni } : {}),
          ...(n.alpn ? { alpn: n.alpn } : { alpn: ["h3"] }),
          ...(n.skipCertVerify ? { insecure: true } : {}),
        },
      };
    case "tuic":
      return {
        type: "tuic",
        ...base,
        uuid: n.uuid,
        password: n.password,
        congestion_control: n.congestionControl || "bbr",
        udp_relay_mode: n.udpRelayMode || "native",
        tls: {
          enabled: true,
          ...(n.sni ? { server_name: n.sni } : {}),
          alpn: n.alpn || ["h3"],
          ...(n.skipCertVerify ? { insecure: true } : {}),
        },
      };
  }
}

function transportSingbox(n: any): Record<string, any> {
  const network: string = n.network || "tcp";
  if (network === "tcp") return {};
  if (network === "ws") {
    return {
      transport: {
        type: "ws",
        ...(n.path ? { path: n.path } : {}),
        ...(n.host ? { headers: { Host: n.host } } : {}),
      },
    };
  }
  if (network === "grpc") {
    return {
      transport: {
        type: "grpc",
        service_name: n.serviceName || n.path || "",
      },
    };
  }
  if (network === "h2") {
    return {
      transport: {
        type: "http",
        ...(n.path ? { path: n.path } : {}),
        ...(n.host ? { host: [n.host] } : {}),
      },
    };
  }
  return {};
}
