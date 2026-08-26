/** Cookie de sesión para la vista cliente /resultados (separada de Ops). */
export const RESULTADOS_AUTH_COOKIE = 'meli_resultados_auth';

const USERNAME_KEY = 'meli_resultados_username';
const PASSWORD_KEY = 'meli_resultados_password';

/** Normaliza email/username para cookie y comparación. */
export function normalizeResultadosUsername(username: string): string {
  return username.trim().toLowerCase();
}

export function getResultadosCredentials(): {
  username: string;
  password: string;
} | null {
  if (typeof window === 'undefined') return null;
  const username = sessionStorage.getItem(USERNAME_KEY);
  const password = sessionStorage.getItem(PASSWORD_KEY);
  if (!username || !password) return null;
  return { username, password };
}

export function setResultadosCredentials(username: string, password: string): void {
  sessionStorage.setItem(USERNAME_KEY, normalizeResultadosUsername(username));
  sessionStorage.setItem(PASSWORD_KEY, password);
}

export function clearResultadosCredentials(): void {
  sessionStorage.removeItem(USERNAME_KEY);
  sessionStorage.removeItem(PASSWORD_KEY);
}

export function requireResultadosCredentials(): { username: string; password: string } {
  const creds = getResultadosCredentials();
  if (!creds) {
    throw new Error('Sesión expirada. Volvé a ingresar.');
  }
  return creds;
}
