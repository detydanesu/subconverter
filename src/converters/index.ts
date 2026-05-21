// 转换调度
import type { ProxyNode, Target } from "../types";
import { toClash } from "./clash";
import { toSingbox } from "./singbox";
import { nodesToBase64Sub, nodesToUriList } from "./uri";

export interface ConvertResult {
  body: string;
  contentType: string;
  filename: string;
}

export function convert(target: Target, nodes: ProxyNode[]): ConvertResult {
  switch (target) {
    case "clash":
    case "clash-meta":
      return {
        body: toClash(nodes),
        contentType: "text/yaml; charset=utf-8",
        filename: "config.yaml",
      };
    case "singbox":
      return {
        body: toSingbox(nodes),
        contentType: "application/json; charset=utf-8",
        filename: "config.json",
      };
    case "v2ray":
      return {
        body: nodesToBase64Sub(nodes),
        contentType: "text/plain; charset=utf-8",
        filename: "sub.txt",
      };
    case "uri":
      return {
        body: nodesToUriList(nodes),
        contentType: "text/plain; charset=utf-8",
        filename: "sub.txt",
      };
  }
}

export function isValidTarget(t: string): t is Target {
  return ["clash", "clash-meta", "singbox", "v2ray", "uri"].includes(t);
}

export const SUPPORTED_TARGETS: Target[] = [
  "clash",
  "clash-meta",
  "singbox",
  "v2ray",
  "uri",
];
