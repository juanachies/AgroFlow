import { useState } from 'react';
import { crearLote, CULTIVOS } from '../lib/data.js';

export default function FieldDialog({ onClose, onCreate }) {
  const [values, setValues] = useState({
    name: '',
    crop: CULTIVOS[0].value,
    areaHa: '',
    latitude: '',
    longitude: '',
    sowingDate: '',
    cycleDays: String(CULTIVOS[0].cycleDays),
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function update(event) {
    const { name, value } = event.target;
    setValues((current) => {
      if (name === 'crop') {
        return {
          ...current,
          crop: value,
          cycleDays: String(CULTIVOS.find((crop) => crop.value === value)?.cycleDays ?? ''),
        };
      }
      return { ...current, [name]: value };
    });
  }

  async function submit(event) {
    event.preventDefault();
    setError('');
    try {
      setSaving(true);
      await onCreate(crearLote(values));
      onClose();
    } catch (reason) {
      setError(reason.message || 'No se pudo guardar el lote.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="dialog-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !saving) onClose();
    }}>
      <section className="dialog-card" role="dialog" aria-modal="true" aria-labelledby="field-dialog-title">
        <div className="dialog-heading">
          <div>
            <span className="eyebrow">Tu información queda en este navegador</span>
            <h2 id="field-dialog-title">Agregar un lote</h2>
          </div>
          <button type="button" className="icon-button" aria-label="Cerrar" onClick={onClose}>×</button>
        </div>
        <form className="field-form" onSubmit={submit}>
          <label>
            Nombre del lote
            <input name="name" value={values.name} onChange={update} placeholder="Ej. La Esperanza · Norte" required maxLength={80} autoFocus />
          </label>
          <div className="form-grid">
            <label>
              Cultivo
              <select name="crop" value={values.crop} onChange={update}>
                {CULTIVOS.map((crop) => <option key={crop.value} value={crop.value}>{crop.label}</option>)}
              </select>
            </label>
            <label>
              Superficie declarada (ha)
              <input name="areaHa" type="number" min="0.01" step="any" value={values.areaHa} onChange={update} placeholder="Ej. 48.5" required />
            </label>
          </div>
          <label>
            Fecha de siembra
            <input name="sowingDate" type="date" value={values.sowingDate} onChange={update} required />
          </label>
          <div className="form-grid">
            <label>
              Latitud del punto de referencia
              <input name="latitude" type="number" min="-90" max="90" step="any" value={values.latitude} onChange={update} placeholder="-32.95" required />
            </label>
            <label>
              Longitud del punto de referencia
              <input name="longitude" type="number" min="-180" max="180" step="any" value={values.longitude} onChange={update} placeholder="-60.64" required />
            </label>
          </div>
          <label>
            Ciclo estimado (días)
            <input name="cycleDays" type="number" min="1" step="1" value={values.cycleDays} onChange={update} required />
            <small>Valor inicial orientativo por cultivo; ajustalo según el híbrido o variedad.</small>
          </label>
          <p className="inline-note">La superficie se ingresa manualmente y no se calcula desde el polígono. El punto sirve para consultas regionales; importá el límite GeoJSON luego.</p>
          {error && <div className="form-error" role="alert">{error}</div>}
          <div className="dialog-actions">
            <button type="button" className="button button--secondary" onClick={onClose} disabled={saving}>Cancelar</button>
            <button type="submit" className="button button--primary" disabled={saving}>{saving ? 'Guardando…' : 'Guardar lote'}</button>
          </div>
        </form>
      </section>
    </div>
  );
}
