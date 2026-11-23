import { UnitImportPage } from '../../pruefen/UnitImportPage';
import { SPIELDEX_IMPORT } from '../importUnits';

/** Spielplätze und ihre Spielgeräte aus einer Excel-/CSV-Liste übernehmen (…/spielplaetze/import, nur Inhaber). */
export function PlaygroundImport() {
  return <UnitImportPage def={SPIELDEX_IMPORT} />;
}
