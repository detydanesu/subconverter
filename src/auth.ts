// 鉴权：支持 KV 存储的密钥列表 + 环境变量兜底
// KV 中的键名约定：
//   - "keys"        -> JSON 数组 ["key1","key2"] 或换行分隔字符串
//   - "key:<value>" -> 单条密钥（值可为 "1" 或备注信息），便于按密钥粒度管理
// 同时支持从 STATIC_KEYS 环境变量（逗号或换行分隔）兜底
//
// 安全说明：
//   - "key:<value>" 直查路径走 KV.get 哈希查找，不存在密文比较
//   - 列表/env 路径使用常量时间比较，避免理论上的时序旁路
//   - 强烈建议密钥使用 ≥ 24 字符的随机串

import type { Env } from "./types";

export async function authenticate(req: Request, env: Env, providedPass: string | null): Promise<boolean> {
  const headerPass = extractAuthHeader(req);
  const candidate = (providedPass || headerPass || "").trim();
  if (!candidate) return false;
  // 极端防御：拒绝过短/过长的输入，避免被用作探测
  if (candidate.length < 1 || candidate.length > 512) return false;

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
        if (listIncludesConstantTime(list, candidate)) return true;
      }
    } catch (e) {
      console.warn("KV keys read failed:", e);
    }
  }

  // 3. 环境变量兜底
  if (env.STATIC_KEYS) {
    const list = parseKeyList(env.STATIC_KEYS);
    if (listIncludesConstantTime(list, candidate)) return true;
  }

  return false;
}

// 仅接受 "Bearer <token>" / "Token <token>"。裸 token 不再接受，避免误用
function extractAuthHeader(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (!auth) return null;
  const m = /^(?:Bearer|Token)\s+(.+)$/i.exec(auth.trim());
  return m ? m[1].trim() : null;
}

function parseKeyList(raw: string): string[] {
  raw = raw.trim();
  if (!raw) return [];
  if (raw.startsWith("[")) {
    try {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return arr.map(String).map((s) => s.trim()).filter(Boolean);
    } catch {
      /* fallthrough */
    }
  }
  return raw
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// 常量时间字符串比较；长度不同时仍然比较一次以保持时序稳定
function constantTimeEquals(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const A = enc.encode(a);
  const B = enc.encode(b);
  const len = Math.max(A.length, B.length);
  let diff = A.length ^ B.length;
  for (let i = 0; i < len; i++) {
    const ai = i < A.length ? A[i] : 0;
    const bi = i < B.length ? B[i] : 0;
    diff |= ai ^ bi;
  }
  return diff === 0;
}

// 始终遍历整张表，避免按位置做时序旁路
function listIncludesConstantTime(list: string[], candidate: string): boolean {
  let hit = 0;
  for (const k of list) {
    if (constantTimeEquals(k, candidate)) hit |= 1;
  }
  return hit === 1;
}
