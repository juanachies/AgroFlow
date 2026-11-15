import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight, BadgeCheck, CalendarRange, Container, Package, Plus, RefreshCw, Search,
  Sprout, Star, Tractor, Truck, Users, Wheat, X,
} from 'lucide-react';
import { api } from '../lib/api.js';
import { distanciaKm } from '../lib/data.js';
import { claveRango, rangoMasComun } from '../lib/marketplace.js';
import ServiceMarketplace from '../components/ServiceMarketplace.jsx';

const OFERTAS_POR_PAGINA = 12;

export const ACTORES = [
  { id: '', label: 'Todos', icon: Users },
  { id: 'cosechadora', label: 'Contratistas de cosecha', short: 'Cosechadoras', icon: Wheat },
  { id: 'tractor con tolva', label: 'Tractores con tolva', short: 'Tolvas', icon: Tractor },
  { id: 'camión', label: 'Transportistas', short: 'Camiones', icon: Truck },
  { id: 'embolsadora', label: 'Embolsadoras', short: 'Embolsadoras', icon: Package },
];

const TIPOS = {
  cosechadora: ['cosechadora-chica', 'cosechadora-mediana', 'cosechadora-grande'],
  camión: ['camion-chasis', 'camion-semi', 'camion-bitren'],
  embolsadora: ['embolsadora-chica', 'embolsadora-grande'],
  'tractor con tolva': [],
};

const fmt = (value, digits = 0) => new Intl.NumberFormat('es-AR', { maximumFractionDigits: digits }).format(value);
const fmtDate = (value) => new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`));
const iconFor = (recurso) => ACTORES.find((a) => a.id === recurso)?.icon ?? Users;
const initials = (name) => name.split(/\s+/).filter((w) => /^[A-ZÁÉÍÓÚ]/.test(w)).slice(0, 2).map((w) => w[0]).join('') || name.slice(0, 2);

function PriceTag({ value }) {
  const pct = Math.round((value - 1) * 100);
  if (pct === 0) return <span className="price-tag">Tarifa de referencia</span>;
  return <span className={`price-tag ${pct < 0 ? 'price-tag--good' : 'price-tag--high'}`}>{pct > 0 ? '+' : ''}{pct}% vs. referencia</span>;
}

function OfferCard({ offer, lot, mostrarFechas }) {
  const Icon = iconFor(offer.recurso);
  const distance = lot ? distanciaKm({ latitude: lot.latitude, longitude: lot.longitude }, { latitude: offer.base.lat, longitude: offer.base.lon }) : null;
  const covers = distance !== null && distance <= offer.radioKm;
  const tipo = [offer.recurso, offer.tipo?.replace(/-/g, ' ')].filter(Boolean).join(' · ');
  return (
    <article className="offer-card offer-card--compact">
      <div className="offer-line offer-line--main">
        <strong className="offer-name">{offer.proveedor}</strong>
        {offer.calificacion != null && (
          <span className="offer-rating" aria-label={`Calificación ${offer.calificacion} de 5`}><Star size={13} aria-hidden="true" /> {offer.calificacion.toFixed(1)}</span>
        )}
      </div>
      <div className="offer-line offer-line--meta">
        <span className="offer-type"><Icon size={14} aria-hidden="true" /> {tipo}</span>
        <strong className="tabular">{fmt(offer.unidades)} {offer.unidades === 1 ? 'unidad' : 'unidades'}</strong>
      </div>
      <div className="offer-line offer-line--chips">
        <PriceTag value={offer.precioRelativo} />
        {distance !== null && (
          <span className={`status-pill ${covers ? 'status-pill--success' : 'status-pill--muted'}`}>
            {covers ? <><BadgeCheck size={12} aria-hidden="true" /> Llega a tu lote · {fmt(distance)} km</> : `Fuera de radio · ${fmt(distance)} km`}
          </span>
        )}
        {mostrarFechas && (
          <span className="offer-dates"><CalendarRange size={13} aria-hidden="true" /> {fmtDate(offer.disponibleDesde)} – {fmtDate(offer.disponibleHasta)}</span>
        )}
      </div>
    </article>
  );
}

function PublishDialog({ lot, onClose, onPublished }) {
  const today = new Date().toISOString().slice(0, 10);
  const [values, setValues] = useState({
    proveedor: '', recurso: 'camión', tipo: 'camion-semi', unidades: 1, localidad: '',
    lat: lot?.latitude ?? -33.89, lon: lot?.longitude ?? -60.57, radioKm: 100,
    disponibleDesde: today, disponibleHasta: `${Number(today.slice(0, 4)) + 1}${today.slice(4)}`, precioRelativo: 1,
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const update = ({ target: { name, value } }) => setValues((v) => (name === 'recurso'
    ? { ...v, recurso: value, tipo: TIPOS[value][0] ?? '' }
    : { ...v, [name]: value }));

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const { oferta } = await api.publicarOferta({
        proveedor: values.proveedor.trim(), recurso: values.recurso, tipo: values.tipo || null,
        unidades: Number(values.unidades), radioKm: Number(values.radioKm), precioRelativo: Number(values.precioRelativo),
        base: { lat: Number(values.lat), lon: Number(values.lon), localidad: values.localidad.trim() || null },
        disponibleDesde: values.disponibleDesde, disponibleHasta: values.disponibleHasta,
      });
      onPublished(oferta);
    } catch (reason) {
      setError(reason.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="dialog-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}>
      <section className="dialog-card" role="dialog" aria-modal="true" aria-labelledby="publish-title">
        <div className="dialog-heading">
          <div><span className="eyebrow">Marketplace · alta de proveedor</span><h2 id="publish-title">Publicar disponibilidad</h2></div>
          <button type="button" className="icon-button" aria-label="Cerrar" onClick={onClose}><X size={18} /></button>
        </div>
        <form className="field-form" onSubmit={submit}>
          <label>Proveedor<input name="proveedor" value={values.proveedor} onChange={update} placeholder="Ej. Transportes del Sur" required maxLength={80} autoFocus /></label>
          <div className="form-grid">
            <label>Recurso
              <select name="recurso" value={values.recurso} onChange={update}>
                {ACTORES.filter((a) => a.id).map((a) => <option key={a.id} value={a.id}>{a.short}</option>)}
              </select>
            </label>
            <label>Tipo
              <select name="tipo" value={values.tipo} onChange={update} disabled={!TIPOS[values.recurso].length}>
                {TIPOS[values.recurso].length ? TIPOS[values.recurso].map((t) => <option key={t} value={t}>{t.replace(/-/g, ' ')}</option>) : <option value="">Único</option>}
              </select>
            </label>
          </div>
          <div className="form-grid form-grid--3">
            <label>Unidades<input name="unidades" type="number" min="1" step="1" value={values.unidades} onChange={update} required /></label>
            <label>Radio (km)<input name="radioKm" type="number" min="1" value={values.radioKm} onChange={update} required /></label>
            <label>Precio relativo<input name="precioRelativo" type="number" min="0.5" max="2" step="0.01" value={values.precioRelativo} onChange={update} required /></label>
          </div>
          <div className="form-grid form-grid--3">
            <label>Localidad<input name="localidad" value={values.localidad} onChange={update} placeholder="Pergamino" /></label>
            <label>Latitud<input name="lat" type="number" step="any" value={values.lat} onChange={update} required /></label>
            <label>Longitud<input name="lon" type="number" step="any" value={values.lon} onChange={update} required /></label>
          </div>
          <div className="form-grid">
            <label>Disponible desde<input name="disponibleDesde" type="date" value={values.disponibleDesde} onChange={update} required /></label>
            <label>Hasta<input name="disponibleHasta" type="date" value={values.disponibleHasta} onChange={update} required /></label>
          </div>
          <small className="field-help">Precio relativo: 1 = tarifa de referencia de <code>data/tarifas.json</code>; 0,9 = 10% más barato.</small>
          {error && <div className="form-error" role="alert">{error}</div>}
          <div className="dialog-actions">
            <button type="button" className="button button--secondary" onClick={onClose} disabled={saving}>Cancelar</button>
            <button type="submit" className="button button--primary" disabled={saving}>{saving ? 'Publicando…' : 'Publicar oferta'}</button>
          </div>
        </form>
      </section>
    </div>
  );
}

export function ApiOffline({ error, onRetry }) {
  return (
    <div className="empty-state empty-state--api">
      <span className="empty-state-icon"><RefreshCw size={22} /></span>
      <h3>La API de AgroFlow no responde</h3>
      <p>{error} Levantala en otra terminal con <code>npm run dev:api</code> y reintentá.</p>
      <button type="button" className="button button--secondary button--small" onClick={onRetry}><RefreshCw size={14} /> Reintentar</button>
    </div>
  );
}

export default function MarketplacePage({ role, fields = [], guest = false, lot, onToast, onNavigate }) {
  const isProvider = role === 'prestador';
  const [offers, setOffers] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [actor, setActor] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState(lot ? 'distancia' : 'precio');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [pagina, setPagina] = useState(OFERTAS_POR_PAGINA);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [{ ofertas }, { reservas }] = await Promise.all([api.ofertas(), api.reservas()]);
      setOffers(ofertas);
      setReservations(reservas.filter((r) => r.loteId !== 'mercado'));
    } catch (reason) {
      setError(reason.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  useEffect(() => { setPagina(OFERTAS_POR_PAGINA); }, [actor, search, sort]);

  const counts = useMemo(() => Object.fromEntries(ACTORES.map((a) => [a.id, a.id ? offers.filter((o) => o.recurso === a.id).length : offers.length])), [offers]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const dist = (o) => (lot ? distanciaKm({ latitude: lot.latitude, longitude: lot.longitude }, { latitude: o.base.lat, longitude: o.base.lon }) : 0);
    return offers
      .filter((o) => (!actor || o.recurso === actor) && (!q || `${o.proveedor} ${o.base.localidad ?? ''} ${o.tipo ?? ''}`.toLowerCase().includes(q)))
      .sort((a, b) => (sort === 'precio' ? a.precioRelativo - b.precioRelativo
        : sort === 'calificacion' ? (b.calificacion ?? 0) - (a.calificacion ?? 0)
          : dist(a) - dist(b)));
  }, [offers, actor, search, sort, lot]);

  const providers = new Set(offers.map((o) => o.proveedor)).size;
  const units = offers.reduce((t, o) => t + o.unidades, 0);
  const avgPrice = offers.length ? offers.reduce((t, o) => t + o.precioRelativo, 0) / offers.length : 1;
  const rangoComun = useMemo(() => rangoMasComun(offers), [offers]);
  const mostradas = visible.slice(0, pagina);
  const restantes = visible.length - mostradas.length;

  return (
    <>
      <div className="page-intro">
        <div>
          <span className="eyebrow">MARKETPLACE DE ACTORES</span>
          <h2>Servicios para la cosecha, en un solo lugar</h2>
          <p>Un espacio para conectar necesidades de cosecha con capacidad y servicios disponibles.</p>
        </div>
        {isProvider && <button type="button" className="button button--primary" onClick={() => setPublishing(true)} disabled={!!error}><Plus size={16} /> Publicar disponibilidad</button>}
      </div>

      {role === 'productor' && !guest && <ServiceMarketplace fields={fields} onNavigate={onNavigate} onToast={onToast} />}

      <section className="actors-flow" aria-label="Cómo funciona el marketplace">
        <div className="actor-step"><span className="actor-step-icon"><Sprout size={18} /></span><div><strong>Productor</strong><small>Simula su plan y publica la demanda de servicios</small></div></div>
        <ArrowRight className="actor-arrow" size={18} aria-hidden="true" />
        <div className="actor-step actor-step--brand"><span className="actor-step-icon"><Container size={18} /></span><div><strong>AgroFlow asigna</strong><small>Por distancia, fecha, precio y saturación del puerto</small></div></div>
        <ArrowRight className="actor-arrow" size={18} aria-hidden="true" />
        <div className="actor-step"><span className="actor-step-icon"><Truck size={18} /></span><div><strong>Contratistas y transportistas</strong><small>Reciben la reserva confirmada con fechas</small></div></div>
        <button type="button" className="text-button" onClick={() => onNavigate(isProvider ? 'services' : 'despacho')}>
          {isProvider ? 'Gestionar mi servicio' : 'Simular mi plan'} <ArrowRight size={15} />
        </button>
      </section>

      {error ? <ApiOffline error={error} onRetry={load} /> : (
        <>
          <div className="metrics-grid">
            <article className="metric-card"><div className="metric-icon"><Users size={18} /></div><div className="metric-label">Proveedores activos</div><div className="metric-value">{loading ? '—' : providers}</div><div className="metric-detail">{offers.length} ofertas publicadas</div></article>
            <article className="metric-card"><div className="metric-icon metric-icon--blue"><Tractor size={18} /></div><div className="metric-label">Unidades disponibles</div><div className="metric-value">{loading ? '—' : fmt(units)}</div><div className="metric-detail">Cosechadoras, tolvas, camiones y embolsadoras</div></article>
            <article className="metric-card"><div className="metric-icon metric-icon--amber"><Star size={18} /></div><div className="metric-label">Precio promedio</div><div className="metric-value">{loading ? '—' : `${avgPrice < 1 ? '' : '+'}${fmt((avgPrice - 1) * 100, 1)}`}<span>%</span></div><div className="metric-detail">Respecto de la tarifa de referencia</div></article>
            <article className="metric-card"><div className="metric-icon metric-icon--violet"><BadgeCheck size={18} /></div><div className="metric-label">Reservas confirmadas</div><div className="metric-value">{loading ? '—' : reservations.length}</div><div className="metric-detail">En esta sesión del servidor</div></article>
          </div>

          <div className="market-toolbar">
            <div className="actor-tabs" role="tablist" aria-label="Filtrar por actor">
              {ACTORES.map(({ id, label, icon: Icon }) => (
                <button type="button" role="tab" key={id || 'all'} aria-selected={actor === id} className={`actor-tab${actor === id ? ' is-active' : ''}`} onClick={() => setActor(id)}>
                  <Icon size={15} aria-hidden="true" /> {label} <span className="count-chip">{counts[id] ?? 0}</span>
                </button>
              ))}
            </div>
            <div className="market-filters">
              <label className="search-field"><Search size={15} aria-hidden="true" /><input type="search" placeholder="Buscar proveedor o localidad" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Buscar proveedor o localidad" /></label>
              <label className="sort-field">Ordenar
                <select value={sort} onChange={(e) => setSort(e.target.value)}>
                  {lot && <option value="distancia">Más cerca de {lot.name}</option>}
                  <option value="precio">Menor precio</option>
                  <option value="calificacion">Mejor calificación</option>
                </select>
              </label>
            </div>
          </div>

          {loading ? (
            <div className="offer-grid">{Array.from({ length: 6 }, (_, i) => <div className="offer-card skeleton" key={i} />)}</div>
          ) : visible.length ? (
            <>
              <div className="offer-grid">{mostradas.map((offer) => <OfferCard key={offer.id} offer={offer} lot={lot} mostrarFechas={claveRango(offer) !== rangoComun} />)}</div>
              {restantes > 0 && (
                <div className="market-more">
                  <button type="button" className="button button--secondary" onClick={() => setPagina((n) => n + OFERTAS_POR_PAGINA)}>Ver más ({restantes})</button>
                </div>
              )}
            </>
          ) : (
            <div className="panel compact-empty">No hay ofertas que coincidan con el filtro.</div>
          )}
        </>
      )}

      {publishing && (
        <PublishDialog
          lot={lot}
          onClose={() => setPublishing(false)}
          onPublished={(oferta) => {
            setOffers((current) => [oferta, ...current]);
            setPublishing(false);
            onToast(`Oferta ${oferta.id} publicada en el marketplace.`);
          }}
        />
      )}
    </>
  );
}
