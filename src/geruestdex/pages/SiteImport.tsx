import { UnitImportPage } from '../../pruefen/UnitImportPage';
import { GERUESTDEX_IMPORT } from '../importUnits';

/** Baustellen und ihre Gerüste aus einer Excel-/CSV-Liste übernehmen (…/baustellen/import, nur Inhaber). */
export function SiteImport() {
  return <UnitImportPage def={GERUESTDEX_IMPORT} />;
}
