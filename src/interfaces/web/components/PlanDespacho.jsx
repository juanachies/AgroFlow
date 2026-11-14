// Página "Plan y despacho": simulador de AgroFlow conectado a la API.
// Destino por margen neto, saturación del puerto, ventana de despacho, pedido, marketplace de
// cadetes, explicación (IA o plantilla), escenarios "¿y si…?" y confirmación de reservas.
import { useEffect, useMemo, useState } from 'react';
import { api, armarEntrada, PUERTOS, REFERENCIAS } from '../lib/api.js';
import { nombreCultivo, ventanaDelLote } from '../lib/data.js';

const usd = (n) => (n == null ? '—' : `US$ ${Math.round(n).toLocaleString('es-AR')}`);
const fecha = (iso) => (iso ? new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`)) : '—');
const hoyIso = () => new Date().toISOString().slice(0, 10);

const ESCENARIOS = [
  { tipo: 'lluvia', valor: 5, etiqueta: '+5 días de lluvia' },
  { tipo: 'demora', valor: 7, etiqueta: 'Cosecha 7 días más tarde' },
  { tipo: 'precioPuerto', valor: -20, etiqueta: 'Puerto −20 US$/t' },
  { tipo: 'flete', valor: 25, etiqueta: 'Flete +25%' },
  { tipo: 'saturacion', valor: 30, etiqueta: '+30% camiones al puerto' },
];

function formularioInicial(lot) {
  const ref = REFERENCIAS[lot.crop] ?? REFERENCIAS.soja;
  return {
    hoy: hoyIso(),
    qqHa: ref.qqHa,
    diasDisponibles: 15,
    urgencia: 'media',
    fechaInicioCosecha: ventanaDelLote(lot)?.optimo ?? '',
    usarSilobolsa: true,
    precioSilobolsa: ref.silobolsa,
    usarAcopio: true,
    nombreAcopio: 'Acopio o cooperativa',
    precioAcopio: ref.acopio,
    tarifaAcopio: 6,
    distanciaAcopio: 20,
    usarPuerto: true,
    puerto: PUERTOS[0].id,
    precioPuerto: ref.puerto,
  };
}

function Campo({ label, children, ayuda }) {
  return (
    <label className="pd-campo">
      <span>{label}</span>
      {children}
      {ayuda && <small>{ayuda}</small>}
    </label>
  );
}

function Formulario({ f, set, onSubmit, cargando }) {
  const num = (k) => ({ type: 'number', value: f[k], onChange: (e) => set(k, e.target.value) });
  const sinDestinos = !f.usarSilobolsa && !f.usarAcopio && !f.usarPuerto;
  return (
    <form className="panel pd-form" onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>
      <div className="pd-grid">
        <Campo label="Fecha de hoy"><input type="date" value={f.hoy} onChange={(e) => set('hoy', e.target.value)} required /></Campo>
        <Campo label="Inicio de cosecha" ayuda="Por defecto, el óptimo de la ventana del lote"><input type="date" value={f.fechaInicioCosecha} onChange={(e) => set('fechaInicioCosecha', e.target.value)} /></Campo>
        <Campo label="Rinde esperado (qq/ha)"><input {...num('qqHa')} min="1" step="0.5" required /></Campo>
        <Campo label="Días disponibles para cosechar"><input {...num('diasDisponibles')} min="1" required /></Campo>
        <Campo label="Urgencia">
          <select value={f.urgencia} onChange={(e) => set('urgencia', e.target.value)}>
            <option value="baja">Baja (menor costo)</option><option value="media">Media</option><option value="alta">Alta (terminar antes)</option>
          </select>
        </Campo>
      </div>
      <h4 className="pd-subtitulo">Destinos a comparar <small>precios editables · valores de referencia, no cotizaciones</small></h4>
      <div className="pd-destinos">
        <div className={`pd-destino${f.usarSilobolsa ? ' is-on' : ''}`}>
          <label className="pd-check"><input type="checkbox" checked={f.usarSilobolsa} onChange={(e) => set('usarSilobolsa', e.target.checked)} /> Silobolsa en el campo</label>
          <Campo label="Precio (US$/t)"><input {...num('precioSilobolsa')} disabled={!f.usarSilobolsa} /></Campo>
        </div>
        <div className={`pd-destino${f.usarAcopio ? ' is-on' : ''}`}>
          <label className="pd-check"><input type="checkbox" checked={f.usarAcopio} onChange={(e) => set('usarAcopio', e.target.checked)} /> Acopio o cooperativa</label>
          <Campo label="Nombre"><input value={f.nombreAcopio} onChange={(e) => set('nombreAcopio', e.target.value)} disabled={!f.usarAcopio} /></Campo>
          <Campo label="Precio (US$/t)"><input {...num('precioAcopio')} disabled={!f.usarAcopio} /></Campo>
          <Campo label="Distancia (km)"><input {...num('distanciaAcopio')} disabled={!f.usarAcopio} /></Campo>
        </div>
        <div className={`pd-destino${f.usarPuerto ? ' is-on' : ''}`}>
          <label className="pd-check"><input type="checkbox" checked={f.usarPuerto} onChange={(e) => set('usarPuerto', e.target.checked)} /> Puerto directo</label>
          <Campo label="Puerto">
            <select value={f.puerto} onChange={(e) => set('puerto', e.target.value)} disabled={!f.usarPuerto}>
              {PUERTOS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </Campo>
          <Campo label="Precio (US$/t)" ayuda="La distancia por ruta la calcula el servidor"><input {...num('precioPuerto')} disabled={!f.usarPuerto} /></Campo>
        </div>
      </div>
      <div className="pd-acciones">
        <button type="submit" className="button button--primary" disabled={cargando || sinDestinos}>{cargando ? 'Simulando…' : 'Simular plan'}</button>
        {sinDestinos && <span className="form-error">Elegí al menos un destino.</span>}
      </div>
    </form>
  );
}

function Avisos({ avisos }) {
  if (!avisos?.length) return null;
  return (
    <section className="pd-avisos">
      {avisos.map((a, i) => <div key={i} className={`pd-aviso pd-aviso--${a.nivel}`}><strong>{a.nivel === 'critico' ? 'Urgente' : a.nivel === 'alerta' ? 'Atención' : 'Info'}</strong> {a.mensaje}</div>)}
    </section>
  );
}

function Destinos({ plan }) {
  const rec = plan.recomendado;
  const opciones = [...plan.alternativas].sort((a, b) => (b.margen_usd ?? -Infinity) - (a.margen_usd ?? -Infinity));
  return (
    <section className="panel pd-panel">
      <div className="section-heading"><div><span className="eyebrow">ADÓNDE MANDAR EL GRANO</span><h3>{rec.destino}</h3></div><span className="status-pill">{rec.criterio}</span></div>
      <div className="pd-cards">
        {opciones.map((o) => (
          <div key={o.destino} className={`pd-card${o.destino === rec.destino ? ' is-best' : ''}`}>
            <span>{o.destino}</span><strong>{usd(o.margen_usd)}</strong><small>margen neto · costo {usd(o.costo_usd)}</small>
          </div>
        ))}
      </div>
      <p className="inline-note">{Math.round(plan.toneladas).toLocaleString('es-AR')} t · {plan.dias_efectivos} días efectivos de cosecha</p>
    </section>
  );
}

function Saturacion({ saturacion, ventana, puerto }) {
  if (!saturacion) return null;
  const dentro = (d) => ventana && d >= ventana.inicio && d <= ventana.fin;
  const dias = saturacion.dias.slice(0, 45);
  return (
    <section className="panel pd-panel">
      <div className="section-heading">
        <div><span className="eyebrow">SATURACIÓN DEL PUERTO · {puerto}</span><h3>{saturacion.diasSaturados.length ? `${saturacion.diasSaturados.length} días saturados en el horizonte` : 'Sin días saturados en el horizonte'}</h3></div>
        <div className="pd-leyenda"><i className="pd-dia--fluido" />fluido <i className="pd-dia--cargado" />cargado <i className="pd-dia--saturado" />saturado <i className="pd-dia--ventana" />tu despacho</div>
      </div>
      <div className="pd-calendario">
        {dias.map((d) => (
          <div key={d.fecha} className={`pd-dia pd-dia--${d.estado}${dentro(d.fecha) ? ' is-ventana' : ''}`} title={`${d.fecha} · ${d.estado}${d.camionesEsperados ? ` · ${d.camionesEsperados} camiones esperados` : ''}`}>
            <span>{fecha(d.fecha)}</span>
          </div>
        ))}
      </div>
      {ventana && (
        <p className="inline-note">
          Despacho sugerido: <strong>{fecha(ventana.inicio)} a {fecha(ventana.fin)}</strong>
          {ventana.desplazamientoDias ? ` (corrido ${ventana.desplazamientoDias} días para evitar ${ventana.diasSaturadosOriginal - ventana.diasSaturados} días de cola)` : ''}.
          Camiones esperados según reservas del marketplace y barcos del puerto.
        </p>
      )}
    </section>
  );
}

function Pedido({ pedidos, asignacion }) {
  return (
    <section className="panel pd-panel">
      <div className="section-heading"><div><span className="eyebrow">MARKETPLACE DE CADETES</span><h3>Qué contratar y con quién</h3></div><span className={`status-pill${asignacion.completa ? '' : ' status-pill--muted'}`}>Cobertura {asignacion.coberturaPct}% · {usd(asignacion.costoUsd)}</span></div>
      <div className="pd-tabla">
        {asignacion.lineas.map((l) => (
          <div key={`${l.linea.recurso}-${l.linea.usar_desde}`} className="pd-linea">
            <div className="pd-linea-head">
              <strong>{l.linea.cantidad} × {l.linea.recurso}</strong>
              <span>{fecha(l.linea.usar_desde)} → {fecha(l.linea.usar_hasta)} · pedir antes del {fecha(l.linea.pedir_antes_del)}</span>
            </div>
            <ul>
              {l.asignaciones.map((a) => <li key={a.ofertaId}><span>{a.proveedor}</span><span>{a.unidades} u. · {a.distanciaKm} km · ×{a.precioRelativo}</span><span>{usd(a.costoUsd)}</span></li>)}
              {l.faltan > 0 && <li className="pd-falta"><span>Faltan {l.faltan}</span><span>sin proveedores con disponibilidad</span><span /></li>}
            </ul>
          </div>
        ))}
        {pedidos.filter((p) => p.recurso === 'silobolsa').map((p) => <p key="bolsas" className="inline-note">Además: {p.cantidad} silobolsas (insumo, pedir antes del {fecha(p.pedir_antes_del)}).</p>)}
      </div>
    </section>
  );
}

function Explicacion({ explicacion, cargando, onPreguntar }) {
  const [pregunta, setPregunta] = useState('');
  return (
    <section className="panel pd-panel pd-explicacion">
      <div className="section-heading"><div><span className="eyebrow">EXPLICACIÓN</span><h3>Qué conviene hacer y por qué</h3></div>{explicacion && <span className="status-pill status-pill--muted">{explicacion.fuente === 'openai' ? `IA · ${explicacion.modelo ?? 'OpenAI'}` : 'Plantilla (sin IA)'}</span>}</div>
      <p className="pd-texto">{cargando ? 'Generando explicación…' : explicacion?.texto ?? '—'}</p>
      {explicacion?.aviso && <p className="inline-note">{explicacion.aviso}</p>}
      <form className="pd-pregunta" onSubmit={(e) => { e.preventDefault(); if (pregunta.trim()) onPreguntar(pregunta.trim()); }}>
        <input placeholder="Preguntá algo sobre este plan, por ejemplo: ¿por qué no conviene el acopio?" value={pregunta} onChange={(e) => setPregunta(e.target.value)} />
        <button type="submit" className="button button--secondary button--small" disabled={cargando}>Preguntar</button>
      </form>
    </section>
  );
}

function Escenarios({ onEscenario, resultado, cargando }) {
  return (
    <section className="panel pd-panel">
      <div className="section-heading"><div><span className="eyebrow">¿Y SI…?</span><h3>Escenarios</h3></div></div>
      <div className="pd-escenarios">
        {ESCENARIOS.map((e) => <button key={e.tipo} type="button" className="button button--secondary button--small" disabled={cargando} onClick={() => onEscenario(e)}>{e.etiqueta}</button>)}
      </div>
      {cargando && <p className="inline-note">Simulando escenario…</p>}
      {resultado && !cargando && (
        <div className="pd-escenario-resultado">
          <p className="pd-texto">{resultado.explicacion.texto}</p>
          {resultado.explicacion.comparacion?.cambios?.length > 0 && <ul>{resultado.explicacion.comparacion.cambios.map((c) => <li key={c}>{c}</li>)}</ul>}
        </div>
      )}
    </section>
  );
}

export default function PlanDespacho({ lot }) {
  const [f, setF] = useState(() => (lot ? formularioInicial(lot) : null));
  const [estado, setEstado] = useState({ cargando: false, error: null, sim: null, explicacion: null, explicando: false, escenario: null, simulandoEscenario: false, reservas: null, confirmando: false });
  useEffect(() => { if (lot) { setF(formularioInicial(lot)); setEstado((s) => ({ ...s, sim: null, explicacion: null, escenario: null, reservas: null, error: null })); } }, [lot?.id]);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const parche = (p) => setEstado((s) => ({ ...s, ...p }));
  const titulo = useMemo(() => (lot ? `${lot.name} · ${nombreCultivo(lot.crop)} · ${lot.areaHa.toLocaleString('es-AR')} ha` : ''), [lot]);

  if (!lot) {
    return <div className="panel compact-empty">Seleccioná o creá un lote para simular su plan de cosecha y despacho.</div>;
  }

  async function simular() {
    parche({ cargando: true, error: null, sim: null, explicacion: null, escenario: null, reservas: null });
    try {
      const sim = await api.simular(armarEntrada(lot, f));
      parche({ sim, cargando: false, explicando: true });
      const explicacion = await api.explicar(sim.simulacionId).catch((e) => ({ texto: e.message, fuente: 'error' }));
      parche({ explicacion, explicando: false });
    } catch (e) {
      parche({ cargando: false, error: e.message });
    }
  }

  async function preguntar(pregunta) {
    parche({ explicando: true });
    const explicacion = await api.explicar(estado.sim.simulacionId, pregunta).catch((e) => ({ texto: e.message, fuente: 'error' }));
    parche({ explicacion, explicando: false });
  }

  async function escenario(e) {
    parche({ simulandoEscenario: true, escenario: null });
    try {
      parche({ escenario: await api.escenario(estado.sim.simulacionId, { tipo: e.tipo, valor: e.valor }), simulandoEscenario: false });
    } catch (err) {
      parche({ simulandoEscenario: false, error: err.message });
    }
  }

  async function confirmar() {
    parche({ confirmando: true });
    try {
      const { reservas } = await api.confirmar(estado.sim.simulacionId, lot.id);
      parche({ reservas, confirmando: false });
    } catch (e) {
      parche({ confirmando: false, error: e.message });
    }
  }

  const { sim } = estado;
  return (
    <>
      <div className="page-intro">
        <div><span className="eyebrow">COSECHA Y DESPACHO SIN COLAS</span><h2>Plan y despacho</h2><p>{titulo}. Destino por margen neto, saturación del puerto, pedido de cadetes y explicación.</p></div>
      </div>
      <Formulario f={f} set={set} onSubmit={simular} cargando={estado.cargando} />
      {estado.error && <div className="pd-aviso pd-aviso--critico"><strong>Error</strong> {estado.error}</div>}
      {sim && (
        <div className="pd-resultado">
          <Avisos avisos={sim.avisos} />
          <div className="pd-dos">
            <Destinos plan={sim.plan} />
            <Explicacion explicacion={estado.explicacion} cargando={estado.explicando} onPreguntar={preguntar} />
          </div>
          <Saturacion saturacion={sim.saturacion} ventana={sim.ventana} puerto={sim.puerto} />
          <Pedido pedidos={sim.plan.recomendado.pedidos} asignacion={sim.asignacion} />
          <Escenarios onEscenario={escenario} resultado={estado.escenario} cargando={estado.simulandoEscenario} />
          <section className="panel pd-panel pd-confirmar">
            {estado.reservas
              ? <p><strong>Listo: {estado.reservas.length} reservas confirmadas.</strong> Los camiones a puerto ya cuentan en el pronóstico de saturación de todos los productores.</p>
              : <>
                <p>Confirmá para reservar a estos proveedores. Los camiones reservados se suman al pronóstico de saturación del puerto.</p>
                <button type="button" className="button button--primary" disabled={estado.confirmando} onClick={confirmar}>{estado.confirmando ? 'Confirmando…' : 'Confirmar reservas'}</button>
              </>}
          </section>
          {(sim.distancias?.length > 0 || sim.clima) && (
            <p className="inline-note pd-fuentes">
              {sim.distancias?.map((d) => `${d.destino}: ${d.km} km (${d.fuente})`).join(' · ')}
              {sim.clima ? ` · Clima: ${sim.clima.disponible ? `${sim.clima.diasConLluvia} días de lluvia en la ventana (Open-Meteo)` : sim.clima.motivo}` : ''}
            </p>
          )}
        </div>
      )}
    </>
  );
}
