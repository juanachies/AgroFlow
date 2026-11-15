import { useEffect, useMemo, useState } from 'react';
import { Anchor, Package, Sprout, Star, Truck, Wheat } from 'lucide-react';
import Almanaque from './Almanaque.jsx';
import EconomiaCampana from './EconomiaCampana.jsx';
import LogisticsMap, { CAPAS } from './LogisticsMap.jsx';
import { Avisos, Destinos, Pedido, Saturacion } from './PlanDespacho.jsx';
import PlanCamiones from './PlanCamiones.jsx';
import ZonaLote from './ZonaLote.jsx';
import { api } from '../lib/api.js';
import { nombreCultivo, ventanaDelLote } from '../lib/data.js';
import {
  ACOPIOS_EJEMPLO,
  PUERTOS_GEO,
  RECURSOS,
  etapaDelCiclo,
  evaluarClima,
  fleterosCercanos,
  resumirFleteros,
  ubicarSilobolsas,
} from '../lib/logistica.js';

const hoyIso = () => new Date().toISOString().slice(0, 10);
const fecha = (iso, opciones = { day: 'numeric', month: 'short' }) => (iso
  ? new Intl.DateTimeFormat('es-AR', { ...opciones, timeZone: 'UTC' }).format(new Date(`${iso.slice(0, 10)}T12:00:00Z`))
  : '—');
const numero = (valor, digitos = 0) => new Intl.NumberFormat('es-AR', { maximumFractionDigits: digitos }).format(valor);
const usd = (valor) => (valor == null ? '—' : `US$ ${numero(valor)}`);
const KG_POR_QUINTAL = 100;

const NIVEL_RIESGO = {
  bajo: { texto: 'Riesgo bajo', clase: 'ok' },
  medio: { texto: 'Riesgo medio', clase: 'warn' },
  alto: { texto: 'Riesgo alto', clase: 'bad' },
  critico: { texto: 'Riesgo crítico', clase: 'bad' },
};

function Kpi({ icono, etiqueta, valor, detalle, tono = 'green' }) {
  return (
    <article className="cl-kpi">
      <span className={`cl-kpi-icon cl-kpi-icon--${tono}`} aria-hidden="true">{icono}</span>
      <div>
        <span className="cl-kpi-label">{etiqueta}</span>
        <strong className="cl-kpi-value">{valor}</strong>
        <small>{detalle}</small>
      </div>
    </article>
  );
}

function CicloTimeline({ lot, ventana, etapa }) {
  if (!lot?.crop || !ventana || !etapa) {
    return (
      <section className="panel cl-panel">
        <div className="section-heading"><div><span className="eyebrow">CICLO DEL CULTIVO</span><h3>Sin cultivo sembrado</h3></div></div>
        <p className="cl-muted">Sembrá un cultivo en Gestionar lotes para ver la ventana de cosecha estimada.</p>
      </section>
    );
  }
  const estado = etapa.cosechado ? 'Cosecha terminada' : etapa.enCosecha ? 'Cosecha en curso' : `Faltan ${etapa.diasHastaInicio} días para el inicio de cosecha`;
  return (
    <section className="panel cl-panel">
      <div className="section-heading"><div><span className="eyebrow">CICLO DEL CULTIVO</span><h3>{nombreCultivo(lot.crop)} · {lot.cycleDays} días</h3></div><span className="status-pill">{estado}</span></div>
      <div className="cl-timeline" role="img" aria-label={`Avance del ciclo: ${Math.round(etapa.progreso * 100)}%`}>
        <div className="cl-timeline-bar"><span style={{ width: `${etapa.progreso * 100}%` }} /></div>
        <div className="cl-timeline-marks">
          <span><i />Siembra<b>{fecha(lot.sowingDate)}</b></span>
          <span><i className="is-harvest" />Inicio cosecha<b>{fecha(ventana.inicio)}</b></span>
          <span><i className="is-center" />Centro estimado<b>{fecha(ventana.optimo)}</b></span>
          <span><i className="is-harvest" />Fin<b>{fecha(ventana.fin)}</b></span>
        </div>
      </div>
      <p className="cl-muted">Estimación por duración del ciclo (±15 días). No sustituye la evaluación agronómica.</p>
    </section>
  );
}

function ClimaPanel({ clima, sim, ventana }) {
  const dias = clima.dias.slice(0, 16);
  const maxMm = Math.max(10, ...dias.map((dia) => dia.mm || 0));
  return (
    <section className="panel cl-panel">
      <div className="section-heading"><div><span className="eyebrow">CUÁNDO COSECHAR SEGÚN EL CLIMA</span><h3>Lluvia pronosticada</h3></div><span className="source-chip">OPEN-METEO</span></div>
      {dias.length ? (
        <>
          <div className="cl-rain" role="img" aria-label="Lluvia diaria pronosticada">
            {dias.map((dia) => (
              <div key={dia.fecha} className={`cl-rain-day cl-rain-day--${dia.estado}${dia.enVentana ? ' is-window' : ''}`} title={`${fecha(dia.fecha)} · ${dia.mm ?? '—'} mm`}>
                <span className="cl-rain-bar" style={{ height: `${Math.max(6, ((dia.mm || 0) / maxMm) * 100)}%` }} />
                <small>{fecha(dia.fecha, { day: 'numeric' })}</small>
              </div>
            ))}
          </div>
          <div className="cl-legend"><i className="cl-dot cl-dot--seco" />seco <i className="cl-dot cl-dot--leve" />lluvia leve <i className="cl-dot cl-dot--fuerte" />lluvia fuerte <i className="cl-dot cl-dot--ventana" />ventana de cosecha</div>
          <p className="cl-highlight">
            {clima.mejorTramo
              ? <>Mejor tramo sin lluvia fuerte: <strong>{fecha(clima.mejorTramo.desde)} a {fecha(clima.mejorTramo.hasta)}</strong> ({clima.mejorTramo.dias} días).</>
              : 'No hay días secos o con lluvia leve en el horizonte pronosticado.'}
          </p>
        </>
      ) : (
        <p className="cl-muted">
          {sim?.clima?.disponible
            ? `${sim.clima.diasConLluvia} días de lluvia previstos durante la cosecha.`
            : sim?.clima?.motivo ?? 'Cuando falten menos de 16 días se muestra el pronóstico día por día; antes, el almanaque usa la frecuencia histórica.'}
        </p>
      )}
      {ventana && !dias.length && <p className="cl-muted">Ventana estimada: {fecha(ventana.inicio)} a {fecha(ventana.fin)}.</p>}
      <p className="cl-muted">Pronóstico puntual y modelado. Clasifica la lluvia: no mide la transitabilidad del lote.</p>
    </section>
  );
}

function FleterosPanel({ cercanos, resumen, cargado }) {
  const destacados = cercanos.slice(0, 6);
  return (
    <section className="panel cl-panel">
      <div className="section-heading"><div><span className="eyebrow">FLETEROS Y CONTRATISTAS</span><h3>{cercanos.length} proveedores llegan a este lote</h3></div><Truck size={20} aria-hidden="true" /></div>
      {!cargado ? <p className="cl-muted">No se pudo consultar el marketplace.</p> : (
        <>
          <div className="cl-resources">
            {Object.entries(RECURSOS).map(([recurso, { label, color }]) => (
              <div key={recurso} className="cl-resource" style={{ '--tone': color }}>
                <strong>{resumen[recurso]?.unidades ?? 0}</strong>
                <span>{label}</span>
                <small>{resumen[recurso]?.proveedores ?? 0} proveedores</small>
              </div>
            ))}
          </div>
          <ul className="cl-providers">
            {destacados.map((oferta) => (
              <li key={oferta.id}>
                <span className="cl-provider-dot" style={{ background: RECURSOS[oferta.recurso]?.color }} />
                <div><strong>{oferta.proveedor}</strong><small>{oferta.unidades} × {oferta.recurso} · {oferta.base.localidad}</small></div>
                <span className="cl-provider-km">{numero(oferta.distanciaKm)} km</span>
                <span className="cl-provider-rate"><Star size={13} aria-hidden="true" />{oferta.calificacion ?? '—'}</span>
                <span className="cl-provider-price">×{oferta.precioRelativo}</span>
              </li>
            ))}
            {!destacados.length && <li className="cl-muted">Ningún proveedor tiene este lote dentro de su radio de servicio.</li>}
          </ul>
        </>
      )}
    </section>
  );
}

function SilobolsasPanel({ bolsas, riesgos, lots, cargado }) {
  const totalQq = bolsas.reduce((suma, bolsa) => suma + bolsa.kg / KG_POR_QUINTAL, 0);
  return (
    <section className="panel cl-panel">
      <div className="section-heading"><div><span className="eyebrow">SILOBOLSAS</span><h3>{bolsas.length} bolsas · {numero(totalQq)} qq</h3></div><Package size={20} aria-hidden="true" /></div>
      {!cargado ? <p className="cl-muted">No se pudo consultar la API de silobolsas.</p> : bolsas.length ? (
        <ul className="cl-bags">
          {bolsas.map((bolsa) => {
            const nivel = NIVEL_RIESGO[riesgos[bolsa.id]];
            return (
              <li key={bolsa.id}>
                <div><strong>{bolsa.id}</strong><small>{nombreCultivo(bolsa.cultivo)} · {numero(bolsa.kg / KG_POR_QUINTAL)} qq · {lots.find((lot) => lot.id === bolsa.loteId)?.name ?? 'sin lote'}</small></div>
                <span className={`cl-risk cl-risk--${nivel?.clase ?? 'none'}`}>{nivel?.texto ?? 'Sin lecturas'}</span>
              </li>
            );
          })}
        </ul>
      ) : <p className="cl-muted">Todavía no hay silobolsas registradas.</p>}
    </section>
  );
}

function LotesStrip({ lots, selectedLot, onSelectLot }) {
  return (
    <div className="cl-lots">
      {lots.map((lot) => {
        const ventana = ventanaDelLote(lot);
        return (
          <button type="button" key={lot.id} className={`cl-lot${lot.id === selectedLot?.id ? ' is-active' : ''}`} onClick={() => onSelectLot(lot.id)}>
            <strong>{lot.name}</strong>
            <small>{lot.crop ? nombreCultivo(lot.crop) : 'Sin cultivo'} · {numero(lot.areaHa)} ha</small>
            <span>{ventana ? `Cosecha ${fecha(ventana.inicio)} – ${fecha(ventana.fin)}` : 'Sin ventana'}</span>
          </button>
        );
      })}
    </div>
  );
}

export default function CentroLogistico({ lots, selectedLot, snapshotRecord, theme, onSelectLot, onNavigate }) {
  const [ofertas, setOfertas] = useState(null);
  const [bolsas, setBolsas] = useState(null);
  const [riesgos, setRiesgos] = useState({});
  const [sim, setSim] = useState(null);
  const [simError, setSimError] = useState('');
  const [reservas, setReservas] = useState([]);
  const [simulando, setSimulando] = useState(false);
  const [capas, setCapas] = useState(() => Object.fromEntries(CAPAS.map(({ id }) => [id, true])));

  useEffect(() => {
    let vivo = true;
    api.ofertas().then(({ ofertas: lista }) => vivo && setOfertas(lista)).catch(() => vivo && setOfertas(false));
    api.silobolsas().then(async ({ silobolsas }) => {
      if (!vivo) return;
      setBolsas(silobolsas);
      const niveles = await Promise.all(silobolsas.map((bolsa) => api.riesgoSilobolsa(bolsa.id)
        .then(({ riesgo }) => [bolsa.id, riesgo.nivel]).catch(() => [bolsa.id, null])));
      if (vivo) setRiesgos(Object.fromEntries(niveles));
    }).catch(() => vivo && setBolsas(false));
    return () => { vivo = false; };
  }, []);

  const lotId = selectedLot?.id;
  const sembrado = Boolean(selectedLot?.crop && selectedLot?.sowingDate);
  useEffect(() => {
    setSim(null);
    setSimError('');
    if (!selectedLot || !sembrado) return undefined;
    let vivo = true;
    setSimulando(true);
    api.decisionLote({
      id: selectedLot.id, lat: selectedLot.latitude, lon: selectedLot.longitude, ha: selectedLot.areaHa,
      cultivo: selectedLot.crop, fechaSiembra: selectedLot.sowingDate, cycleDays: selectedLot.cycleDays,
    })
      .then((resultado) => vivo && setSim(resultado))
      .catch((reason) => vivo && setSimError(reason.message))
      .finally(() => vivo && setSimulando(false));
    return () => { vivo = false; };
    // La simulación depende del lote activo y de su siembra, no de cada edición menor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lotId, selectedLot?.crop, selectedLot?.sowingDate, selectedLot?.cycleDays]);

  const lotIdReservas = selectedLot?.id;
  const cargarReservas = () => api.reservas()
    .then(({ reservas: lista }) => setReservas(lista.filter((reserva) => reserva.loteId === lotIdReservas)))
    .catch(() => setReservas([]));
  useEffect(() => {
    if (lotIdReservas) cargarReservas();
    else setReservas([]);
    // Se vuelve a pedir al cambiar de lote o de plan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lotIdReservas, sim?.simulacionId]);

  async function confirmarReservas() {
    await api.confirmar(sim.simulacionId, selectedLot.id);
    await cargarReservas();
  }

  const hoy = hoyIso();
  const ventana = useMemo(() => ventanaDelLote(selectedLot), [selectedLot]);
  const etapa = useMemo(() => etapaDelCiclo(selectedLot, ventana, hoy), [selectedLot, ventana, hoy]);
  const cercanos = useMemo(() => fleterosCercanos(selectedLot, ofertas || []), [selectedLot, ofertas]);
  const resumen = useMemo(() => resumirFleteros(cercanos), [cercanos]);
  const pronosticoDelServidor = useMemo(() => (sim?.decision?.almanaque ?? [])
    .filter((dia) => dia.clima.fuente === 'pronostico')
    .map((dia) => ({ date: dia.fecha, precipitationMm: dia.clima.lluviaMm })), [sim]);
  const clima = useMemo(
    () => evaluarClima(snapshotRecord?.snapshot?.dailyForecast ?? pronosticoDelServidor, ventana),
    [snapshotRecord, pronosticoDelServidor, ventana],
  );
  const silobolsas = useMemo(() => ubicarSilobolsas(bolsas || [], lots), [bolsas, lots]);
  const recomendado = sim?.plan?.recomendado;
  const destinoPuerto = recomendado?.tipo === 'puerto' ? recomendado.destino : null;

  const totalHa = lots.reduce((suma, lot) => suma + lot.areaHa, 0);
  const totalQq = (bolsas || []).reduce((suma, bolsa) => suma + bolsa.kg / KG_POR_QUINTAL, 0);
  const camiones = resumen['camión']?.unidades ?? 0;

  if (!lots.length) {
    return (
      <div className="empty-state">
        <span className="empty-state-icon"><Wheat size={22} /></span>
        <h3>Todavía no hay lotes</h3>
        <p>Creá tu primer lote para ver toda la logística de la campaña en un solo lugar.</p>
        <button type="button" className="button button--primary button--small" onClick={() => onNavigate('lots')}>Ir a Gestionar lotes</button>
      </div>
    );
  }

  return (
    <div className="cl-page">
      <div className="page-intro">
        <div>
          <span className="eyebrow">CENTRO LOGÍSTICO</span>
          <h2>{selectedLot?.name ?? 'Campaña'} · toda la logística en una vista</h2>
          <p>Lotes, cosecha estimada, clima, fleteros, acopios, silobolsas y decisiones del lote activo.</p>
        </div>
      </div>

      <div className="cl-kpis">
        <Kpi icono={<Sprout size={18} />} etiqueta="Lotes" valor={lots.length} detalle={`${numero(totalHa)} ha en total`} />
        <Kpi
          icono={<Wheat size={18} />} tono="amber" etiqueta="Cosecha estimada"
          valor={sim?.decision ? fecha(sim.decision.cosecha.inicio) : ventana ? fecha(ventana.optimo) : '—'}
          detalle={sim?.decision
            ? `hasta el ${fecha(sim.decision.cosecha.fin)} · ${sim.decision.cosecha.dias} días`
            : etapa ? (etapa.enCosecha ? 'En curso' : etapa.cosechado ? 'Terminada' : `en ${etapa.diasHastaCentro} días`) : 'Sin cultivo sembrado'}
        />
        <Kpi icono={<Anchor size={18} />} tono="violet" etiqueta="Mejor destino" valor={recomendado?.destino ?? (simulando ? 'Calculando…' : '—')} detalle={recomendado ? `margen ${usd(recomendado.margen_usd)}` : 'Requiere cultivo sembrado'} />
        <Kpi icono={<Truck size={18} />} tono="blue" etiqueta="Camiones disponibles" valor={ofertas === null ? '…' : camiones} detalle={`${cercanos.length} proveedores en radio`} />
        <Kpi icono={<Package size={18} />} tono="teal" etiqueta="Silobolsas" valor={bolsas ? bolsas.length : '—'} detalle={bolsas ? `${numero(totalQq)} qq embolsados` : 'API sin conexión'} />
      </div>

      <LotesStrip lots={lots} selectedLot={selectedLot} onSelectLot={onSelectLot} />

      <div className="cl-main">
        <section className="panel cl-map-panel">
          <div className="cl-layers" role="group" aria-label="Capas del mapa">
            {CAPAS.map(({ id, label, color }) => (
              <label key={id} className={`cl-layer${capas[id] ? ' is-on' : ''}`} style={{ '--tone': color }}>
                <input type="checkbox" checked={capas[id]} onChange={() => setCapas((actual) => ({ ...actual, [id]: !actual[id] }))} />
                <i />{label}
              </label>
            ))}
          </div>
          <LogisticsMap
            key={theme}
            lots={lots}
            selectedLot={selectedLot}
            silobolsas={silobolsas}
            acopios={ACOPIOS_EJEMPLO}
            puertos={PUERTOS_GEO}
            fleteros={cercanos}
            destino={destinoPuerto}
            visible={capas}
            theme={theme}
            onSelectLot={onSelectLot}
          />
          <p className="cl-muted cl-map-note">Los acopios son datos de ejemplo: el sistema aún no tiene un padrón real. La línea dorada une el lote con el puerto recomendado.</p>
        </section>
        <div className="cl-side">
          <CicloTimeline lot={selectedLot} ventana={ventana} etapa={etapa} />
          <ClimaPanel clima={clima} sim={sim} ventana={ventana} />
        </div>
      </div>

      {sim?.decision && <PlanCamiones sim={sim} ofertas={ofertas} nombreLote={selectedLot?.name} reservas={reservas} onConfirmar={confirmarReservas} />}
      {sim?.decision && <ZonaLote decision={sim.decision} />}
      {sim?.decision && <Almanaque decision={sim.decision} nombreLote={selectedLot?.name} />}
      {sim?.decision?.economia && <EconomiaCampana economia={sim.decision.economia} nombreLote={selectedLot?.name} />}
      {sim?.decision?.errorEconomia && <div className="pd-aviso pd-aviso--alerta"><strong>No se pudo estimar la ganancia</strong> {sim.decision.errorEconomia}</div>}

      <div className="cl-two">
        <FleterosPanel cercanos={cercanos} resumen={resumen} cargado={ofertas !== false} />
        <SilobolsasPanel bolsas={bolsas || []} riesgos={riesgos} lots={lots} cargado={bolsas !== false} />
      </div>

      <div className="section-heading section-heading--standalone">
        <div><h3>Decisiones para {selectedLot?.name}</h3><p>Plan calculado solo con los datos de tu lote y de tu zona; si querés probar otros valores, usá el simulador.</p></div>
        <button type="button" className="button button--secondary button--small" onClick={() => onNavigate('despacho')}>Abrir simulador completo</button>
      </div>
      {!sembrado && <div className="panel compact-empty">El lote no tiene cultivo sembrado: sembralo en Gestionar lotes para calcular destino, flete y despacho.</div>}
      {simulando && <div className="loading-state" role="status">Calculando el plan logístico…</div>}
      {simError && <div className="pd-aviso pd-aviso--critico"><strong>No se pudo calcular el plan</strong> {simError}</div>}
      {sim && (
        <div className="pd-resultado">
          <Avisos avisos={sim.avisos} />
          <Destinos plan={sim.plan} />
          <Saturacion saturacion={sim.saturacion} ventana={sim.ventana} puerto={sim.puerto} />
          <Pedido pedidos={sim.plan.recomendado.pedidos} asignacion={sim.asignacion} />
        </div>
      )}
    </div>
  );
}
