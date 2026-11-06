// Wortgleiche Kopie von InstallateurDex/mobile/src/lib/region.ts — Änderungen IMMER in beiden Repos.
// Kürzel = Schlüssel in docs/recht/recht-at.json bzw. recht-de.json (dort „regions“).
type Land = 'DE' | 'AT' | 'CH';

export const AT_REGIONS: Record<string, string> = {
  bgld: 'Burgenland',
  ktn: 'Kärnten',
  noe: 'Niederösterreich',
  ooe: 'Oberösterreich',
  sbg: 'Salzburg',
  stmk: 'Steiermark',
  tirol: 'Tirol',
  vbg: 'Vorarlberg',
  wien: 'Wien',
};

export const DE_REGIONS: Record<string, string> = {
  BW: 'Baden-Württemberg',
  BY: 'Bayern',
  BE: 'Berlin',
  BB: 'Brandenburg',
  HB: 'Bremen',
  HH: 'Hamburg',
  HE: 'Hessen',
  MV: 'Mecklenburg-Vorpommern',
  NI: 'Niedersachsen',
  NW: 'Nordrhein-Westfalen',
  RP: 'Rheinland-Pfalz',
  SL: 'Saarland',
  SN: 'Sachsen',
  ST: 'Sachsen-Anhalt',
  SH: 'Schleswig-Holstein',
  TH: 'Thüringen',
};

export function regionsOf(land: Land): Record<string, string> {
  return land === 'AT' ? AT_REGIONS : land === 'DE' ? DE_REGIONS : {};
}

/** Gehört das Kürzel zum Land? (Nach einem Länderwechsel ist das alte Bundesland ungültig.) */
export function isRegionOf(land: Land, region: string | undefined | null): region is string {
  return !!region && Object.prototype.hasOwnProperty.call(regionsOf(land), region);
}

export function regionLabel(land: Land, region: string | undefined | null): string {
  return isRegionOf(land, region) ? regionsOf(land)[region] : '';
}

/**
 * Vorschlag aus der österreichischen PLZ (nur ein Vorschlag — an den Landesgrenzen gibt es
 * Ausnahmen, z. B. 2xxx teils Burgenland, 99xx Osttirol). Deutschland: kein Vorschlag, die
 * Leitzonen laufen quer über die Ländergrenzen.
 */
export function regionFromZip(land: Land, zip: string | undefined | null): string | null {
  const z = String(zip ?? '').replace(/\D/g, '');
  if (land !== 'AT' || z.length !== 4) return null;
  const n = Number(z);
  if (n >= 1010 && n <= 1239) return 'wien';
  if (n >= 9900) return 'tirol'; // Osttirol
  if (n >= 6700 && n <= 6999) return 'vbg';
  switch (z[0]) {
    case '1':
    case '2':
    case '3':
      return 'noe';
    case '4':
      return 'ooe';
    case '5':
      return 'sbg';
    case '6':
      return 'tirol';
    case '7':
      return 'bgld';
    case '8':
      return 'stmk';
    case '9':
      return 'ktn';
  }
  return null;
}
