import { UnitImportPage } from '../../pruefen/UnitImportPage';
import { REGALDEX_IMPORT } from '../importUnits';

/** Lager und ihre Regalzeilen aus einer Excel-/CSV-Liste übernehmen (…/lager/import, nur Inhaber). */
export function WarehouseImport() {
  return <UnitImportPage def={REGALDEX_IMPORT} />;
}
