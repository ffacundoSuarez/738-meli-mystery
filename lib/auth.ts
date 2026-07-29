// Gestión del passcode de ops en el browser (para llamadas RPC admin_*)

const PASSCODE_KEY = 'meli_ops_passcode';

export function getOpsPasscode(): string | null {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem(PASSCODE_KEY);
}

export function setOpsPasscode(passcode: string): void {
  sessionStorage.setItem(PASSCODE_KEY, passcode);
}

export function clearOpsPasscode(): void {
  sessionStorage.removeItem(PASSCODE_KEY);
}

export function requireOpsPasscode(): string {
  const passcode = getOpsPasscode();
  if (!passcode) {
    throw new Error('Sesión expirada. Volvé a ingresar el passcode.');
  }
  return passcode;
}
