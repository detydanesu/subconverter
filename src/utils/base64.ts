// Base64 编解码（兼容 URL-safe 与 padding 缺失）

export function b64Decode(input: string): string {
  // URL-safe → 标准
  let s = input.replace(/-/g, "+").replace(/_/g, "/").replace(/\s+/g, "");
  // 补 padding
  while (s.length % 4 !== 0) s += "=";
  try {
    // atob 仅处理 latin1，使用 TextDecoder 处理 UTF-8
    const bin = atob(s);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder("utf-8").decode(bytes);
  } catch {
    return "";
  }
}

export function b64Encode(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

export function b64EncodeUrlSafe(input: string): string {
  return b64Encode(input).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// 判断字符串是否为 base64 编码的订阅文本（基本启发式）
export function looksLikeBase64Sub(text: string): boolean {
  const t = text.trim();
  if (t.length < 16) return false;
  // 不含明显的 URI 头则倾向于判定为 base64
  if (/^(vmess|vless|trojan|ss|ssr|hysteria2?|hy2|tuic):\/\//im.test(t)) return false;
  // 不含 yaml 关键词
  if (/^proxies\s*:/m.test(t)) return false;
  // 仅由 base64 字符与换行组成
  return /^[A-Za-z0-9+/=_\-\s]+$/.test(t);
}
