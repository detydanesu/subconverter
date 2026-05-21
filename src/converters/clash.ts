// 转换为 Clash Meta YAML（兼容 Clash Verge Rev / Mihomo）
import yaml from "js-yaml";
import type { ProxyNode } from "../types";

export function toClash(nodes: ProxyNode[]): string {
  const proxies = nodes.map(toClashProxy).filter(Boolean) as Record<string, any>[];
  const names = dedupNames(proxies.map((p) => p.name as string));
  proxies.forEach((p, i) => (p.name = names[i]));

  const config = buildBaseConfig(proxies);
  return yaml.dump(config, {
    indent: 2,
    lineWidth: -1,
    noRefs: true,
    quotingType: '"',
    forceQuotes: false,
  });
}

function toClashProxy(n: ProxyNode): Record<string, any> | null {
  switch (n.type) {
    case "vmess": {
      const p: Record<string, any> = {
        name: n.name,
        type: "vmess",
        server: n.server,
        port: n.port,
        uuid: n.uuid,
        alterId: n.alterId,
        cipher: n.cipher || "auto",
        udp: n.udp ?? true,
      };
      if (n.tls) {
        p.tls = true;
        if (n.sni) p.servername = n.sni;
        if (n.alpn) p.alpn = n.alpn;
        if (n.fingerprint) p["client-fingerprint"] = n.fingerprint;
        if (n.skipCertVerify) p["skip-cert-verify"] = true;
      }
      attachTransport(p, n);
      return p;
    }
    case "vless": {
      const p: Record<string, any> = {
        name: n.name,
        type: "vless",
        server: n.server,
        port: n.port,
        uuid: n.uuid,
        udp: n.udp ?? true,
      };
      if (n.flow) p.flow = n.flow;
      if (n.tls) {
        p.tls = true;
        if (n.sni) p.servername = n.sni;
        if (n.alpn) p.alpn = n.alpn;
        if (n.fingerprint) p["client-fingerprint"] = n.fingerprint;
        if (n.skipCertVerify) p["skip-cert-verify"] = true;
        if (n.reality && n.publicKey) {
          p["reality-opts"] = {
            "public-key": n.publicKey,
            ...(n.shortId ? { "short-id": n.shortId } : {}),
          };
        }
      }
      attachTransport(p, n);
      return p;
    }
    case "trojan": {
      const p: Record<string, any> = {
        name: n.name,
        type: "trojan",
        server: n.server,
        port: n.port,
        password: n.password,
        udp: n.udp ?? true,
      };
      if (n.sni) p.sni = n.sni;
      if (n.alpn) p.alpn = n.alpn;
      if (n.fingerprint) p["client-fingerprint"] = n.fingerprint;
      if (n.skipCertVerify) p["skip-cert-verify"] = true;
      attachTransport(p, n);
      return p;
    }
    case "ss": {
      const p: Record<string, any> = {
        name: n.name,
        type: "ss",
        server: n.server,
        port: n.port,
        cipher: n.cipher,
        password: n.password,
        udp: n.udp ?? true,
      };
      if (n.plugin) {
        p.plugin = n.plugin;
        if (n.pluginOpts) p["plugin-opts"] = n.pluginOpts;
      }
      return p;
    }
    case "ssr": {
      return {
        name: n.name,
        type: "ssr",
        server: n.server,
        port: n.port,
        cipher: n.cipher,
        password: n.password,
        protocol: n.protocol,
        ...(n.protocolParam ? { "protocol-param": n.protocolParam } : {}),
        obfs: n.obfs,
        ...(n.obfsParam ? { "obfs-param": n.obfsParam } : {}),
        udp: n.udp ?? true,
      };
    }
    case "hysteria2": {
      const p: Record<string, any> = {
        name: n.name,
        type: "hysteria2",
        server: n.server,
        port: n.port,
        password: n.password,
      };
      if (n.sni) p.sni = n.sni;
      if (n.alpn) p.alpn = n.alpn;
      if (n.obfs) {
        p.obfs = n.obfs;
        if (n.obfsPassword) p["obfs-password"] = n.obfsPassword;
      }
      if (n.skipCertVerify) p["skip-cert-verify"] = true;
      if (n.ports) p.ports = n.ports;
      return p;
    }
    case "tuic": {
      const p: Record<string, any> = {
        name: n.name,
        type: "tuic",
        server: n.server,
        port: n.port,
        uuid: n.uuid,
        password: n.password,
      };
      if (n.sni) p.sni = n.sni;
      if (n.alpn) p.alpn = n.alpn;
      if (n.congestionControl) p["congestion-controller"] = n.congestionControl;
      if (n.udpRelayMode) p["udp-relay-mode"] = n.udpRelayMode;
      if (n.skipCertVerify) p["skip-cert-verify"] = true;
      return p;
    }
  }
}

function attachTransport(p: Record<string, any>, n: any) {
  const network: string = n.network || "tcp";
  if (network === "tcp") return;
  p.network = network;
  if (network === "ws") {
    const opts: any = {};
    if (n.path) opts.path = n.path;
    if (n.host) opts.headers = { Host: n.host };
    if (Object.keys(opts).length) p["ws-opts"] = opts;
  } else if (network === "grpc") {
    const svc = n.serviceName || n.path;
    if (svc) p["grpc-opts"] = { "grpc-service-name": svc };
  } else if (network === "h2") {
    const opts: any = {};
    if (n.path) opts.path = n.path;
    if (n.host) opts.host = [n.host];
    if (Object.keys(opts).length) p["h2-opts"] = opts;
  }
}

function dedupNames(names: string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((nm) => {
    const base = nm || "proxy";
    const n = seen.get(base) || 0;
    seen.set(base, n + 1);
    return n === 0 ? base : `${base} #${n + 1}`;
  });
}

function buildBaseConfig(proxies: Record<string, any>[]): any {
  const proxyNames = proxies.map((p) => p.name);
  return {
    "mixed-port": 7890,
    "allow-lan": false,
    mode: "rule",
    "log-level": "info",
    "external-controller": "127.0.0.1:9090",
    dns: {
      enable: true,
      ipv6: false,
      "default-nameserver": ["223.5.5.5", "119.29.29.29"],
      "enhanced-mode": "fake-ip",
      "fake-ip-range": "198.18.0.1/16",
      nameserver: ["https://doh.pub/dns-query", "https://dns.alidns.com/dns-query"],
      fallback: ["https://1.1.1.1/dns-query", "tls://8.8.4.4:853"],
      "fallback-filter": { geoip: true, "geoip-code": "CN" },
    },
    proxies,
    "proxy-groups": [
      {
        name: "PROXY",
        type: "select",
        proxies: ["AUTO", "DIRECT", ...proxyNames],
      },
      {
        name: "AUTO",
        type: "url-test",
        proxies: proxyNames.length ? proxyNames : ["DIRECT"],
        url: "http://www.gstatic.com/generate_204",
        interval: 300,
        tolerance: 50,
      },
    ],
    rules: [
      "DOMAIN-SUFFIX,local,DIRECT",
      "IP-CIDR,127.0.0.0/8,DIRECT,no-resolve",
      "IP-CIDR,192.168.0.0/16,DIRECT,no-resolve",
      "IP-CIDR,10.0.0.0/8,DIRECT,no-resolve",
      "IP-CIDR,172.16.0.0/12,DIRECT,no-resolve",
      "GEOIP,CN,DIRECT",
      "MATCH,PROXY",
    ],
  };
}
