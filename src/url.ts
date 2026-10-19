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
  if (u.protocol !== "https:" && u.protocol !== "http:") {
    throw new Error("url must use http or https");
  }
  if (u.protocol === "http:" && !isLocalOrPrivateHost(u.hostname)) {
    throw new Error("insecure http URL; use https, or plain http only for localhost or a private (LAN) address");
  }
  if (u.username || u.password) {
    throw new Error("url must not contain credentials");
  }
  u.hash = "";
  u.search = "";
  return u.toString();
}

/**
 * Hosts a plain-http baseUrl may point at: loopback, RFC1918 / link-local /
 * CGNAT (Tailscale) addresses, IPv6 ULA and link-local, and the usual
 * local suffixes. Everything else stays HTTPS-only.
 */
export function isLocalOrPrivateHost(host: string): boolean {
  const h = host.trim().toLowerCase().replace(/^\[|\]$/g, "");
  if (!h) return false;
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (h.endsWith(".local") || h.endsWith(".lan") || h.endsWith(".internal") || h.endsWith(".home.arpa")) return true;
  if (h === "::1") return true;
  if (/^f[cd][0-9a-f]{0,2}:/i.test(h)) return true; // IPv6 unique-local fc00::/7
  if (/^fe[89ab][0-9a-f]{0,2}:/i.test(h)) return true; // IPv6 link-local fe80::/10
  const octets = h.split(".");
  if (octets.length !== 4) return false;
  if (!octets.every((o) => /^\d{1,3}$/.test(o) && Number(o) <= 255)) return false;
  const [a, b] = octets.map(Number);
  if (a === 127) return true; // loopback
  if (a === 10) return true; // RFC1918
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
  if (a === 192 && b === 168) return true; // RFC1918
  if (a === 169 && b === 254) return true; // link-local
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT / Tailscale
  return false;
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
