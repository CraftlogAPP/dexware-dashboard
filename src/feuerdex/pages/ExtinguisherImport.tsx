import { UnitImportPage } from '../../pruefen/UnitImportPage';
import { FEUERDEX_IMPORT } from '../importUnits';

/** Feuerlöscher aus einer Excel-/CSV-Liste übernehmen (…/standorte/import, nur Inhaber). */
export function ExtinguisherImport() {
  return <UnitImportPage def={FEUERDEX_IMPORT} />;
}
