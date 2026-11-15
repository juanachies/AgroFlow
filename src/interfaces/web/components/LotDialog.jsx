import { lazy, Suspense, useState } from 'react';
import Modal from './Modal.jsx';
import { crearLote, editarLote } from '../lib/data.js';

const MapPicker = lazy(() => import('./MapPicker.jsx'));

function initialValues(lot, draft) {
  return {
    name: lot?.name ?? '',
    areaHa: lot?.areaHa ?? draft?.areaHa ?? '',
    latitude: lot?.latitude ?? draft?.latitude ?? '',
    longitude: lot?.longitude ?? draft?.longitude ?? '',
  };
}

export default function LotDialog({ lot = null, draft = null, onClose, onSave }) {
  const [values, setValues] = useState(() => initialValues(lot, draft));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const measured = Boolean(draft?.boundary);

  function update({ target: { name, value } }) {
    setValues((current) => ({ ...current, [name]: value }));
  }

  function pickPoint(latitude, longitude) {
    setValues((current) => ({ ...current, latitude: latitude.toFixed(6), longitude: longitude.toFixed(6) }));
  }

  async function submit(event) {
    event.preventDefault();
    setError('');
    setSaving(true);
    try {
      if (lot) {
        await onSave(editarLote(lot, values));
      } else {
        const created = crearLote(values);
        await onSave(draft?.boundary ? { ...created, boundary: draft.boundary } : created);
      }
      onClose();
    } catch (reason) {
      setError(reason.message || 'No se pudo guardar el lote.');
      setSaving(false);
    }
  }

  return (
    <Modal
      wide
      eyebrow={lot ? 'Editar terreno' : 'El lote es el terreno; el cultivo se siembra después'}
      title={lot ? `Editar ${lot.name}` : measured ? 'Crear lote desde el mapa' : 'Nuevo lote'}
      onClose={onClose}
      busy={saving}
    >
      <form className="field-form" onSubmit={submit}>
        <div className="form-grid">
          <label>
            Nombre del lote
            <input name="name" value={values.name} onChange={update} placeholder="Ej. La Esperanza · Norte" required maxLength={80} autoFocus />
          </label>
          <label>
            {measured ? 'Superficie medida (ha)' : 'Superficie (ha)'}
            <input name="areaHa" type="number" min="0.01" step="any" value={values.areaHa} onChange={update} placeholder="Ej. 48.5" required />
          </label>
        </div>
        <div className="field-form-group">
          <strong>Ubicación</strong>
          <small>Tocá el mapa donde está el lote: latitud y longitud se completan solas.</small>
          <Suspense fallback={<div className="map-picker compact-empty">Cargando mapa…</div>}>
            <MapPicker latitude={values.latitude} longitude={values.longitude} onPick={pickPoint} />
          </Suspense>
          <div className="form-grid">
            <label>
              Latitud
              <input name="latitude" type="number" min="-90" max="90" step="any" value={values.latitude} onChange={update} placeholder="-32.95" required />
            </label>
            <label>
              Longitud
              <input name="longitude" type="number" min="-180" max="180" step="any" value={values.longitude} onChange={update} placeholder="-60.64" required />
            </label>
          </div>
        </div>
        {error && <div className="form-error" role="alert">{error}</div>}
        <div className="dialog-actions">
          <button type="button" className="button button--secondary" onClick={onClose} disabled={saving}>Cancelar</button>
          <button type="submit" className="button button--primary" disabled={saving}>{saving ? 'Guardando…' : 'Guardar lote'}</button>
        </div>
      </form>
    </Modal>
  );
}
