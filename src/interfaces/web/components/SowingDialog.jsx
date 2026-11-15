import { useMemo, useState } from 'react';
import Modal from './Modal.jsx';
import { CULTIVOS, estimarCiclo, sembrarLote, variedadesDe, ventanaDelLote } from '../lib/data.js';

function describirEstimacion({ base, ajusteZona, ajusteFecha }) {
  const ajustes = [
    ajusteZona && `${ajusteZona > 0 ? '+' : '−'}${Math.abs(ajusteZona)} por la zona (latitud del lote)`,
    ajusteFecha && `${ajusteFecha > 0 ? '+' : '−'}${Math.abs(ajusteFecha)} por la fecha de siembra`,
  ].filter(Boolean);
  return ajustes.length ? `${base} días del ciclo elegido, ${ajustes.join(', ')}` : `${base} días del ciclo elegido`;
}

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
  const [cycleEdited, setCycleEdited] = useState(Boolean(lot.cycleDays));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const varieties = variedadesDe(values.crop);

  const estimate = useMemo(
    () => estimarCiclo({ crop: values.crop, variety: values.variety, latitude: lot.latitude, sowingDate: values.sowingDate }),
    [values.crop, values.variety, values.sowingDate, lot.latitude],
  );
  const finalValues = { ...values, cycleDays: cycleEdited ? values.cycleDays : String(estimate?.dias ?? '') };

  function update({ target: { name, value } }) {
    if (name === 'cycleDays') setCycleEdited(true);
    setValues((current) => (name === 'crop'
      ? { ...current, crop: value, variety: '' }
      : { ...current, [name]: value }));
  }

  const preview = useMemo(() => {
    try {
      return ventanaDelLote(sembrarLote(lot, finalValues));
    } catch {
      return null;
    }
  }, [lot, finalValues.crop, finalValues.variety, finalValues.sowingDate, finalValues.cycleDays]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(event) {
    event.preventDefault();
    setError('');
    setSaving(true);
    try {
      await onSave(sembrarLote(lot, finalValues));
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
          <input name="cycleDays" type="number" min="1" step="1" value={finalValues.cycleDays} onChange={update} required />
          {estimate ? (
            <small>
              Estimado: {describirEstimacion(estimate)}. Es una aproximación: corregila con los datos de tu semilla.
              {cycleEdited && <> <button type="button" className="text-button" onClick={() => setCycleEdited(false)}>Volver a la estimación ({estimate.dias} días)</button></>}
            </small>
          ) : <small>Elegí el tipo de ciclo para estimar los días hasta la cosecha.</small>}
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
