import type { ProxyNode } from "./types";

/**
 * Apply the request-level options used by SubConverter/OpenClash.
 *
 * The parsed node flags remain the source of truth by default. `scv=true`
 * only enables certificate verification bypass, so an explicit insecure flag
 * in a node is never lost when a caller omits `scv`.
 */
export function applyRequestOptions(
  nodes: ProxyNode[],
  params: URLSearchParams,
): ProxyNode[] {
  const skipCertVerify = readBoolean(params.get("scv"));
  const udp = readBoolean(params.get("udp"));

  return nodes.map((node) => ({
    ...node,
    ...(skipCertVerify === true ? { skipCertVerify: true } : {}),
    ...(udp !== undefined ? { udp } : {}),
  }));
}

function readBoolean(value: string | null): boolean | undefined {
  if (value === null) return undefined;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return undefined;
}
