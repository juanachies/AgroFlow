import { useEffect, useState } from 'react';
import {
  ArrowRight, BadgeCheck, CalendarRange, CircleDollarSign, Clock3, MapPin, MessageSquareText, Pencil,
  Package, Send, Tractor, Truck, UserRound, X,
} from 'lucide-react';
import { accountApi } from '../lib/accountApi.js';

const SERVICE_LABELS = {
  transporte: 'Transporte',
  almacenamiento: 'Almacenamiento',
  maquinaria: 'Maquinaria',
};
const SERVICE_ICONS = { transporte: Truck, almacenamiento: Package, maquinaria: Tractor };
const PRICE_UNIT_LABELS = {
  por_viaje: 'por viaje',
  por_km: 'por km',
  por_dia: 'por día',
  por_tonelada: 'por tonelada',
  por_tonelada_mes: 'por tonelada / mes',
  por_tonelada_dia: 'por tonelada / día',
  por_hectarea: 'por hectárea',
  por_hora: 'por hora',
};
const CAPACITY_UNIT_LABELS = {
  toneladas: 'toneladas',
  hectareas_dia: 'ha/día',
  hectareas: 'hectáreas',
  metros_cubicos: 'm³',
};
const CARGO_LABELS = { granos: 'Granos', insumos: 'Insumos', maquinaria: 'Maquinaria', otros: 'Otros' };
const CROP_LABELS = { soja: 'Soja', maiz: 'Maíz', trigo: 'Trigo', girasol: 'Girasol' };
const STORAGE_LABELS = { silo_bolsa: 'Silo bolsa', silo_fijo: 'Silo fijo', deposito: 'Depósito', celda: 'Celda' };
const ACTIVITY_LABELS = {
  cosecha: 'Cosecha',
  siembra: 'Siembra',
  pulverizacion: 'Pulverización',
  labranza: 'Labranza',
  embolsado: 'Embolsado',
};
const STATUSES = {
  pending: { label: 'Nueva', className: 'status-pill--warning' },
  quoted: { label: 'Cotizada', className: 'status-pill--info' },
  accepted: { label: 'Aceptada', className: 'status-pill--success' },
  declined: { label: 'No concretada', className: 'status-pill--muted' },
  cancelled: { label: 'Cancelada', className: 'status-pill--muted' },
};
const FILTERS = [
  { id: 'open', label: 'Abiertas' },
  { id: 'pending', label: 'Nuevas' },
  { id: 'quoted', label: 'Cotizadas' },
  { id: 'accepted', label: 'Aceptadas' },
  { id: 'closed', label: 'Cerradas' },
];

const formatNumber = (value) => new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(Number(value));
const formatDate = (value) => value
  ? new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${String(value).slice(0, 10)}T12:00:00Z`))
  : null;

function Availability({ from, until }) {
  const start = formatDate(from);
  const end = formatDate(until);
  if (!start && !end) return 'Sin fechas definidas';
  if (start && end) return `${start} – ${end}`;
  return start ? `Desde ${start}` : `Hasta ${end}`;
}

function serviceDetails(offering) {
  const details = offering.details ?? {};
  if (offering.serviceType === 'transporte') {
    const cargo = (details.loadTypes ?? []).map((value) => CARGO_LABELS[value] ?? value).join(', ');
    return cargo ? `Cargas: ${cargo}` : 'Cargas a coordinar';
  }
  if (offering.serviceType === 'almacenamiento') {
    const types = (details.storageTypes ?? []).map((value) => STORAGE_LABELS[value] ?? value).join(', ');
    const crops = (details.crops ?? []).map((value) => CROP_LABELS[value] ?? value).join(', ');
    return [types && `Instalaciones: ${types}`, crops && `Cultivos: ${crops}`, details.dryingAvailable && 'Servicio de secado']
      .filter(Boolean)
      .join(' · ') || 'Condiciones a coordinar';
  }
  const activities = (details.activities ?? []).map((value) => ACTIVITY_LABELS[value] ?? value).join(', ');
  return [activities && `Tareas: ${activities}`, details.operatorIncluded && 'Incluye operador']
    .filter(Boolean)
    .join(' · ') || 'Tareas a coordinar';
}

function requestDetails(request) {
  const details = request.requestDetails ?? {};
  if (request.serviceType === 'transporte') {
    return `${CARGO_LABELS[details.loadType] ?? 'Carga'} · destino ${details.destination}`;
  }
  if (request.serviceType === 'almacenamiento') {
    return `${CROP_LABELS[details.crop] ?? details.crop} · ${STORAGE_LABELS[details.storageType] ?? details.storageType} · ${details.storageDays} días`;
  }
  return ACTIVITY_LABELS[details.activity] ?? details.activity;
}

function QuoteDialog({ request, offering, onClose, onSubmit }) {
  const today = new Date().toISOString().slice(0, 10);
  const [values, setValues] = useState({
    price: String(offering.price),
    currency: offering.currency,
    validUntil: '',
    message: '',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function update(event) {
    setValues((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  async function submit(event) {
    event.preventDefault();
    setError('');
    setSaving(true);
    try {
      await onSubmit(request.id, {
        price: Number(values.price),
        currency: values.currency,
        validUntil: values.validUntil || null,
        message: values.message.trim(),
      });
    } catch (reason) {
      setError(reason.message || 'No se pudo enviar la cotización.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
      <section className="dialog-card" role="dialog" aria-modal="true" aria-labelledby="provider-quote-title">
        <div className="dialog-heading">
          <div><span className="eyebrow">RESPUESTA A SOLICITUD</span><h2 id="provider-quote-title">Prepará tu cotización</h2></div>
          <button type="button" className="icon-button" aria-label="Cerrar" onClick={onClose}>×</button>
        </div>
        <p className="provider-quote-context">{request.requester.displayName} · {formatNumber(request.quantity)} {request.quantityUnit} · {requestDetails(request)}</p>
        <form className="account-form" onSubmit={submit}>
          <div className="account-form-grid">
            <label>Precio cotizado
              <input name="price" type="number" min="0.01" step="any" value={values.price} onChange={update} required autoFocus />
            </label>
            <label>Moneda
              <select name="currency" value={values.currency} onChange={update}>
                <option value="ARS">ARS</option>
                <option value="USD">USD</option>
              </select>
            </label>
          </div>
          <p className="account-form-note">La unidad se mantiene según tu servicio: {PRICE_UNIT_LABELS[offering.priceUnit]}.</p>
          <label>Válida hasta <span className="optional-label">Opcional</span>
            <input name="validUntil" type="date" min={today} value={values.validUntil} onChange={update} />
          </label>
          <label>Condiciones de la propuesta <span className="optional-label">Opcional</span>
            <textarea name="message" rows="3" maxLength="1000" value={values.message} onChange={update} placeholder="Incluí alcance, tiempos, forma de trabajo u otras condiciones." />
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="account-form-actions">
            <button type="button" className="button button--secondary" onClick={onClose} disabled={saving}>Cancelar</button>
            <button type="submit" className="button button--primary" disabled={saving}>{saving ? 'Enviando…' : 'Enviar cotización'} <Send size={15} /></button>
          </div>
        </form>
      </section>
    </div>
  );
}

function RequestCard({ request, onQuote, onDecline, busy }) {
  const status = STATUSES[request.status] ?? STATUSES.pending;
  const Icon = SERVICE_ICONS[request.serviceType] ?? Package;
  const dates = [formatDate(request.neededFrom), formatDate(request.neededUntil)].filter(Boolean).join(' – ');
  return (
    <article className="service-request-card">
      <header>
        <div className="service-request-heading">
          <span className="service-request-icon"><Icon size={18} /></span>
          <div><span className="eyebrow">{SERVICE_LABELS[request.serviceType]}</span><h4>{request.requester.displayName}</h4></div>
        </div>
        <span className={`status-pill ${status.className}`}>{status.label}</span>
      </header>
      <div className="service-request-facts">
        <span><MapPin size={14} /> {request.field.name}</span>
        <span>{formatNumber(request.quantity)} {request.quantityUnit}</span>
        <span>{requestDetails(request)}</span>
        {dates && <span><CalendarRange size={14} /> {dates}</span>}
      </div>
      {request.message && <p className="service-request-message"><MessageSquareText size={14} /> {request.message}</p>}
      {request.quote && (
        <div className="service-quote-box">
          <strong>{request.quote.currency} {formatNumber(request.quote.price)} {PRICE_UNIT_LABELS[request.quote.priceUnit]}</strong>
          {request.quote.validUntil && <span>Válida hasta {formatDate(request.quote.validUntil)}</span>}
          {request.quote.message && <p>{request.quote.message}</p>}
        </div>
      )}
      {request.status === 'pending' && (
        <div className="service-request-actions">
          <button type="button" className="button button--primary button--small" onClick={() => onQuote(request)} disabled={busy}>Preparar cotización <ArrowRight size={14} /></button>
          <button type="button" className="button button--secondary button--small" onClick={() => onDecline(request.id)} disabled={busy}>No puedo tomarla</button>
        </div>
      )}
      {request.status === 'accepted' && (
        <div className="service-contact-details">
          <strong><BadgeCheck size={15} /> Cotización aceptada · contacto habilitado</strong>
          <span><UserRound size={14} /> {request.requester.displayName}</span>
          <span>{request.requester.phone || 'El productor no informó teléfono'}</span>
        </div>
      )}
    </article>
  );
}

export default function ServicesPage({ account, onNavigate }) {
  const offering = account.offering;
  const ServiceIcon = SERVICE_ICONS[offering?.serviceType] ?? Truck;
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [filter, setFilter] = useState('open');
  const [activeQuote, setActiveQuote] = useState(null);
  const [busyRequestId, setBusyRequestId] = useState('');

  async function loadRequests() {
    setLoading(true);
    setError('');
    try {
      const { requests: list } = await accountApi.listServiceRequests();
      setRequests(list);
    } catch (reason) {
      setError(reason.message || 'No se pudieron cargar las solicitudes.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadRequests(); }, []);

  const pendingCount = requests.filter((request) => request.status === 'pending').length;
  const quotedCount = requests.filter((request) => request.status === 'quoted').length;
  const acceptedCount = requests.filter((request) => request.status === 'accepted').length;
  const visibleRequests = requests.filter((request) => {
    if (filter === 'open') return ['pending', 'quoted'].includes(request.status);
    if (filter === 'closed') return ['declined', 'cancelled'].includes(request.status);
    return request.status === filter;
  });

  async function sendQuote(requestId, quote) {
    const { request } = await accountApi.submitServiceQuote(requestId, quote);
    setRequests((current) => current.map((item) => item.id === requestId ? request : item));
    setActiveQuote(null);
  }

  async function declineRequest(requestId) {
    setBusyRequestId(requestId);
    setActionError('');
    try {
      const { request } = await accountApi.declineServiceRequest(requestId);
      setRequests((current) => current.map((item) => item.id === requestId ? request : item));
    } catch (reason) {
      setActionError(reason.message || 'No se pudo actualizar la solicitud.');
    } finally {
      setBusyRequestId('');
    }
  }

  return (
    <div className="provider-page">
      <div className="page-intro">
        <div>
          <span className="eyebrow">ESPACIO DEL PRESTADOR</span>
          <h2>Tu servicio en AgroFlow</h2>
          <p>Administrá tu oferta y respondé las solicitudes con una cotización clara.</p>
        </div>
        <button type="button" className="button button--secondary" onClick={() => onNavigate('account')}>
          <Pencil size={15} /> {offering ? 'Editar servicio' : 'Completar servicio'}
        </button>
      </div>

      {offering ? (
        <section className="panel provider-service-overview">
          <div className="provider-service-heading">
            <span className="provider-service-icon"><ServiceIcon size={20} /></span>
            <div>
              <span className="eyebrow">TU OFERTA ACTIVA</span>
              <h3>{SERVICE_LABELS[offering.serviceType]} · {offering.subtype}</h3>
            </div>
            <span className="status-pill status-pill--success"><BadgeCheck size={13} /> Visible para productores</span>
          </div>
          <div className="provider-service-facts">
            <div><span>Precio base</span><strong><CircleDollarSign size={15} /> {offering.currency} {formatNumber(offering.price)} {PRICE_UNIT_LABELS[offering.priceUnit]}</strong></div>
            <div><span>Capacidad</span><strong>{formatNumber(offering.capacity)} {CAPACITY_UNIT_LABELS[offering.capacityUnit]}</strong></div>
            <div><span>Cobertura</span><strong><MapPin size={15} /> {formatNumber(offering.serviceRadiusKm)} km de radio</strong></div>
            <div><span>Disponibilidad</span><strong><CalendarRange size={15} /> <Availability from={offering.availableFrom} until={offering.availableUntil} /></strong></div>
            <div><span>Base del servicio</span><strong>{formatNumber(offering.baseLatitude)}, {formatNumber(offering.baseLongitude)}</strong></div>
          </div>
          <p className="provider-service-capabilities">{serviceDetails(offering)}</p>
          {offering.notes && <p className="provider-service-notes">{offering.notes}</p>}
        </section>
      ) : (
        <section className="panel provider-service-empty">
          <span className="provider-service-icon"><ServiceIcon size={20} /></span>
          <div><h3>Completá tu oferta</h3><p>Definí el tipo de servicio, capacidad, tarifa y zona para empezar a recibir pedidos.</p></div>
          <button type="button" className="button button--primary" onClick={() => onNavigate('account')}>Crear oferta</button>
        </section>
      )}

      <section className="provider-request-metrics" aria-label="Resumen de solicitudes">
        <article className="panel"><span className="eyebrow">NUEVAS</span><strong>{loading ? '—' : pendingCount}</strong><span>Esperan tu cotización</span></article>
        <article className="panel"><span className="eyebrow">COTIZADAS</span><strong>{loading ? '—' : quotedCount}</strong><span>Esperan respuesta del productor</span></article>
        <article className="panel"><span className="eyebrow">ACEPTADAS</span><strong>{loading ? '—' : acceptedCount}</strong><span>Podés coordinar el servicio</span></article>
      </section>

      <section className="panel provider-inbox">
        <div className="provider-inbox-heading">
          <div><span className="eyebrow">BANDEJA DE ENTRADA</span><h3>Solicitudes de cotización</h3><p>Revisá la necesidad, enviá tu propuesta y coordiná cuando la acepten.</p></div>
          <button type="button" className="button button--secondary button--small" onClick={loadRequests} disabled={loading}><Clock3 size={14} /> Actualizar</button>
        </div>
        <div className="provider-request-filters" role="tablist" aria-label="Filtrar solicitudes">
          {FILTERS.map(({ id, label }) => (
            <button type="button" role="tab" aria-selected={filter === id} key={id} onClick={() => setFilter(id)}>{label}</button>
          ))}
        </div>
        {error && <div className="app-alert" role="alert">{error}<button type="button" className="text-button" onClick={loadRequests}>Reintentar</button></div>}
        {actionError && <p className="form-error" role="alert">{actionError}</p>}
        {!error && (loading ? (
          <p className="compact-empty" role="status">Cargando solicitudes…</p>
        ) : visibleRequests.length ? (
          <div className="service-request-list">
            {visibleRequests.map((request) => (
              <RequestCard
                key={request.id}
                request={request}
                onQuote={setActiveQuote}
                onDecline={declineRequest}
                busy={busyRequestId === request.id}
              />
            ))}
          </div>
        ) : (
          <div className="provider-inbox-empty">
            <span><MessageSquareText size={22} /></span>
            <h4>No hay solicitudes en esta bandeja</h4>
            <p>Cuando un productor pida una cotización para tu servicio, la vas a encontrar acá.</p>
          </div>
        ))}
      </section>

      <section className="panel provider-marketplace-card">
        <div><span className="eyebrow">OTRAS OPORTUNIDADES</span><h3>Marketplace general</h3><p>Consultá disponibilidades publicadas para la operación de cosecha.</p></div>
        <button type="button" className="button button--primary" onClick={() => onNavigate('marketplace')}>Abrir Marketplace <ArrowRight size={16} /></button>
      </section>

      {activeQuote && offering && (
        <QuoteDialog
          request={activeQuote}
          offering={offering}
          onClose={() => setActiveQuote(null)}
          onSubmit={sendQuote}
        />
      )}
    </div>
  );
}
