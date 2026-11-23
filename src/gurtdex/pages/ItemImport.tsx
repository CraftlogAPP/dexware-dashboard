import { UnitImportPage } from '../../pruefen/UnitImportPage';
import { GURTDEX_IMPORT } from '../importUnits';

/** PSA-Artikel aus einer Excel-/CSV-Liste übernehmen (…/standorte/import, nur Inhaber). */
export function ItemImport() {
  return <UnitImportPage def={GURTDEX_IMPORT} />;
}
