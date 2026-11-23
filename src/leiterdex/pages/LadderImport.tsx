import { UnitImportPage } from '../../pruefen/UnitImportPage';
import { LEITERDEX_IMPORT } from '../importUnits';

/** Leitern & Tritte aus einer Excel-/CSV-Liste übernehmen (…/standorte/import, nur Inhaber). */
export function LadderImport() {
  return <UnitImportPage def={LEITERDEX_IMPORT} />;
}
