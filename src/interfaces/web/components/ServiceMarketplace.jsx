import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, BadgeCheck, CalendarRange, MapPin, MessageSquareText, Package, Search, Send, Tractor, Truck } from 'lucide-react';
import { accountApi } from '../lib/accountApi.js';
import { distanciaKm } from '../lib/data.js';

const SERVICE_TYPES = [
  { id: '', label: 'Todos', icon: Package },
  { id: 'transporte', label: 'Transporte', icon: Truck },
  { id: 'almacenamiento', label: 'Almacenamiento', icon: Package },
  { id: 'maquinaria', label: 'Maquinaria', icon: Tractor },
];
const SERVICE_LABELS = { transporte: 'Transporte', almacenamiento: 'Almacenamiento', maquinaria: 'Maquinaria' };
const PRICE_UNITS = {
  por_viaje: 'por viaje',
  por_km: 'por km',
  por_dia: 'por día',
  por_tonelada: 'por tonelada',
  por_tonelada_mes: 'por tonelada / mes',
  por_tonelada_dia: 'por tonelada / día',
  por_hectarea: 'por hectárea',
  por_hora: 'por hora',
};
const CAPACITY_UNITS = {
  toneladas: 'toneladas',
  hectareas_dia: 'ha/día',
  hectareas: 'hectáreas',
  metros_cubicos: 'm³',
};
const CROP_LABELS = { soja: 'Soja', maiz: 'Maíz', trigo: 'Trigo', girasol: 'Girasol' };
const CARGO_LABELS = { granos: 'Granos', insumos: 'Insumos', maquinaria: 'Maquinaria', otros: 'Otros' };
const STORAGE_LABELS = { silo_bolsa: 'Silo bolsa', silo_fijo: 'Silo fijo', deposito: 'Depósito', celda: 'Celda' };
const ACTIVITY_LABELS = {
  cosecha: 'Cosecha',
  siembra: 'Siembra',
  pulverizacion: 'Pulverización',
  labranza: 'Labranza',
  embolsado: 'Embolsado',
};
const REQUEST_STATUS = {
  pending: { label: 'Esperando cotización', kind: 'status-pill--warning' },
  quoted: { label: 'Cotización recibida', kind: 'status-pill--info' },
  accepted: { label: 'Aceptada', kind: 'status-pill--success' },
  declined: { label: 'No concretada', kind: 'status-pill--muted' },
  cancelled: { label: 'Cancelada', kind: 'status-pill--muted' },
};

const formatNumber = (value) => new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(Number(value));
const formatDate = (value) => value
  ? new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${String(value).slice(0, 10)}T12:00:00Z`))
  : '';

function requestDetailsLabel(request) {
  const details = request.requestDetails ?? {};
  if (request.serviceType === 'transporte') {
    return `${CARGO_LABELS[details.loadType] ?? 'Carga'} · destino ${details.destination}`;
  }
  if (request.serviceType === 'almacenamiento') {
    return `${CROP_LABELS[details.crop] ?? details.crop} · ${STORAGE_LABELS[details.storageType] ?? details.storageType} · ${details.storageDays} días`;
  }
  return ACTIVITY_LABELS[details.activity] ?? details.activity;
}

function ProviderCard({ entry, field, onRequest }) {
  const { offering, providerId, providerName } = entry;
  const distance = field
    ? distanciaKm(
      { latitude: field.latitude, longitude: field.longitude },
      { latitude: offering.baseLatitude, longitude: offering.baseLongitude },
    )
    : null;
  const covered = distance != null && distance <= offering.serviceRadiusKm;
  const tags = offering.serviceType === 'transporte'
    ? (offering.details?.loadTypes ?? []).map((value) => CARGO_LABELS[value] ?? value)
    : offering.serviceType === 'almacenamiento'
      ? [
        ...(offering.details?.storageTypes ?? []).map((value) => STORAGE_LABELS[value] ?? value),
        ...(offering.details?.crops ?? []).map((value) => CROP_LABELS[value] ?? value),
        ...(offering.details?.dryingAvailable ? ['Secado'] : []),
      ]
      : [
        ...(offering.details?.activities ?? []).map((value) => ACTIVITY_LABELS[value] ?? value),
        ...(offering.details?.operatorIncluded ? ['Con operador'] : []),
      ];

  return (
    <article className="service-provider-card">
      <header>
        <span className="service-provider-avatar" aria-hidden="true">{providerName.slice(0, 1).toUpperCase()}</span>
        <div>
          <strong>{providerName}</strong>
          <span>{SERVICE_LABELS[offering.serviceType]} · {offering.subtype}</span>
        </div>
      </header>
      <div className="service-provider-facts">
        <span>{offering.currency} {formatNumber(offering.price)} {PRICE_UNITS[offering.priceUnit]}</span>
        <span>Capacidad: {formatNumber(offering.capacity)} {CAPACITY_UNITS[offering.capacityUnit]}</span>
        <span><MapPin size={14} /> Radio {formatNumber(offering.serviceRadiusKm)} km</span>
      </div>
      {tags.length > 0 && <div className="service-detail-chips">{tags.map((tag) => <span key={tag}>{tag}</span>)}</div>}
      {offering.notes && <p className="service-provider-notes">{offering.notes}</p>}
      {distance != null && (
        <div className={`service-coverage${covered ? ' service-coverage--ok' : ''}`}>
          {covered ? <BadgeCheck size={14} /> : <MapPin size={14} />}
          {covered ? `Cubre tu campo · ${formatNumber(distance)} km` : `Fuera de cobertura · ${formatNumber(distance)} km`}
        </div>
      )}
      <button
        type="button"
        className="button button--primary button--small"
        onClick={() => onRequest(entry)}
        disabled={!field || !covered}
      >
        Pedir cotización <ArrowRight size={15} />
      </button>
      {!field && <small className="service-provider-hint">Agregá un campo en Mi cuenta para consultar.</small>}
    </article>
  );
}

function QuoteRequestDialog({ entry, field, onClose, onSubmit }) {
  const { offering } = entry;
  const details = offering.details ?? {};
  const loadTypes = details.loadTypes?.length ? details.loadTypes : Object.keys(CARGO_LABELS);
  const storageTypes = details.storageTypes?.length ? details.storageTypes : Object.keys(STORAGE_LABELS);
  const crops = details.crops?.length ? details.crops : Object.keys(CROP_LABELS);
  const activities = details.activities?.length ? details.activities : Object.keys(ACTIVITY_LABELS);
  const [values, setValues] = useState(() => ({
    quantity: '',
    neededFrom: '',
    neededUntil: '',
    message: '',
    requestDetails: offering.serviceType === 'transporte'
      ? { loadType: loadTypes[0], destination: '' }
      : offering.serviceType === 'almacenamiento'
        ? { crop: crops[0], storageType: storageTypes[0], storageDays: '30' }
        : { activity: activities[0] },
  }));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function update(event) {
    const { name, value } = event.target;
    if (name.startsWith('requestDetails.')) {
      const key = name.slice('requestDetails.'.length);
      setValues((current) => ({ ...current, requestDetails: { ...current.requestDetails, [key]: value } }));
      return;
    }
    setValues((current) => ({ ...current, [name]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    setError('');
    setSaving(true);
    try {
      await onSubmit({
        providerId: entry.providerId,
        offeringId: offering.id,
        fieldId: field.id,
        serviceType: offering.serviceType,
        quantity: Number(values.quantity),
        neededFrom: values.neededFrom || null,
        neededUntil: values.neededUntil || null,
        message: values.message.trim(),
        requestDetails: {
          ...values.requestDetails,
          ...(values.requestDetails.storageDays ? { storageDays: Number(values.requestDetails.storageDays) } : {}),
        },
      });
    } catch (reason) {
      setError(reason.message || 'No se pudo enviar la solicitud.');
    } finally {
      setSaving(false);
    }
  }

  const quantityUnit = offering.serviceType === 'maquinaria' ? 'hectáreas' : 'toneladas';
  return (
    <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
      <section className="dialog-card" role="dialog" aria-modal="true" aria-labelledby="quote-request-title">
        <div className="dialog-heading">
          <div><span className="eyebrow">SOLICITUD DE COTIZACIÓN</span><h2 id="quote-request-title">{entry.providerName}</h2><p>{offering.subtype}</p></div>
          <button type="button" className="icon-button" aria-label="Cerrar" onClick={onClose}>×</button>
        </div>
        <form className="account-form" onSubmit={submit}>
          <label>Campo
            <input value={`${field.name} · ${formatNumber(field.areaHa)} ha`} readOnly />
          </label>
          <label>Cantidad ({quantityUnit})
            <input name="quantity" type="number" min="0.01" step="any" value={values.quantity} onChange={update} required autoFocus />
          </label>
          {offering.serviceType === 'transporte' && (
            <div className="account-form-grid">
              <label>Tipo de carga
                <select name="requestDetails.loadType" value={values.requestDetails.loadType} onChange={update}>
                  {loadTypes.map((value) => <option key={value} value={value}>{CARGO_LABELS[value] ?? value}</option>)}
                </select>
              </label>
              <label>Destino
                <input name="requestDetails.destination" value={values.requestDetails.destination} onChange={update} placeholder="Localidad o establecimiento" required maxLength={120} />
              </label>
            </div>
          )}
          {offering.serviceType === 'almacenamiento' && (
            <div className="account-form-grid">
              <label>Cultivo
                <select name="requestDetails.crop" value={values.requestDetails.crop} onChange={update}>
                  {crops.map((value) => <option key={value} value={value}>{CROP_LABELS[value] ?? value}</option>)}
                </select>
              </label>
              <label>Instalación
                <select name="requestDetails.storageType" value={values.requestDetails.storageType} onChange={update}>
                  {storageTypes.map((value) => <option key={value} value={value}>{STORAGE_LABELS[value] ?? value}</option>)}
                </select>
              </label>
              <label>Días estimados
                <input name="requestDetails.storageDays" type="number" min="1" step="1" max="3650" value={values.requestDetails.storageDays} onChange={update} required />
              </label>
            </div>
          )}
          {offering.serviceType === 'maquinaria' && (
            <label>Tarea
              <select name="requestDetails.activity" value={values.requestDetails.activity} onChange={update}>
                {activities.map((value) => <option key={value} value={value}>{ACTIVITY_LABELS[value] ?? value}</option>)}
              </select>
            </label>
          )}
          <div className="account-form-grid">
            <label>Fecha estimada desde<input name="neededFrom" type="date" value={values.neededFrom} onChange={update} /></label>
            <label>Hasta<input name="neededUntil" type="date" value={values.neededUntil} onChange={update} /></label>
          </div>
          <label>Mensaje para el prestador <span className="optional-label">Opcional</span>
            <textarea name="message" rows="3" maxLength="1000" value={values.message} onChange={update} placeholder="Contá algún detalle que ayude a preparar la cotización." />
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="account-form-actions">
            <button type="button" className="button button--secondary" onClick={onClose} disabled={saving}>Cancelar</button>
            <button type="submit" className="button button--primary" disabled={saving}>{saving ? 'Enviando…' : 'Enviar solicitud'} <Send size={15} /></button>
          </div>
        </form>
      </section>
    </div>
  );
}

function ProducerRequestCard({ request, onAction, busy }) {
  const status = REQUEST_STATUS[request.status] ?? REQUEST_STATUS.pending;
  const dateRange = [formatDate(request.neededFrom), formatDate(request.neededUntil)].filter(Boolean).join(' – ');
  const quoteExpired = request.quote?.validUntil
    && request.quote.validUntil < new Date().toISOString().slice(0, 10);
  return (
    <article className="service-request-card">
      <header>
        <div><span className="eyebrow">{SERVICE_LABELS[request.serviceType]}</span><h4>{request.provider.displayName} · {request.subtype}</h4></div>
        <span className={`status-pill ${status.kind}`}>{status.label}</span>
      </header>
      <p className="service-request-summary">{request.field.name} · {formatNumber(request.quantity)} {request.quantityUnit} · {requestDetailsLabel(request)}</p>
      {dateRange && <p className="service-request-meta"><CalendarRange size={14} /> {dateRange}</p>}
      {request.message && <p className="service-request-message"><MessageSquareText size={14} /> {request.message}</p>}
      {request.quote && (
        <div className="service-quote-box">
          <strong>Cotización: {request.quote.currency} {formatNumber(request.quote.price)} {PRICE_UNITS[request.quote.priceUnit]}</strong>
          {request.quote.validUntil && <span>Válida hasta {formatDate(request.quote.validUntil)}</span>}
          {quoteExpired && <span className="service-quote-expired">Cotización vencida; pedí una nueva al prestador.</span>}
          {request.quote.message && <p>{request.quote.message}</p>}
        </div>
      )}
      {request.status === 'quoted' && (
        <div className="service-request-actions">
          <button type="button" className="button button--primary button--small" onClick={() => onAction(request.id, 'accept_quote')} disabled={busy || quoteExpired}>Aceptar cotización</button>
          <button type="button" className="button button--secondary button--small" onClick={() => onAction(request.id, 'decline_quote')} disabled={busy}>Rechazar</button>
        </div>
      )}
      {request.status === 'pending' && <button type="button" className="text-button" onClick={() => onAction(request.id, 'cancel')} disabled={busy}>Cancelar solicitud</button>}
      {request.status === 'accepted' && (
        <div className="service-contact-details">
          <strong>Contacto del prestador</strong>
          <span>{request.provider.phone || 'No informó teléfono de contacto'}</span>
        </div>
      )}
    </article>
  );
}

export default function ServiceMarketplace({ fields, onNavigate, onToast }) {
  const [offerings, setOfferings] = useState([]);
  const [requests, setRequests] = useState([]);
  const [serviceType, setServiceType] = useState('');
  const [search, setSearch] = useState('');
  const [selectedFieldId, setSelectedFieldId] = useState(fields[0]?.id ?? '');
  const [activeRequest, setActiveRequest] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [busyRequestId, setBusyRequestId] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [offeringResult, requestResult] = await Promise.all([
        accountApi.listServiceOfferings(),
        accountApi.listServiceRequests(),
      ]);
      setOfferings(offeringResult.offerings);
      setRequests(requestResult.requests);
    } catch (reason) {
      setError(reason.message || 'No se pudieron cargar los prestadores y las solicitudes.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const selectedField = fields.find((field) => field.id === selectedFieldId) ?? fields[0] ?? null;
  const visibleOfferings = useMemo(() => {
    const query = search.trim().toLowerCase();
    return offerings.filter(({ providerName, offering }) => (
      (!serviceType || offering.serviceType === serviceType)
      && (!query || `${providerName} ${offering.subtype} ${offering.notes ?? ''}`.toLowerCase().includes(query))
    ));
  }, [offerings, serviceType, search]);
  const visibleRequests = requests.filter((request) => statusFilter === 'all' || request.status === statusFilter);
  const openRequests = requests.filter((request) => ['pending', 'quoted'].includes(request.status)).length;

  async function createRequest(payload) {
    const { request } = await accountApi.createServiceRequest(payload);
    setRequests((current) => [request, ...current]);
    setActiveRequest(null);
    onToast('Solicitud enviada. Vas a ver la cotización en Mis solicitudes.');
  }

  async function respondToRequest(id, action) {
    setBusyRequestId(id);
    setActionError('');
    try {
      const { request } = await accountApi.respondToServiceQuote(id, action);
      setRequests((current) => current.map((item) => item.id === id ? request : item));
    } catch (reason) {
      setActionError(reason.message || 'No se pudo actualizar la solicitud.');
    } finally {
      setBusyRequestId('');
    }
  }

  return (
    <section className="service-marketplace">
      <div className="service-marketplace-heading">
        <div>
          <span className="eyebrow">SERVICIOS DE LA COMUNIDAD</span>
          <h3>Encontrá un prestador y pedí cotización</h3>
          <p>La cotización no confirma una reserva. Si la aceptás, se habilitan los datos de contacto para coordinar.</p>
        </div>
        <div className="service-request-count"><strong>{openRequests}</strong><span>solicitudes abiertas</span></div>
      </div>

      {error && (
        <div className="app-alert" role="alert">
          {error}
          <button type="button" className="text-button" onClick={load}>Reintentar</button>
        </div>
      )}

      {!error && (
        <>
          <section aria-label="Directorio de prestadores">
            <div className="service-marketplace-toolbar">
              <div className="service-type-tabs" role="tablist" aria-label="Tipo de servicio">
                {SERVICE_TYPES.map(({ id, label, icon: Icon }) => (
                  <button type="button" role="tab" aria-selected={serviceType === id} key={id || 'all'} onClick={() => setServiceType(id)}>
                    <Icon size={15} />{label}
                  </button>
                ))}
              </div>
              <label className="search-field"><Search size={15} /><input type="search" aria-label="Buscar prestador" placeholder="Buscar prestador o servicio" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
            </div>
            {fields.length > 0 && (
              <label className="service-field-select">Campo para evaluar cobertura
                <select value={selectedField?.id ?? ''} onChange={(event) => setSelectedFieldId(event.target.value)}>
                  {fields.map((field) => <option key={field.id} value={field.id}>{field.name}</option>)}
                </select>
              </label>
            )}
            {loading ? (
              <p className="compact-empty" role="status">Cargando prestadores…</p>
            ) : visibleOfferings.length ? (
              <div className="service-provider-grid">
                {visibleOfferings.map((entry) => (
                  <ProviderCard key={entry.offering.id} entry={entry} field={selectedField} onRequest={setActiveRequest} />
                ))}
              </div>
            ) : (
              <div className="compact-empty">No hay prestadores registrados para este filtro.</div>
            )}
          </section>

          <section className="producer-requests">
            <div className="service-marketplace-heading">
              <div><span className="eyebrow">SEGUIMIENTO</span><h3>Mis solicitudes</h3><p>Revisá las respuestas y cotizaciones que te enviaron.</p></div>
              <label className="sort-field">Estado
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                  <option value="all">Todos</option>
                  <option value="pending">Esperando cotización</option>
                  <option value="quoted">Cotización recibida</option>
                  <option value="accepted">Aceptadas</option>
                  <option value="declined">No concretadas</option>
                  <option value="cancelled">Canceladas</option>
                </select>
              </label>
            </div>
            {actionError && <p className="form-error" role="alert">{actionError}</p>}
            {visibleRequests.length ? (
              <div className="service-request-list">
                {visibleRequests.map((request) => (
                  <ProducerRequestCard
                    key={request.id}
                    request={request}
                    onAction={respondToRequest}
                    busy={busyRequestId === request.id}
                  />
                ))}
              </div>
            ) : <div className="compact-empty">Todavía no tenés solicitudes en este estado.</div>}
          </section>
        </>
      )}

      {activeRequest && selectedField && (
        <QuoteRequestDialog
          entry={activeRequest}
          field={selectedField}
          onClose={() => setActiveRequest(null)}
          onSubmit={createRequest}
        />
      )}
    </section>
  );
}
