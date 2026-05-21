// 抓取订阅源原始文本
// - URL 校验（SSRF 防护、HTTPS 强制）由调用方负责，本模块只关心传输与大小
import type { Env } from "./types";

// 5MB；正常订阅文件远小于此，足够覆盖大节点池
const MAX_SUBSCRIPTION_BYTES = 5 * 1024 * 1024;

export class FetchUpstreamError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "FetchUpstreamError";
  }
}

export interface SubscriptionPayload {
  text: string;
  contentType: string;
  userInfo?: string;
}

export async function fetchSubscription(url: URL, env: Env): Promise<SubscriptionPayload> {
  const ua = env.DEFAULT_UA || "ClashforWindows/0.20.39";

  let resp: Response;
  try {
    resp = await fetch(url.toString(), {
      headers: { "User-Agent": ua, Accept: "*/*" },
      redirect: "follow",
      cf: { cacheTtl: 60, cacheEverything: false },
    });
  } catch (e) {
    // 网络层错误，不向客户端透传细节
    console.warn("fetchSubscription network error:", e);
    throw new FetchUpstreamError(502, "无法连接订阅源");
  }

  if (!resp.ok) {
    console.warn("fetchSubscription upstream status:", resp.status, url.toString());
    throw new FetchUpstreamError(502, `订阅源返回 ${resp.status}`);
  }

  // Content-Length 提前拦截（如果上游诚实返回）
  const lenHeader = resp.headers.get("content-length");
  if (lenHeader) {
    const declared = parseInt(lenHeader, 10);
    if (!isNaN(declared) && declared > MAX_SUBSCRIPTION_BYTES) {
      // 主动取消 body
      resp.body?.cancel().catch(() => {});
      throw new FetchUpstreamError(413, "订阅响应过大");
    }
  }

  // 流式累积，超过上限即断开
  const text = await readWithLimit(resp, MAX_SUBSCRIPTION_BYTES);

  return {
    text,
    contentType: resp.headers.get("content-type") || "",
    userInfo: resp.headers.get("subscription-userinfo") || undefined,
  };
}

async function readWithLimit(resp: Response, max: number): Promise<string> {
  if (!resp.body) return "";
  const reader = resp.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > max) {
        try { await reader.cancel(); } catch { /* ignore */ }
        throw new FetchUpstreamError(413, "订阅响应过大");
      }
      chunks.push(value);
    }
  } finally {
    try { reader.releaseLock(); } catch { /* ignore */ }
  }
  const buf = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    buf.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder("utf-8").decode(buf);
}
