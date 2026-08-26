import {
  ListingFacts,
  ListingUrlParseResult,
  buildListingFacts,
  listingUrlNeedsRedirect,
  parseListingUrl,
  parseListingUrlWithMeta,
} from './survey-config/listing-url';
import { coerceListingHref } from './survey-config/listing-url-resolve';

export type NormalizeListingResult = {
  facts: ListingFacts;
  parse: ListingUrlParseResult;
};

type CacheEntry = { expires: number; result: NormalizeListingResult };

const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, CacheEntry>();

function cacheKey(
  raw: string,
  options?: { expectedMarketplace?: string; expectedCountry?: string }
): string {
  return JSON.stringify({
    u: raw.trim(),
    mp: options?.expectedMarketplace,
    c: options?.expectedCountry,
  });
}

/**
 * Sigue redirects HTTP (share / acortadores) hasta URL final o límite.
 * Fail-soft: null si no se pudo resolver.
 */
export async function resolveListingRedirects(
  rawUrl: string,
  options?: { maxRedirects?: number; timeoutMs?: number }
): Promise<string | null> {
  const maxRedirects = options?.maxRedirects ?? 5;
  const timeoutMs = options?.timeoutMs ?? 8000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let current = coerceListingHref(rawUrl);

    for (let i = 0; i < maxRedirects; i++) {
      const res = await fetch(current, {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (compatible; MeliMystery/1.0; +listing-normalize)',
          Accept: 'text/html,application/xhtml+xml,*/*',
        },
      });

      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get('location');
        if (!loc) break;
        current = new URL(loc, current).href;
        continue;
      }

      if (res.status >= 200 && res.status < 400) {
        return current;
      }
      break;
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Normaliza A05: parse local, o resolve + re-parse para shares.
 * Siempre fail-soft (facts con parseOk=false si falla).
 */
export async function normalizeListingUrl(
  raw: string,
  options?: {
    expectedMarketplace?: string;
    expectedCountry?: string;
    skipCache?: boolean;
  }
): Promise<NormalizeListingResult> {
  const trimmed = raw.trim();
  if (!trimmed) {
    const parse: ListingUrlParseResult = {
      ok: false,
      code: 'empty',
      messageKey: 'listingUrlInvalid',
    };
    return { parse, facts: buildListingFacts(trimmed, parse) };
  }

  const key = cacheKey(trimmed, options);
  if (!options?.skipCache) {
    const hit = cache.get(key);
    if (hit && hit.expires > Date.now()) return hit.result;
  }

  const local = parseListingUrlWithMeta(trimmed, options);
  if (local.parse.ok) {
    const result: NormalizeListingResult = {
      parse: local.parse,
      facts: buildListingFacts(trimmed, local.parse, { meta: local.meta }),
    };
    cache.set(key, { expires: Date.now() + CACHE_TTL_MS, result });
    return result;
  }

  if (
    local.parse.ok === false &&
    local.parse.code !== 'needsResolve' &&
    !listingUrlNeedsRedirect(trimmed)
  ) {
    const result: NormalizeListingResult = {
      parse: local.parse,
      facts: buildListingFacts(trimmed, local.parse),
    };
    cache.set(key, { expires: Date.now() + CACHE_TTL_MS, result });
    return result;
  }

  const resolved = await resolveListingRedirects(trimmed);
  if (!resolved) {
    const parse: ListingUrlParseResult = local.parse.ok
      ? local.parse
      : {
          ok: false,
          code: 'needsResolve',
          messageKey: 'listingUrlNeedsResolve',
        };
    const result: NormalizeListingResult = {
      parse,
      facts: buildListingFacts(trimmed, parse, { source: 'url-resolved' }),
    };
    cache.set(key, { expires: Date.now() + CACHE_TTL_MS, result });
    return result;
  }

  const resolvedMeta = parseListingUrlWithMeta(resolved, options);
  const result: NormalizeListingResult = {
    parse: resolvedMeta.parse,
    facts: buildListingFacts(trimmed, resolvedMeta.parse, {
      source: 'url-resolved',
      canonicalUrl: resolvedMeta.parse.ok ? resolvedMeta.parse.href : resolved,
      meta: resolvedMeta.meta,
    }),
  };
  cache.set(key, { expires: Date.now() + CACHE_TTL_MS, result });
  return result;
}

/** Limpia cache (tests). */
export function clearListingNormalizeCache(): void {
  cache.clear();
}
