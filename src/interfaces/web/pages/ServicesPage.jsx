import { ArrowRight, CalendarRange, MapPin, Pencil, Truck } from 'lucide-react';

const SERVICE_LABELS = {
  transporte: 'Transporte',
  almacenamiento: 'Almacenamiento',
  maquinaria: 'Maquinaria',
};

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

function formatNumber(value) {
  return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(Number(value));
}

function formatDate(value) {
  if (!value) return null;
  return new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${String(value).slice(0, 10)}T12:00:00Z`));
}

function Availability({ from, until }) {
  const start = formatDate(from);
  const end = formatDate(until);
  if (!start && !end) return 'Sin fechas definidas';
  if (start && end) return `${start} – ${end}`;
  return start ? `Desde ${start}` : `Hasta ${end}`;
}

export default function ServicesPage({ account, onNavigate }) {
  const offering = account.offering;

  return (
    <div className="provider-page">
      <div className="page-intro">
        <div>
          <span className="eyebrow">ESPACIO DEL PRESTADOR</span>
          <h2>Tu servicio en AgroFlow</h2>
          <p>Gestioná los datos de tu oferta y encontrá oportunidades desde el Marketplace.</p>
        </div>
        <button type="button" className="button button--secondary" onClick={() => onNavigate('account')}>
          <Pencil size={15} /> {offering ? 'Editar servicio' : 'Completar servicio'}
        </button>
      </div>

      {offering ? (
        <section className="panel provider-service-overview">
          <div className="provider-service-heading">
            <span className="provider-service-icon"><Truck size={20} /></span>
            <div>
              <span className="eyebrow">TU OFERTA DE SERVICIO</span>
              <h3>{SERVICE_LABELS[offering.serviceType] ?? 'Servicio'} · {offering.subtype}</h3>
            </div>
          </div>
          <div className="provider-service-facts">
            <div><span>Precio</span><strong>{offering.currency} {formatNumber(offering.price)} {PRICE_UNIT_LABELS[offering.priceUnit] ?? offering.priceUnit}</strong></div>
            <div><span>Capacidad</span><strong>{formatNumber(offering.capacity)} {CAPACITY_UNIT_LABELS[offering.capacityUnit] ?? offering.capacityUnit}</strong></div>
            <div><span>Cobertura</span><strong>{formatNumber(offering.serviceRadiusKm)} km de radio</strong></div>
            <div><span>Disponibilidad</span><strong><CalendarRange size={15} /> <Availability from={offering.availableFrom} until={offering.availableUntil} /></strong></div>
            <div><span>Base del servicio</span><strong><MapPin size={15} /> {formatNumber(offering.baseLatitude)}, {formatNumber(offering.baseLongitude)}</strong></div>
          </div>
          {offering.notes && <p className="provider-service-notes">{offering.notes}</p>}
        </section>
      ) : (
        <section className="panel provider-service-empty">
          <span className="provider-service-icon"><Truck size={20} /></span>
          <div>
            <h3>Completá tu oferta</h3>
            <p>Agregá el tipo de servicio, precio, capacidad y zona de cobertura para presentarte en AgroFlow.</p>
          </div>
          <button type="button" className="button button--primary" onClick={() => onNavigate('account')}>Completar servicio</button>
        </section>
      )}

      <section className="panel provider-marketplace-card">
        <div>
          <span className="eyebrow">OPORTUNIDADES</span>
          <h3>Marketplace</h3>
          <p>Consultá las ofertas y publicá tu disponibilidad en un espacio separado de la gestión de tu servicio.</p>
        </div>
        <button type="button" className="button button--primary" onClick={() => onNavigate('marketplace')}>
          Abrir Marketplace <ArrowRight size={16} />
        </button>
      </section>
    </div>
  );
}
