import type { Device } from '../types';

/** Unterzeile eines Geräts: Typ, Hersteller, Schutzklasse, Geräte-ID. */
export function deviceInfo(d: Device): string {
  return [d.device_type, d.manufacturer, d.protection_class ? `SK ${d.protection_class}` : 'Schutzklasse fehlt', d.qr_code]
    .filter(Boolean)
    .join(' · ');
}
