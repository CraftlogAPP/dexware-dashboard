// CSV für Excel (deutsch): Semikolon, UTF-8 mit BOM, Zeilenende CRLF, Dezimalkomma.
// Zellen, die mit = + - @ beginnen, bekommen ein ' davor — sonst würde Excel sie als Formel ausführen.

export type Cell = string | number | null | undefined;

function cell(v: Cell): string {
  if (v === null || v === undefined) return '';
  let s = typeof v === 'number' ? v.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false }) : v;
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: Cell[][]): string {
  return '﻿' + [header, ...rows].map((r) => r.map(cell).join(';')).join('\r\n') + '\r\n';
}

/** Startet den Download im Browser. */
export function downloadCsv(fileName: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
