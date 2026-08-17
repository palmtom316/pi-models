import type { PiApi } from "./types.ts";
import { isOpenAiApi } from "./types.ts";

export function stripUserinfoAndFrag(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("empty url");
  let u: URL;
  try {
    u = new URL(trimmed);
  } catch {
    throw new Error(`invalid url: ${trimmed.slice(0, 80)}`);
  }
  if (u.username || u.password) {
    throw new Error("url must not contain credentials");
  }
  u.hash = "";
  u.search = "";
  return u.toString();
}

export function trimSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

/** Persist / compare: keep path, drop trailing slash, lowercase host. */
export function canonicalizeUrl(raw: string): string {
  const cleaned = stripUserinfoAndFrag(raw);
  const u = new URL(cleaned);
  u.hostname = u.hostname.toLowerCase();
  const path = u.pathname === "/" ? "" : u.pathname.replace(/\/+$/, "");
  return `${u.protocol}//${u.host}${path}`;
}

export function joinUrl(base: string, path: string): string {
  const root = trimSlash(canonicalizeUrl(base));
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${root}${p}`;
}

export function looksLikeHtml(text: string): boolean {
  const head = text.slice(0, 256).toLowerCase();
  return head.includes("<html") || head.includes("<!doctype") || head.includes("<body");
}

export function catalogCandidates(api: PiApi, baseUrl: string): string[] {
  const root = trimSlash(canonicalizeUrl(baseUrl));
  if (api === "anthropic-messages") {
    const out = [`${root}/v1/models`, `${root}/models`];
    return [...new Set(out)];
  }
  if (api === "google-generative-ai") {
    return [`${root}/models`];
  }
  return [`${root}/models`];
}

export function suggestV1(api: string, baseUrl: string): string | undefined {
  if (!isOpenAiApi(api)) return undefined;
  const root = trimSlash(canonicalizeUrl(baseUrl));
  if (root.endsWith("/v1")) return undefined;
  return `${root}/v1`;
}

export function sameEndpoint(a: { api?: string; baseUrl?: string }, b: { api?: string; baseUrl?: string }): boolean {
  if (!a.api || !b.api || !a.baseUrl || !b.baseUrl) return false;
  return a.api === b.api && canonicalizeUrl(a.baseUrl) === canonicalizeUrl(b.baseUrl);
}
