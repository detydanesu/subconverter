// 抓取订阅源原始文本，自动处理常见 UA 反爬
import type { Env } from "./types";

export async function fetchSubscription(url: string, env: Env): Promise<{
  text: string;
  contentType: string;
  userInfo?: string; // subscription-userinfo header（流量信息）
}> {
  const ua = env.DEFAULT_UA || "ClashforWindows/0.20.39";
  const resp = await fetch(url, {
    headers: {
      "User-Agent": ua,
      Accept: "*/*",
    },
    redirect: "follow",
    cf: {
      // 缩短缓存，订阅是动态资源
      cacheTtl: 60,
      cacheEverything: false,
    },
  });
  if (!resp.ok) {
    throw new Error(`订阅源返回 ${resp.status}: ${await safeText(resp)}`);
  }
  const text = await resp.text();
  return {
    text,
    contentType: resp.headers.get("content-type") || "",
    userInfo: resp.headers.get("subscription-userinfo") || undefined,
  };
}

async function safeText(r: Response): Promise<string> {
  try {
    const t = await r.text();
    return t.slice(0, 200);
  } catch {
    return "";
  }
}
