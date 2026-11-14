import { useRef, useState } from 'react';
import { leerSnapshotClimatico, parsearGeoJSON } from '../lib/data.js';

export function BoundaryImport({ onImport }) {
  const inputRef = useRef(null);
  const [features, setFeatures] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function readFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError('');
    setMessage('');
    try {
      const parsed = parsearGeoJSON(await file.text());
      setFeatures(parsed);
      setSelectedIndex(0);
      if (parsed.length === 1) {
        await onImport(parsed[0]);
        setFeatures([]);
        setMessage('Límite GeoJSON asignado al lote.');
      }
    } catch (reason) {
      setFeatures([]);
      setError(reason.message || 'No se pudo leer el límite.');
    }
  }

  async function assignFeature() {
    try {
      setError('');
      await onImport(features[selectedIndex]);
      setFeatures([]);
      setMessage('Límite GeoJSON asignado al lote.');
    } catch (reason) {
      setError(reason.message || 'No se pudo guardar el límite.');
    }
  }

  return (
    <div className="import-control">
      <input ref={inputRef} className="visually-hidden" type="file" accept=".geojson,.json,application/geo+json,application/json" onChange={readFile} />
      <button type="button" className="button button--secondary button--small" onClick={() => inputRef.current?.click()}>
        {features.length ? 'Elegir otro archivo' : 'Importar límite GeoJSON'}
      </button>
      {features.length > 1 && (
        <div className="feature-picker">
          <label>
            Elegí el polígono
            <select value={selectedIndex} onChange={(event) => setSelectedIndex(Number(event.target.value))}>
              {features.map((feature, index) => (
                <option key={`${feature.id}-${index}`} value={index}>
                  {feature.properties.name || feature.properties.nombre || `Geometría ${index + 1}`}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="button button--primary button--small" onClick={assignFeature}>Asignar al lote</button>
        </div>
      )}
      {message && <p className="form-success" role="status">{message}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <small>Se aceptan polígonos GeoJSON WGS84. La app no crea ni modifica geometrías.</small>
    </div>
  );
}

export function SnapshotImport({ onImport }) {
  const inputRef = useRef(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function readFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setMessage('');
    setError('');
    try {
      await onImport(leerSnapshotClimatico(await file.text()));
      setMessage(`Snapshot importado: ${file.name}`);
    } catch (reason) {
      setError(reason.message || 'No se pudo importar el snapshot.');
    }
  }

  return (
    <div className="import-control">
      <input ref={inputRef} className="visually-hidden" type="file" accept=".json,application/json" onChange={readFile} />
      <button type="button" className="button button--secondary button--small" onClick={() => inputRef.current?.click()}>
        Importar snapshot de clima
      </button>
      {message && <p className="form-success" role="status">{message}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <small>Usá un JSON generado por <code>npm run update:weather</code>. No se consulta una API desde el navegador.</small>
    </div>
  );
}
