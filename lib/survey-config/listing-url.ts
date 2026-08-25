import { AnswerValue } from '../types';
import { stripAccents } from './assignment-title';

export type ListingMarketplace = 'falabella' | 'amazon' | 'temu';

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

/** Normaliza URL: agrega https:// si falta esquema. */
function coerceHref(raw: string): string {
  const trimmed = raw.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^\/\//.test(trimmed)) return `https:${trimmed}`;
  return `https://${trimmed}`;
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

/** Extrae slug e IDs según marketplace. */
function extractProductMeta(
  url: URL,
  marketplace: ListingMarketplace
): { slug?: string; productId?: string } {
  const path = url.pathname;
  const parts = path.split('/').filter(Boolean);

  if (marketplace === 'temu') {
    // /cl/camara-de-tablero-...-g-601099512345678.html o goods.html?...
    const goodsId =
      url.searchParams.get('goods_id') ||
      url.searchParams.get('goodsId') ||
      url.searchParams.get('spec_gallery_id');
    const gMatch = path.match(/-g-(\d{6,})/i);
    const productId = goodsId || gMatch?.[1] || undefined;

    // Segmento con el slug del producto (después del país)
    const slugPart =
      parts.find((p, i) => i > 0 && /[a-z].*-/i.test(p) && !p.includes('.')) ||
      parts.find((p) => /-g-\d+/i.test(p)) ||
      parts.find((p) => p.toLowerCase().endsWith('.html'));

    let slug: string | undefined;
    if (slugPart) {
      slug = slugPart
        .replace(/\.html?$/i, '')
        .replace(/-g-\d+$/i, '')
        .replace(/-+/g, ' ')
        .trim();
    }
    return { slug, productId: productId || undefined };
  }

  if (marketplace === 'amazon') {
    const dp = path.match(/\/(?:dp|gp\/product|product)\/([A-Z0-9]{10})/i);
    const productId = dp?.[1]?.toUpperCase();
    // /Slug-Title/dp/ASIN
    const slugIdx = parts.findIndex((p) => p.toLowerCase() === 'dp');
    let slug: string | undefined;
    if (slugIdx > 0) {
      slug = parts[slugIdx - 1].replace(/-/g, ' ');
    }
    return { slug, productId };
  }

  // Falabella: .../product/.../ID o .../prodNNNNN/...
  const prodMatch =
    path.match(/\/(?:product|prod)\/[^/]+\/(\d{5,})/i) ||
    path.match(/\/(\d{6,})(?:\/|$|\?)/) ||
    path.match(/prod(\d{5,})/i);
  const sku = url.searchParams.get('skuId') || url.searchParams.get('sku');
  const productId = sku || prodMatch?.[1] || undefined;
  const slugPart = parts.find(
    (p) => p.length > 8 && /[a-z]/i.test(p) && !/^\d+$/.test(p)
  );
  const slug = slugPart
    ? slugPart.replace(/-/g, ' ').replace(/\.[a-z]+$/i, '')
    : undefined;
  return { slug, productId };
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

  if (IMAGE_EXT_RE.test(trimmed)) {
    return { ok: false, code: 'imageUrl', messageKey: 'listingUrlImage' };
  }

  const url = tryParseUrl(trimmed);
  if (!url || !url.hostname) {
    return { ok: false, code: 'notUrl', messageKey: 'listingUrlInvalid' };
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
  const { slug, productId } = extractProductMeta(url, marketplace);

  // Página de producto: path no vacío (salvo query con goods_id) y no solo "/"
  const pathParts = url.pathname.split('/').filter(Boolean);
  const looksLikeProduct =
    pathParts.length >= 1 ||
    Boolean(productId) ||
    url.searchParams.has('goods_id');

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
