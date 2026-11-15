import { useMemo, useState } from 'react';
import Modal from './Modal.jsx';
import { CULTIVOS, sembrarLote, variedadesDe, ventanaDelLote } from '../lib/data.js';

function formatDate(value) {
  return new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${value}T12:00:00Z`));
}

export default function SowingDialog({ lot, onClose, onSave }) {
  const [values, setValues] = useState({
    crop: lot.crop ?? CULTIVOS[0].value,
    variety: lot.variety ?? '',
    sowingDate: lot.sowingDate ?? '',
    cycleDays: lot.cycleDays ? String(lot.cycleDays) : '',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const varieties = variedadesDe(values.crop);

  function update({ target: { name, value } }) {
    setValues((current) => {
      if (name === 'crop') return { ...current, crop: value, variety: '', cycleDays: '' };
      if (name === 'variety') {
        const picked = variedadesDe(current.crop).find((item) => item.value === value);
        return { ...current, variety: value, cycleDays: picked ? String(picked.cycleDays) : '' };
      }
      return { ...current, [name]: value };
    });
  }

  const preview = useMemo(() => {
    try {
      return ventanaDelLote(sembrarLote(lot, values));
    } catch {
      return null;
    }
  }, [lot, values]);

  async function submit(event) {
    event.preventDefault();
    setError('');
    setSaving(true);
    try {
      await onSave(sembrarLote(lot, values));
      onClose();
    } catch (reason) {
      setError(reason.message || 'No se pudo guardar la siembra.');
      setSaving(false);
    }
  }

  return (
    <Modal eyebrow={lot.name} title={lot.crop ? 'Cambiar cultivo sembrado' : 'Sembrar un cultivo'} onClose={onClose} busy={saving}>
      <form className="field-form" onSubmit={submit}>
        <div className="form-grid">
          <label>
            Cultivo
            <select name="crop" value={values.crop} onChange={update}>
              {CULTIVOS.map((crop) => <option key={crop.value} value={crop.value}>{crop.label}</option>)}
            </select>
          </label>
          <label>
            Tipo de ciclo
            <select name="variety" value={values.variety} onChange={update} required>
              <option value="" disabled>Elegí el ciclo…</option>
              {varieties.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
        </div>
        <label>
          Fecha de siembra
          <input name="sowingDate" type="date" value={values.sowingDate} onChange={update} required />
          <small>Escribila o abrí el calendario con el ícono del campo.</small>
        </label>
        <label>
          Ciclo estimado (días)
          <input name="cycleDays" type="number" min="1" step="1" value={values.cycleDays} onChange={update} required />
          <small>Valor orientativo según el tipo de ciclo; ajustalo según el cultivar y la zona.</small>
        </label>
        {preview && <p className="inline-note">Cosecha estimada: {formatDate(preview.inicio)} a {formatDate(preview.fin)} (centro {formatDate(preview.optimo)}).</p>}
        {error && <div className="form-error" role="alert">{error}</div>}
        <div className="dialog-actions">
          <button type="button" className="button button--secondary" onClick={onClose} disabled={saving}>Cancelar</button>
          <button type="submit" className="button button--primary" disabled={saving}>{saving ? 'Guardando…' : 'Guardar siembra'}</button>
        </div>
      </form>
    </Modal>
  );
}
