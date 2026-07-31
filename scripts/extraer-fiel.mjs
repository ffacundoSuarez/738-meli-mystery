/**
 * Extracción FIEL de 728 - Mystery Mercado Envios - Cuestionario.docx
 *
 * Distinta de la extracción de análisis: concatena los <w:r> de cada párrafo
 * SIN insertar separadores, porque Word parte las palabras en varios runs
 * ("P"+"ais", "C"+"ontacto", "1"+"5c").
 *
 * Normalizaciones (las únicas permitidas, según el plan):
 *   - U+00A0 (espacio no-quebrable) -> espacio común
 *   - "**" (artefacto de markdown pegado en Word) -> se quita
 * Todo lo demás se preserva: erratas, comillas curvas/rectas/desparejas,
 * mayúsculas, acentos, códigos de opción.
 *
 * Salida: un párrafo por línea, con marcadores de estructura de tabla.
 * Es la fuente de verdad para transcribir y para el verificador de fidelidad.
 */
import fs from 'node:fs';
import JSZip from 'jszip';

const DOCX = process.argv[2];

const OUT = process.argv[3];

/** Lee word/document.xml del .docx (zip) sin depender de unzip del sistema. */
async function readDocumentXml(docxPath) {
  const buf = fs.readFileSync(docxPath);
  const zip = await JSZip.loadAsync(buf);
  const entry = zip.file('word/document.xml');
  if (!entry) throw new Error('word/document.xml no encontrado en el .docx');
  return entry.async('string');
}

const xml = await readDocumentXml(DOCX);

function unescapeXml(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, '&'); // último, para no re-desescapar
}

/** Normalizaciones permitidas por el plan. */
function normalizar(s) {
  return s.replace(/\u00a0/g, ' ').replace(/\*\*/g, '');
}

// Tokenizamos el XML en eventos que nos importan, en orden de documento.
const TOKEN = /<w:tbl[ >]|<\/w:tbl>|<w:tr[ >]|<\/w:tr>|<w:tc[ >]|<\/w:tc>|<w:p[ >]|<\/w:p>|<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:commentReference\s+w:id="(\d+)"|<w:highlight\s+w:val="(\w+)"/g;

const lines = [];
let buf = '';
let enParrafo = false;
let highlights = new Set();
let comentarios = [];
let depthTbl = 0;

function cerrarParrafo() {
  if (!enParrafo) return;
  const texto = normalizar(buf);
  const meta = [];
  if (highlights.size) meta.push(`hl=${[...highlights].sort().join('+')}`);
  if (comentarios.length) meta.push(`com=${comentarios.join(',')}`);
  // Sólo emitimos párrafos con contenido, o vacíos dentro de tabla (marcan celda vacía)
  if (texto.trim() !== '' || depthTbl > 0) {
    lines.push(meta.length ? `${texto}\t«${meta.join(' ')}»` : texto);
  }
  buf = '';
  enParrafo = false;
  highlights = new Set();
  comentarios = [];
}

let m;
while ((m = TOKEN.exec(xml)) !== null) {
  const tag = m[0];
  if (m[1] !== undefined) {
    // <w:t>…</w:t>
    if (enParrafo) buf += unescapeXml(m[1]);
    continue;
  }
  if (m[2] !== undefined) {
    comentarios.push(m[2]);
    continue;
  }
  if (m[3] !== undefined) {
    highlights.add(m[3]);
    continue;
  }
  if (tag.startsWith('<w:p')) {
    cerrarParrafo();
    enParrafo = true;
    continue;
  }
  if (tag === '</w:p>') {
    cerrarParrafo();
    continue;
  }
  if (tag.startsWith('<w:tbl')) {
    cerrarParrafo();
    depthTbl++;
    lines.push('<<TABLA>>');
    continue;
  }
  if (tag === '</w:tbl>') {
    cerrarParrafo();
    depthTbl--;
    lines.push('<</TABLA>>');
    continue;
  }
  if (tag.startsWith('<w:tr')) {
    cerrarParrafo();
    lines.push('  <<FILA>>');
    continue;
  }
  if (tag.startsWith('<w:tc')) {
    cerrarParrafo();
    lines.push('    <<CELDA>>');
    continue;
  }
}
cerrarParrafo();

const salida = lines.join('\n') + '\n';
fs.writeFileSync(OUT, salida, 'utf8');

// --- Autocontroles -------------------------------------------------------
const textoPlano = lines.filter((l) => !l.startsWith('<') && !l.trim().startsWith('<<')).join('\n');
const chequeos = [
  ['párrafos emitidos', lines.filter((l) => !l.trim().startsWith('<<') && !l.startsWith('<</')).length],
  ['U+00A0 restantes (debe ser 0)', (salida.match(/\u00a0/g) || []).length],
  ['** restantes (debe ser 0)', (salida.match(/\*\*/g) || []).length],
  ['comillas curvas “ preservadas', (textoPlano.match(/\u201c/g) || []).length],
  ['comillas curvas ” preservadas', (textoPlano.match(/\u201d/g) || []).length],
  ['comillas rectas " preservadas', (textoPlano.match(/"/g) || []).length],
  ['errata "Vartiables" preservada', /Vartiables/.test(salida) ? 'sí' : 'NO'],
  ['errata "Si si," preservada', /Si si,/.test(salida) ? 'sí' : 'NO'],
  ['errata "cierra" preservada', (salida.match(/cierra/g) || []).length],
];
for (const [k, v] of chequeos) console.log(`  ${String(k).padEnd(36)} ${v}`);
