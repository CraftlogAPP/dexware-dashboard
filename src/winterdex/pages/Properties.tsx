import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownUp, FileUp } from 'lucide-react';
import { useAppAuth } from '../../auth/AppAuthContext';
import {
  fetchOperationMeta,
  fetchProperties,
  type OpMeta,
} from '../api';
import { LoadGuard, StatusBadge, useAsync } from '../../components/ui';
import { fmtDateTime, todayLocalISO } from '../../lib/format';
import { ExcelButton } from '../../components/ExcelButton';
import { ExportNotice } from '../../lib/xlsx';
import { saveSheets } from '../exportActions';
import { propertySheets } from '../exportLists';
import { lastOpByProperty } from '../labels';
import { PropertyDialog } from '../dialogs';
import { Modal } from '../../components/form';
import { useOrg } from '../../components/OrgContext';
import { FREE_PROPERTIES, PRO_HOW, PRO_MAILTO, PRO_UNKLAR, ProUnklarError, orgProFuerGrenze } from '../pro';
import type { DutyTimes, Property } from '../types';
import { TourReihenfolge } from '../GratisHinweise';
import { aufGratisAenderung } from '../gratisLage';
import { hatTourSpalte } from '../tour';

interface Data {
  properties: Property[];
  lastByProp: Map<string, OpMeta>;
}

export function Properties() {
  const { client } = useAppAuth();
  // Objekte anlegen/ändern darf am Server nur der Inhaber (property_insert/update) — sonst kämen nur Fehlermeldungen.
  const owner = useOrg().data?.role === 'owner';
  const [editing, setEditing] = useState<Property | 'new' | null>(null);
  const [gate, setGate] = useState<false | 'grenze' | 'unklar'>(false);
  const [tour, setTour] = useState(false);

  const state = useAsync<Data>(async () => {
    const [properties, meta] = await Promise.all([
      fetchProperties(client),
      fetchOperationMeta(client),
    ]);
    return { properties, lastByProp: lastOpByProperty(meta) };
  }, [client]);
  // Nach „Objekte wählen“ (Gratis nach Ablauf von Pro) sind Objekte stillgelegt → Liste auffrischen
  useEffect(() => aufGratisAenderung(state.refresh), [state.refresh]);
  // „Reihenfolge ändern“ nur, wenn die Datenbank die Spalte schon kennt (sonst gar nicht anbieten) und es etwas zu sortieren gibt
  const props = state.data?.properties ?? [];
  const tourMoeglich = owner && hatTourSpalte(props) && props.filter((p) => p.active).length >= 2;

  const { data: org } = useOrg();
  /** Objektliste als Excel — frisch geladen, damit gerade Angelegtes dabei ist. */
  async function exportExcel() {
    if (!org) throw new Error('Betrieb nicht geladen.');
    const properties = await fetchProperties(client);
    if (properties.length === 0) throw new ExportNotice('Noch keine Objekte angelegt.');
    await saveSheets(`WinterDex_Objekte_${todayLocalISO()}`, 'WinterDex Objektliste', propertySheets(org.org, properties));
  }

  return (
    <>
      <div className="section-head">
        <h1 style={{ margin: 0 }}>Objekte</h1>
        <div className="spacer" />
        {/* Knöpfe zusammen rechts (sonst verteilt section-head sie über die Breite) */}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          {/* Objektliste für alle Rollen und gratis: die eigenen Daten gehören dem Betrieb */}
          <ExcelButton
            label="Objektliste"
            onExport={exportExcel}
            title="Alle Objekte als Excel-Datei — lässt sich unter „Objekte importieren“ wieder einlesen"
          />
          {tourMoeglich && (
            <button className="btn ghost" onClick={() => setTour(true)} title="Reihenfolge der Tour festlegen — gilt für das ganze Team">
              <ArrowDownUp className="i" aria-hidden /> Reihenfolge ändern
            </button>
          )}
          {owner && (
            <>
              <Link className="btn ghost" to="import" title="Objekte aus einer Excel- oder CSV-Liste übernehmen">
                <FileUp className="i" aria-hidden /> Objekte importieren
              </Link>
              <button
                className="btn"
                onClick={() => {
                  void (async () => {
                    // Gratis: 2 aktive Objekte (wie in der App); Pro laut Server. Unklar → letzter sicherer Stand,
                    // sonst Hinweis „gleich nochmal“ (nicht mehr „im Zweifel erlaubt“). Der Dialog prüft beim Speichern erneut.
                    const count = (state.data?.properties ?? []).filter((p) => p.active).length;
                    if (count >= FREE_PROPERTIES) {
                      const pro = await orgProFuerGrenze(client).catch((e) => (e instanceof ProUnklarError ? null : Promise.reject(e)));
                      if (pro === null) return setGate('unklar');
                      if (!pro) return setGate('grenze');
                    }
                    setEditing('new');
                  })();
                }}
              >
                ＋ Objekt anlegen
              </button>
            </>
          )}
        </div>
      </div>
      <p className="muted" style={{ marginTop: -6 }}>
        Alle Liegenschaften mit Pflichtzeiten und letztem Einsatz.
        {!owner && ' Objekte anlegen und ändern kann nur der Inhaber des Betriebs.'}
      </p>

      <LoadGuard state={state}>
        {({ properties, lastByProp }) =>
          properties.length === 0 ? (
            <div className="card empty">
              Noch keine Objekte angelegt.
              {owner && (
                <>
                  {' '}
                  Du hast eine Liste in Excel? <Link to="import">Objekte importieren</Link>
                </>
              )}
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Objekt</th>
                    <th>Adresse</th>
                    <th>Auftraggeber</th>
                    <th>Pflichtzeiten</th>
                    <th>Letzter Einsatz</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {properties.map((p) => {
                    const last = lastByProp.get(p.id);
                    return (
                      <tr key={p.id}>
                        <td>
                          <Link to={p.id}>{p.name}</Link>
                        </td>
                        <td className="wrap muted">{p.address}</td>
                        <td className="wrap muted">{p.customer_name ?? '—'}</td>
                        <td className="muted small">{dutyLabel(p.duty_times)}</td>
                        <td>{last ? fmtDateTime(last.started_at) : '—'}</td>
                        <td>
                          <StatusBadge active={p.active} />
                        </td>
                        <td>
                          {owner && (
                            <button className="btn ghost small" onClick={() => setEditing(p)}>
                              Bearbeiten
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        }
      </LoadGuard>

      {gate && (
        <Modal title={gate === 'unklar' ? 'Pro-Status wird geprüft' : 'Mehr Objekte mit Pro'} onClose={() => setGate(false)} dirty={false}>
          {gate === 'unklar' ? (
            <p>{PRO_UNKLAR}</p>
          ) : (
            <p>
              Im Gratis-Paket sind {FREE_PROPERTIES} aktive Objekte möglich — unbegrenzt viele gibt es mit Pro. {PRO_HOW}{' '}
              <a href={PRO_MAILTO}>E-Mail schreiben</a>
            </p>
          )}
          <div className="row" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
            <button type="button" className="btn" onClick={() => setGate(false)}>
              Verstanden
            </button>
          </div>
        </Modal>
      )}

      {tour && (
        <TourReihenfolge
          objekte={props}
          onClose={() => setTour(false)}
          onSaved={() => {
            setTour(false);
            state.reload();
          }}
        />
      )}

      {editing && (
        <PropertyDialog
          property={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            state.reload();
          }}
        />
      )}
    </>
  );
}

export function dutyLabel(d: DutyTimes | null | undefined): string {
  if (!d) return '—';
  const parts: string[] = [];
  if (d.mo_fr) parts.push(`Mo–Fr ${d.mo_fr}`);
  if (d.sa) parts.push(`Sa ${d.sa}`);
  if (d.so) parts.push(`So ${d.so}`);
  return parts.length ? parts.join(' · ') : '—';
}
