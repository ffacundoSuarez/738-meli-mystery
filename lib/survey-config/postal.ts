import { AnswerValue } from '../types';

/** Resultado de validar CP vs país y ciudad declarada. */
export type PostalCheckStatus = 'match' | 'city_mismatch' | 'country_mismatch';

export interface PostalCheckResult {
  status: PostalCheckStatus;
  label: string;
}

const CITY_LABELS: Record<string, string> = {
  santiago: 'Santiago',
  antofagasta: 'Antofagasta',
  concepcion: 'Concepción',
  bogota: 'Bogotá',
  medellin: 'Medellín',
  cali: 'Cali',
};

/** Normaliza CP a dígitos; Colombia se rellena a 6 (Medellín 050xxx). */
export function normalizePostalDigits(
  raw: AnswerValue | undefined,
  countryCode: string
): string | null {
  if (raw === undefined || raw === null || raw === '') return null;
  const digits = String(raw).replace(/\D/g, '');
  if (!digits) return null;

  if (countryCode === '1') {
    return digits.length === 7 ? digits : null;
  }
  if (countryCode === '2') {
    if (digits.length > 6) return null;
    return digits.padStart(6, '0');
  }
  return null;
}

/** Infiere ciudad del CP según prefijos de las 6 ciudades del cuestionario. */
function cityFromPostal(countryCode: string, postal: string): string | null {
  if (countryCode === '1') {
    const prefix3 = postal.slice(0, 3);
    const prefixNum = Number.parseInt(prefix3, 10);
    if (prefixNum >= 750 && prefixNum <= 838) return 'santiago';
    if (prefixNum >= 842 && prefixNum <= 938) return 'santiago';
    if (prefix3.startsWith('124')) return 'antofagasta';
    if (['403', '410', '413', '426'].includes(prefix3)) return 'concepcion';
    return null;
  }
  if (countryCode === '2') {
    if (postal.startsWith('11')) return 'bogota';
    if (postal.startsWith('050')) return 'medellin';
    if (postal.startsWith('760')) return 'cali';
    return null;
  }
  return null;
}

/**
 * Compara A08 con el país precargado y la ciudad A09.
 * Usado en revisión para que Ops no verifique CP a mano.
 */
export function checkPostalCode(
  postalRaw: AnswerValue | undefined,
  countryCode: AnswerValue | undefined,
  cityCode: AnswerValue | undefined
): PostalCheckResult | null {
  if (!hasPostalValue(postalRaw) || !countryCode) return null;

  const country = String(countryCode);
  if (country !== '1' && country !== '2') return null;

  const countryLabel = country === '1' ? 'Chile' : 'Colombia';
  const expectedLen = country === '1' ? '7 dígitos' : '6 dígitos';
  const normalized = normalizePostalDigits(postalRaw, country);

  if (!normalized) {
    return {
      status: 'country_mismatch',
      label: `CP no válido para ${countryLabel} (${expectedLen})`,
    };
  }

  const inferredCity = cityFromPostal(country, normalized);
  const city = cityCode ? String(cityCode) : '';

  if (city && inferredCity && inferredCity === city) {
    return {
      status: 'match',
      label: `CP coincide con ${countryLabel} / ${CITY_LABELS[city]}`,
    };
  }

  if (city && inferredCity && inferredCity !== city) {
    return {
      status: 'city_mismatch',
      label: `CP parece ser de ${CITY_LABELS[inferredCity]}, no de ${CITY_LABELS[city] ?? city}`,
    };
  }

  if (city && !inferredCity) {
    return {
      status: 'city_mismatch',
      label: `CP válido para ${countryLabel}, no coincide con ${CITY_LABELS[city] ?? city}`,
    };
  }

  if (inferredCity) {
    return {
      status: 'match',
      label: `CP corresponde a ${countryLabel} / ${CITY_LABELS[inferredCity]}`,
    };
  }

  return {
    status: 'city_mismatch',
    label: `CP válido para ${countryLabel}, ciudad no identificada en prefijos`,
  };
}

function hasPostalValue(raw: AnswerValue | undefined): boolean {
  return raw !== undefined && raw !== null && raw !== '';
}
