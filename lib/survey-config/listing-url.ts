import {
  AnswerValue,
  ListingFacts,
  LISTING_FACTS_KEY,
  ListingMarketplace,
} from '../types';
import { stripAccents } from './assignment-title';
import { coerceListingHref } from './listing-url-resolve';

export type { ListingFacts, ListingMarketplace };
export { LISTING_FACTS_KEY };

/** Datos extraídos de una URL de publicación (A05). */
export interface ParsedListingUrl {
  ok: true;
  href: string;
  marketplace: ListingMarketplace;
  countryCode?: '1' | '2';
  /** Slug o fragmento de título en el path */
  slug?: string;
  /** ID de producto / goods_id / ASIN / SKU */
  productId?: string;
  host: string;
}

export type ListingUrlErrorCode =
  | 'empty'
  | 'notUrl'
  | 'imageUrl'
  | 'unknownHost'
  | 'notProductPage'
  | 'needsResolve'
  | 'marketplaceMismatch'
  | 'countryMismatch';

export interface ListingUrlError {
  ok: false;
  code: ListingUrlErrorCode;
  messageKey: ListingUrlMessageKey;
}

export type ListingUrlMessageKey =
  | 'listingUrlInvalid'
  | 'listingUrlImage'
  | 'listingUrlUnknownHost'
  | 'listingUrlNotProduct'
  | 'listingUrlNeedsResolve'
  | 'listingUrlMarketplaceMismatch'
  | 'listingUrlCountryMismatch';

export type ListingUrlParseResult = ParsedListingUrl | ListingUrlError;

export type PurchaseCodeMessageKey =
  | 'purchaseCodeTooShort'
  | 'purchaseCodeTrash';

export interface PurchaseCodeValidation {
  level: 'ok' | 'error';
  messageKey?: PurchaseCodeMessageKey;
}

export type PurchaseCodeUrlCrossStatus =
  | 'match'
  | 'no_id_in_url'
  | 'mismatch'
  | 'skip';

export interface PurchaseCodeUrlCrossResult {
  status: PurchaseCodeUrlCrossStatus;
  label: string;
}

const IMAGE_EXT_RE = /\.(jpe?g|png|gif|webp|bmp|svg|avif)(\?|&|#|$)/i;
const PURCHASE_TRASH =
  /^(test|asdf|xxx+|aaa+|hola|ok|n\/a|na|ninguno|\.+|-+|_+|123+|abc+)$/i;
const TEMU_NON_PRODUCT =
  /^(shopping_cart|cart|checkout|login|search|index|home)(\.html)?$/i;
const GENERIC_SLUG = /^(goods|shopping_cart|cart|product|index)(\.html)?$/i;
const LOCALE_SEG = /^[a-z]{2}$/i;

/** Hosts que requieren seguir redirects en servidor (share / acortadores). */
export function listingUrlNeedsRedirect(raw: string): boolean {
  const url = tryParseUrl(raw);
  if (!url) return false;
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  if (host === 'share.temu.com') return true;
  if (host === 'amzn.to' || host === 'a.co') return true;
  return false;
}

/** True si el pathname (no el query) apunta a un archivo de imagen. */
function pathLooksLikeImageFile(pathname: string): boolean {
  return IMAGE_EXT_RE.test(pathname);
}

/** Normaliza URL: agrega https:// si falta esquema. */
function coerceHref(raw: string): string {
  return coerceListingHref(raw);
}
function tryParseUrl(raw: string): URL | null {
  try {
    return new URL(coerceHref(raw));
  } catch {
    return null;
  }
}

function countryFromPathSegment(seg: string): '1' | '2' | undefined {
  const s = seg.toLowerCase();
  if (s === 'cl' || s === 'chi' || s === 'chile') return '1';
  if (s === 'co' || s === 'col' || s === 'colombia') return '2';
  return undefined;
}

/** Detecta marketplace y país desde host + path de Temu / Falabella / Amazon. */
function detectMarketplace(url: URL): {
  marketplace: ListingMarketplace;
  countryCode?: '1' | '2';
} | null {
  const host = url.hostname.toLowerCase().replace(/^www\./, '');

  if (host === 'amzn.to' || host === 'a.co') {
    return { marketplace: 'amazon', countryCode: undefined };
  }

  if (host === 'temu.com' || host.endsWith('.temu.com')) {
    const parts = url.pathname.split('/').filter(Boolean);
    const countryCode =
      parts.length > 0 ? countryFromPathSegment(parts[0]) : undefined;
    return { marketplace: 'temu', countryCode };
  }

  if (host.includes('falabella')) {
    // falabella.com/falabella-cl/... o www.falabella.com.co
    let countryCode: '1' | '2' | undefined;
    if (host.endsWith('.com.co') || host.includes('falabella-co')) {
      countryCode = '2';
    } else if (
      host.includes('falabella-cl') ||
      host.endsWith('.cl') ||
      host === 'falabella.com'
    ) {
      countryCode = '1';
    }
    const pathLower = url.pathname.toLowerCase();
    if (pathLower.includes('falabella-co')) countryCode = '2';
    if (pathLower.includes('falabella-cl')) countryCode = '1';
    return { marketplace: 'falabella', countryCode };
  }

  if (
    host === 'amazon.com.co' ||
    host.endsWith('.amazon.com.co') ||
    host === 'amzn.com.co'
  ) {
    return { marketplace: 'amazon', countryCode: '2' };
  }
  // amazon.com genérico: no es el dominio del estudio (solo CO)
  if (host.includes('amazon.')) {
    return { marketplace: 'amazon', countryCode: undefined };
  }

  return null;
}

type ProductMeta = {
  slug?: string;
  productId?: string;
  goodsId?: string;
  alternateProductId?: string;
};

function cleanSlug(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const s = raw.replace(/\.html?$/i, '').replace(/-+/g, ' ').trim();
  if (!s || GENERIC_SLUG.test(s.replace(/\s/g, '_'))) return undefined;
  return s;
}

function isTemuNonProductPath(pathname: string): boolean {
  const parts = pathname.split('/').filter(Boolean);
  const leaf = (parts[parts.length - 1] || '').replace(/\.html?$/i, '');
  if (TEMU_NON_PRODUCT.test(leaf)) return true;
  return parts.some((p) => TEMU_NON_PRODUCT.test(p.replace(/\.html?$/i, '')));
}

/** Extrae slug e IDs según marketplace. */
function extractProductMeta(url: URL, marketplace: ListingMarketplace): ProductMeta {
  const path = url.pathname;
  const parts = path.split('/').filter(Boolean);

  if (marketplace === 'temu') {
    const gMatch = path.match(/-g-(\d{6,})/i);
    const skuId =
      url.searchParams.get('sku_id') || url.searchParams.get('skuId');
    const goodsId =
      url.searchParams.get('goods_id') ||
      url.searchParams.get('goodsId') ||
      undefined;
    const productId = gMatch?.[1] || skuId || undefined;

    const slugPart =
      parts.find((p, i) => i > 0 && /[a-z].*-/i.test(p) && !p.includes('.')) ||
      parts.find((p) => /-g-\d+/i.test(p));

    return {
      slug: cleanSlug(
        slugPart
          ?.replace(/\.html?$/i, '')
          .replace(/-g-\d+$/i, '')
          .replace(/-+/g, ' ')
      ),
      productId: productId || undefined,
      goodsId: goodsId || undefined,
    };
  }

  if (marketplace === 'amazon') {
    const dp = path.match(/\/(?:dp|gp\/product|product)\/([A-Z0-9]{10})/i);
    const productId = dp?.[1]?.toUpperCase();
    const dpIdx = parts.findIndex((p) => p.toLowerCase() === 'dp');
    let slug: string | undefined;
    if (dpIdx > 0) {
      for (let i = dpIdx - 1; i >= 0; i--) {
        const seg = parts[i];
        if (seg === '-' || LOCALE_SEG.test(seg)) continue;
        if (seg.length > 3 && /[a-z]/i.test(seg)) {
          slug = seg.replace(/-/g, ' ');
          break;
        }
      }
    }
    return { slug: cleanSlug(slug), productId };
  }

  // Falabella: /falabella-{cl|co}/product/{catalogId}/{Title-Slug}/{pageSkuId}
  const productIdx = parts.findIndex((p) => p.toLowerCase() === 'product');
  if (productIdx >= 0 && parts.length > productIdx + 1) {
    const catalogId = /^\d{5,}$/.test(parts[productIdx + 1])
      ? parts[productIdx + 1]
      : undefined;
    const titleSeg = parts[productIdx + 2];
    const trailingId =
      /^\d{5,}$/.test(parts[parts.length - 1]) ? parts[parts.length - 1] : undefined;
    const slug =
      titleSeg && !/^\d+$/.test(titleSeg) && /[a-z]/i.test(titleSeg)
        ? titleSeg.replace(/-/g, ' ')
        : undefined;
    const querySku = url.searchParams.get('skuId') || url.searchParams.get('sku');
    const pageSkuId = trailingId || catalogId;
    const productId = querySku || pageSkuId;
    const alternateProductId =
      catalogId && productId && catalogId !== productId ? catalogId : undefined;
    return {
      slug: cleanSlug(slug),
      productId,
      alternateProductId,
    };
  }

  const prodMatch =
    path.match(/\/(?:product|prod)\/(\d{5,})/i) ||
    path.match(/prod(\d{5,})/i);
  const querySku = url.searchParams.get('skuId') || url.searchParams.get('sku');
  return {
    productId: querySku || prodMatch?.[1],
  };
}

/**
 * Parsea y valida A05 (URL de publicación).
 * expectedMarketplace / expectedCountry bloquean si no calzan.
 */
export function parseListingUrl(
  raw: AnswerValue | string | undefined | null,
  options?: {
    expectedMarketplace?: string;
    expectedCountry?: string;
  }
): ListingUrlParseResult {
  if (raw === undefined || raw === null || raw === '') {
    return { ok: false, code: 'empty', messageKey: 'listingUrlInvalid' };
  }
  if (typeof raw !== 'string') {
    return { ok: false, code: 'notUrl', messageKey: 'listingUrlInvalid' };
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, code: 'empty', messageKey: 'listingUrlInvalid' };
  }

  // Debe parecer una URL (http o dominio conocido)
  if (
    !/^https?:\/\//i.test(trimmed) &&
    !/^(www\.)?(temu|falabella|amazon)\./i.test(trimmed) &&
    !/\.(com|cl|co)([/?#]|$)/i.test(trimmed)
  ) {
    return { ok: false, code: 'notUrl', messageKey: 'listingUrlInvalid' };
  }

  const url = tryParseUrl(trimmed);
  if (!url || !url.hostname) {
    return { ok: false, code: 'notUrl', messageKey: 'listingUrlInvalid' };
  }

  if (listingUrlNeedsRedirect(trimmed)) {
    const detected = detectMarketplace(url);
    return {
      ok: false,
      code: 'needsResolve',
      messageKey: 'listingUrlNeedsResolve',
    };
  }

  // Solo el pathname: query params tipo top_gallery_url=...jpeg no cuentan
  if (pathLooksLikeImageFile(url.pathname)) {
    return { ok: false, code: 'imageUrl', messageKey: 'listingUrlImage' };
  }

  const detected = detectMarketplace(url);
  if (!detected) {
    return {
      ok: false,
      code: 'unknownHost',
      messageKey: 'listingUrlUnknownHost',
    };
  }

  const { marketplace, countryCode } = detected;
  const meta = extractProductMeta(url, marketplace);
  const { slug, productId } = meta;

  if (marketplace === 'temu' && isTemuNonProductPath(url.pathname)) {
    return {
      ok: false,
      code: 'notProductPage',
      messageKey: 'listingUrlNotProduct',
    };
  }

  // Página de producto: path con señal de ficha o ID en path/query
  const pathParts = url.pathname.split('/').filter(Boolean);
  const looksLikeProduct =
    (marketplace === 'falabella' &&
      pathParts.some((p) => p.toLowerCase() === 'product')) ||
    (marketplace === 'amazon' && Boolean(productId)) ||
    (marketplace === 'temu' &&
      (Boolean(productId) ||
        pathParts.some((p) => /-g-\d+/i.test(p)) ||
        (pathParts.some((p) => p.toLowerCase().endsWith('.html')) &&
          !isTemuNonProductPath(url.pathname)))) ||
    Boolean(productId);

  if (!looksLikeProduct) {
    return {
      ok: false,
      code: 'notProductPage',
      messageKey: 'listingUrlNotProduct',
    };
  }

  // Solo path de imagen / CDN aunque la extensión se haya escapado
  if (
    /\/(image|images|img|cdn|media|static)\//i.test(url.pathname) &&
    !productId
  ) {
    return { ok: false, code: 'imageUrl', messageKey: 'listingUrlImage' };
  }

  if (
    options?.expectedMarketplace &&
    options.expectedMarketplace !== marketplace
  ) {
    return {
      ok: false,
      code: 'marketplaceMismatch',
      messageKey: 'listingUrlMarketplaceMismatch',
    };
  }

  if (
    options?.expectedCountry &&
    countryCode &&
    options.expectedCountry !== countryCode
  ) {
    return {
      ok: false,
      code: 'countryMismatch',
      messageKey: 'listingUrlCountryMismatch',
    };
  }

  return {
    ok: true,
    href: url.href,
    marketplace,
    countryCode,
    slug,
    productId,
    host: url.hostname.replace(/^www\./, ''),
  };
}

/** Construye ListingFacts desde el resultado del parser (local o post-resolve). */
export function buildListingFacts(
  inputUrl: string,
  parse: ListingUrlParseResult,
  options?: {
    source?: ListingFacts['source'];
    canonicalUrl?: string;
    meta?: ProductMeta;
  }
): ListingFacts {
  const now = new Date().toISOString();
  if (!parse.ok) {
    return {
      source: options?.source ?? 'url',
      inputUrl,
      canonicalUrl: options?.canonicalUrl,
      parseOk: false,
      parseCode: parse.code as ListingFacts['parseCode'],
      extractedAt: now,
    };
  }
  const meta = options?.meta;
  return {
    source: options?.source ?? 'url',
    inputUrl,
    canonicalUrl: options?.canonicalUrl ?? parse.href,
    marketplace: parse.marketplace,
    countryCode: parse.countryCode,
    productId: parse.productId,
    goodsId: meta?.goodsId,
    alternateProductId: meta?.alternateProductId,
    slug: parse.slug,
    host: parse.host,
    parseOk: true,
    extractedAt: now,
  };
}

/** Parse completo con meta extendida (goodsId, SKU alterno). */
export function parseListingUrlWithMeta(
  raw: AnswerValue | string | undefined | null,
  options?: {
    expectedMarketplace?: string;
    expectedCountry?: string;
  }
): { parse: ListingUrlParseResult; meta?: ProductMeta } {
  const parse = parseListingUrl(raw, options);
  if (!parse.ok || typeof raw !== 'string') return { parse };
  const url = tryParseUrl(raw.trim());
  if (!url) return { parse };
  const detected = detectMarketplace(url);
  if (!detected) return { parse };
  return { parse, meta: extractProductMeta(url, detected.marketplace) };
}

/** Lee ListingFacts persistidos en answers. */
export function getListingFactsFromAnswers(
  answers: Record<string, AnswerValue | undefined>
): ListingFacts | null {
  const raw = answers[LISTING_FACTS_KEY];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const f = raw as ListingFacts;
  if (typeof f.inputUrl !== 'string' || typeof f.extractedAt !== 'string') {
    return null;
  }
  return f;
}

/** Parse efectivo para badges: prioriza facts resueltos si calzan con A05. */
export function getEffectiveListingParse(
  answers: Record<string, AnswerValue | undefined>,
  options?: {
    expectedMarketplace?: string;
    expectedCountry?: string;
  }
): ListingUrlParseResult | null {
  const url = answers['q05-link-publicacion'];
  if (typeof url !== 'string' || !url.trim()) return null;

  const facts = getListingFactsFromAnswers(answers);
  if (
    facts &&
    facts.inputUrl === url.trim() &&
    facts.parseOk &&
    facts.canonicalUrl &&
    facts.marketplace
  ) {
    return {
      ok: true,
      href: facts.canonicalUrl,
      marketplace: facts.marketplace,
      countryCode: facts.countryCode,
      slug: facts.slug,
      productId: facts.productId,
      host: facts.host ?? '',
    };
  }

  return parseListingUrl(url, options);
}

/**
 * A06: mínimo 6 caracteres alfanuméricos reales; rechaza "." y basura.
 */
export function validatePurchaseCode(
  raw: AnswerValue | string | undefined | null
): PurchaseCodeValidation {
  if (raw === undefined || raw === null || raw === '') {
    return { level: 'error', messageKey: 'purchaseCodeTooShort' };
  }
  if (typeof raw !== 'string') {
    return { level: 'error', messageKey: 'purchaseCodeTooShort' };
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return { level: 'error', messageKey: 'purchaseCodeTooShort' };
  }

  if (PURCHASE_TRASH.test(trimmed)) {
    return { level: 'error', messageKey: 'purchaseCodeTrash' };
  }

  // Contar letras/números (ignorar espacios y puntuación suelta)
  const alnum = trimmed.replace(/[^a-zA-Z0-9]/g, '');
  if (alnum.length < 6) {
    return { level: 'error', messageKey: 'purchaseCodeTooShort' };
  }

  return { level: 'ok' };
}

/**
 * Cruce best-effort A06 ↔ ID en URL. No bloquea; solo badges en revisión.
 */
export function crossCheckPurchaseCodeWithUrl(
  codeRaw: AnswerValue | undefined,
  urlRaw: AnswerValue | undefined
): PurchaseCodeUrlCrossResult {
  if (typeof codeRaw !== 'string' || !codeRaw.trim()) {
    return { status: 'skip', label: '' };
  }
  const parsed = parseListingUrl(urlRaw);
  if (!parsed.ok || !parsed.productId) {
    return {
      status: 'no_id_in_url',
      label: 'Sin ID en URL para cruzar',
    };
  }

  const code = codeRaw.trim().toLowerCase();
  const id = parsed.productId.toLowerCase();
  if (code.includes(id) || id.includes(code)) {
    return {
      status: 'match',
      label: `OK · ID URL: ${parsed.productId}`,
    };
  }
  return {
    status: 'mismatch',
    label: `No cruza con ID URL (${parsed.productId})`,
  };
}

/**
 * Aviso suave: ¿el slug de la URL se parece al título A04?
 * No bloquea.
 */
export function slugLooksLikeTitle(
  slug: string | undefined,
  titleRaw: AnswerValue | undefined
): boolean | null {
  if (!slug || typeof titleRaw !== 'string' || !titleRaw.trim()) return null;
  const norm = (s: string) =>
    stripAccents(s)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  const a = norm(slug);
  const b = norm(titleRaw);
  if (a.length < 4 || b.length < 4) return null;
  // Tokens comunes (≥3 chars)
  const tokensA = a.split(' ').filter((t) => t.length >= 3);
  const tokensB = new Set(b.split(' ').filter((t) => t.length >= 3));
  if (tokensA.length === 0) return null;
  const hits = tokensA.filter((t) => tokensB.has(t)).length;
  return hits >= Math.min(2, tokensA.length);
}
