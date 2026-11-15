import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, BadgeCheck, CalendarClock, CheckCircle2, Info, Loader2, PlayCircle, Ship, Trophy,
} from 'lucide-react';
import { api, entradaDesdeLote } from '../lib/api.js';
import { nombreCultivo } from '../lib/data.js';
import { ApiOffline } from './MarketplacePage.jsx';

const usd = (v) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);
const fmt = (v, d = 0) => new Intl.NumberFormat('es-AR', { maximumFractionDigits: d }).format(v);
const fmtDate = (v, opts = { day: 'numeric', month: 'short' }) => (v ? new Intl.DateTimeFormat('es-AR', { ...opts, timeZone: 'UTC' }).format(new Date(`${v}T12:00:00Z`)) : '—');
const today = () => new Date().toISOString().slice(0, 10);
const NIVEL = { critico: 0, alerta: 1, info: 2 };
const ESTADO_LABEL = { fluido: 'Fluido', cargado: 'Cargado', saturado: 'Saturado' };
// Cada tipo de destino necesita un servicio contratado (ver docs/API.md).
const SERVICIO_DESTINO = { silobolsa: 'almacenaje', acopio: 'transporte', puerto: 'transporte' };
const habilitado = (destino, form) => form[SERVICIO_DESTINO[destino.tipo] ?? 'transporte'];

function Alerts({ avisos }) {
  if (!avisos?.length) return null;
  const sorted = [...avisos].sort((a, b) => (NIVEL[a.nivel] ?? 3) - (NIVEL[b.nivel] ?? 3));
  return (
    <div className="alert-list">
      {sorted.map((aviso, i) => {
        const Icon = aviso.nivel === 'info' ? Info : AlertTriangle;
        return (
          <div className={`alert alert--${aviso.nivel}`} key={`${aviso.tipo}-${i}`} role={aviso.nivel === 'critico' ? 'alert' : undefined}>
            <Icon size={17} aria-hidden="true" />
            <div><strong>{aviso.nivel === 'critico' ? 'Crítico' : aviso.nivel === 'alerta' ? 'Alerta' : 'Info'} · {aviso.modulo}</strong><p>{aviso.mensaje}</p></div>
          </div>
        );
      })}
    </div>
  );
}

function SaturationCalendar({ saturacion, ventana, pedidos }) {
  const dias = saturacion?.dias ?? [];
  if (!dias.length) return null;
  const transporte = pedidos?.find((p) => p.recurso === 'camión');
  const inicio = ventana?.inicio ?? transporte?.usar_desde;
  const fin = ventana?.fin ?? transporte?.usar_hasta;
  const fuera = inicio && dias.at(-1).fecha < inicio;
  return (
    <section className="panel">
      <div className="section-heading">
        <div><h3><Ship size={17} aria-hidden="true" /> Saturación del puerto · {saturacion.puerto ?? 'Gran Rosario'}</h3><p>Pronóstico de 60 días. El recuadro marca tu ventana de despacho.</p></div>
        <div className="legend">
          {Object.entries(ESTADO_LABEL).map(([k, label]) => <span key={k}><i className={`dot dot--${k}`} />{label}</span>)}
          <span><i className="dot dot--window" />Tu despacho</span>
        </div>
      </div>
      <div className="sat-calendar" role="list">
        {dias.map((dia) => {
          const enVentana = inicio && dia.fecha >= inicio && dia.fecha <= fin;
          return (
            <div role="listitem" key={dia.fecha} className={`sat-day sat-day--${dia.estado}${enVentana ? ' is-window' : ''}`}
              title={`${fmtDate(dia.fecha, { weekday: 'short', day: 'numeric', month: 'short' })} · ${ESTADO_LABEL[dia.estado] ?? dia.estado}${dia.camionesEsperados ? ` · ${fmt(dia.camionesEsperados)} camiones` : ''} · espera ${fmt(dia.esperaDias, 1)} días`}>
              <span>{dia.fecha.slice(8)}</span>
            </div>
          );
        })}
      </div>
      <div className="sat-foot">
        <span>{fmtDate(dias[0].fecha)}</span>
        {fuera && <span className="text-warning">Tu despacho ({fmtDate(inicio)}) cae después del horizonte del pronóstico. Mové la fecha “hoy” para verlo.</span>}
        <span>{fmtDate(dias.at(-1).fecha)}</span>
      </div>
    </section>
  );
}

export default function LogisticsPage({ lot, onToast, onNavigate }) {
  const [ejemplo, setEjemplo] = useState(null);
  const [form, setForm] = useState({ hoy: today(), qqHa: 35, diasDisponibles: 12, urgencia: 'media', transporte: true, almacenaje: false });
  const [destinos, setDestinos] = useState([]);
  const [result, setResult] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | running | confirming | confirmed
  const [error, setError] = useState('');
  const [offline, setOffline] = useState('');

  async function loadExample() {
    setOffline('');
    try {
      const data = await api.ejemplo();
      setEjemplo(data);
      setDestinos(data.destinos);
      setForm((f) => ({ ...f, qqHa: data.qqHa, diasDisponibles: data.diasDisponibles, urgencia: data.urgencia }));
    } catch (reason) {
      setOffline(reason.message);
    }
  }
  useEffect(() => { loadExample(); }, []);
  useEffect(() => { setResult(null); setStatus('idle'); }, [lot?.id]);

  const update = ({ target: { name, value, type, checked } }) => setForm((f) => ({ ...f, [name]: type === 'checkbox' ? checked : value }));
  const updateDestino = (i, key, value) => setDestinos((list) => list.map((d, j) => (j === i ? { ...d, [key]: Number(value) } : d)));

  async function simulate(event) {
    event.preventDefault();
    setStatus('running');
    setError('');
    try {
      const servicios = [form.transporte && 'transporte', form.almacenaje && 'almacenaje'].filter(Boolean);
      const activos = destinos.filter((d) => habilitado(d, form));
      if (!activos.length) throw new Error('Marcá transporte o almacenaje para tener al menos un destino.');
      const entrada = entradaDesdeLote(lot, ejemplo, {
        hoy: form.hoy, qqHa: Number(form.qqHa), diasDisponibles: Number(form.diasDisponibles), urgencia: form.urgencia, servicios, destinos: activos,
      });
      setResult(await api.simular(entrada));
      setStatus('idle');
    } catch (reason) {
      setError(reason.message);
      setStatus('idle');
    }
  }

  async function confirm() {
    setStatus('confirming');
    try {
      const { reservas } = await api.confirmarReservas(result.simulacionId, lot.id);
      setStatus('confirmed');
      onToast(`${reservas.length} reservas confirmadas en el marketplace.`);
    } catch (reason) {
      setError(reason.message);
      setStatus('idle');
    }
  }

  const plan = result?.plan;
  const maxMargin = useMemo(() => Math.max(1, ...(plan?.alternativas ?? []).map((a) => a.margen_usd)), [plan]);

  if (!lot) {
    return <div className="empty-state"><h3>Seleccioná un lote</h3><p>El plan logístico se arma con la superficie, el cultivo y la ubicación del lote.</p></div>;
  }

  return (
    <>
      <div className="page-intro">
        <div>
          <span className="eyebrow">PLAN LOGÍSTICO · API AGROFLOW</span>
          <h2>Cosecha y despacho sin colas</h2>
          <p>{lot.name} · {nombreCultivo(lot.crop)} · {fmt(lot.areaHa, 1)} ha · siembra {fmtDate(lot.sowingDate, { day: 'numeric', month: 'short', year: 'numeric' })}</p>
        </div>
      </div>

      {offline ? <ApiOffline error={offline} onRetry={loadExample} /> : (
        <div className="logistics-grid">
          <form className="panel sim-form" onSubmit={simulate}>
            <div className="section-heading"><div><h3>Parámetros</h3><p>Se precargan con la entrada de ejemplo de la API.</p></div></div>
            <div className="form-grid">
              <label>Rinde esperado (qq/ha)<input name="qqHa" type="number" min="1" step="0.5" value={form.qqHa} onChange={update} required /></label>
              <label>Días disponibles<input name="diasDisponibles" type="number" min="1" value={form.diasDisponibles} onChange={update} required /></label>
            </div>
            <div className="form-grid">
              <label>Urgencia
                <select name="urgencia" value={form.urgencia} onChange={update}><option value="baja">Baja</option><option value="media">Media</option><option value="alta">Alta</option></select>
              </label>
              <label>Fecha de referencia<input name="hoy" type="date" value={form.hoy} onChange={update} required /></label>
            </div>
            <fieldset className="check-group">
              <legend>Servicios a contratar (cosecha va siempre)</legend>
              <label className="check"><input type="checkbox" name="transporte" checked={form.transporte} onChange={update} /> Transporte</label>
              <label className="check"><input type="checkbox" name="almacenaje" checked={form.almacenaje} onChange={update} /> Almacenaje en silobolsa</label>
            </fieldset>
            <fieldset className="destinos">
              <legend>Destinos y precios (USD/t)</legend>
              {destinos.map((d, i) => (
                <div className={`destino-row${habilitado(d, form) ? '' : ' is-off'}`} key={d.nombre}>
                  <span><strong>{d.nombre}</strong><small>{habilitado(d, form) ? `${d.tipo}${d.distanciaKm ? ` · ${d.distanciaKm} km` : ''}` : `Requiere ${SERVICIO_DESTINO[d.tipo]}`}</small></span>
                  <input type="number" min="1" aria-label={`Precio ${d.nombre}`} value={d.precioUsdPorT} disabled={!habilitado(d, form)} onChange={(e) => updateDestino(i, 'precioUsdPorT', e.target.value)} />
                </div>
              ))}
            </fieldset>
            {error && <div className="form-error" role="alert">{error}</div>}
            <button type="submit" className="button button--primary button--block" disabled={status === 'running' || !ejemplo}>
              {status === 'running' ? <><Loader2 className="spin" size={16} /> Simulando…</> : <><PlayCircle size={16} /> Simular plan</>}
            </button>
          </form>

          <div className="sim-results">
            {!result ? (
              <div className="empty-state">
                <span className="empty-state-icon"><CalendarClock size={22} /></span>
                <h3>Simulá para ver el plan</h3>
                <p>Destino con mejor margen, maquinaria a pedir, saturación del puerto y proveedores asignados del marketplace.</p>
              </div>
            ) : (
              <>
                <div className="result-hero">
                  <div className="result-hero-main">
                    <span className="eyebrow"><Trophy size={13} /> Destino recomendado</span>
                    <h3>{plan.recomendado.destino}</h3>
                    <p>{plan.recomendado.criterio}</p>
                  </div>
                  <div className="result-kpis">
                    <div><span>Margen neto</span><strong className="tabular">{usd(plan.recomendado.margen_usd)}</strong></div>
                    <div><span>Toneladas</span><strong className="tabular">{fmt(plan.toneladas)} t</strong></div>
                    <div><span>Costo servicios</span><strong className="tabular">{usd(plan.recomendado.costo_usd)}</strong></div>
                  </div>
                </div>

                <Alerts avisos={result.avisos} />

                <section className="panel">
                  <div className="section-heading"><div><h3>Comparación de destinos</h3><p>Margen neto por alternativa</p></div></div>
                  <div className="margin-bars">
                    {plan.alternativas.map((alt) => (
                      <div className={`margin-row${alt.destino === plan.recomendado.destino ? ' is-best' : ''}`} key={alt.destino}>
                        <span className="margin-label"><strong>{alt.destino}</strong><small>{alt.tipo}</small></span>
                        <span className="margin-track"><span style={{ transform: `scaleX(${Math.max(0.02, alt.margen_usd / maxMargin)})` }} /></span>
                        <span className="tabular margin-value">{usd(alt.margen_usd)}</span>
                      </div>
                    ))}
                  </div>
                </section>

                <SaturationCalendar saturacion={{ ...result.saturacion, puerto: result.puerto }} ventana={result.ventana} pedidos={plan.recomendado.pedidos} />

                <section className="panel">
                  <div className="section-heading"><div><h3>Pedido de maquinaria y asignación</h3><p>Proveedores del marketplace para cada recurso</p></div>
                    <span className={`status-pill ${result.asignacion.completa ? 'status-pill--success' : 'status-pill--warning'}`}>Cobertura {fmt(result.asignacion.coberturaPct)}%</span>
                  </div>
                  <div className="table-scroll">
                    <table className="data-table">
                      <thead><tr><th>Recurso</th><th>Cant.</th><th>Pedir antes del</th><th>Uso</th><th>Proveedores asignados</th><th className="num">Costo</th></tr></thead>
                      <tbody>
                        {result.asignacion.lineas.map(({ linea, asignaciones, faltan }) => (
                          <tr key={`${linea.recurso}-${linea.tipo}`}>
                            <td><strong>{linea.recurso}</strong><small>{linea.tipo}</small></td>
                            <td className="tabular">{linea.cantidad}</td>
                            <td>{fmtDate(linea.pedir_antes_del)}</td>
                            <td>{fmtDate(linea.usar_desde)} – {fmtDate(linea.usar_hasta)}</td>
                            <td>
                              {asignaciones.map((a) => <div className="assign" key={a.ofertaId}><BadgeCheck size={13} aria-hidden="true" /> {a.proveedor} · {a.unidades} u. · {fmt(a.distanciaKm)} km</div>)}
                              {faltan > 0 && <div className="assign assign--missing"><AlertTriangle size={13} aria-hidden="true" /> Faltan {faltan}</div>}
                            </td>
                            <td className="num tabular">{usd(asignaciones.reduce((t, a) => t + (a.costoUsd ?? 0), 0) || linea.costo_usd)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>

                <div className="confirm-bar panel">
                  <div>
                    <strong>{status === 'confirmed' ? 'Reservas confirmadas' : '¿Reservar este plan?'}</strong>
                    <p>{status === 'confirmed' ? 'Los camiones a puerto ya cuentan en la saturación de las próximas simulaciones.' : 'Se reservan los proveedores asignados. La simulación se usa una sola vez.'}</p>
                  </div>
                  {status === 'confirmed' ? (
                    <button type="button" className="button button--secondary" onClick={() => onNavigate('marketplace')}><CheckCircle2 size={16} /> Ver marketplace</button>
                  ) : (
                    <button type="button" className="button button--primary" onClick={confirm} disabled={status === 'confirming'}>
                      {status === 'confirming' ? <><Loader2 className="spin" size={16} /> Confirmando…</> : <><CheckCircle2 size={16} /> Confirmar reservas</>}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
