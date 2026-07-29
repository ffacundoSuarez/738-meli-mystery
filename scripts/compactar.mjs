/**
 * Vista compacta de fiel.txt: colapsa TABLA/FILA/CELDA en una línea por fila,
 * separando celdas con " ⟨|⟩ " (secuencia que no existe en el documento).
 * El texto de cada celda queda EXACTO — sirve para transcribir.
 */
import fs from 'node:fs';

const [inPath, outPath] = process.argv.slice(2);
const lines = fs.readFileSync(inPath, 'utf8').split('\n');

const out = [];
let fila = null;
let celda = null;

const meta = (l) => {
  const m = l.match(/^(.*)\t«([^»]*)»$/);
  return m ? { texto: m[1], meta: m[2] } : { texto: l, meta: '' };
};

function cerrarCelda() {
  if (celda === null) return;
  fila.push(celda.join(' ⏎ '));
  celda = null;
}
function cerrarFila() {
  cerrarCelda();
  if (fila === null) return;
  out.push('    ' + fila.join(' ⟨|⟩ '));
  fila = null;
}

for (const raw of lines) {
  const l = raw.replace(/\r$/, '');
  const t = l.trim();
  if (t === '<<TABLA>>') { cerrarFila(); out.push('  ┌─ tabla'); continue; }
  if (t === '<</TABLA>>') { cerrarFila(); out.push('  └─'); continue; }
  if (t === '<<FILA>>') { cerrarFila(); fila = []; continue; }
  if (t === '<<CELDA>>') { cerrarCelda(); celda = []; continue; }
  if (l === '') continue;

  const { texto, meta: mt } = meta(l);
  const marca = mt ? ` «${mt}»` : '';
  if (celda !== null) celda.push(texto + marca);
  else { cerrarFila(); out.push(texto + marca); }
}
cerrarFila();

fs.writeFileSync(outPath, out.join('\n') + '\n', 'utf8');
console.log(`${out.length} líneas`);
