// Worker 入口
import { authenticate } from "./auth";
import { SUPPORTED_TARGETS, convert, isValidTarget } from "./converters";
import { FetchUpstreamError, fetchSubscription } from "./fetcher";
import { parseAny } from "./parsers";
import type { Env, Target } from "./types";
import { validateSubscriptionUrl } from "./utils/url-guard";

export default {
  async fetch(req: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);

    // API 路由
    if (url.pathname === "/api/sub") {
      return handleSub(req, env, url);
    }
    if (url.pathname === "/api/health") {
      // 不再泄露功能指纹（targets / 版本等）
      return new Response("ok", {
        status: 200,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    // 其余请求交给静态资源
    return env.ASSETS.fetch(req);
  },
} satisfies ExportedHandler<Env>;

async function handleSub(req: Request, env: Env, url: URL): Promise<Response> {
  // 仅允许 GET / HEAD
  if (req.method !== "GET" && req.method !== "HEAD") {
    return errText("方法不允许", 405);
  }

  const subUrl = url.searchParams.get("url");
  const target = (url.searchParams.get("target") || "clash").toLowerCase();
  const pass = url.searchParams.get("pass");

  // 鉴权前不暴露任何业务细节：未通过鉴权一律 401，避免被作为参数探测器
  const authed = await authenticate(req, env, pass);
  if (!authed) {
    return new Response("Unauthorized", {
      status: 401,
      headers: {
        "WWW-Authenticate": 'Bearer realm="subconverter"',
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  }

  // 鉴权后才进行参数校验，错误信息也只对授权用户显示
  if (!subUrl) return errText("缺少必要参数 url", 400);
  if (!isValidTarget(target)) {
    return errText(
      `不支持的 target（支持: ${SUPPORTED_TARGETS.join(", ")}）`,
      400,
    );
  }

  // SSRF / 协议白名单 / 内网黑名单
  const allowHttp = (env.ALLOW_HTTP_SUBSCRIPTION || "").toLowerCase() === "true";
  const validation = validateSubscriptionUrl(subUrl, { allowHttp });
  if (!validation.ok) return errText(validation.reason, 400);

  // 拉订阅 → 解析 → 转换
  let raw;
  try {
    raw = await fetchSubscription(validation.url, env);
  } catch (e) {
    if (e instanceof FetchUpstreamError) return errText(e.message, e.status);
    console.error("fetchSubscription unexpected error:", e);
    return errText("订阅源不可用", 502);
  }

  const nodes = parseAny(raw.text);
  if (nodes.length === 0) {
    return errText("未从订阅源解析出任何节点（格式不支持或源拒绝访问）", 422);
  }

  const result = convert(target as Target, nodes);

  const headers: Record<string, string> = {
    "Content-Type": result.contentType,
    "Cache-Control": "no-store",
    "Content-Disposition": `inline; filename="${result.filename}"`,
    "X-Node-Count": String(nodes.length),
    // 默认不暴露 CORS；客户端（Clash/sing-box）直抓不需要 CORS
    // 如确需浏览器跨域，可在此白名单具体 origin
  };
  if (raw.userInfo) headers["Subscription-Userinfo"] = raw.userInfo;
  if (target === "clash" || target === "clash-meta") {
    headers["Profile-Update-Interval"] = "24";
  }

  return new Response(result.body, { status: 200, headers });
}

function errText(msg: string, status: number): Response {
  return new Response(msg, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
