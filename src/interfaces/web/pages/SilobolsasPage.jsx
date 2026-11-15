import { useEffect, useState } from 'react';
import { Package, Plus, RefreshCw } from 'lucide-react';
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

export default function SilobolsasPage({ lots = [] }) {
  const [bolsas, setBolsas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [alta, setAlta] = useState({ cultivo: 'soja', kg: '', fechaCreacion: hoyISO(), loteId: '' });
  const [guardando, setGuardando] = useState(false);
  const [errorAlta, setErrorAlta] = useState('');

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

  function cambiarAlta({ target: { name, value } }) {
    setAlta((actual) => ({ ...actual, [name]: value }));
  }

  async function registrar(event) {
    event.preventDefault();
    setGuardando(true);
    setErrorAlta('');
    try {
      const datos = { cultivo: alta.cultivo, kg: Number(alta.kg), fechaCreacion: alta.fechaCreacion };
      if (alta.loteId) datos.loteId = alta.loteId;
      const { silobolsa } = await api.registrarSilobolsa(datos);
      setBolsas((actual) => [...actual, silobolsa]);
      setAlta((actual) => ({ ...actual, kg: '' }));
    } catch (reason) {
      setErrorAlta(mensaje(reason));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <>
      <div className="page-intro">
        <div>
          <span className="eyebrow">SILOBOLSAS</span>
          <h2>Riesgo y venta de cada bolsa</h2>
          <p>Registrá la bolsa, cargá lecturas del sensor y consultá el riesgo o la decisión de venta.</p>
        </div>
      </div>

      <section className="panel">
        <div className="section-heading"><div><h3>Registrar silobolsa</h3></div></div>
        <form className="field-form" onSubmit={registrar}>
          <div className="form-grid">
            <label>Cultivo
              <select name="cultivo" value={alta.cultivo} onChange={cambiarAlta}>
                {CULTIVOS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </label>
            <label>Kg<input name="kg" type="number" min="1" step="1" value={alta.kg} onChange={cambiarAlta} required /></label>
            <label>Fecha de creación<input name="fechaCreacion" type="date" value={alta.fechaCreacion} onChange={cambiarAlta} required /></label>
            <label>Lote
              <select name="loteId" value={alta.loteId} onChange={cambiarAlta}>
                <option value="">Sin lote</option>
                {lots.map((lot) => <option key={lot.id} value={lot.id}>{lot.name}</option>)}
              </select>
            </label>
          </div>
          {errorAlta && <div className="form-error" role="alert">{errorAlta}</div>}
          <div>
            <button type="submit" className="button button--primary" disabled={guardando}><Plus size={16} /> {guardando ? 'Registrando…' : 'Registrar'}</button>
          </div>
        </form>
      </section>

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
          <p>Registrá la primera con el formulario de arriba.</p>
        </div>
      ) : (
        <div className="lot-list">
          {bolsas.map((bolsa) => <SilobolsaCard key={bolsa.id} bolsa={bolsa} lote={lots.find((lot) => lot.id === bolsa.loteId)} />)}
        </div>
      )}
    </>
  );
}

function SilobolsaCard({ bolsa, lote }) {
  const [lectura, setLectura] = useState({ humedad: '', temperatura: '', co2: '' });
  const [venta, setVenta] = useState({ terminal: 'Puerto Gran Rosario', distanciaKm: 300 });
  const [guardandoLectura, setGuardandoLectura] = useState(false);
  const [consultandoRiesgo, setConsultandoRiesgo] = useState(false);
  const [vendiendo, setVendiendo] = useState(false);
  const [errorLectura, setErrorLectura] = useState('');
  const [errorRiesgo, setErrorRiesgo] = useState('');
  const [errorVenta, setErrorVenta] = useState('');
  const [avisoLectura, setAvisoLectura] = useState('');
  const [riesgo, setRiesgo] = useState('');
  const [decision, setDecision] = useState('');

  function cambiarLectura({ target: { name, value } }) {
    setLectura((actual) => ({ ...actual, [name]: value }));
  }

  function cambiarVenta({ target: { name, value } }) {
    setVenta((actual) => ({ ...actual, [name]: value }));
  }

  async function enviarLectura(event) {
    event.preventDefault();
    setGuardandoLectura(true);
    setErrorLectura('');
    setAvisoLectura('');
    try {
      const { agregadas } = await api.cargarLecturas(bolsa.id, [{
        timestamp: new Date().toISOString(),
        humedad: Number(lectura.humedad),
        temperatura: Number(lectura.temperatura),
        co2: Number(lectura.co2),
      }]);
      setAvisoLectura(`${agregadas} lectura cargada.`);
      setLectura({ humedad: '', temperatura: '', co2: '' });
    } catch (reason) {
      setErrorLectura(mensaje(reason));
    } finally {
      setGuardandoLectura(false);
    }
  }

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

  async function vender(event) {
    event.preventDefault();
    setVendiendo(true);
    setErrorVenta('');
    setDecision('');
    try {
      const resultado = await api.venderSilobolsa(bolsa.id, {
        hoy: hoyISO(),
        destino: { terminal: venta.terminal.trim(), distanciaKm: Number(venta.distanciaKm) },
        tasaAnual: 0.08,
      });
      setDecision(textoDecision(resultado));
    } catch (reason) {
      setErrorVenta(mensaje(reason));
    } finally {
      setVendiendo(false);
    }
  }

  return (
    <article className="panel">
      <div className="section-heading">
        <div>
          <h3>{bolsa.id}</h3>
          <p>{nombreCultivo(bolsa.cultivo)} · {fmt(bolsa.kg)} kg · {bolsa.fechaCreacion}{lote ? ` · ${lote.name}` : ''}</p>
        </div>
      </div>

      <form className="field-form" onSubmit={enviarLectura}>
        <strong>Cargar lectura</strong>
        <div className="form-grid form-grid--3">
          <label>Humedad (%)<input name="humedad" type="number" step="any" value={lectura.humedad} onChange={cambiarLectura} required /></label>
          <label>Temperatura (°C)<input name="temperatura" type="number" step="any" value={lectura.temperatura} onChange={cambiarLectura} required /></label>
          <label>CO₂ (%)<input name="co2" type="number" step="any" value={lectura.co2} onChange={cambiarLectura} required /></label>
        </div>
        {errorLectura && <div className="form-error" role="alert">{errorLectura}</div>}
        {avisoLectura && <p>{avisoLectura}</p>}
        <div>
          <button type="submit" className="button" disabled={guardandoLectura}>{guardandoLectura ? 'Cargando…' : 'Cargar lectura'}</button>
        </div>
      </form>

      <div className="detail-block">
        <button type="button" className="button button--primary" onClick={verRiesgo} disabled={consultandoRiesgo}>{consultandoRiesgo ? 'Consultando…' : 'Ver riesgo'}</button>
        {errorRiesgo && <div className="form-error" role="alert">{errorRiesgo}</div>}
        {riesgo && <p>{riesgo}</p>}
      </div>

      <form className="field-form" onSubmit={vender}>
        <strong>Venta</strong>
        <div className="form-grid">
          <label>Terminal<input name="terminal" value={venta.terminal} onChange={cambiarVenta} required /></label>
          <label>Distancia (km)<input name="distanciaKm" type="number" min="1" step="any" value={venta.distanciaKm} onChange={cambiarVenta} required /></label>
        </div>
        {errorVenta && <div className="form-error" role="alert">{errorVenta}</div>}
        {decision && <p>{decision}</p>}
        <div>
          <button type="submit" className="button button--primary" disabled={vendiendo}>{vendiendo ? 'Calculando…' : 'Calcular venta'}</button>
        </div>
      </form>
    </article>
  );
}
