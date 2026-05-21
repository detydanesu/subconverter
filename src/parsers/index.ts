// 入口解析器：自动识别输入类型（base64 / URI 列表 / Clash YAML）
import { b64Decode, looksLikeBase64Sub } from "../utils/base64";
import type { ProxyNode } from "../types";
import { parseClashYaml } from "./clash";
import { parseUriList } from "./uri";

export function parseAny(text: string): ProxyNode[] {
  if (!text || !text.trim()) return [];
  const trimmed = text.trim();

  // 1. Clash YAML
  if (/^proxies\s*:/m.test(trimmed) || /^port\s*:/m.test(trimmed)) {
    const r = parseClashYaml(trimmed);
    if (r.length) return r;
  }

  // 2. base64 整体编码
  if (looksLikeBase64Sub(trimmed)) {
    const decoded = b64Decode(trimmed);
    if (decoded) {
      const r = parseUriList(decoded);
      if (r.length) return r;
    }
  }

  // 3. 直接当作 URI 列表
  const r = parseUriList(trimmed);
  if (r.length) return r;

  // 4. 兜底：尝试再 base64 解一次
  const fallback = b64Decode(trimmed);
  if (fallback) {
    const r2 = parseUriList(fallback);
    if (r2.length) return r2;
    const r3 = parseClashYaml(fallback);
    if (r3.length) return r3;
  }

  return [];
}
