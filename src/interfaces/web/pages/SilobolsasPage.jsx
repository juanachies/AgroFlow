import { useEffect, useState } from 'react';
import { Package, Plus, RefreshCw } from 'lucide-react';
import Modal from '../components/Modal.jsx';
import { ApiError, api } from '../lib/api.js';

const CULTIVOS = [
  { id: 'soja', label: 'Soja' },
  { id: 'maiz', label: 'Maíz' },
  { id: 'trigo', label: 'Trigo' },
  { id: 'girasol', label: 'Girasol' },
];

const DECISIONES = {
  embarcar: 'Embarcar',
  vender_acopio: 'Vender en acopio',
  vender_acopio_urgente: 'Venta urgente en acopio',
  sin_barco_factible: 'Sin barco factible',
};

const fmt = (value, digits = 0) => new Intl.NumberFormat('es-AR', { maximumFractionDigits: digits }).format(value);
const hoyISO = () => new Date().toISOString().slice(0, 10);
const nombreCultivo = (id) => CULTIVOS.find((c) => c.id === id)?.label ?? id;
const mensaje = (reason) => (reason instanceof ApiError ? reason.message : reason.message);

function dias(value) {
  if (value == null) return 'sin plazo';
  return `${fmt(value)} días`;
}

function textoRiesgo(riesgo) {
  return `Nivel ${riesgo.nivel}. Días hasta medio: ${dias(riesgo.diasHastaMedio)}. Días hasta crítico: ${dias(riesgo.diasHastaCritico)}.`;
}

function textoDecision(resultado) {
  const titulo = DECISIONES[resultado.decision] ?? resultado.decision;
  const elegido = resultado.elegido;
  const partes = [titulo];
  if (resultado.riesgo) partes.push(`riesgo ${resultado.riesgo}`);
  if (elegido?.barcoId) partes.push(`barco ${elegido.barcoId}`);
  if (elegido?.acopio) partes.push(`acopio ${elegido.acopio}`);
  if (elegido?.fechaCarga) partes.push(`carga ${elegido.fechaCarga}`);
  if (elegido?.camiones) partes.push(`${fmt(elegido.camiones.cantidad)} ${elegido.camiones.tipo}`);
  if (elegido?.extractora) partes.push(`extractora ${elegido.extractora.desde} a ${elegido.extractora.hasta}`);
  if (elegido?.netoUsd != null) partes.push(`neto US$ ${fmt(elegido.netoUsd)}`);
  if (resultado.recomendacion) partes.push(resultado.recomendacion);
  return partes.join(' · ');
}

function useFormulario(inicial) {
  const [valores, setValores] = useState(inicial);
  const cambiar = ({ target: { name, value } }) => setValores((actual) => ({ ...actual, [name]: value }));
  return [valores, cambiar, setValores];
}

function NuevaSilobolsaDialog({ lots, onClose, onCreated }) {
  const [alta, cambiar, setAlta] = useFormulario({ cultivo: 'soja', kg: '', fechaCreacion: hoyISO(), loteId: '' });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  async function registrar(event) {
    event.preventDefault();
    setGuardando(true);
    setError('');
    try {
      const datos = { cultivo: alta.cultivo, kg: Number(alta.kg), fechaCreacion: alta.fechaCreacion };
      if (alta.loteId) datos.loteId = alta.loteId;
      const { silobolsa } = await api.registrarSilobolsa(datos);
      onCreated(silobolsa);
      onClose();
    } catch (reason) {
      setError(mensaje(reason));
      setGuardando(false);
    }
  }

  return (
    <Modal eyebrow="Silobolsas" title="Nueva silobolsa" onClose={onClose} busy={guardando}>
      <form className="field-form" onSubmit={registrar}>
        <fieldset className="choice-group">
          <legend>Cultivo embolsado</legend>
          <div className="choice-row">
            {CULTIVOS.map((c) => (
              <label key={c.id} className={`choice-chip${alta.cultivo === c.id ? ' is-selected' : ''}`}>
                <input type="radio" name="cultivo" value={c.id} checked={alta.cultivo === c.id} onChange={() => setAlta((actual) => ({ ...actual, cultivo: c.id }))} />
                {c.label}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="form-grid">
          <label>Kilos embolsados<input name="kg" type="number" min="1" step="1" value={alta.kg} onChange={cambiar} placeholder="Ej. 200000" required autoFocus /></label>
          <label>Fecha de embolsado<input name="fechaCreacion" type="date" value={alta.fechaCreacion} onChange={cambiar} required /></label>
        </div>
        <label>Lote de origen
          <select name="loteId" value={alta.loteId} onChange={cambiar}>
            <option value="">Sin lote asociado</option>
            {lots.map((lot) => <option key={lot.id} value={lot.id}>{lot.name}</option>)}
          </select>
        </label>
        {error && <div className="form-error" role="alert">{error}</div>}
        <div className="dialog-actions">
          <button type="button" className="button button--secondary" onClick={onClose} disabled={guardando}>Cancelar</button>
          <button type="submit" className="button button--primary" disabled={guardando}>{guardando ? 'Registrando…' : 'Guardar silobolsa'}</button>
        </div>
      </form>
    </Modal>
  );
}

function LecturaDialog({ bolsa, onClose }) {
  const [lectura, cambiar] = useFormulario({ humedad: '', temperatura: '', co2: '' });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  async function enviar(event) {
    event.preventDefault();
    setGuardando(true);
    setError('');
    try {
      await api.cargarLecturas(bolsa.id, [{
        timestamp: new Date().toISOString(),
        humedad: Number(lectura.humedad),
        temperatura: Number(lectura.temperatura),
        co2: Number(lectura.co2),
      }]);
      onClose(true);
    } catch (reason) {
      setError(mensaje(reason));
      setGuardando(false);
    }
  }

  return (
    <Modal eyebrow={bolsa.id} title="Cargar lectura del sensor" onClose={() => onClose(false)} busy={guardando}>
      <form className="field-form" onSubmit={enviar}>
        <div className="form-grid form-grid--3">
          <label>Humedad (%)<input name="humedad" type="number" step="any" value={lectura.humedad} onChange={cambiar} required autoFocus /></label>
          <label>Temperatura (°C)<input name="temperatura" type="number" step="any" value={lectura.temperatura} onChange={cambiar} required /></label>
          <label>CO₂ (%)<input name="co2" type="number" step="any" value={lectura.co2} onChange={cambiar} required /></label>
        </div>
        {error && <div className="form-error" role="alert">{error}</div>}
        <div className="dialog-actions">
          <button type="button" className="button button--secondary" onClick={() => onClose(false)} disabled={guardando}>Cancelar</button>
          <button type="submit" className="button button--primary" disabled={guardando}>{guardando ? 'Cargando…' : 'Guardar lectura'}</button>
        </div>
      </form>
    </Modal>
  );
}

function VentaDialog({ bolsa, onClose }) {
  const [venta, cambiar] = useFormulario({ terminal: 'Puerto Gran Rosario', distanciaKm: 300 });
  const [vendiendo, setVendiendo] = useState(false);
  const [error, setError] = useState('');
  const [decision, setDecision] = useState('');

  async function vender(event) {
    event.preventDefault();
    setVendiendo(true);
    setError('');
    setDecision('');
    try {
      const resultado = await api.venderSilobolsa(bolsa.id, {
        hoy: hoyISO(),
        destino: { terminal: venta.terminal.trim(), distanciaKm: Number(venta.distanciaKm) },
        tasaAnual: 0.08,
      });
      setDecision(textoDecision(resultado));
    } catch (reason) {
      setError(mensaje(reason));
    } finally {
      setVendiendo(false);
    }
  }

  return (
    <Modal eyebrow={bolsa.id} title="Decisión de venta" onClose={onClose} busy={vendiendo}>
      <form className="field-form" onSubmit={vender}>
        <div className="form-grid">
          <label>Terminal<input name="terminal" value={venta.terminal} onChange={cambiar} required autoFocus /></label>
          <label>Distancia (km)<input name="distanciaKm" type="number" min="1" step="any" value={venta.distanciaKm} onChange={cambiar} required /></label>
        </div>
        {error && <div className="form-error" role="alert">{error}</div>}
        {decision && <p className="result-note">{decision}</p>}
        <div className="dialog-actions">
          <button type="button" className="button button--secondary" onClick={onClose} disabled={vendiendo}>Cerrar</button>
          <button type="submit" className="button button--primary" disabled={vendiendo}>{vendiendo ? 'Calculando…' : 'Calcular venta'}</button>
        </div>
      </form>
    </Modal>
  );
}

export default function SilobolsasPage({ lots = [] }) {
  const [bolsas, setBolsas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creando, setCreando] = useState(false);

  async function cargar() {
    setLoading(true);
    setError('');
    try {
      const { silobolsas } = await api.silobolsas();
      setBolsas(silobolsas);
    } catch (reason) {
      setError(mensaje(reason));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { cargar(); }, []);

  return (
    <>
      <div className="page-intro">
        <div>
          <span className="eyebrow">GESTIONAR SILOBOLSAS</span>
          <h2>Riesgo y venta de cada bolsa</h2>
          <p>Registrá cada bolsa, cargá lecturas del sensor y consultá el riesgo o la decisión de venta.</p>
        </div>
        <button type="button" className="button button--primary button--small" onClick={() => setCreando(true)}><Plus size={15} /> Nueva silobolsa</button>
      </div>

      {error ? (
        <div className="empty-state empty-state--api">
          <span className="empty-state-icon"><RefreshCw size={22} /></span>
          <h3>La API de AgroFlow no responde</h3>
          <p>{error}</p>
          <button type="button" className="button button--secondary button--small" onClick={cargar}><RefreshCw size={14} /> Reintentar</button>
        </div>
      ) : loading ? (
        <div className="loading-state" role="status">Cargando silobolsas…</div>
      ) : bolsas.length === 0 ? (
        <div className="empty-state">
          <span className="empty-state-icon"><Package size={22} /></span>
          <h3>Todavía no hay silobolsas</h3>
          <p>Registrá la primera con el botón “Nueva silobolsa”.</p>
          <button type="button" className="button button--primary button--small" onClick={() => setCreando(true)}><Plus size={15} /> Nueva silobolsa</button>
        </div>
      ) : (
        <div className="lot-list">
          {bolsas.map((bolsa) => <SilobolsaCard key={bolsa.id} bolsa={bolsa} lote={lots.find((lot) => lot.id === bolsa.loteId)} />)}
        </div>
      )}

      {creando && <NuevaSilobolsaDialog lots={lots} onClose={() => setCreando(false)} onCreated={(silobolsa) => setBolsas((actual) => [...actual, silobolsa])} />}
    </>
  );
}

function SilobolsaCard({ bolsa, lote }) {
  const [dialogo, setDialogo] = useState(null);
  const [consultandoRiesgo, setConsultandoRiesgo] = useState(false);
  const [errorRiesgo, setErrorRiesgo] = useState('');
  const [aviso, setAviso] = useState('');
  const [riesgo, setRiesgo] = useState('');

  async function verRiesgo() {
    setConsultandoRiesgo(true);
    setErrorRiesgo('');
    setRiesgo('');
    try {
      const { riesgo: calculado } = await api.riesgoSilobolsa(bolsa.id);
      setRiesgo(textoRiesgo(calculado));
    } catch (reason) {
      setErrorRiesgo(mensaje(reason));
    } finally {
      setConsultandoRiesgo(false);
    }
  }

  function cerrarLectura(cargada) {
    setDialogo(null);
    if (cargada) setAviso('Lectura cargada.');
  }

  return (
    <article className="panel">
      <div className="section-heading">
        <div>
          <h3>{bolsa.id}</h3>
          <p>{nombreCultivo(bolsa.cultivo)} · {fmt(bolsa.kg)} kg · {bolsa.fechaCreacion}{lote ? ` · ${lote.name}` : ''}</p>
        </div>
      </div>
      <div className="action-row">
        <button type="button" className="button button--secondary button--small" onClick={() => { setAviso(''); setDialogo('lectura'); }}>Cargar lectura</button>
        <button type="button" className="button button--secondary button--small" onClick={verRiesgo} disabled={consultandoRiesgo}>{consultandoRiesgo ? 'Consultando…' : 'Ver riesgo'}</button>
        <button type="button" className="button button--primary button--small" onClick={() => setDialogo('venta')}>Calcular venta</button>
      </div>
      {aviso && <p className="result-note">{aviso}</p>}
      {errorRiesgo && <div className="form-error" role="alert">{errorRiesgo}</div>}
      {riesgo && <p className="result-note">{riesgo}</p>}
      {dialogo === 'lectura' && <LecturaDialog bolsa={bolsa} onClose={cerrarLectura} />}
      {dialogo === 'venta' && <VentaDialog bolsa={bolsa} onClose={() => setDialogo(null)} />}
    </article>
  );
}
