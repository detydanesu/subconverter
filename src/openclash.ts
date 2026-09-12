import { dumpClashConfig, toClashConfig } from "./converters/clash";
import { FetchUpstreamError, fetchSubscription } from "./fetcher";
import type { ProxyNode } from "./types";
import { validateSubscriptionUrl } from "./utils/url-guard";

const MAX_REMOTE_RULESETS = 12;

interface ParsedTemplate {
  groups: string[];
  ruleSources: Array<{ policy: string; source: string }>;
}

interface ClashProxy {
  name?: unknown;
}

interface ClashGroup {
  name: string;
  type: string;
  proxies: string[];
  url?: string;
  interval?: number;
  tolerance?: number;
}

export async function toOpenClash(
  nodes: ProxyNode[],
  ini: string,
  env: Env,
): Promise<string> {
  const config = toClashConfig(nodes);
  const parsed = parseTemplate(ini);
  const proxies = Array.isArray(config.proxies) ? (config.proxies as ClashProxy[]) : [];
  const proxyNames = proxies
    .map((proxy) => proxy.name)
    .filter((name): name is string => typeof name === "string" && name.length > 0);

  const groups = parsed.groups
    .map((line) => parseGroup(line, proxyNames))
    .filter((group): group is ClashGroup => group !== null);
  if (groups.length === 0) {
    throw new Error("外部配置未生成任何 proxy group");
  }

  const rules = await expandRules(parsed.ruleSources, env);
  if (rules.length === 0) {
    throw new Error("外部配置未生成任何 rule");
  }

  config["proxy-groups"] = groups;
  config.rules = rules;
  return dumpClashConfig(config);
}

function parseTemplate(ini: string): ParsedTemplate {
  const groups: string[] = [];
  const ruleSources: Array<{ policy: string; source: string }> = [];

  for (const rawLine of ini.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith(";") || line.startsWith("#")) continue;

    if (line.startsWith("custom_proxy_group=")) {
      groups.push(line.slice("custom_proxy_group=".length));
      continue;
    }
    if (!line.startsWith("ruleset=")) continue;

    const value = line.slice("ruleset=".length);
    const comma = value.indexOf(",");
    if (comma <= 0) continue;
    const policy = value.slice(0, comma).trim();
    const source = value.slice(comma + 1).trim();
    if (policy && source) ruleSources.push({ policy, source });
  }

  return { groups, ruleSources };
}

function parseGroup(line: string, proxyNames: string[]): ClashGroup | null {
  const fields = line.split("`");
  if (fields.length < 2) return null;
  const name = fields[0].trim();
  const type = fields[1].trim();
  if (!name || !type) return null;

  if (type === "select") {
    const proxies = resolveMembers(fields.slice(2), proxyNames);
    return { name, type, proxies: proxies.length > 0 ? proxies : ["DIRECT"] };
  }

  if (type === "url-test" || type === "fallback" || type === "load-balance") {
    const filter = fields[2] || ".*";
    const url = fields[3] || "http://www.gstatic.com/generate_204";
    const timing = (fields[4] || "300,,50").split(",");
    const interval = positiveInteger(timing[0], 300);
    const tolerance = positiveInteger(timing[2], 50);
    const proxies = matchProxyNames(filter, proxyNames);
    return {
      name,
      type,
      proxies: proxies.length > 0 ? proxies : ["DIRECT"],
      url,
      interval,
      ...(type === "url-test" ? { tolerance } : {}),
    };
  }

  return null;
}

function resolveMembers(fields: string[], proxyNames: string[]): string[] {
  const members: string[] = [];
  for (const field of fields) {
    if (field.startsWith("[]")) {
      members.push(field.slice(2));
    } else if (field) {
      members.push(...matchProxyNames(field, proxyNames));
    }
  }
  return deduplicate(members);
}

function matchProxyNames(pattern: string, proxyNames: string[]): string[] {
  try {
    const regex = new RegExp(pattern, "i");
    return proxyNames.filter((name) => regex.test(name));
  } catch {
    throw new Error(`代理组正则表达式无效: ${pattern}`);
  }
}

async function expandRules(
  sources: Array<{ policy: string; source: string }>,
  env: Env,
): Promise<string[]> {
  const remoteCount = sources.filter(({ source }) => !source.startsWith("[]")).length;
  if (remoteCount > MAX_REMOTE_RULESETS) {
    throw new Error(`外部规则集过多（最多 ${MAX_REMOTE_RULESETS} 个）`);
  }

  const expanded = await Promise.all(
    sources.map(async ({ policy, source }) => {
      if (source.startsWith("[]")) {
        const rule = attachPolicy(source.slice(2), policy);
        return rule ? [rule] : [];
      }

      const remoteUrl = stripRulesetPrefix(source.split(",")[0].trim());
      const allowHttp = (env.ALLOW_HTTP_SUBSCRIPTION || "").toLowerCase() === "true";
      const validation = validateSubscriptionUrl(remoteUrl, { allowHttp });
      if (!validation.ok) {
        throw new Error(`规则集 URL 无效: ${validation.reason}`);
      }

      let text: string;
      try {
        text = (await fetchSubscription(validation.url, env)).text;
      } catch (error) {
        if (error instanceof FetchUpstreamError) {
          throw new Error(`无法读取规则集: ${error.message}`);
        }
        throw error;
      }

      return text
        .split(/\r?\n/)
        .map((line) => attachPolicy(line, policy))
        .filter((rule): rule is string => rule !== null);
    }),
  );

  return expanded.flat();
}

function stripRulesetPrefix(source: string): string {
  for (const prefix of ["clash-classic:", "clash-domain:", "clash-ipcidr:"]) {
    if (source.startsWith(prefix)) return source.slice(prefix.length);
  }
  return source;
}

function attachPolicy(rawRule: string, policy: string): string | null {
  const trimmed = rawRule.trim().replace(/^[-]\s*/, "").replace(/^['\"]|['\"]$/g, "");
  if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith(";") || trimmed === "payload:") {
    return null;
  }

  const parts = trimmed.split(",").map((part) => part.trim());
  if (parts.length === 0 || !parts[0]) return null;
  if (parts[0].toUpperCase() === "FINAL") return `MATCH,${policy}`;
  if (parts[0].toUpperCase() === "MATCH") return `MATCH,${policy}`;

  const noResolve = parts.at(-1)?.toLowerCase() === "no-resolve";
  if (noResolve) {
    parts.splice(parts.length - 1, 0, policy);
  } else {
    parts.push(policy);
  }
  return parts.join(",");
}

function positiveInteger(input: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(input || "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function deduplicate(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
