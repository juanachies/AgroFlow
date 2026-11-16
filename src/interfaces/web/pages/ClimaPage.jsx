import { useEffect, useId, useMemo, useState } from 'react';
import { consultarClimaLotes, formatearValor, resumenVariable, valorEnUnidadMostrada, VARIABLES_CLIMA } from '../lib/climaTiempoReal.js';

const NUM = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 });
const HORA = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' });

function claveVariable(punto, variableId) {
  if (variableId === 'humedadAire') return 'humedadAire';
  if (variableId === 'humedadSuelo') return 'humedadSuelo';
  return variableId;
}

function valorPunto(punto, variableId) {
  return valorEnUnidadMostrada(variableId, punto[claveVariable(punto, variableId)]);
}

function textoRango(extremo, variableId) {
  if (!extremo) return '—';
  return `${formatearValor(variableId, extremo.minimo)} / ${formatearValor(variableId, extremo.maximo)}`;
}

function kpis(resumen, variableId) {
  const base = [{ etiqueta: 'Actual', valor: formatearValor(variableId, resumen.actual) }];
  if (variableId === 'precipitacion') {
    return [
      ...base,
      { etiqueta: 'Acumulado 24 h', valor: `${NUM.format(resumen.acumulado24 ?? 0)} mm` },
      { etiqueta: 'Próx. 48 h', valor: `${NUM.format(resumen.acumulado48 ?? 0)} mm · ${NUM.format(resumen.probabilidadMaxima48 ?? 0)}% máx.` },
    ];
  }
  if (variableId === 'viento') {
    return [
      ...base,
      { etiqueta: 'Ráfaga 24 h máx.', valor: formatearValor('viento', resumen.rafaga24) },
      { etiqueta: 'Ráfaga 48 h máx.', valor: formatearValor('viento', resumen.rafaga48) },
    ];
  }
  return [
    ...base,
    { etiqueta: 'Mín / máx 24 h', valor: textoRango(resumen.extremo24, variableId) },
    { etiqueta: 'Mín / máx 48 h', valor: textoRango(resumen.extremo48, variableId) },
  ];
}

function tabla24h(resumen, variableId) {
  if (variableId === 'precipitacion') return `${NUM.format(resumen.acumulado24 ?? 0)} mm`;
  if (variableId === 'viento') return formatearValor('viento', resumen.rafaga24);
  return textoRango(resumen.extremo24, variableId);
}

function interpretacion(variableId, resumen) {
  if (variableId === 'precipitacion') {
    return (resumen.acumulado24 ?? 0) > 5
      ? 'Más de 5 mm en 24 h: suelo probablemente no transitable para cosechar.'
      : 'Menos de 5 mm en 24 h: poca lluvia reciente; verificar piso antes de entrar.';
  }
  if (variableId === 'humedadSuelo') {
    const actual = valorEnUnidadMostrada('humedadSuelo', resumen.actual);
    if (actual != null && actual >= 35) return 'Humedad de suelo alta: riesgo de huella y compactación al cosechar.';
    if (actual != null && actual <= 15) return 'Suelo seco: mejor transitabilidad, vigilar polvo y pérdida de grano.';
    return 'Humedad de suelo intermedia: evaluar transitabilidad en el lote antes de cosechar.';
  }
  if (variableId === 'viento') {
    const rafaga = Math.max(resumen.rafaga48 ?? 0, resumen.rafagaActual ?? 0);
    return rafaga >= 30
      ? 'Ráfagas de 30 km/h o más: condición riesgosa para cosechar; evaluar suspensión.'
      : 'Ráfagas bajo 30 km/h: viento en rango operativo para cosecha, confirmar en campo.';
  }
  if (variableId === 'temperatura') {
    const max48 = resumen.extremo48?.maximo ?? resumen.actual;
    return max48 != null && max48 >= 35
      ? 'Calor alto esperado: planificar cosecha en horas frescas y cuidar el grano.'
      : 'Temperatura sin extremo térmico alto en 48 h: sin alerta térmica marcada.';
  }
  const actual = resumen.actual ?? 0;
  return actual >= 75
    ? 'Humedad del aire alta: el grano puede demorar en secar; controlar humedad de cosecha.'
    : 'Humedad del aire moderada: condición favorable para el secado natural del grano.';
}

function GraficoHorario({ puntos, indiceAhora, variableId, unidad }) {
  const valores = puntos.map((punto) => valorPunto(punto, variableId));
  const finitos = valores.filter(Number.isFinite);
  if (!finitos.length) return <div className="clima-chart-empty">Sin datos horarios.</div>;
  const min = Math.min(...finitos);
  const max = Math.max(...finitos);
  const pad = (max - min) * 0.15 || 1;
  const yMin = min - pad;
  const yMax = max + pad;
  const w = 600;
  const h = 160;
  const m = { top: 12, right: 12, bottom: 28, left: 40 };
  const iw = w - m.left - m.right;
  const ih = h - m.top - m.bottom;
  const x = (i) => m.left + (i / Math.max(1, puntos.length - 1)) * iw;
  const y = (v) => m.top + ih - ((v - yMin) / (yMax - yMin || 1)) * ih;
  const coords = valores.map((v, i) => (Number.isFinite(v) ? [x(i), y(v)] : null)).filter(Boolean);
  const path = coords.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)} ${py.toFixed(1)}`).join(' ');
  const ticks = [0, Math.floor((puntos.length - 1) / 2), puntos.length - 1];
  const yTicks = [yMax, (yMin + yMax) / 2, yMin];
  const nowX = x(indiceAhora);
  return (
    <svg className="clima-chart" viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Gráfico horario 24 horas pasadas y 48 próximas">
      <line x1={m.left} y1={m.top} x2={m.left} y2={m.top + ih} className="clima-axis" />
      <line x1={m.left} y1={m.top + ih} x2={m.left + iw} y2={m.top + ih} className="clima-axis" />
      {yTicks.map((tick, i) => {
        const yy = m.top + (i / 2) * ih;
        return (
          <g key={i}>
            <line x1={m.left} y1={yy} x2={m.left + iw} y2={yy} className="clima-grid" />
            <text x={m.left - 4} y={yy + 4} textAnchor="end" className="clima-tick">{NUM.format(tick)}</text>
          </g>
        );
      })}
      <text x={m.left - 4} y={m.top - 2} textAnchor="end" className="clima-tick">{unidad}</text>
      <line x1={nowX} y1={m.top} x2={nowX} y2={m.top + ih} className="clima-now" />
      <text x={nowX} y={m.top + ih + 20} textAnchor="middle" className="clima-now-label">Ahora</text>
      {path && <path d={path} className="clima-line" />}
      {coords.map(([px, py], i) => <circle key={i} cx={px} cy={py} r="2" className="clima-dot" />)}
      {ticks.map((i) => (
        <text key={i} x={x(i)} y={m.top + ih + 11} textAnchor="middle" className="clima-tick">
          {HORA.format(new Date(puntos[i].hora))}
        </text>
      ))}
    </svg>
  );
}

export default function ClimaPage({ lots, selectedLot, initialVariable, onSelectLot }) {
  const uid = useId();
  const variableInicial = VARIABLES_CLIMA.some(({ id }) => id === initialVariable) ? initialVariable : 'precipitacion';
  const [variableId, setVariableId] = useState(variableInicial);
  const [estado, setEstado] = useState({ datos: null, cargando: true, error: '' });

  useEffect(() => {
    setVariableId(variableInicial);
  }, [variableInicial]);

  useEffect(() => {
    let vivo = true;
    setEstado({ datos: null, cargando: true, error: '' });
    consultarClimaLotes(lots)
      .then((datos) => { if (vivo) setEstado({ datos, cargando: false, error: '' }); })
      .catch((fallo) => { if (vivo) setEstado({ datos: null, cargando: false, error: fallo.message || 'No se pudo consultar el clima.' }); });
    return () => { vivo = false; };
  }, [lots]);

  const porLote = useMemo(
    () => new Map((estado.datos?.lotes ?? []).map((item) => [item.loteId, item])),
    [estado.datos],
  );
  const activo = selectedLot ? porLote.get(selectedLot.id) : null;
  const resumen = activo ? resumenVariable(activo, variableId) : null;
  const variable = VARIABLES_CLIMA.find(({ id }) => id === variableId) ?? VARIABLES_CLIMA[0];

  if (estado.cargando) return <div className="loading-state" role="status">Consultando clima en vivo…</div>;
  if (estado.error) return <div className="app-alert" role="alert">{estado.error}</div>;
  if (!selectedLot || !activo || !resumen) return <div className="panel compact-empty">No hay datos de clima para el lote activo.</div>;

  return (
    <div className="clima-page">
      <div className="clima-tabs" role="tablist" aria-label="Variables de clima">
        {VARIABLES_CLIMA.map((item) => {
          const selected = item.id === variableId;
          const tabId = `${uid}-tab-${item.id}`;
          const panelId = `${uid}-panel-${item.id}`;
          return (
            <button
              key={item.id}
              id={tabId}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={panelId}
              tabIndex={selected ? 0 : -1}
              className={`clima-tab${selected ? ' is-active' : ''}`}
              onClick={() => setVariableId(item.id)}
            >
              {item.titulo}
            </button>
          );
        })}
      </div>

      <section
        id={`${uid}-panel-${variableId}`}
        role="tabpanel"
        aria-labelledby={`${uid}-tab-${variableId}`}
        className="clima-panel"
      >
        <div className="clima-kpis">
          {kpis(resumen, variableId).map((item) => (
            <div key={item.etiqueta} className="clima-kpi">
              <span>{item.etiqueta}</span>
              <strong>{item.valor}</strong>
            </div>
          ))}
        </div>

        <div className="clima-block">
          <div className="clima-block-head">
            <h3>{variable.titulo} · últimas 24 h y próximas 48 h</h3>
            <span className="clima-unit">Unidad: {variable.unidad}</span>
          </div>
          <GraficoHorario puntos={resumen.puntos} indiceAhora={resumen.indiceAhora} variableId={variableId} unidad={variable.unidad} />
        </div>

        <div className="clima-block">
          <h3>Todos los lotes</h3>
          <div className="table-scroll">
            <table className="clima-table">
              <thead>
                <tr><th>Lote</th><th>Actual</th><th>24 h</th></tr>
              </thead>
              <tbody>
                {lots.map((lote) => {
                  const item = porLote.get(lote.id);
                  const r = item ? resumenVariable(item, variableId) : null;
                  const actual = r?.actual ?? null;
                  return (
                    <tr key={lote.id} className={lote.id === selectedLot.id ? 'is-active' : ''} onClick={() => onSelectLot(lote.id)}>
                      <td><button type="button" className="clima-lote-link">{lote.name}</button></td>
                      <td><span className="clima-dot-value" style={{ '--clima-color': r ? `var(--clima-color, ${'#94a3b8'})` : '#94a3b8', color: r ? undefined : 'inherit' }}><i style={{ background: r ? (formatearValor(variableId, actual) === '—' ? '#94a3b8' : undefined) : '#94a3b8' }} />{r ? formatearValor(variableId, actual) : '—'}</span></td>
                      <td>{r ? tabla24h(r, variableId) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <p className="clima-interpretacion">{interpretacion(variableId, resumen)}</p>
        <p className="clima-fuente">Open-Meteo, modelo, no medición en el lote.</p>
      </section>
    </div>
  );
}
