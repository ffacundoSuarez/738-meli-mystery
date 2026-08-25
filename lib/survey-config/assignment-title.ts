import { AnswerValue } from '../types';

/** País / ciudad / marketplace inferidos del título de la encuesta. */
export interface ParsedAssignment {
  countryCode: '1' | '2';
  countryLabel: 'Chile' | 'Colombia';
  cityCode: string;
  cityLabel: string;
  marketplace: 'falabella' | 'amazon' | 'temu';
  marketplaceLabel: string;
  /** Resumen corto para UI: "Temu · Concepción · Chile" */
  summary: string;
}

export type AssignmentCheckStatus =
  | 'match'
  | 'mismatch'
  | 'country_mismatch'
  | 'unparseable';

export interface AssignmentCheckResult {
  status: AssignmentCheckStatus;
  label: string;
  parsed?: ParsedAssignment;
}

/** Quita acentos para comparar CONCEPCIÓN ↔ CONCEPCION. */
export function stripAccents(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '');
}

function normalizeToken(text: string): string {
  return stripAccents(text).toUpperCase().replace(/\s+/g, ' ').trim();
}

const CITY_ALIASES: { code: string; label: string; tokens: string[] }[] = [
  { code: 'santiago', label: 'Santiago', tokens: ['SANTIAGO'] },
  { code: 'antofagasta', label: 'Antofagasta', tokens: ['ANTOFAGASTA'] },
  {
    code: 'concepcion',
    label: 'Concepción',
    tokens: ['CONCEPCION', 'CONCEPCIÓN'],
  },
  { code: 'bogota', label: 'Bogotá', tokens: ['BOGOTA', 'BOGOTÁ'] },
  { code: 'medellin', label: 'Medellín', tokens: ['MEDELLIN', 'MEDELLÍN'] },
  { code: 'cali', label: 'Cali', tokens: ['CALI'] },
];

const MARKETPLACE_ALIASES: {
  slug: 'falabella' | 'amazon' | 'temu';
  label: string;
  tokens: string[];
}[] = [
  { slug: 'temu', label: 'Temu', tokens: ['TEMU'] },
  { slug: 'falabella', label: 'Falabella', tokens: ['FALABELLA'] },
  { slug: 'amazon', label: 'Amazon', tokens: ['AMAZON'] },
];

/**
 * Parsea el título de la encuesta (nombreApellido / answers['nombre-apellido']).
 * Ej: "168CHI CONCEPCIÓN TEMU FULL" → Chile + Concepción + Temu.
 * Devuelve null si no parece un título de asignación (nombre de persona, etc.).
 */
export function parseAssignmentTitle(
  raw: AnswerValue | string | undefined | null
): ParsedAssignment | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const normalized = normalizeToken(trimmed);

  // Prefijo: 168CHI / 96COL / T01CHI
  const prefixMatch = normalized.match(
    /^(?:T)?(\d+)\s*(CHI|COL)\b/
  );
  if (!prefixMatch) return null;

  const countryToken = prefixMatch[2] as 'CHI' | 'COL';
  const countryCode = countryToken === 'CHI' ? '1' : '2';
  const countryLabel = countryToken === 'CHI' ? 'Chile' : 'Colombia';

  const rest = normalized.slice(prefixMatch[0].length).trim();
  if (!rest) return null;

  let cityCode: string | undefined;
  let cityLabel: string | undefined;
  for (const city of CITY_ALIASES) {
    for (const token of city.tokens) {
      const normToken = normalizeToken(token);
      // Ciudad como palabra completa en el resto del título
      if (
        rest === normToken ||
        rest.startsWith(normToken + ' ') ||
        rest.includes(' ' + normToken + ' ') ||
        rest.endsWith(' ' + normToken)
      ) {
        cityCode = city.code;
        cityLabel = city.label;
        break;
      }
    }
    if (cityCode) break;
  }

  let marketplace: ParsedAssignment['marketplace'] | undefined;
  let marketplaceLabel: string | undefined;
  for (const mp of MARKETPLACE_ALIASES) {
    for (const token of mp.tokens) {
      if (rest.includes(normalizeToken(token))) {
        marketplace = mp.slug;
        marketplaceLabel = mp.label;
        break;
      }
    }
    if (marketplace) break;
  }

  if (!cityCode || !cityLabel || !marketplace || !marketplaceLabel) {
    return null;
  }

  return {
    countryCode,
    countryLabel,
    cityCode,
    cityLabel,
    marketplace,
    marketplaceLabel,
    summary: `${marketplaceLabel} · ${cityLabel} · ${countryLabel}`,
  };
}

/** Título desde answers (clave de alta) o string suelto. */
export function assignmentTitleFromAnswers(
  answers: Record<string, AnswerValue>
): string | undefined {
  const fromAnswers = answers['nombre-apellido'];
  if (typeof fromAnswers === 'string' && fromAnswers.trim()) {
    return fromAnswers.trim();
  }
  return undefined;
}

/**
 * Compara A07 / A09 / país con el título parseado.
 * Usado en revisión (badges) y para bloquear envío si hay mismatch.
 */
export function checkAssignmentMatch(
  answers: Record<string, AnswerValue>,
  field: 'marketplace' | 'city' | 'country'
): AssignmentCheckResult | null {
  const title = assignmentTitleFromAnswers(answers);
  if (!title) return null;

  const parsed = parseAssignmentTitle(title);
  if (!parsed) {
    return {
      status: 'unparseable',
      label: 'Título no identificable',
    };
  }

  if (field === 'marketplace') {
    const current = answers['q8-competidor'];
    if (typeof current !== 'string' || !current) {
      return {
        status: 'mismatch',
        label: `Esperado: ${parsed.marketplaceLabel}`,
        parsed,
      };
    }
    if (current === parsed.marketplace) {
      return {
        status: 'match',
        label: `OK · ${parsed.marketplaceLabel}`,
        parsed,
      };
    }
    return {
      status: 'mismatch',
      label: `No coincide · título: ${parsed.marketplaceLabel}`,
      parsed,
    };
  }

  if (field === 'city') {
    const current = answers['q10-ciudad'];
    if (typeof current !== 'string' || !current) {
      return {
        status: 'mismatch',
        label: `Esperado: ${parsed.cityLabel}`,
        parsed,
      };
    }
    if (current === parsed.cityCode) {
      return {
        status: 'match',
        label: `OK · ${parsed.cityLabel}`,
        parsed,
      };
    }
    return {
      status: 'mismatch',
      label: `No coincide · título: ${parsed.cityLabel}`,
      parsed,
    };
  }

  // country
  const current = answers['f1-pais'];
  if (typeof current !== 'string' || !current) {
    return {
      status: 'country_mismatch',
      label: `Esperado: ${parsed.countryLabel}`,
      parsed,
    };
  }
  if (current === parsed.countryCode) {
    return {
      status: 'match',
      label: `OK · ${parsed.countryLabel}`,
      parsed,
    };
  }
  return {
    status: 'country_mismatch',
    label: `País no coincide · título: ${parsed.countryLabel}`,
    parsed,
  };
}

/**
 * Valor bloqueado desde el título (marketplace o ciudad).
 * undefined = título no parseable → el shopper elige libremente.
 */
export function lockedValueFromAssignment(
  field: 'marketplace' | 'city',
  answers: Record<string, AnswerValue>
): string | undefined {
  const title = assignmentTitleFromAnswers(answers);
  if (!title) return undefined;
  const parsed = parseAssignmentTitle(title);
  if (!parsed) return undefined;
  return field === 'marketplace' ? parsed.marketplace : parsed.cityCode;
}
