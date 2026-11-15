import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, CircleDollarSign, Compass, Package, Sprout, Truck } from 'lucide-react';
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
const conFechasCortas = (texto) => (texto ? texto.replace(/\d{4}-\d{2}-\d{2}/g, (iso) => fechaCorta(iso)) : texto);

const TEXTO_CONFIANZA = { alta: 'Alta', media: 'Media', baja: 'Baja' };
const ICONO_ETAPA = { cosecha: Sprout, transporte: Truck, almacenaje: Package, venta: CircleDollarSign };

function Aviso({ aviso }) {
  const texto = aviso ? `${aviso} ` : '';
  return (
    <div className="estrategia-aviso" role="note">
      <p>{texto}<strong>La decisión final es del productor y su agrónomo.</strong></p>
    </div>
  );
}

function cadenaEtapas(etapas = []) {
  const [cosecha, transporte, almacenaje] = etapas;
  const partes = [];
  const fC = fechaCorta(cosecha?.fecha);
  if (fC) partes.push({ icono: Sprout, texto: `Cosecha ${fC}` });
  const destino = /llevar a ([^ ]+)/i.exec(transporte?.decision || '')?.[1];
  if (destino) {
    const fT = fechaCorta(transporte.fecha);
    partes.push({ icono: Truck, texto: fT ? `${destino} ${fT}` : destino });
  }
  if (/^silobolsa/i.test(almacenaje?.decision || '')) partes.push({ icono: Package, texto: almacenaje.decision });
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
  const resta = factor.impacto < 0;
  return (
    <li className={`estrategia-factor estrategia-factor--${resta ? 'resta' : 'neutro'}`}>
      <span className="estrategia-factor-nombre">
        {factor.nombre}
        {factor.valor != null && factor.valor !== '' && <em>{factor.valor}</em>}
      </span>
      <span className="estrategia-factor-puntos">{resta ? `−${Math.abs(factor.impacto)} pts` : '0 pts'}</span>
      <p className="estrategia-factor-detalle">{factor.detalle}</p>
    </li>
  );
}

function PasoEstrategia({ etapa }) {
  const Icono = ICONO_ETAPA[etapa.id] ?? Sprout;
  return (
    <li className="estrategia-paso">
      <div className="estrategia-paso-marca">
        <span className="estrategia-paso-icono"><Icono size={17} aria-hidden="true" /></span>
        <span className="estrategia-paso-linea" aria-hidden="true" />
      </div>
      <div className="estrategia-paso-cuerpo">
        <span className="estrategia-paso-etapa">{etapa.titulo}</span>
        <strong className="estrategia-paso-decision">{conFechasCortas(etapa.decision)}</strong>
        {etapa.detalle && <p className="estrategia-paso-detalle">{conFechasCortas(etapa.detalle)}</p>}
      </div>
    </li>
  );
}

function ConfianzaEstrategia({ confianza, factores }) {
  const { indice, nivel, explicacion } = confianza;
  const restan = factores.filter((f) => f.impacto < 0).sort((a, b) => a.impacto - b.impacto);
  const sinEfecto = factores.filter((f) => f.impacto >= 0);
  const totalRestado = restan.reduce((suma, f) => suma + Math.abs(f.impacto), 0);
  const fuentes = [...new Set(factores.map((f) => f.fuente).filter(Boolean))];
  return (
    <section className="estrategia-bloque" aria-label="Por qué esta confianza">
      <h4>Por qué esta confianza</h4>
      <div className="estrategia-cuenta">
        <span>Restan <strong>−{totalRestado} pts</strong></span>
        <span className={`estrategia-confianza estrategia-confianza--${nivel}`}>{indice}% · {TEXTO_CONFIANZA[nivel] ?? nivel}</span>
      </div>
      {explicacion && <p className="estrategia-bloque-ayuda">{explicacion}</p>}
      {restan.length > 0 && <ul className="estrategia-factores">{restan.map((f) => <FilaFactor key={f.id} factor={f} />)}</ul>}
      {sinEfecto.length > 0 && (
        <details className="estrategia-sin-efecto">
          <summary>{sinEfecto.length} {sinEfecto.length === 1 ? 'factor sin efecto' : 'factores sin efecto'}</summary>
          <ul className="estrategia-factores">{sinEfecto.map((f) => <FilaFactor key={f.id} factor={f} />)}</ul>
        </details>
      )}
      {fuentes.length > 0 && <p className="estrategia-fuentes">Fuentes: {fuentes.join(' · ')}.</p>}
    </section>
  );
}

function DetalleEstrategia({ estrategia, onVolver }) {
  const { indice, nivel } = estrategia.confianza;
  const etapas = estrategia.etapas ?? [];

  return (
    <>
      <button type="button" className="estrategia-volver" onClick={onVolver}>
        <ArrowLeft size={16} aria-hidden="true" /> Volver
      </button>

      <section className="panel estrategia-detalle">
        <div className="estrategia-detalle-head">
          <div className="estrategia-titulo-fila">
            <h3>{estrategia.titulo}</h3>
            {estrategia.recomendadaPorModelo && <span className="estrategia-tag">Sugerida</span>}
          </div>
          {estrategia.accion && <p>{estrategia.accion}</p>}
        </div>

        <div className="estrategia-kpis" role="group" aria-label="Resumen">
          <span className="estrategia-kpi"><span>Ganancia neta</span><strong>{usd(estrategia.gananciaNetaUSD)}</strong></span>
          <span className="estrategia-kpi"><span>Frente a la mejor</span><strong>{diferencia(estrategia.diferenciaVsMejorUSD)}</strong></span>
          <span className={`estrategia-kpi estrategia-kpi--conf estrategia-confianza--${nivel}`}>
            <span>Confianza</span><strong>{indice}% · {TEXTO_CONFIANZA[nivel] ?? nivel}</strong>
          </span>
        </div>

        <section className="estrategia-bloque" aria-label="Paso a paso">
          <h4>Paso a paso</h4>
          <ol className="estrategia-pasos">
            {etapas.map((etapa) => <PasoEstrategia key={etapa.id} etapa={etapa} />)}
          </ol>
        </section>

        <ConfianzaEstrategia confianza={estrategia.confianza} factores={estrategia.factores ?? []} />
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
