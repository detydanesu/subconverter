// Worker 入口
import { authenticate } from "./auth";
import { SUPPORTED_TARGETS, convert, isValidTarget } from "./converters";
import { fetchSubscription } from "./fetcher";
import { parseAny } from "./parsers";
import type { Env, Target } from "./types";

export default {
  async fetch(req: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);

    // 路由：API
    if (url.pathname === "/api/sub") {
      return handleSub(req, env, url);
    }
    if (url.pathname === "/api/health") {
      return json({ ok: true, targets: SUPPORTED_TARGETS });
    }

    // 其余请求交给静态资源
    return env.ASSETS.fetch(req);
  },
} satisfies ExportedHandler<Env>;

async function handleSub(req: Request, env: Env, url: URL): Promise<Response> {
  const subUrl = url.searchParams.get("url");
  const target = (url.searchParams.get("target") || "clash").toLowerCase();
  const pass = url.searchParams.get("pass");

  // 校验
  if (!subUrl) {
    return errText("缺少必要参数 url", 400);
  }
  if (!isValidTarget(target)) {
    return errText(
      `不支持的 target: ${target}（支持: ${SUPPORTED_TARGETS.join(", ")}）`,
      400,
    );
  }
  if (!isHttpUrl(subUrl)) {
    return errText("url 必须是 http(s) 链接", 400);
  }

  // 鉴权
  const authed = await authenticate(req, env, pass);
  if (!authed) {
    return new Response("Unauthorized: 需要有效的 pass 参数或 Authorization 头", {
      status: 401,
      headers: {
        "WWW-Authenticate": 'Bearer realm="subconverter"',
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  }

  // 拉订阅 → 解析 → 转换
  let raw: { text: string; userInfo?: string };
  try {
    raw = await fetchSubscription(subUrl, env);
  } catch (e: any) {
    return errText(`抓取订阅失败: ${e?.message || e}`, 502);
  }

  const nodes = parseAny(raw.text);
  if (nodes.length === 0) {
    return errText("未从订阅源解析出任何节点（可能是格式不支持或源被反爬）", 422);
  }

  const result = convert(target as Target, nodes);

  const headers: Record<string, string> = {
    "Content-Type": result.contentType,
    "Cache-Control": "no-store",
    "Content-Disposition": `inline; filename="${result.filename}"`,
    "X-Node-Count": String(nodes.length),
    // CORS：允许前端页面（也可能跨域）调用
    "Access-Control-Allow-Origin": "*",
  };
  if (raw.userInfo) headers["Subscription-Userinfo"] = raw.userInfo;
  // 让 Clash 等客户端识别为订阅
  if (target === "clash" || target === "clash-meta") {
    headers["Profile-Update-Interval"] = "24";
  }

  return new Response(result.body, { status: 200, headers });
}

function isHttpUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function errText(msg: string, status: number): Response {
  return new Response(msg, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
