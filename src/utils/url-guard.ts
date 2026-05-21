// SSRF 防护：拒绝指向内网/链路本地/回环的目标
// 只校验 URL 字面量中的 host；CF Workers 的 fetch 通常不可达内网，但作为深度防御保留这层校验

const PRIVATE_HOSTNAMES = new Set([
  "localhost",
  "ip6-localhost",
  "ip6-loopback",
  "broadcasthost",
]);

// IPv4 私有/特殊段：CIDR
const IPV4_BLOCK: Array<[number, number]> = [
  toCidr("0.0.0.0", 8),       // "this network"
  toCidr("10.0.0.0", 8),      // RFC1918
  toCidr("100.64.0.0", 10),   // CGNAT
  toCidr("127.0.0.0", 8),     // loopback
  toCidr("169.254.0.0", 16),  // link-local / metadata
  toCidr("172.16.0.0", 12),   // RFC1918
  toCidr("192.0.0.0", 24),    // IETF protocol
  toCidr("192.168.0.0", 16),  // RFC1918
  toCidr("198.18.0.0", 15),   // benchmarking
  toCidr("224.0.0.0", 4),     // multicast
  toCidr("240.0.0.0", 4),     // reserved
  toCidr("255.255.255.255", 32),
];

export interface ValidateUrlOptions {
  allowHttp?: boolean;
}

export type ValidateResult =
  | { ok: true; url: URL }
  | { ok: false; reason: string };

export function validateSubscriptionUrl(input: string, opts: ValidateUrlOptions = {}): ValidateResult {
  let u: URL;
  try {
    u = new URL(input);
  } catch {
    return { ok: false, reason: "URL 格式不合法" };
  }

  if (u.protocol !== "https:" && u.protocol !== "http:") {
    return { ok: false, reason: `仅支持 http(s)，收到 ${u.protocol}` };
  }
  if (u.protocol === "http:" && !opts.allowHttp) {
    return { ok: false, reason: "出于安全原因默认仅允许 https 订阅源" };
  }

  // 取裸 host（去除 IPv6 字面量两侧方括号；不同运行时表现不一致，统一处理）
  let hostname = u.hostname.toLowerCase();
  if (hostname.startsWith("[") && hostname.endsWith("]")) {
    hostname = hostname.slice(1, -1);
  }
  if (!hostname) return { ok: false, reason: "URL 缺少 host" };

  if (PRIVATE_HOSTNAMES.has(hostname)) {
    return { ok: false, reason: `禁止访问内部主机名: ${hostname}` };
  }
  if (hostname.endsWith(".local") || hostname.endsWith(".internal") || hostname.endsWith(".localhost")) {
    return { ok: false, reason: `禁止访问内部域: ${hostname}` };
  }

  if (isIpv4Literal(hostname)) {
    if (isPrivateIpv4(hostname)) {
      return { ok: false, reason: `禁止访问内网/特殊 IPv4: ${hostname}` };
    }
  } else if (isIpv6Literal(hostname)) {
    if (isPrivateIpv6(hostname)) {
      return { ok: false, reason: `禁止访问内网/特殊 IPv6: ${hostname}` };
    }
  }

  return { ok: true, url: u };
}

// ---- IPv4 ----
function isIpv4Literal(h: string): boolean {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(h);
}

function ipv4ToInt(ip: string): number {
  const parts = ip.split(".").map((p) => parseInt(p, 10));
  if (parts.length !== 4 || parts.some((n) => isNaN(n) || n < 0 || n > 255)) return -1;
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function toCidr(base: string, bits: number): [number, number] {
  const n = ipv4ToInt(base);
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return [n & mask, mask];
}

function isPrivateIpv4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  if (n < 0) return true; // 解析失败按内网处理
  return IPV4_BLOCK.some(([base, mask]) => (n & mask) === base);
}

// ---- IPv6 ----
function isIpv6Literal(h: string): boolean {
  // 简单判定：包含冒号即视为 IPv6 字面量
  return h.includes(":");
}

function isPrivateIpv6(h: string): boolean {
  const lc = h.toLowerCase();
  // 回环
  if (lc === "::1" || lc === "::") return true;
  // IPv4-mapped 在不同运行时下被归一化为不同形式（::ffff:127.0.0.1 / ::ffff:7f00:1 等）
  // 直接拒绝所有 IPv4-mapped；如需访问外网 IPv4，请直接用 IPv4 字面量
  if (lc.startsWith("::ffff:")) return true;
  // 链路本地 fe80::/10
  if (lc.startsWith("fe8") || lc.startsWith("fe9") || lc.startsWith("fea") || lc.startsWith("feb")) return true;
  // 唯一本地地址 fc00::/7
  if (lc.startsWith("fc") || lc.startsWith("fd")) return true;
  // 多播 ff00::/8
  if (lc.startsWith("ff")) return true;
  return false;
}
