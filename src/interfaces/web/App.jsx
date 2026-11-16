import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, ChartNoAxesCombined, CloudSun, Compass, House, LayoutDashboard, Map as MapIcon, Moon, Package, Plus, Route,
  Sprout, Store, Sun, UserRound, Wheat,
} from 'lucide-react';
import ChatBubble from './components/ChatBubble.jsx';
import { ForecastTable, WeatherChart } from './components/Charts.jsx';
import ConfirmDialog from './components/ConfirmDialog.jsx';
import LotDialog from './components/LotDialog.jsx';
import SowingDialog from './components/SowingDialog.jsx';
import {
  diasEnVentana,
  distanciaKm,
  nombreCultivo,
  nombreVariedad,
  quitarSiembra,
  ventanaDelLote,
} from './lib/data.js';
import {
  eliminarLote,
  guardarLote,
  listarLotes,
} from './lib/storage.js';
import { api } from './lib/api.js';
import { pronosticoDelLote } from './lib/climaAutomatico.js';
import {
  cargarSilobolsasDeEjemplo, ejemploYaCargado, esLoteDeEjemplo, lotesDeEjemplo, marcarEjemploCargado,
} from './lib/productorEjemplo.js';
import { useTheme } from './lib/theme.js';
import { getHomePageForRole, getWorkspacePages } from './lib/workspacePages.js';
import AccountPage from './pages/AccountPage.jsx';
import ClimaPage from './pages/ClimaPage.jsx';
import EstrategiasPage from './pages/EstrategiasPage.jsx';
import MarketplacePage from './pages/MarketplacePage.jsx';
import ServicesPage from './pages/ServicesPage.jsx';
import SilobolsasPage from './pages/SilobolsasPage.jsx';

const MapView = lazy(() => import('./components/MapView.jsx'));
const PlanDespacho = lazy(() => import('./components/PlanDespacho.jsx'));
const CentroLogistico = lazy(() => import('./components/CentroLogistico.jsx'));

const SECTIONS = [
  { id: 'inicio', label: 'Inicio', icon: House, pages: [{ id: 'summary', label: 'Resumen' }] },
  { id: 'estrategia', label: 'Estrategia y decisiones', icon: Compass, pages: [{ id: 'estrategias', label: 'Estrategias' }] },
  { id: 'centro', label: 'Centro logístico', icon: LayoutDashboard, pages: [{ id: 'centro', label: 'Centro logístico' }] },
  {
    id: 'lotes', label: 'Gestionar lotes', icon: MapIcon,
    pages: [
      { id: 'lots', label: 'Lotes y mapa' },
      { id: 'clima', label: 'Clima en vivo' },
      { id: 'planning', label: 'Planificación' },
      { id: 'technical', label: 'Análisis técnico' },
    ],
  },
  { id: 'silos', label: 'Gestionar silobolsas', icon: Package, pages: [{ id: 'silobolsas', label: 'Silobolsas' }] },
  {
    id: 'logistica', label: 'Logística y ventas', icon: Route,
    pages: [
      { id: 'despacho', label: 'Plan y despacho' },
      { id: 'marketplace', label: 'Marketplace' },
    ],
  },
  { id: 'cuenta', label: 'Gestionar cuenta', icon: UserRound, pages: [{ id: 'account', label: 'Mi cuenta' }] },
];

const PAGES = SECTIONS.flatMap(({ pages }) => pages);
const sectionOf = (pageId) => SECTIONS.find(({ pages }) => pages.some(({ id }) => id === pageId));
const PAGES_WITH_LOT_SELECTOR = new Set(['summary', 'estrategias', 'centro', 'lots', 'clima', 'planning', 'technical', 'despacho', 'marketplace']);

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

function Header({ page, pages, lots, selectedLot, onSelectLot, theme, onToggleTheme, onSignOut }) {
  const pageLabel = pages.find(({ id }) => id === page)?.label ?? '';
  return (
    <header className="topbar">
      <div className="topbar-title">
        <span className="mobile-brand"><BrandMark /></span>
        <div>
          <div className="breadcrumbs">AgroFlow <span>/</span> {pageLabel}</div>
          <h1>{pageLabel}</h1>
        </div>
      </div>
      <div className="topbar-actions">
        {PAGES_WITH_LOT_SELECTOR.has(page) && <LotSelector lots={lots} selectedLot={selectedLot} onSelect={onSelectLot} />}
        <button type="button" className="icon-button theme-toggle" onClick={onToggleTheme} aria-label={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'} title={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}>
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        <button type="button" className="button button--secondary button--small" onClick={onSignOut}>Cerrar sesión</button>
      </div>
    </header>
  );
}

function Sidebar({ pages, page, homePage, onNavigate, apiStatus, isProducer }) {
  const groupLabels = { campo: 'MI CAMPO', servicios: 'MI SERVICIO', marketplace: 'MARKETPLACE', cuenta: 'MI CUENTA' };
  const helpText = isProducer
    ? apiStatus === 'off' ? 'Corré npm run dev:api para usar Marketplace y plan logístico.' : 'Los lotes se guardan en este navegador; el clima se actualiza solo.'
    : apiStatus === 'off' ? 'El Marketplace requiere conexión con la API.' : 'Tu servicio se administra desde este espacio.';
  return (
    <aside className="sidebar">
      <a className="brand" href="#" onClick={(event) => { event.preventDefault(); onNavigate(homePage); }}>
        <BrandMark />
        <span><strong>AgroFlow</strong><small>COSECHA · LOGÍSTICA</small></span>
      </a>
      <nav className="primary-nav" aria-label="Principal">
        {!isProducer && pages.map((item, index) => (
          <div key={item.id} className="nav-group">
            {(index === 0 || pages[index - 1].group !== item.group) && <div className="sidebar-caption">{groupLabels[item.group]}</div>}
            <button
              type="button"
              className={`nav-item${page === item.id ? ' is-active' : ''}`}
              onClick={() => onNavigate(item.id)}
              aria-current={page === item.id ? 'page' : undefined}
            >
              <item.icon className="nav-icon" size={18} aria-hidden="true" />
              {item.label}
            </button>
          </div>
        ))}
        {isProducer && SECTIONS.map((section) => {
          const active = sectionOf(page)?.id === section.id;
          return (
            <div key={section.id} className="nav-group">
              <button
                type="button"
                className={`nav-item${active ? ' is-active' : ''}`}
                onClick={() => onNavigate(section.pages[0].id)}
                aria-current={active ? 'page' : undefined}
              >
                <section.icon className="nav-icon" size={18} aria-hidden="true" />
                {section.label}
              </button>
            </div>
          );
        })}
      </nav>
      <div className="sidebar-bottom">
        <div className={`api-badge api-badge--${apiStatus}`}>
          <span />{apiStatus === 'ok' ? 'API conectada' : apiStatus === 'checking' ? 'Conectando API…' : 'API sin conexión'}
        </div>
        <p>{helpText}</p>
        <div className="sidebar-version">AgroFlow · v0.2</div>
      </div>
    </aside>
  );
}

function SectionTabs({ page, onNavigate }) {
  const section = sectionOf(page);
  if (!section || section.pages.length < 2) return null;
  return (
    <nav className="section-tabs" aria-label={section.label}>
      {section.pages.map((item) => (
        <button
          type="button"
          key={item.id}
          className={`section-tab${item.id === page ? ' is-active' : ''}`}
          aria-current={item.id === page ? 'page' : undefined}
          onClick={() => onNavigate(item.id)}
        >
          {item.label}
        </button>
      ))}
    </nav>
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
  if (!window) return <span className="status-pill status-pill--muted">Sin cultivo sembrado</span>;
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
        <MetricCard label="Con datos de clima" value={withSnapshot} unit="" detail="Pronóstico automático" icon={<CloudSun size={18} />} tone="violet" />
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
                  <span className="crop-avatar">{lot.crop ? nombreCultivo(lot.crop).slice(0, 1) : '–'}</span>
                  <span className="lot-list-copy">
                    <strong>{lot.name}</strong>
                    <small>{nombreCultivo(lot.crop)} · {formatNumber(lot.areaHa)} ha</small>
                  </span>
                  <span className="lot-list-window"><WindowTag lot={lot} /><small>{snapshots[lot.id] ? 'Pronóstico al día' : 'Sin pronóstico'}</small></span>
                  <span className="row-chevron">›</span>
                </button>
              ))}
              {lots.length > 5 && <button className="text-button list-footer" type="button" onClick={() => onNavigate('lots')}>Ver los {lots.length} lotes →</button>}
            </div>
          ) : (
            <EmptyState
              title="Todavía no hay lotes"
              description="Agregá el terreno marcando su ubicación en el mapa. El cultivo se siembra después desde Gestionar lotes."
              action={<button type="button" className="button button--primary button--small" onClick={onCreate}>＋ Agregar un lote</button>}
            />
          )}
        </section>
      </div>
      <div className="summary-bottom-grid">
        <section className="panel forecast-preview">
          <div className="section-heading">
            <div><h3>Pronóstico disponible</h3><p>{selectedLot ? `Punto de consulta · ${selectedLot.name}` : 'El pronóstico se carga solo'}</p></div>
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
            <button type="button" className="text-button" onClick={() => onNavigate('despacho')}>Simular plan logístico <span>→</span></button>
          </div>
        </section>
      </div>
    </>
  );
}

function LotDetails({ lot, snapshotRecord, onEdit, onSow, onClearSowing, onDelete }) {
  if (!lot) {
    return <EmptyState title="Seleccioná un lote" description="Elegí o creá un lote para ver sus datos." />;
  }
  const snapshot = snapshotRecord?.snapshot;
  const window = ventanaDelLote(lot);
  const variety = nombreVariedad(lot.crop, lot.variety);

  return (
    <div className="lot-details">
      <div className="detail-title">
        <span className="crop-avatar crop-avatar--large">{lot.crop ? nombreCultivo(lot.crop).slice(0, 1) : '–'}</span>
        <div><span className="eyebrow">{lot.crop ? `${nombreCultivo(lot.crop)}${variety ? ` · ${variety}` : ''}` : 'Sin cultivo sembrado'}</span><h2>{lot.name}</h2></div>
      </div>
      <div className="action-row">
        <button type="button" className="button button--primary button--small" onClick={onSow}><Sprout size={14} aria-hidden="true" /> {lot.crop ? 'Cambiar cultivo' : 'Sembrar cultivo'}</button>
        <button type="button" className="button button--secondary button--small" onClick={onEdit}>Editar lote</button>
        {lot.crop && <button type="button" className="button button--secondary button--small" onClick={onClearSowing}>Quitar cultivo</button>}
      </div>
      <div className="detail-stats">
        <div><span>{lot.boundary?.properties?.areaHa ? 'Superficie medida' : 'Superficie declarada'}</span><strong>{formatNumber(lot.areaHa, 2)} ha</strong></div>
        <div><span>Ciclo estimado</span><strong>{lot.cycleDays ? `${lot.cycleDays} días` : '—'}</strong></div>
        <div><span>Fecha de siembra</span><strong>{lot.sowingDate ? formatDate(lot.sowingDate) : '—'}</strong></div>
        <div><span>Coordenadas del punto</span><strong>{lot.latitude.toFixed(4)}, {lot.longitude.toFixed(4)}</strong></div>
      </div>
      <div className="detail-block">
        <div className="detail-block-heading"><strong>Límite del lote</strong><span className={`status-pill ${lot.boundary ? 'status-pill--success' : 'status-pill--muted'}`}>{lot.boundary ? 'Cargado' : 'Pendiente'}</span></div>
        <p>{lot.boundary ? `Polígono dibujado en el mapa${lot.boundary.properties?.areaHa ? ` · superficie medida ${formatNumber(lot.boundary.properties.areaHa, 2)} ha` : ''}.` : 'Dibujá el límite sobre el mapa: la superficie se mide sola.'}</p>
      </div>
      <div className="detail-block">
        <div className="detail-block-heading"><strong>Datos climáticos</strong><span className={`status-pill ${snapshot ? 'status-pill--success' : 'status-pill--muted'}`}>{snapshot ? 'Automático' : 'Sin conexión'}</span></div>
        <p>{snapshot ? `Pronóstico de Open-Meteo para este lote, actualizado el ${formatDate(snapshot.queriedAt)}. Se renueva solo.` : 'El pronóstico se carga solo cuando la API está conectada.'}</p>
      </div>
      <div className="detail-block">
        <strong>Ventana estimada de cosecha</strong>
        {window
          ? <p>{formatDate(window.inicio)} – {formatDate(window.fin)} · fecha central estimada {formatDate(window.optimo)}.</p>
          : <p>Sembrá un cultivo para calcular un rango orientativo.</p>}
        <small>Estimación por duración del ciclo; no sustituye evaluación agronómica.</small>
      </div>
      <button type="button" className="danger-text-button" onClick={onDelete}>Eliminar lote y datos asociados</button>
    </div>
  );
}

function LotsPage({ lots, selectedLot, snapshots, onSelectLot, onEdit, onSow, onClearSowing, onDelete, onCreate, onDrawnBoundary, onCreateFromDrawing, onOpenClima, theme }) {
  return (
    <>
      <PageIntro
        eyebrow="GESTIONAR LOTES"
        title="Lotes y mapa"
        description="Un lote es un terreno. Dibujá su límite sobre el satélite y después sembrá el cultivo desde su ficha."
        action={<button type="button" className="button button--primary button--small" onClick={onCreate}><Plus size={15} /> Nuevo lote</button>}
      />
      <div className="lots-workspace">
        <div className="lots-map-column">
          <MapView lots={lots} selectedLot={selectedLot} onSelectLot={onSelectLot} onSaveBoundary={onDrawnBoundary} onCreateFromDrawing={onCreateFromDrawing} onOpenClima={onOpenClima} theme={theme} />
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
              onEdit={() => onEdit(selectedLot)}
              onSow={() => onSow(selectedLot)}
              onClearSowing={() => onClearSowing(selectedLot)}
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

function PlanningPage({ lot, snapshotRecord, onSow, onNavigate }) {
  const snapshot = snapshotRecord?.snapshot;
  const window = ventanaDelLote(lot);
  const days = diasEnVentana(snapshot?.dailyForecast, window);

  return (
    <>
      <PageIntro
        eyebrow="DECISIÓN AGRONÓMICA"
        title="Planificación de cosecha"
        description={lot ? `${lot.name} · ${lot.crop ? `${nombreCultivo(lot.crop)} · ciclo declarado ${lot.cycleDays} días` : 'sin cultivo sembrado'}` : 'Seleccioná un lote para consultar su ventana estimada.'}
        action={lot ? <WindowTag lot={lot} /> : null}
      />
      {!lot ? (
        <EmptyState title="No hay un lote seleccionado" description="Creá un lote en Gestionar lotes para generar su ventana orientativa." />
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
                <div className="compact-empty">
                  <p>El lote no tiene cultivo sembrado.</p>
                  <button type="button" className="button button--primary button--small" onClick={onSow}>Sembrar cultivo</button>
                </div>
              )}
            </section>
            <section className="panel recommendation-panel">
              <span className="eyebrow">SIGUIENTE PASO</span>
              <h3>¿Qué conviene hacer?</h3>
              <p>Compará las estrategias disponibles para este lote con su ventana de cosecha.</p>
              <button type="button" className="button button--primary button--small" onClick={() => onNavigate('estrategias')}>Ver estrategias</button>
            </section>
          </div>
          <div className="section-heading section-heading--standalone">
            <div>
              <h3>Pronóstico durante la ventana</h3>
              <p>Se muestran los días que el pronóstico automático alcanza a cubrir (hasta 16 días).</p>
              {snapshot && <span className="data-footnote">Fuente Open-Meteo · consultado el {formatDate(snapshot.queriedAt)}</span>}
            </div>
          </div>
          {!snapshot ? (
            <EmptyState title="Sin pronóstico por ahora" description="El pronóstico se descarga solo cuando la API está conectada. Si estás sin conexión, volvé a intentarlo en un rato." />
          ) : days.length ? (
            <section className="panel"><ForecastTable days={days} /></section>
          ) : (
            <div className="panel compact-empty">La ventana de cosecha está fuera de los 16 días que cubre el pronóstico. En el Centro logístico se estima con la frecuencia histórica de lluvia.</div>
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
      <div className="section-heading"><div><h3>Fuentes del pronóstico</h3><p>Estado registrado al momento de la consulta</p></div><span className="status-pill status-pill--muted">{status.quality ?? 'sin clasificar'}</span></div>
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
  }), [series]);

  return (
    <>
      <PageIntro
        eyebrow="DATOS Y PROCEDENCIA"
        title="Análisis técnico"
        description={lot ? `${lot.name} · pronóstico automático de Open-Meteo` : 'Seleccioná un lote para consultar las fuentes y variables.'}
        action={snapshot ? <span className="status-pill status-pill--success">Consulta {formatDate(snapshot.queriedAt)}</span> : null}
      />
      {!lot ? (
        <EmptyState title="No hay un lote seleccionado" description="Agregá o elegí un lote para ver datos técnicos." />
      ) : !snapshot ? (
        <EmptyState title="Sin datos técnicos por ahora" description="El pronóstico se descarga solo cuando la API está conectada. No se muestran valores sintéticos." icon="◌" />
      ) : (
        <>
          <SourceNote lot={lot} snapshot={snapshot} />
          <div className="technical-metrics">
            <div className="technical-metric"><span>Consultado</span><strong>{formatDate(snapshot.queriedAt)}</strong><small>Descarga automática</small></div>
            <div className="technical-metric"><span>Días pronosticados</span><strong>{series.length}</strong><small>Serie diaria disponible</small></div>
            <div className="technical-metric"><span>Fuentes consultadas</span><strong>{snapshot.sourceStatus.requested?.length ?? 0}</strong><small>{snapshot.sourceStatus.successful?.length ?? 0} disponibles</small></div>
            <div className="technical-metric"><span>Horizonte del pronóstico</span><strong>{series.length ? formatDate(series[0].date, { day: 'numeric', month: 'short' }) : '—'}</strong><small>Inicio de la serie</small></div>
          </div>
          <div className="technical-chart-grid">
            <WeatherChart title="Precipitación diaria" unit="mm" points={points.rain} color="blue" note="Pronóstico en el punto consultado" />
            <WeatherChart title="Temperatura máxima" unit="°C" points={points.temperature} color="amber" note="Pronóstico en el punto consultado" />
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
          <p className="technical-disclaimer">Los gráficos describen el pronóstico automático; no son mediciones de campo ni una recomendación agronómica.</p>
        </>
      )}
    </>
  );
}

export function WorkspaceApp({ user, account, onAccountChange, onSignOut, guest = false }) {
  const role = account?.profile?.role ?? 'productor';
  const pages = getWorkspacePages(role);
  const homePage = getHomePageForRole(role) ?? 'account';
  const isProducer = role === 'productor';
  const [page, setPage] = useState('summary');
  const [lots, setLots] = useState([]);
  const [snapshots, setSnapshots] = useState({});
  const [selectedLotId, setSelectedLotId] = useState('');
  const [climaVariable, setClimaVariable] = useState('precipitacion');
  const [dialog, setDialog] = useState(null);
  const [loading, setLoading] = useState(true);
  const [storageError, setStorageError] = useState('');
  const [toast, setToast] = useState('');
  const [theme, toggleTheme] = useTheme();
  const [apiStatus, setApiStatus] = useState('checking');

  useEffect(() => {
    if (!pages.some(({ id }) => id === page)) setPage(homePage);
  }, [pages, page, homePage]);

  useEffect(() => {
    let alive = true;
    const check = () => api.salud().then(() => alive && setApiStatus('ok')).catch(() => alive && setApiStatus('off'));
    check();
    const id = window.setInterval(check, 30000);
    return () => { alive = false; window.clearInterval(id); };
  }, []);

  useEffect(() => {
    if (!isProducer) {
      setLoading(false);
      return undefined;
    }
    listarLotes()
      .then(async (savedLots) => {
        let lotes = savedLots;
        // La primera vez en modo invitado se suma un productor de ejemplo (sin tocar los lotes propios) para probar la aplicación como uno real.
        if (guest && !ejemploYaCargado()) {
          const ejemplo = lotesDeEjemplo().filter((lote) => !lotes.some((guardado) => guardado.id === lote.id));
          await Promise.all(ejemplo.map((lote) => guardarLote(lote)));
          lotes = [...ejemplo, ...lotes];
          marcarEjemploCargado();
          cargarSilobolsasDeEjemplo(api).catch(() => {});
        }
        setLots(lotes);
        setSelectedLotId(lotes[0]?.id ?? '');
      })
      .catch((error) => setStorageError(error.message || 'No se pudo leer el almacenamiento local.'))
      .finally(() => setLoading(false));
    return undefined;
  }, [isProducer]);

  // El pronóstico de cada lote se descarga solo; se vuelve a pedir si cambia su ubicación.
  const ubicaciones = lots.map((lot) => `${lot.id}:${lot.latitude}:${lot.longitude}`).join('|');
  useEffect(() => {
    let alive = true;
    for (const lot of lots) {
      pronosticoDelLote(lot)
        .then((snapshot) => {
          if (!alive) return;
          setSnapshots((current) => {
            const next = { ...current };
            if (snapshot) next[lot.id] = { lotId: lot.id, snapshot };
            else delete next[lot.id];
            return next;
          });
        })
        .catch(() => {});
    }
    return () => { alive = false; };
    // Depende de las ubicaciones, no de cada edición del lote.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ubicaciones]);

  useEffect(() => {
    if (!toast) return undefined;
    const timeout = window.setTimeout(() => setToast(''), 3500);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const selectedLot = lots.find((lot) => lot.id === selectedLotId) ?? null;

  const closeDialog = useCallback(() => setDialog(null), []);

  async function createLot(lot) {
    await guardarLote(lot);
    setLots((current) => [...current, lot]);
    setSelectedLotId(lot.id);
    setToast('Lote guardado en este navegador.');
  }

  async function updateLot(lot, message) {
    await guardarLote(lot);
    setLots((current) => current.map((item) => item.id === lot.id ? lot : item));
    setToast(message);
  }

  async function saveDrawnBoundary(lot, feature, { ha, center }) {
    const boundary = { ...feature, properties: { ...feature.properties, areaHa: ha } };
    const updated = { ...lot, boundary, areaHa: Math.round(ha * 100) / 100, longitude: center[0], latitude: center[1] };
    await guardarLote(updated);
    setLots((current) => current.map((item) => item.id === lot.id ? updated : item));
    setToast(`Límite guardado · ${formatNumber(ha, 2)} ha medidas.`);
  }

  function createFromDrawing(feature, { ha, center }) {
    setDialog({
      type: 'lot',
      draft: {
        areaHa: ha.toFixed(2),
        latitude: center[1].toFixed(6),
        longitude: center[0].toFixed(6),
        boundary: { ...feature, properties: { ...feature.properties, areaHa: ha } },
      },
    });
  }

  async function removeLot(lot) {
    await eliminarLote(lot.id);
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

  async function resetExample() {
    const propios = lots.filter((lot) => !esLoteDeEjemplo(lot));
    const nuevos = lotesDeEjemplo();
    await Promise.all([...lots.filter(esLoteDeEjemplo).map((lot) => eliminarLote(lot.id)), ...nuevos.map((lote) => guardarLote(lote))]);
    setLots([...nuevos, ...propios]);
    setSelectedLotId(nuevos[0].id);
    marcarEjemploCargado();
    cargarSilobolsasDeEjemplo(api).catch(() => {});
    setToast('Datos de ejemplo restablecidos.');
  }

  function openCreate() {
    setDialog({ type: 'lot' });
  }

  function navigate(nextPage) {
    if (!pages.some(({ id }) => id === nextPage)) return;
    setPage(nextPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#contenido">Saltar al contenido</a>
      <Sidebar pages={pages} page={page} homePage={homePage} onNavigate={navigate} apiStatus={apiStatus} isProducer={isProducer} />
      <main className="main-content" id="contenido">
        <Header
          page={page}
          pages={pages}
          lots={lots}
          selectedLot={selectedLot}
          onSelectLot={setSelectedLotId}
          theme={theme}
          onToggleTheme={toggleTheme}
          onSignOut={onSignOut}
        />
        {isProducer && <SectionTabs page={page} onNavigate={navigate} />}
        {storageError && <div className="app-alert" role="alert">No se pudo abrir la base local: {storageError}. Recargá la página o probá otro navegador.</div>}
        {loading ? (
          <div className="loading-state" role="status">Cargando tus datos locales…</div>
        ) : (
          <div className="page-content">
            <Suspense fallback={<div className="loading-state" role="status">Cargando mapa…</div>}>
              {page === 'summary' && <SummaryPage lots={lots} selectedLot={selectedLot} snapshots={snapshots} onNavigate={navigate} onSelectLot={setSelectedLotId} onCreate={openCreate} theme={theme} />}
              {page === 'estrategias' && <EstrategiasPage lot={selectedLot} />}
              {page === 'lots' && <LotsPage lots={lots} selectedLot={selectedLot} snapshots={snapshots} onSelectLot={setSelectedLotId} onEdit={(lot) => setDialog({ type: 'lot', lot })} onSow={(lot) => setDialog({ type: 'sow', lot })} onClearSowing={(lot) => setDialog({ type: 'clear', lot })} onDelete={(lot) => setDialog({ type: 'delete', lot })} onCreate={openCreate} onDrawnBoundary={saveDrawnBoundary} onCreateFromDrawing={createFromDrawing} onOpenClima={(v) => { setClimaVariable(v); navigate('clima'); }} theme={theme} />}
              {page === 'clima' && <ClimaPage lots={lots} selectedLot={selectedLot} initialVariable={climaVariable} onSelectLot={setSelectedLotId} />}
              {page === 'planning' && <PlanningPage lot={selectedLot} snapshotRecord={selectedLot ? snapshots[selectedLot.id] : null} onSow={() => setDialog({ type: 'sow', lot: selectedLot })} onNavigate={navigate} />}
              {page === 'despacho' && <Suspense fallback={<div className="panel compact-empty">Cargando…</div>}><PlanDespacho lot={selectedLot} /></Suspense>}
              {page === 'centro' && <CentroLogistico lots={lots} selectedLot={selectedLot} snapshotRecord={selectedLot ? snapshots[selectedLot.id] : null} theme={theme} onSelectLot={setSelectedLotId} onNavigate={navigate} />}
              {page === 'technical' && <TechnicalPage lot={selectedLot} snapshotRecord={selectedLot ? snapshots[selectedLot.id] : null} />}
              {page === 'marketplace' && <MarketplacePage role={role} fields={account?.fields ?? []} guest={guest} lot={selectedLot} onToast={setToast} onNavigate={navigate} />}
              {page === 'silobolsas' && <SilobolsasPage lots={lots} />}
              {page === 'services' && <ServicesPage account={account} onNavigate={navigate} guest={guest} />}
              {page === 'account' && <AccountPage user={user} account={account} onAccountChange={onAccountChange} onSignOut={onSignOut} guest={guest} lots={lots} onResetExample={resetExample} />}
            </Suspense>
          </div>
        )}
      </main>
      {dialog?.type === 'lot' && (
        <LotDialog
          lot={dialog.lot}
          draft={dialog.draft}
          onClose={closeDialog}
          onSave={dialog.lot ? (lot) => updateLot(lot, 'Lote actualizado.') : createLot}
        />
      )}
      {dialog?.type === 'sow' && <SowingDialog lot={dialog.lot} onClose={closeDialog} onSave={(lot) => updateLot(lot, `Siembra de ${nombreCultivo(lot.crop)} registrada en ${lot.name}.`)} />}
      {dialog?.type === 'clear' && (
        <ConfirmDialog
          title="Quitar cultivo"
          message={`Se borra el cultivo y la fecha de siembra de “${dialog.lot.name}”. El terreno y su límite se conservan.`}
          confirmLabel="Quitar cultivo"
          onClose={closeDialog}
          onConfirm={() => updateLot(quitarSiembra(dialog.lot), 'Cultivo quitado del lote.')}
        />
      )}
      {dialog?.type === 'delete' && (
        <ConfirmDialog
          title="Eliminar lote"
          message={`¿Eliminar “${dialog.lot.name}” y sus datos asociados de este navegador? No se puede deshacer.`}
          confirmLabel="Eliminar lote"
          onClose={closeDialog}
          onConfirm={() => removeLot(dialog.lot)}
        />
      )}
      {isProducer && page !== 'account' && <ChatBubble lots={lots} selectedLot={selectedLot} onNavigate={navigate} />}
      {toast && <div className="toast-message" role="status"><span>✓</span>{toast}</div>}
    </div>
  );
}

export default WorkspaceApp;
