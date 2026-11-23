import { UnitImportPage } from '../../pruefen/UnitImportPage';
import { HEBEDEX_IMPORT } from '../importUnits';

/** Anschlag-, Lastaufnahme- und Zurrmittel aus einer Excel-/CSV-Liste übernehmen (…/standorte/import, nur Inhaber). */
export function ItemImport() {
  return <UnitImportPage def={HEBEDEX_IMPORT} />;
}
