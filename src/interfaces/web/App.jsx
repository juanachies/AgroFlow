import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import {
  Activity, CalendarRange, ChartNoAxesCombined, CloudSun, House, Map as MapIcon, Moon, Plus, Route,
  Sprout, Store, Sun, Wheat,
} from 'lucide-react';
import ChatBubble from './components/ChatBubble.jsx';
import { ForecastTable, WeatherChart } from './components/Charts.jsx';
import { BoundaryImport, SnapshotImport } from './components/DataImport.jsx';
import FieldDialog from './components/FieldDialog.jsx';
import {
  diasEnVentana,
  distanciaKm,
  nombreCultivo,
  promedio,
  ventanaDelLote,
} from './lib/data.js';
import {
  eliminarLote,
  eliminarSnapshot,
  guardarLote,
  guardarSnapshot,
  listarLotes,
  listarSnapshots,
} from './lib/storage.js';
import { api } from './lib/api.js';
import { useTheme } from './lib/theme.js';
import LogisticsPage from './pages/LogisticsPage.jsx';
import MarketplacePage from './pages/MarketplacePage.jsx';

const MapView = lazy(() => import('./components/MapView.jsx'));

const PAGES = [
  { id: 'summary', label: 'Resumen', icon: House, group: 'campo' },
  { id: 'lots', label: 'Lotes y mapa', icon: MapIcon, group: 'campo' },
  { id: 'planning', label: 'Planificación', icon: CalendarRange, group: 'campo' },
  { id: 'technical', label: 'Análisis técnico', icon: ChartNoAxesCombined, group: 'campo' },
  { id: 'logistics', label: 'Plan logístico', icon: Route, group: 'red' },
  { id: 'marketplace', label: 'Marketplace', icon: Store, group: 'red' },
];

function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <svg viewBox="0 0 32 32" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 22c6 0 8-4 12-4s6 4 12 4" />
        <path d="M4 27c6 0 8-4 12-4s6 4 12 4" opacity=".55" />
        <path d="M16 15V5" />
        <path d="M16 9c-3 0-5-2-5-5 3 0 5 2 5 5Z" fill="currentColor" stroke="none" />
        <path d="M16 12c3 0 5-2 5-5-3 0-5 2-5 5Z" fill="currentColor" stroke="none" />
      </svg>
    </span>
  );
}

function formatDate(value, options = { day: 'numeric', month: 'short', year: 'numeric' }) {
  if (!value) return 'Sin fecha';
  return new Intl.DateTimeFormat('es-AR', { ...options, timeZone: 'UTC' })
    .format(new Date(`${value.slice(0, 10)}T12:00:00Z`));
}

function formatNumber(value, digits = 1) {
  return new Intl.NumberFormat('es-AR', { maximumFractionDigits: digits }).format(value);
}

function LotSelector({ lots, selectedLot, onSelect }) {
  return (
    <label className="lot-select">
      <span>Lote activo</span>
      <select value={selectedLot?.id ?? ''} onChange={(event) => onSelect(event.target.value)} disabled={!lots.length}>
        {!lots.length && <option value="">Sin lotes</option>}
        {lots.map((lot) => <option key={lot.id} value={lot.id}>{lot.name}</option>)}
      </select>
    </label>
  );
}

function Header({ page, lots, selectedLot, onSelectLot, onCreate, theme, onToggleTheme }) {
  return (
    <header className="topbar">
      <div className="topbar-title">
        <span className="mobile-brand"><BrandMark /></span>
        <div>
          <div className="breadcrumbs">AgroFlow <span>/</span> {PAGES.find(({ id }) => id === page)?.label}</div>
          <h1>{PAGES.find(({ id }) => id === page)?.label}</h1>
        </div>
      </div>
      <div className="topbar-actions">
        <LotSelector lots={lots} selectedLot={selectedLot} onSelect={onSelectLot} />
        <button type="button" className="icon-button theme-toggle" onClick={onToggleTheme} aria-label={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'} title={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}>
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        <button type="button" className="button button--primary" onClick={onCreate} aria-label="Nuevo lote"><Plus size={16} aria-hidden="true" /> <span>Nuevo lote</span></button>
      </div>
    </header>
  );
}

function Sidebar({ page, onNavigate, apiStatus }) {
  return (
    <aside className="sidebar">
      <a className="brand" href="#" onClick={(event) => { event.preventDefault(); onNavigate('summary'); }}>
        <BrandMark />
        <span><strong>AgroFlow</strong><small>COSECHA · LOGÍSTICA</small></span>
      </a>
      <nav className="primary-nav" aria-label="Principal">
        {PAGES.map((item, index) => (<div key={item.id} className="nav-group">
          {(index === 0 || PAGES[index - 1].group !== item.group) && (
            <div className="sidebar-caption">{item.group === 'campo' ? 'MI CAMPO' : 'RED AGROFLOW'}</div>
          )}
          <button
            type="button"
            className={`nav-item${page === item.id ? ' is-active' : ''}`}
            onClick={() => onNavigate(item.id)}
            aria-current={page === item.id ? 'page' : undefined}
          >
            <item.icon className="nav-icon" size={18} aria-hidden="true" />
            {item.label}
          </button>
        </div>))}
      </nav>
      <div className="sidebar-bottom">
        <div className={`api-badge api-badge--${apiStatus}`}>
          <span />{apiStatus === 'ok' ? 'API conectada' : apiStatus === 'checking' ? 'Conectando API…' : 'API sin conexión'}
        </div>
        <p>{apiStatus === 'off' ? 'Corré npm run dev:api para usar marketplace y plan logístico.' : 'Lotes y snapshots se guardan en este navegador.'}</p>
        <div className="sidebar-version">AgroFlow · v0.2</div>
      </div>
    </aside>
  );
}

function PageIntro({ eyebrow, title, description, action }) {
  return (
    <div className="page-intro">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}

function EmptyState({ title, description, action, icon = '＋' }) {
  return (
    <div className="empty-state">
      <span className="empty-state-icon">{icon}</span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}

function MetricCard({ label, value, unit, detail, icon, tone = 'green' }) {
  return (
    <article className="metric-card">
      <div className={`metric-icon metric-icon--${tone}`} aria-hidden="true">{icon}</div>
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}<span>{unit}</span></div>
      <div className="metric-detail">{detail}</div>
    </article>
  );
}

function WindowTag({ lot }) {
  const window = ventanaDelLote(lot);
  if (!window) return <span className="status-pill status-pill--muted">Sin fecha de siembra</span>;
  return <span className="window-tag">{formatDate(window.inicio, { day: 'numeric', month: 'short' })} – {formatDate(window.fin, { day: 'numeric', month: 'short' })}</span>;
}

function SummaryPage({ lots, selectedLot, snapshots, onNavigate, onSelectLot, onCreate, theme }) {
  const area = lots.reduce((total, lot) => total + lot.areaHa, 0);
  const withWindow = lots.filter((lot) => lot.sowingDate).length;
  const withSnapshot = lots.filter((lot) => snapshots[lot.id]).length;
  const activeSnapshot = selectedLot ? snapshots[selectedLot.id]?.snapshot : null;
  const nextDays = activeSnapshot?.dailyForecast?.slice(0, 4) ?? [];

  return (
    <>
      <PageIntro
        eyebrow="CAMPAÑA ACTUAL"
        title="Decisiones claras, datos trazables."
        description="Organizá tus lotes y consultá la información disponible para planificar la cosecha."
        action={<span className="period-chip"><Activity size={14} aria-hidden="true" /> Campaña 2026/27</span>}
      />
      <div className="metrics-grid">
        <MetricCard label="Lotes registrados" value={lots.length} unit="" detail={lots.length ? 'Puntos geográficos cargados' : 'Agregá tu primer lote'} icon={<Sprout size={18} />} />
        <MetricCard label="Superficie total" value={formatNumber(area)} unit=" ha" detail={lots.some((lot) => lot.boundary) ? 'Medida en el mapa o declarada' : 'Ingresada manualmente'} icon={<MapIcon size={18} />} tone="blue" />
        <MetricCard label="Ventanas configuradas" value={withWindow} unit="" detail="Según fecha de siembra y ciclo" icon={<Wheat size={18} />} tone="amber" />
        <MetricCard label="Con datos de clima" value={withSnapshot} unit="" detail="Snapshots importados" icon={<CloudSun size={18} />} tone="violet" />
      </div>
      <div className="summary-main-grid">
        <div className="summary-map-column">
          <div className="section-heading">
            <div><h3>Vista de los lotes</h3><p>Ubicaciones y límites importados por vos</p></div>
            <button type="button" className="text-button" onClick={() => onNavigate('lots')}>Abrir mapa <span>→</span></button>
          </div>
          <MapView lots={lots} selectedLot={selectedLot} onSelectLot={onSelectLot} theme={theme} compact />
        </div>
        <section className="panel upcoming-panel">
          <div className="section-heading">
            <div><h3>Seguimiento de lotes</h3><p>Ventanas estimadas por ciclo</p></div>
            <span className="count-chip">{lots.length}</span>
          </div>
          {lots.length ? (
            <div className="lot-list">
              {lots.slice(0, 5).map((lot) => (
                <button className="lot-list-row" type="button" key={lot.id} onClick={() => { onSelectLot(lot.id); onNavigate('lots'); }}>
                  <span className="crop-avatar">{nombreCultivo(lot.crop).slice(0, 1)}</span>
                  <span className="lot-list-copy">
                    <strong>{lot.name}</strong>
                    <small>{nombreCultivo(lot.crop)} · {formatNumber(lot.areaHa)} ha</small>
                  </span>
                  <span className="lot-list-window"><WindowTag lot={lot} /><small>{snapshots[lot.id] ? 'Clima importado' : 'Sin snapshot'}</small></span>
                  <span className="row-chevron">›</span>
                </button>
              ))}
              {lots.length > 5 && <button className="text-button list-footer" type="button" onClick={() => onNavigate('lots')}>Ver los {lots.length} lotes →</button>}
            </div>
          ) : (
            <EmptyState
              title="Todavía no hay lotes"
              description="Agregá el nombre, cultivo y ubicación real para comenzar. Los polígonos se importan después."
              action={<button type="button" className="button button--primary button--small" onClick={onCreate}>＋ Agregar un lote</button>}
            />
          )}
        </section>
      </div>
      <div className="summary-bottom-grid">
        <section className="panel forecast-preview">
          <div className="section-heading">
            <div><h3>Pronóstico disponible</h3><p>{selectedLot ? `Punto de consulta · ${selectedLot.name}` : 'Importá un snapshot climático'}</p></div>
            <span className="source-chip">OPEN-METEO</span>
          </div>
          {nextDays.length ? (
            <div className="forecast-preview-list">
              {nextDays.map((day) => (
                <div className="forecast-preview-row" key={day.date}>
                  <span>{formatDate(day.date, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                  <strong>{Number.isFinite(day.temperatureMinC) && Number.isFinite(day.temperatureMaxC)
                    ? `${Math.round(day.temperatureMinC)}° / ${Math.round(day.temperatureMaxC)}°`
                    : 'Sin dato'}</strong>
                  <span>{Number.isFinite(day.precipitationMm) ? `${formatNumber(day.precipitationMm)} mm` : 'Sin dato'} lluvia</span>
                </div>
              ))}
              <p className="data-footnote">Pronóstico puntual/modelado · no es una medición del lote.</p>
            </div>
          ) : (
            <div className="compact-empty">No hay pronóstico importado para el lote seleccionado.</div>
          )}
        </section>
        <section className="panel planning-prompt">
          <div className="planning-prompt-icon">✳</div>
          <div>
            <span className="eyebrow">PLANIFICACIÓN</span>
            <h3>Cosecha y despacho sin colas.</h3>
            <p>Simulá el plan de tu lote: destino con mejor margen, maquinaria a pedir y proveedores del marketplace, evitando los días de puerto saturado.</p>
            <button type="button" className="text-button" onClick={() => onNavigate('logistics')}>Simular plan logístico <span>→</span></button>
          </div>
        </section>
      </div>
    </>
  );
}

function LotDetails({ lot, snapshotRecord, onBoundary, onSnapshot, onDelete }) {
  if (!lot) {
    return <EmptyState title="Seleccioná un lote" description="Elegí o creá un lote para ver sus datos y cargar límites o snapshots." />;
  }
  const snapshot = snapshotRecord?.snapshot;
  const window = ventanaDelLote(lot);

  return (
    <div className="lot-details">
      <div className="detail-title">
        <span className="crop-avatar crop-avatar--large">{nombreCultivo(lot.crop).slice(0, 1)}</span>
        <div><span className="eyebrow">{nombreCultivo(lot.crop)}</span><h2>{lot.name}</h2></div>
      </div>
      <div className="detail-stats">
        <div><span>{lot.boundary?.properties?.areaHa ? 'Superficie medida' : 'Superficie declarada'}</span><strong>{formatNumber(lot.areaHa, 2)} ha</strong></div>
        <div><span>Ciclo ingresado</span><strong>{lot.cycleDays} días</strong></div>
        <div><span>Fecha de siembra</span><strong>{formatDate(lot.sowingDate)}</strong></div>
        <div><span>Coordenadas del punto</span><strong>{lot.latitude.toFixed(4)}, {lot.longitude.toFixed(4)}</strong></div>
      </div>
      <div className="detail-block">
        <div className="detail-block-heading"><strong>Límite del lote</strong><span className={`status-pill ${lot.boundary ? 'status-pill--success' : 'status-pill--muted'}`}>{lot.boundary ? 'Cargado' : 'Pendiente'}</span></div>
        <p>{lot.boundary ? `Polígono ${lot.boundary.properties?.origen === 'dibujado en AgroFlow' ? 'dibujado en el mapa' : 'importado'}${lot.boundary.properties?.areaHa ? ` · superficie medida ${formatNumber(lot.boundary.properties.areaHa, 2)} ha` : ''}.` : 'Dibujá el límite en el mapa para medir la superficie, o importá un GeoJSON.'}</p>
        <BoundaryImport onImport={onBoundary} />
      </div>
      <div className="detail-block">
        <div className="detail-block-heading"><strong>Datos climáticos</strong><span className={`status-pill ${snapshot ? 'status-pill--success' : 'status-pill--muted'}`}>{snapshot ? 'Snapshot guardado' : 'Sin importar'}</span></div>
        {snapshot && <p>Consulta: {formatDate(snapshot.queriedAt)} · {snapshot.sourceStatus.successful?.length ?? 0} fuente(s) disponible(s).</p>}
        <SnapshotImport onImport={onSnapshot} />
      </div>
      <div className="detail-block">
        <strong>Ventana estimada de cosecha</strong>
        {window
          ? <p>{formatDate(window.inicio)} – {formatDate(window.fin)} · fecha central estimada {formatDate(window.optimo)}.</p>
          : <p>Agregá fecha de siembra para calcular un rango orientativo.</p>}
        <small>Estimación por duración del ciclo; no sustituye evaluación agronómica.</small>
      </div>
      <button type="button" className="danger-text-button" onClick={onDelete}>Eliminar lote y datos asociados</button>
    </div>
  );
}

function LotsPage({ lots, selectedLot, snapshots, onSelectLot, onBoundary, onSnapshot, onDelete, onCreate, onDrawnBoundary, onCreateFromDrawing, theme }) {
  return (
    <>
      <PageIntro
        eyebrow="EXPLORADOR"
        title="Lotes y mapa"
        description="Dibujá el límite de cada campo sobre el satélite y AgroFlow calcula su superficie."
        action={<button type="button" className="button button--primary button--small" onClick={onCreate}><Plus size={15} /> Nuevo lote</button>}
      />
      <div className="lots-workspace">
        <div className="lots-map-column">
          <MapView lots={lots} selectedLot={selectedLot} onSelectLot={onSelectLot} onSaveBoundary={onDrawnBoundary} onCreateFromDrawing={onCreateFromDrawing} theme={theme} />
          <div className="map-key"><span className="map-key-dot" /> Punto de lote <span className="map-key-line" /> Límite del lote <span className="map-key-line map-key-line--draft" /> Dibujo en curso</div>
        </div>
        <aside className="panel lot-sidebar-panel">
          {lots.length > 1 && (
            <div className="side-lot-picker">
              <label htmlFor="lot-detail-select">Lotes registrados</label>
              <select id="lot-detail-select" value={selectedLot?.id ?? ''} onChange={(event) => onSelectLot(event.target.value)}>
                {lots.map((lot) => <option key={lot.id} value={lot.id}>{lot.name}</option>)}
              </select>
            </div>
          )}
          {selectedLot ? (
            <LotDetails
              lot={selectedLot}
              snapshotRecord={snapshots[selectedLot.id]}
              onBoundary={(boundary) => onBoundary(selectedLot, boundary)}
              onSnapshot={(snapshot) => onSnapshot(selectedLot, snapshot)}
              onDelete={() => onDelete(selectedLot)}
            />
          ) : (
            <EmptyState title="Sin lotes cargados" description="Creá un lote con datos reales para ubicarlo en el mapa." action={<button type="button" className="button button--primary button--small" onClick={onCreate}>Agregar lote</button>} />
          )}
        </aside>
      </div>
    </>
  );
}

function SourceNote({ lot, snapshot }) {
  if (!snapshot) return null;
  const distance = distanciaKm(lot, snapshot.lote);
  return (
    <div className="data-source-note">
      <span className="source-note-icon">i</span>
      <p>
        Pronóstico de Open-Meteo consultado el <strong>{formatDate(snapshot.queriedAt)}</strong> para
        {' '}({snapshot.lote.latitude.toFixed(3)}, {snapshot.lote.longitude.toFixed(3)}), a
        {' '}{formatNumber(distance)} km del punto declarado del lote. Es un dato puntual/modelado,
        no una medición ni una capa del polígono.
      </p>
    </div>
  );
}

function PlanningPage({ lot, snapshotRecord, onSnapshot }) {
  const snapshot = snapshotRecord?.snapshot;
  const window = ventanaDelLote(lot);
  const days = diasEnVentana(snapshot?.dailyForecast, window);

  return (
    <>
      <PageIntro
        eyebrow="DECISIÓN AGRONÓMICA"
        title="Planificación de cosecha"
        description={lot ? `${lot.name} · ${nombreCultivo(lot.crop)} · ciclo declarado ${lot.cycleDays} días` : 'Seleccioná un lote para consultar su ventana estimada.'}
        action={lot ? <WindowTag lot={lot} /> : null}
      />
      {!lot ? (
        <EmptyState title="No hay un lote seleccionado" description="Agregá un lote desde el encabezado para generar su ventana orientativa." />
      ) : (
        <>
          <div className="planning-overview-grid">
            <section className="panel window-panel">
              <div className="section-heading"><div><span className="eyebrow">VENTANA ORIENTATIVA</span><h3>Rango de cosecha</h3></div><span className="window-symbol">◷</span></div>
              {window ? (
                <>
                  <div className="window-dates"><strong>{formatDate(window.inicio)}</strong><span>—</span><strong>{formatDate(window.fin)}</strong></div>
                  <div className="window-rail"><span /></div>
                  <div className="window-foot"><span>Inicio estimado</span><span>Centro · {formatDate(window.optimo)}</span><span>Fin estimado</span></div>
                  <div className="inline-note">Cálculo basado en fecha de siembra y ciclo configurado ({window.cicloDias} días). No es una recomendación de cosecha.</div>
                </>
              ) : (
                <div className="compact-empty">No hay fecha de siembra configurada.</div>
              )}
            </section>
            <section className="panel recommendation-panel">
              <span className="eyebrow">ESTADO DE DECISIÓN</span>
              <div className="decision-status"><span className="decision-status-dot" /> Sin evaluación de transitabilidad</div>
              <p>No se calcula probabilidad ni semáforo de cosecha. Los indicadores disponibles no están calibrados con mediciones de piso del lote.</p>
              <ul>
                <li>Sin capacidad portante medida en el lote</li>
                <li>Humedad de suelo disponible solo como modelo regional</li>
                <li>Sin modelo validado que convierta lluvia en transitabilidad</li>
              </ul>
            </section>
          </div>
          <div className="section-heading section-heading--standalone">
            <div><h3>Pronóstico durante la ventana</h3><p>Solo se muestran días cubiertos por el snapshot importado.</p></div>
            <SnapshotImport onImport={(data) => onSnapshot(lot, data)} />
          </div>
          {snapshot && <SourceNote lot={lot} snapshot={snapshot} />}
          {!snapshot ? (
            <EmptyState title="Falta importar el pronóstico" description="Generá un snapshot con el CLI del proyecto y cargá el archivo JSON para mostrar datos reales." />
          ) : days.length ? (
            <section className="panel"><ForecastTable days={days} /></section>
          ) : (
            <div className="panel compact-empty">El snapshot no tiene días que coincidan con esta ventana estimada. No se extrapolan datos.</div>
          )}
          <section className="panel explanation-panel">
            <div className="explanation-icon">i</div>
            <div><h3>Cómo interpretar esta vista</h3><p>El rango proviene del módulo de ventana de cosecha del proyecto y depende de la fecha de siembra y duración declarada del ciclo. El pronóstico es puntual y modelado. No se dispone de análisis de transitabilidad ni de una recomendación automática.</p></div>
          </section>
        </>
      )}
    </>
  );
}

function SourceStatus({ snapshot }) {
  const status = snapshot.sourceStatus;
  const successful = new Set(status.successful ?? []);
  const failed = new Map((status.failed ?? []).map(({ source, message }) => [source, message]));
  return (
    <section className="panel source-status-panel">
      <div className="section-heading"><div><h3>Fuentes del snapshot</h3><p>Estado registrado al momento de la consulta</p></div><span className="status-pill status-pill--muted">{status.quality ?? 'sin clasificar'}</span></div>
      <div className="source-status-list">
        {(status.requested ?? []).map((source) => (
          <div className="source-status-row" key={source}>
            <span className={`source-status-dot ${successful.has(source) ? 'is-success' : failed.has(source) ? 'is-failed' : ''}`} />
            <strong>{source}</strong>
            <span>{successful.has(source) ? 'Disponible' : failed.has(source) ? 'Falló' : 'No disponible'}</span>
            {failed.has(source) && <small>{failed.get(source)}</small>}
          </div>
        ))}
        {(status.notRequested ?? []).map((note) => (
          <div className="source-not-requested" key={note}><span>—</span>{note}</div>
        ))}
      </div>
      {snapshot.limitations?.length > 0 && (
        <div className="limitations-list"><strong>Limitaciones declaradas por la fuente</strong>{snapshot.limitations.map((limitation) => <p key={limitation}>{limitation}</p>)}</div>
      )}
    </section>
  );
}

function TechnicalPage({ lot, snapshotRecord }) {
  const snapshot = snapshotRecord?.snapshot;
  const series = snapshot?.dailyForecast ?? [];
  const points = useMemo(() => ({
    rain: series.map((day) => ({ date: day.date, value: day.precipitationMm })),
    temperature: series.map((day) => ({ date: day.date, value: day.temperatureMaxC })),
    soil: series.map((day) => ({
      date: day.date,
      value: promedio(Object.values(day.soilMoistureHourly ?? {}).flat()),
    })),
  }), [series]);

  return (
    <>
      <PageIntro
        eyebrow="DATOS Y PROCEDENCIA"
        title="Análisis técnico"
        description={lot ? `${lot.name} · observaciones del snapshot importado` : 'Seleccioná un lote para consultar las fuentes y variables.'}
        action={snapshot ? <span className="status-pill status-pill--success">Consulta {formatDate(snapshot.queriedAt)}</span> : null}
      />
      {!lot ? (
        <EmptyState title="No hay un lote seleccionado" description="Agregá o elegí un lote para ver datos técnicos." />
      ) : !snapshot ? (
        <EmptyState title="Sin datos técnicos importados" description="Importá un snapshot climático desde la vista Lotes y mapa. No se muestran valores sintéticos." icon="◌" />
      ) : (
        <>
          <SourceNote lot={lot} snapshot={snapshot} />
          <div className="technical-metrics">
            <div className="technical-metric"><span>Consultado</span><strong>{formatDate(snapshot.queriedAt)}</strong><small>Fecha registrada en snapshot</small></div>
            <div className="technical-metric"><span>Días pronosticados</span><strong>{series.length}</strong><small>Serie diaria disponible</small></div>
            <div className="technical-metric"><span>Fuentes consultadas</span><strong>{snapshot.sourceStatus.requested?.length ?? 0}</strong><small>{snapshot.sourceStatus.successful?.length ?? 0} disponibles</small></div>
            <div className="technical-metric"><span>Horizonte del pronóstico</span><strong>{series.length ? formatDate(series[0].date, { day: 'numeric', month: 'short' }) : '—'}</strong><small>Inicio de la serie</small></div>
          </div>
          <div className="technical-chart-grid">
            <WeatherChart title="Precipitación diaria" unit="mm" points={points.rain} color="blue" note="Pronóstico en el punto consultado" />
            <WeatherChart title="Temperatura máxima" unit="°C" points={points.temperature} color="amber" note="Pronóstico en el punto consultado" />
            <WeatherChart title="Humedad de suelo modelada" unit="m³/m³" points={points.soil} color="violet" note="Promedio de valores horarios disponibles" />
          </div>
          <div className="technical-bottom-grid">
            <SourceStatus snapshot={snapshot} />
            <section className="panel unavailable-panel">
              <span className="eyebrow">CAPAS NO DISPONIBLES</span>
              <h3>Sin raster procesado para este lote</h3>
              <p>Las búsquedas de productos o cotas puntuales no equivalen a capas espaciales del campo.</p>
              <div className="unavailable-item"><span>—</span> DEM, relieve y pendiente</div>
              <div className="unavailable-item"><span>—</span> Vegetación (NDVI u otros índices)</div>
              <div className="unavailable-item"><span>—</span> Lluvia, humedad y transitabilidad por polígono</div>
            </section>
          </div>
          <p className="technical-disclaimer">Los gráficos describen el snapshot importado; no son mediciones de campo ni una recomendación agronómica.</p>
        </>
      )}
    </>
  );
}

export default function App() {
  const [page, setPage] = useState('summary');
  const [lots, setLots] = useState([]);
  const [snapshots, setSnapshots] = useState({});
  const [selectedLotId, setSelectedLotId] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [loading, setLoading] = useState(true);
  const [storageError, setStorageError] = useState('');
  const [toast, setToast] = useState('');
  const [theme, toggleTheme] = useTheme();
  const [apiStatus, setApiStatus] = useState('checking');
  const [draftLot, setDraftLot] = useState(null);

  useEffect(() => {
    let alive = true;
    const check = () => api.salud().then(() => alive && setApiStatus('ok')).catch(() => alive && setApiStatus('off'));
    check();
    const id = window.setInterval(check, 30000);
    return () => { alive = false; window.clearInterval(id); };
  }, []);

  useEffect(() => {
    Promise.all([listarLotes(), listarSnapshots()])
      .then(([savedLots, savedSnapshots]) => {
        setLots(savedLots);
        setSnapshots(Object.fromEntries(savedSnapshots.map((record) => [record.lotId, record])));
        setSelectedLotId(savedLots[0]?.id ?? '');
      })
      .catch((error) => setStorageError(error.message || 'No se pudo leer el almacenamiento local.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const timeout = window.setTimeout(() => setToast(''), 3500);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const selectedLot = lots.find((lot) => lot.id === selectedLotId) ?? null;

  async function createLot(lot) {
    await guardarLote(lot);
    setLots((current) => [...current, lot]);
    setSelectedLotId(lot.id);
    setToast('Lote guardado en este navegador.');
  }

  async function saveBoundary(lot, boundary) {
    const updated = { ...lot, boundary };
    await guardarLote(updated);
    setLots((current) => current.map((item) => item.id === lot.id ? updated : item));
    setToast('Límite asignado al lote.');
  }

  async function saveDrawnBoundary(lot, feature, { ha, center }) {
    const boundary = { ...feature, properties: { ...feature.properties, areaHa: ha } };
    const updated = { ...lot, boundary, areaHa: Math.round(ha * 100) / 100, longitude: center[0], latitude: center[1] };
    await guardarLote(updated);
    setLots((current) => current.map((item) => item.id === lot.id ? updated : item));
    setToast(`Límite guardado · ${formatNumber(ha, 2)} ha medidas.`);
  }

  function createFromDrawing(feature, { ha, center }) {
    setDraftLot({
      areaHa: ha.toFixed(2),
      latitude: center[1].toFixed(6),
      longitude: center[0].toFixed(6),
      boundary: { ...feature, properties: { ...feature.properties, areaHa: ha } },
    });
    setShowCreateDialog(true);
  }

  async function saveSnapshot(lot, snapshot) {
    await guardarSnapshot(lot.id, snapshot);
    setSnapshots((current) => ({ ...current, [lot.id]: { lotId: lot.id, snapshot } }));
    setToast('Snapshot climático guardado.');
  }

  async function removeLot(lot) {
    if (!window.confirm(`¿Eliminar “${lot.name}” y sus datos asociados de este navegador?`)) return;
    await Promise.all([eliminarLote(lot.id), eliminarSnapshot(lot.id)]);
    const remaining = lots.filter((item) => item.id !== lot.id);
    setLots(remaining);
    if (selectedLotId === lot.id) setSelectedLotId(remaining[0]?.id ?? '');
    setSnapshots((current) => {
      const next = { ...current };
      delete next[lot.id];
      return next;
    });
    setToast('Lote y datos asociados eliminados.');
  }

  function navigate(nextPage) {
    setPage(nextPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#contenido">Saltar al contenido</a>
      <Sidebar page={page} onNavigate={navigate} apiStatus={apiStatus} />
      <main className="main-content" id="contenido">
        <Header
          page={page}
          lots={lots}
          selectedLot={selectedLot}
          onSelectLot={setSelectedLotId}
          onCreate={() => setShowCreateDialog(true)}
          theme={theme}
          onToggleTheme={toggleTheme}
        />
        {storageError && <div className="app-alert" role="alert">No se pudo abrir la base local: {storageError}. Recargá la página o probá otro navegador.</div>}
        {loading ? (
          <div className="loading-state" role="status">Cargando tus datos locales…</div>
        ) : (
          <div className="page-content">
            <Suspense fallback={<div className="loading-state" role="status">Cargando mapa…</div>}>
              {page === 'summary' && <SummaryPage lots={lots} selectedLot={selectedLot} snapshots={snapshots} onNavigate={navigate} onSelectLot={setSelectedLotId} onCreate={() => setShowCreateDialog(true)} theme={theme} />}
              {page === 'lots' && <LotsPage lots={lots} selectedLot={selectedLot} snapshots={snapshots} onSelectLot={setSelectedLotId} onBoundary={saveBoundary} onSnapshot={saveSnapshot} onDelete={removeLot} onCreate={() => setShowCreateDialog(true)} onDrawnBoundary={saveDrawnBoundary} onCreateFromDrawing={createFromDrawing} theme={theme} />}
              {page === 'planning' && <PlanningPage lot={selectedLot} snapshotRecord={selectedLot ? snapshots[selectedLot.id] : null} onSnapshot={saveSnapshot} />}
              {page === 'technical' && <TechnicalPage lot={selectedLot} snapshotRecord={selectedLot ? snapshots[selectedLot.id] : null} />}
              {page === 'logistics' && <LogisticsPage lot={selectedLot} onToast={setToast} onNavigate={navigate} />}
              {page === 'marketplace' && <MarketplacePage lot={selectedLot} onToast={setToast} onNavigate={navigate} />}
            </Suspense>
          </div>
        )}
      </main>
      {showCreateDialog && <FieldDialog initial={draftLot} onClose={() => { setShowCreateDialog(false); setDraftLot(null); }} onCreate={createLot} />}
      <ChatBubble lots={lots} selectedLot={selectedLot} onNavigate={navigate} />
      {toast && <div className="toast-message" role="status"><span>✓</span>{toast}</div>}
    </div>
  );
}
