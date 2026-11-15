import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, CircleDollarSign, Compass, Minus, Package, Sprout, TrendingDown, TrendingUp, Truck } from 'lucide-react';
import { api } from '../lib/api.js';

const numero = (valor) => new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(valor);
const usd = (valor) => (valor == null ? '—' : `US$ ${numero(valor)}`);
const fecha = (iso) => {
  if (!iso) return 'Sin fecha';
  return new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${iso.slice(0, 10)}T12:00:00Z`));
};
const fechaCorta = (iso) => {
  if (!iso) return null;
  return new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', timeZone: 'UTC' })
    .format(new Date(`${iso.slice(0, 10)}T12:00:00Z`));
};
const diferencia = (valor) => (valor == null || valor >= 0 ? 'Es la mejor' : `−${usd(Math.abs(valor))}`);
const valorTexto = (valor) => (valor == null || valor === '' ? 'Sin dato' : String(valor));

const TEXTO_CONFIANZA = { alta: 'Alta', media: 'Media', baja: 'Baja' };
const ICONO_ETAPA = { cosecha: Sprout, transporte: Truck, almacenaje: Package, venta: CircleDollarSign };

function IconoEfecto({ efecto }) {
  if (efecto === 'favorable') return <TrendingUp size={14} aria-hidden="true" />;
  if (efecto === 'desfavorable') return <TrendingDown size={14} aria-hidden="true" />;
  return <Minus size={14} aria-hidden="true" />;
}

function Aviso({ aviso }) {
  const texto = aviso ? `${aviso} ` : '';
  return (
    <div className="estrategia-aviso" role="note">
      <p>{texto}<strong>La decisión final es del productor y su agrónomo.</strong></p>
    </div>
  );
}

function cadenaEtapas(etapas = []) {
  const [cosecha, transporte, , venta] = etapas;
  const partes = [];
  const fC = fechaCorta(cosecha?.fecha);
  if (fC) partes.push({ icono: Sprout, texto: `Cosecha ${fC}` });
  if (transporte) {
    const fT = fechaCorta(transporte.fecha);
    const dif = (transporte.decision || '').toLowerCase().includes('sin transporte');
    if (!dif) {
      const dest = /llevar a ([^ ]+)/i.exec(transporte.decision || '')?.[1];
      if (dest && fT) partes.push({ icono: Truck, texto: `${dest} ${fT}` });
      else if (dest) partes.push({ icono: Truck, texto: dest });
    }
  }
  const fV = fechaCorta(venta?.fecha);
  if (fV) partes.push({ icono: CircleDollarSign, texto: `Cobro ${fV}` });
  return partes;
}

function TarjetaEstrategia({ estrategia, onElegir }) {
  const { indice, nivel } = estrategia.confianza;
  const cadena = cadenaEtapas(estrategia.etapas);
  return (
    <button type="button" className="estrategia-card" onClick={() => onElegir(estrategia.id)}>
      <div className="estrategia-card-head">
        <h3>{estrategia.titulo}</h3>
        {estrategia.recomendadaPorModelo && <span className="estrategia-tag">Sugerida</span>}
      </div>
      {cadena.length > 0 && (
        <p className="estrategia-cadena" aria-label="Cadena de etapas">
          {cadena.map((p, i) => {
            const Icono = p.icono;
            return (
              <span key={i} className="estrategia-cadena-paso">
                <Icono size={13} aria-hidden="true" /> {p.texto}
                {i < cadena.length - 1 && <ArrowRight size={12} className="estrategia-cadena-sep" aria-hidden="true" />}
              </span>
            );
          })}
        </p>
      )}
      <div className="estrategia-card-datos">
        <div><span>Ganancia neta</span><strong>{usd(estrategia.gananciaNetaUSD)}</strong></div>
        <div><span>Cobro</span><strong>{fecha(estrategia.fechaCobro)}</strong></div>
      </div>
      <span className={`estrategia-confianza estrategia-confianza--${nivel}`}>{indice}% · {TEXTO_CONFIANZA[nivel] ?? nivel}</span>
    </button>
  );
}

function FilaFactor({ factor }) {
  return (
    <li className={`estrategia-factor estrategia-factor--${factor.efecto}`}>
      <div className="estrategia-factor-linea">
        <span className="estrategia-factor-icono"><IconoEfecto efecto={factor.efecto} /></span>
        <span className="estrategia-factor-nombre">{factor.nombre}</span>
        <span className="estrategia-factor-valor">{valorTexto(factor.valor)}</span>
        <span className={`estrategia-factor-impacto estrategia-factor-impacto--${factor.impacto < 0 ? 'negativo' : 'neutro'}`}>{factor.impacto} pts</span>
      </div>
      <div className="estrategia-factor-extra">
        <small>{factor.detalle}</small>
        <small className="estrategia-factor-fuente">Fuente: {factor.fuente}</small>
      </div>
    </li>
  );
}

function PanelEtapa({ etapa, factores }) {
  const deEtapa = (etapa.factores || []).map((id) => factores.find((f) => f.id === id)).filter(Boolean);
  const conEfecto = deEtapa.filter((f) => f.impacto !== 0);
  const sinEfecto = deEtapa.filter((f) => f.impacto === 0);
  return (
    <div className="estrategia-etapa-panel">
      <div className="estrategia-etapa-panel-head">
        <strong>{etapa.decision}</strong>
        {etapa.fecha && <span>{fecha(etapa.fecha)}</span>}
      </div>
      {etapa.detalle && <p className="estrategia-etapa-detalle">{etapa.detalle}</p>}
      {conEfecto.length > 0 && <ul className="estrategia-factores">{conEfecto.map((f) => <FilaFactor key={f.id} factor={f} />)}</ul>}
      {sinEfecto.length > 0 && (
        <details className="estrategia-sin-efecto">
          <summary>{sinEfecto.length} {sinEfecto.length === 1 ? 'factor sin efecto' : 'factores sin efecto'}</summary>
          <ul className="estrategia-factores">{sinEfecto.map((f) => <FilaFactor key={f.id} factor={f} />)}</ul>
        </details>
      )}
      {!deEtapa.length && <p className="estrategia-etapa-detalle">Sin factores para esta etapa.</p>}
    </div>
  );
}

function DetalleEstrategia({ estrategia, onVolver }) {
  const { indice, nivel, explicacion } = estrategia.confianza;
  const etapas = estrategia.etapas ?? [];
  const [activa, setActiva] = useState(etapas[0]?.id ?? null);
  useEffect(() => { setActiva(etapas[0]?.id ?? null); }, [estrategia.id]);
  const etapaActiva = etapas.find((e) => e.id === activa) ?? etapas[0];

  return (
    <>
      <button type="button" className="estrategia-volver" onClick={onVolver}>
        <ArrowLeft size={16} aria-hidden="true" /> Volver
      </button>

      <section className="panel estrategia-detalle">
        <div className="estrategia-detalle-head">
          <h3>{estrategia.titulo}</h3>
          {estrategia.recomendadaPorModelo && <span className="estrategia-tag">Sugerida</span>}
        </div>

        <div className="estrategia-kpis" role="group" aria-label="Resumen">
          <span className="estrategia-kpi"><span>Ganancia</span><strong>{usd(estrategia.gananciaNetaUSD)}</strong></span>
          <span className="estrategia-kpi"><span>Diferencia</span><strong>{diferencia(estrategia.diferenciaVsMejorUSD)}</strong></span>
          <span className="estrategia-kpi"><span>Cobro</span><strong>{fecha(estrategia.fechaCobro)}</strong></span>
          <span className={`estrategia-kpi estrategia-kpi--conf estrategia-confianza--${nivel}`}>
            <span>Confianza</span><strong>{indice}% {TEXTO_CONFIANZA[nivel] ?? nivel}</strong>
          </span>
        </div>

        <nav className="estrategia-stepper" aria-label="Etapas">
          {etapas.map((etapa, i) => {
            const Icono = ICONO_ETAPA[etapa.id] ?? Sprout;
            const esActiva = etapa.id === etapaActiva?.id;
            return (
              <div key={etapa.id} className="estrategia-step-wrap">
                <button
                  type="button"
                  className={`estrategia-step${esActiva ? ' is-activa' : ''}`}
                  aria-current={esActiva ? 'step' : undefined}
                  onClick={() => setActiva(etapa.id)}
                >
                  <span className="estrategia-step-icono"><Icono size={16} aria-hidden="true" /></span>
                  <span className="estrategia-step-texto">
                    <span className="estrategia-step-titulo">{etapa.titulo}</span>
                    <span className="estrategia-step-decision">{etapa.decision}</span>
                    {etapa.fecha && <span className="estrategia-step-fecha">{fecha(etapa.fecha)}</span>}
                  </span>
                </button>
                {i < etapas.length - 1 && <span className="estrategia-step-conector" aria-hidden="true" />}
              </div>
            );
          })}
        </nav>

        {etapaActiva && <PanelEtapa etapa={etapaActiva} factores={estrategia.factores ?? []} />}

        <details className="estrategia-supuestos-det">
          <summary>Supuestos del cálculo</summary>
          <ul className="estrategia-supuestos">
            {(estrategia.supuestos ?? []).map((supuesto) => <li key={supuesto}>{supuesto}</li>)}
          </ul>
        </details>

        {explicacion && <p className="estrategia-explicacion">{explicacion}</p>}
      </section>
    </>
  );
}

export default function EstrategiasPage({ lot }) {
  const [resultado, setResultado] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [elegidaId, setElegidaId] = useState(null);

  const lotId = lot?.id;
  const sembrado = Boolean(lot?.crop && lot?.sowingDate);

  useEffect(() => {
    setResultado(null);
    setError('');
    setElegidaId(null);
    if (!lot || !sembrado) {
      setCargando(false);
      return undefined;
    }
    let vivo = true;
    setCargando(true);
    api.decisionLote({
      id: lot.id, lat: lot.latitude, lon: lot.longitude, ha: lot.areaHa,
      cultivo: lot.crop, fechaSiembra: lot.sowingDate, cycleDays: lot.cycleDays,
    })
      .then((datos) => vivo && setResultado(datos))
      .catch((reason) => vivo && setError(reason.message))
      .finally(() => vivo && setCargando(false));
    return () => { vivo = false; };
    // La consulta depende del lote activo y de su siembra, no de cada edición menor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lotId, lot?.crop, lot?.sowingDate, lot?.cycleDays]);

  const estrategias = resultado?.estrategias;
  const aviso = estrategias?.aviso;
  const elegida = elegidaId ? estrategias?.estrategias?.find((estrategia) => estrategia.id === elegidaId) : null;

  return (
    <div className="estrategia-page">
      <div className="page-intro">
        <div>
          <span className="eyebrow">ESTRATEGIA Y DECISIONES</span>
          <h2>{lot?.name ?? 'Sin lote'} · qué hacer con la cosecha</h2>
          <p>Estrategias comparadas por ganancia neta y confianza según los datos disponibles del lote.</p>
        </div>
      </div>

      <Aviso aviso={aviso} />

      {!lot && (
        <div className="empty-state">
          <span className="empty-state-icon"><Compass size={22} /></span>
          <h3>No hay un lote seleccionado</h3>
          <p>Elegí o creá un lote para ver sus estrategias de venta y el nivel de confianza.</p>
        </div>
      )}

      {lot && !sembrado && (
        <div className="empty-state">
          <span className="empty-state-icon"><Compass size={22} /></span>
          <h3>Sin cultivo sembrado</h3>
          <p>Sembrá un cultivo en Gestionar lotes para calcular estrategias, ganancia y confianza.</p>
        </div>
      )}

      {lot && sembrado && cargando && <div className="loading-state" role="status">Calculando estrategias…</div>}

      {lot && sembrado && !cargando && error && (
        <div className="estrategia-alerta" role="alert"><strong>No se pudieron calcular las estrategias</strong> {error}</div>
      )}

      {lot && sembrado && !cargando && !error && estrategias?.error && (
        <div className="estrategia-alerta" role="alert"><strong>No se pudieron calcular las estrategias</strong> {estrategias.error}</div>
      )}

      {lot && sembrado && !cargando && !error && !estrategias?.error && !elegida && (
        estrategias?.estrategias?.length ? (
          <div className="estrategia-grilla">
            {estrategias.estrategias.map((estrategia) => (
              <TarjetaEstrategia key={estrategia.id} estrategia={estrategia} onElegir={setElegidaId} />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <span className="empty-state-icon"><Compass size={22} /></span>
            <h3>Sin estrategias para este lote</h3>
            <p>La API no devolvió estrategias. Revisá que el lote tenga economía calculada y volvé a intentarlo.</p>
          </div>
        )
      )}

      {lot && sembrado && !cargando && !error && elegida && (
        <DetalleEstrategia estrategia={elegida} onVolver={() => setElegidaId(null)} />
      )}
    </div>
  );
}
