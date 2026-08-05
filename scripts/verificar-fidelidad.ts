/**
 * Verificador de fidelidad textual.
 * Recorre surveySections y comprueba que cada text/hint/label aparezca
 * literal en incoming/fiel.txt. También rechaza metadatos colados.
 *
 * Uso: npx tsx scripts/verificar-fidelidad.ts
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { surveySections } from '../lib/survey-config';
import { getAllQuestions } from '../lib/survey-logic';

const FIEL_PATH = resolve(process.cwd(), 'incoming/fiel.txt');

const FORBIDDEN = [
  { re: / ⟨\|⟩ /, name: 'separador compacto ⟨|⟩' },
  { re: /PROGRAMADOR/i, name: 'PROGRAMADOR' },
  { re: /\bRU\b/, name: 'marcador RU' },
  { re: /\bRA\b/, name: 'marcador RA' },
  { re: /\bRM\b/, name: 'marcador RM' },
  { re: /\bNUMERICA\b/i, name: 'marcador NUMERICA' },
  { re: /\bNUMERICO\b/i, name: 'marcador NUMERICO' },
  { re: /\u00A0/, name: 'U+00A0' },
];

/** Textos de acompañamiento (Otro/especificar) que no están como enunciado
 *  independiente en el .docx — se aceptan si el fragmento clave está en fiel. */
const COMPANION_ALLOW = new Set([
  'A10. Especifique la categoría',
  'A13. Especifique vendido por',
  'C01.1. ¿Cuál otro medio?',
  'C02.1. ¿Cuál otro medio?',
  'C03.1. ¿Cuál otro medio?',
  'C04.1. ¿Cuál otro medio?',
  'D07.1. Especifique otra compensación',
  'Adjuntar evidencias',
  // Labels de moneda: se quitaron (SOLO CHI/COL/TODOS); el doc aún los tiene
  'Pesos chilenos',
  'Pesos colombianos',
  'Dólares estadounidenses',
  // Hints de UI / Ops (no vienen del .docx)
  'Precargado al generar el link. Verifique que sea correcto.',
  'Audios, imágenes, videos, PDF y cualquier otro archivo.',
  // País aux (no está como enunciado shopper en el body A–F)
  'Pais',
  'Chile',
  'Colombia',
]);

function collectStrings(): { where: string; value: string }[] {
  const out: { where: string; value: string }[] = [];
  for (const q of getAllQuestions(surveySections)) {
    if (q.text?.trim()) out.push({ where: `${q.id}.text`, value: q.text });
    if (q.hint?.trim()) out.push({ where: `${q.id}.hint`, value: q.hint });
    for (const o of q.options ?? []) {
      if (o.label?.trim()) out.push({ where: `${q.id}.opt:${o.value}`, value: o.label });
    }
    for (const r of q.matrixRows ?? []) {
      if (r.label?.trim()) out.push({ where: `${q.id}.row:${r.id}`, value: r.label });
    }
  }
  return out;
}

function main() {
  let fiel: string;
  try {
    fiel = readFileSync(FIEL_PATH, 'utf8');
  } catch {
    console.error(`No se encontró ${FIEL_PATH}. Regenerá con:`);
    console.error(
      '  node scripts/extraer-fiel.mjs "incoming/728 - Mystery Mercado Envios - Cuestionario 03.08.docx" incoming/fiel.txt'
    );
    process.exit(2);
  }

  const findings: string[] = [];
  const strings = collectStrings();

  for (const { where, value } of strings) {
    for (const f of FORBIDDEN) {
      if (f.re.test(value)) {
        findings.push(`[meta] ${where}: contiene ${f.name}\n  → ${JSON.stringify(value)}`);
      }
    }

    // Piping markers stay in source text by design
    const needle = value.trim();
    if (!needle) continue;

    if (COMPANION_ALLOW.has(needle)) continue;

    // Module titles like SELECCIÓN / COMPRA / NOTIFICACIONES / ENTREGA / CONTACTOS
    if (fiel.includes(needle)) continue;

    // Allow multiline hints if each non-empty line appears
    const lines = needle.split(/\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length > 1 && lines.every((l) => fiel.includes(l))) continue;

    findings.push(`[fidelidad] ${where}: no aparece en fiel.txt\n  → ${JSON.stringify(needle)}`);
  }

  if (findings.length) {
    console.error(`Hallazgos: ${findings.length}\n`);
    for (const f of findings) console.error(f + '\n');
    process.exit(1);
  }

  console.log(`OK — ${strings.length} cadenas verificadas contra fiel.txt`);
}

main();
