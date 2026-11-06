// QR-Code als SVG für den Browser-Druck (Bezahl-QR „GiroCode“/EPC auf der Rechnung) — wie App lib/qr.ts qrSvg:
// Fehlerkorrektur M, ohne Rand. Inhalt = epcPayload() aus invoice.ts (wortgleich zur App).
// qrcode-generator (ohne Abhängigkeiten) wandelt Text nur zeichenweise in Latin-1 um — Umlaute im Firmennamen gingen
// kaputt. Darum bekommt sie die UTF-8-Bytes als „Byte-Zeichenkette“ (je Zeichen ein Byte); EPC Zeichensatz 1 = UTF-8.

import qrcode from 'qrcode-generator';

/** QR-Matrix (für Tests): true = dunkel */
export function qrMatrix(value: string): boolean[][] {
  const qr = make(value);
  const n = qr.getModuleCount();
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c)));
}

/** SVG ohne Rand, skalierbar (Größe setzt das CSS). Leer bei Fehler. */
export function qrSvg(value: string): string {
  try {
    return make(value).createSvgTag({ cellSize: 4, margin: 0, scalable: true });
  } catch {
    return '';
  }
}

function make(value: string) {
  let bin = '';
  for (const b of new TextEncoder().encode(value)) bin += String.fromCharCode(b);
  const qr = qrcode(0, 'M');
  qr.addData(bin, 'Byte');
  qr.make();
  return qr;
}
