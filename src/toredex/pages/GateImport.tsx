import { UnitImportPage } from '../../pruefen/UnitImportPage';
import { TOREDEX_IMPORT } from '../importUnits';

/** Tore und Türen aus einer Excel-/CSV-Liste übernehmen (…/objekte/import, nur Inhaber). */
export function GateImport() {
  return <UnitImportPage def={TOREDEX_IMPORT} />;
}
