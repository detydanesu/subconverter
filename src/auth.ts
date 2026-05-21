// 鉴权：支持 KV 存储的密钥列表 + 环境变量兜底
// KV 中的键名约定：
//   - "keys"        -> JSON 数组 ["key1","key2"] 或换行分隔字符串
//   - "key:<value>" -> 单条密钥（值可为 "1" 或备注信息），便于按密钥粒度管理
// 同时支持从 STATIC_KEYS 环境变量（逗号或换行分隔）兜底

import type { Env } from "./types";

export async function authenticate(req: Request, env: Env, providedPass: string | null): Promise<boolean> {
  const headerPass = extractAuthHeader(req);
  const candidate = (providedPass || headerPass || "").trim();
  if (!candidate) return false;

  // 1. KV 单条密钥（最快路径，O(1) 查询）
  if (env.AUTH_KV) {
    try {
      const v = await env.AUTH_KV.get(`key:${candidate}`);
      if (v !== null) return true;
    } catch (e) {
      console.warn("KV get failed:", e);
    }

    // 2. KV 中的 keys 列表
    try {
      const raw = await env.AUTH_KV.get("keys");
      if (raw) {
        const list = parseKeyList(raw);
        if (list.includes(candidate)) return true;
      }
    } catch (e) {
      console.warn("KV keys read failed:", e);
    }
  }

  // 3. 环境变量兜底
  if (env.STATIC_KEYS) {
    const list = parseKeyList(env.STATIC_KEYS);
    if (list.includes(candidate)) return true;
  }

  return false;
}

function extractAuthHeader(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (!auth) return null;
  // 支持 "Bearer xxx" / "Token xxx" / 直接放 key
  const m = /^(Bearer|Token)\s+(.+)$/i.exec(auth);
  if (m) return m[2].trim();
  return auth.trim();
}

function parseKeyList(raw: string): string[] {
  raw = raw.trim();
  if (!raw) return [];
  // JSON 数组
  if (raw.startsWith("[")) {
    try {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return arr.map(String).map((s) => s.trim()).filter(Boolean);
    } catch {
      /* fallthrough */
    }
  }
  // 逗号/换行分隔
  return raw
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}
