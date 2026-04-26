import { readFileSync } from 'fs';
const src = readFileSync('node_modules/@spz-loader/core/dist/index.js', 'utf8');
// Find the WASM template literal
const wasmIdx = src.indexOf('\\0asm');
console.log('\\0asm at index:', wasmIdx);
if (wasmIdx > 0) {
  const before = src.substring(wasmIdx - 200, wasmIdx + 50);
  console.log('Context:', JSON.stringify(before));
}
// Count how many template literals contain \0
let count = 0;
let pos = 0;
while (pos < src.length) {
  const bt = src.indexOf('`', pos);
  if (bt < 0) break;
  const end = src.indexOf('`', bt + 1);
  if (end < 0) break;
  const tmpl = src.substring(bt, end + 1);
  if (tmpl.includes('\\0') || tmpl.includes('\\x')) count++;
  pos = end + 1;
}
console.log('Template literals with escape sequences:', count);
