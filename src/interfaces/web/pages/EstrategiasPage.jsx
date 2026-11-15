import { useEffect, useState } from 'react';
import { ArrowLeft, Compass, Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { api } from '../lib/api.js';

const numero = (valor) => new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(valor);
const usd = (valor) => (valor == null ? '—' : `US$ ${numero(valor)}`);
const fecha = (iso) => {
  if (!iso) return 'Sin fecha';
  return new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${iso.slice(0, 10)}T12:00:00Z`));
};
const diferencia = (valor) => (valor == null || valor >= 0 ? 'Es la mejor ganancia' : `−${usd(Math.abs(valor))}`);
const valorTexto = (valor) => (valor == null || valor === '' ? 'Sin dato' : String(valor));

const CATEGORIAS = [
  ['clima', 'Clima'],
  ['precio', 'Precio'],
  ['logistica', 'Logística'],
  ['grano', 'Grano'],
  ['almacenaje', 'Almacenaje'],
];

const TEXTO_CONFIANZA = { alta: 'Confianza alta', media: 'Confianza media', baja: 'Confianza baja' };

function IconoEfecto({ efecto }) {
  if (efecto === 'favorable') return <TrendingUp size={15} aria-hidden="true" />;
  if (efecto === 'desfavorable') return <TrendingDown size={15} aria-hidden="true" />;
  return <Minus size={15} aria-hidden="true" />;
}

function Aviso({ aviso }) {
  return (
    <div className="estrategia-aviso" role="note">
      {aviso && <p><strong>Aviso</strong> {aviso}</p>}
      <p>La decisión final es del productor y su agrónomo. El índice de confianza es una estimación con los datos disponibles, no una garantía.</p>
    </div>
  );
}

function TarjetaEstrategia({ estrategia, onElegir }) {
  const { indice, nivel } = estrategia.confianza;
  return (
    <button type="button" className="estrategia-card" onClick={() => onElegir(estrategia.id)}>
      <div className="estrategia-card-head">
        <h3>{estrategia.titulo}</h3>
        {estrategia.recomendadaPorModelo && <span className="estrategia-tag">Sugerida por el modelo</span>}
      </div>
      <p>{estrategia.resumen}</p>
      <div className="estrategia-card-datos">
        <div><span>Ganancia neta</span><strong>{usd(estrategia.gananciaNetaUSD)}</strong></div>
        <div><span>Fecha de cobro</span><strong>{fecha(estrategia.fechaCobro)}</strong></div>
      </div>
      <span className={`estrategia-confianza estrategia-confianza--${nivel}`}>{indice}% · {TEXTO_CONFIANZA[nivel] ?? nivel}</span>
      <span className="estrategia-card-link">Ver detalle →</span>
    </button>
  );
}

function DetalleEstrategia({ estrategia, onVolver }) {
  const { indice, nivel, explicacion } = estrategia.confianza;
  const factoresPorCategoria = CATEGORIAS
    .map(([id, label]) => ({ id, label, factores: estrategia.factores.filter((factor) => factor.categoria === id) }))
    .filter(({ factores }) => factores.length);

  return (
    <>
      <button type="button" className="estrategia-volver" onClick={onVolver}>
        <ArrowLeft size={16} aria-hidden="true" /> Volver a estrategias
      </button>

      <section className="panel estrategia-detalle">
        <div className="estrategia-detalle-head">
          <span className="eyebrow">DETALLE DE LA ESTRATEGIA</span>
          <h3>{estrategia.titulo}</h3>
          <p>{estrategia.accion}</p>
          {estrategia.recomendadaPorModelo && <span className="estrategia-tag">Sugerida por el modelo</span>}
        </div>

        <div className="estrategia-metricas">
          <div><span>Ganancia neta</span><strong>{usd(estrategia.gananciaNetaUSD)}</strong></div>
          <div><span>Diferencia vs la mejor</span><strong>{diferencia(estrategia.diferenciaVsMejorUSD)}</strong></div>
          <div><span>Fecha de cobro</span><strong>{fecha(estrategia.fechaCobro)}</strong></div>
        </div>

        <div className="estrategia-medidor">
          <div className="estrategia-medidor-cabeza">
            <strong>Índice de confianza · {indice}%</strong>
            <span className={`estrategia-confianza estrategia-confianza--${nivel}`}>{TEXTO_CONFIANZA[nivel] ?? nivel}</span>
          </div>
          <div
            className={`estrategia-medidor-barra estrategia-medidor-barra--${nivel}`}
            role="progressbar"
            aria-label="Índice de confianza"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={indice}
          >
            <span style={{ width: `${indice}%` }} />
          </div>
          <p>{explicacion}</p>
        </div>

        <div className="estrategia-seccion">
          <h4>Qué nos lleva a esta estrategia</h4>
          {factoresPorCategoria.map(({ id, label, factores }) => (
            <div key={id} className="estrategia-grupo">
              <span className="estrategia-grupo-titulo">{label}</span>
              <ul className="estrategia-factores">
                {factores.map((factor) => (
                  <li key={factor.id} className={`estrategia-factor estrategia-factor--${factor.efecto}`}>
                    <span className="estrategia-factor-icono"><IconoEfecto efecto={factor.efecto} /></span>
                    <div className="estrategia-factor-cuerpo">
                      <strong>{factor.nombre}</strong>
                      <span className="estrategia-factor-valor">{valorTexto(factor.valor)}</span>
                      <small>{factor.detalle}</small>
                      <small className="estrategia-factor-fuente">Fuente: {factor.fuente}</small>
                    </div>
                    <span className={`estrategia-factor-impacto estrategia-factor-impacto--${factor.impacto < 0 ? 'negativo' : factor.impacto > 0 ? 'positivo' : 'neutro'}`}>
                      {factor.impacto > 0 ? '+' : ''}{factor.impacto} pts
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {!factoresPorCategoria.length && <p className="cl-muted">No hay factores informados para esta estrategia.</p>}
        </div>

        <div className="estrategia-seccion">
          <h4>Supuestos</h4>
          <ul className="estrategia-supuestos">
            {(estrategia.supuestos ?? []).map((supuesto) => <li key={supuesto}>{supuesto}</li>)}
          </ul>
        </div>

        <p className="estrategia-pie">Información orientativa: no constituye asesoramiento ni asegura resultados.</p>
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
