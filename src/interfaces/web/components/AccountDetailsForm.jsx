import { lazy, Suspense, useState } from 'react';

const MapPicker = lazy(() => import('./MapPicker.jsx'));

const SERVICE_OPTIONS = [
  { value: 'transporte', label: 'Transporte' },
  { value: 'almacenamiento', label: 'Almacenamiento' },
  { value: 'maquinaria', label: 'Maquinaria' },
];

const PRICE_UNITS = {
  transporte: [
    ['por_viaje', 'Por viaje'],
    ['por_km', 'Por kilómetro'],
    ['por_dia', 'Por día'],
    ['por_tonelada', 'Por tonelada'],
  ],
  almacenamiento: [
    ['por_tonelada_mes', 'Por tonelada / mes'],
    ['por_tonelada_dia', 'Por tonelada / día'],
  ],
  maquinaria: [
    ['por_hectarea', 'Por hectárea'],
    ['por_hora', 'Por hora'],
    ['por_dia', 'Por día'],
  ],
};

const CAPACITY_UNITS = {
  transporte: [['toneladas', 'Toneladas por unidad']],
  almacenamiento: [['toneladas', 'Toneladas de capacidad']],
  maquinaria: [
    ['hectareas_dia', 'Hectáreas por día'],
    ['hectareas', 'Hectáreas de capacidad'],
  ],
};

const DEFAULT_DETAILS = {
  transporte: { loadTypes: ['granos'] },
  almacenamiento: { storageTypes: ['silo_bolsa'], crops: ['soja', 'maiz', 'trigo'], dryingAvailable: false },
  maquinaria: { activities: ['cosecha'], operatorIncluded: true },
};

const DETAIL_OPTIONS = {
  loadTypes: [
    ['granos', 'Granos'],
    ['insumos', 'Insumos'],
    ['maquinaria', 'Maquinaria'],
    ['otros', 'Otros'],
  ],
  storageTypes: [
    ['silo_bolsa', 'Silo bolsa'],
    ['silo_fijo', 'Silo fijo'],
    ['deposito', 'Depósito'],
    ['celda', 'Celda'],
  ],
  crops: [
    ['soja', 'Soja'],
    ['maiz', 'Maíz'],
    ['trigo', 'Trigo'],
    ['girasol', 'Girasol'],
  ],
  activities: [
    ['cosecha', 'Cosecha'],
    ['siembra', 'Siembra'],
    ['pulverizacion', 'Pulverización'],
    ['labranza', 'Labranza'],
    ['embolsado', 'Embolsado'],
  ],
};

function defaultValues(initial = {}) {
  const field = initial.fields?.[0] ?? {};
  const offering = initial.offering ?? {};
  const serviceType = offering.serviceType ?? 'transporte';
  return {
    role: initial.profile?.role ?? initial.role ?? 'productor',
    displayName: initial.profile?.displayName ?? initial.displayName ?? '',
    phone: initial.profile?.phone ?? initial.phone ?? '',
    fieldName: field.name ?? '',
    city: field.city ?? offering.city ?? '',
    areaHa: field.areaHa ?? '',
    latitude: field.latitude ?? '',
    longitude: field.longitude ?? '',
    serviceType,
    subtype: offering.subtype ?? '',
    price: offering.price ?? '',
    currency: offering.currency ?? 'ARS',
    priceUnit: offering.priceUnit ?? PRICE_UNITS[serviceType][0][0],
    capacity: offering.capacity ?? '',
    capacityUnit: offering.capacityUnit ?? CAPACITY_UNITS[serviceType][0][0],
    baseLatitude: offering.baseLatitude ?? '',
    baseLongitude: offering.baseLongitude ?? '',
    serviceRadiusKm: offering.serviceRadiusKm ?? '',
    baseAddress: offering.baseAddress ?? '',
    availableFrom: offering.availableFrom?.slice(0, 10) ?? '',
    availableUntil: offering.availableUntil?.slice(0, 10) ?? '',
    details: { ...DEFAULT_DETAILS[serviceType], ...offering.details },
    notes: offering.notes ?? '',
  };
}

function toPayload(values) {
  const common = {
    displayName: values.displayName,
    phone: values.phone,
    role: values.role,
  };
  if (values.role === 'productor') {
    return {
      ...common,
      field: {
        name: values.fieldName,
        areaHa: values.areaHa,
        city: values.city,
        latitude: values.latitude,
        longitude: values.longitude,
        boundary: values.boundary,
      },
    };
  }
  return {
    ...common,
    offering: {
      serviceType: values.serviceType,
      subtype: values.subtype,
      price: values.price,
      currency: values.currency,
      priceUnit: values.priceUnit,
      capacity: values.capacity,
      capacityUnit: values.capacityUnit,
      baseLatitude: values.baseLatitude,
      baseLongitude: values.baseLongitude,
      city: values.city,
      baseAddress: values.baseAddress,
      serviceRadiusKm: values.serviceRadiusKm,
      availableFrom: values.availableFrom || null,
      availableUntil: values.availableUntil || null,
      details: values.details,
      notes: values.notes,
    },
  };
}

function DetailOptions({ name, label, options, values, onToggle }) {
  return (
    <fieldset className="service-detail-options">
      <legend>{label}</legend>
      <div>
        {options.map(([value, optionLabel]) => (
          <label className="service-detail-option" key={value}>
            <input
              type="checkbox"
              checked={values.includes(value)}
              onChange={() => onToggle(name, value)}
            />
            <span>{optionLabel}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export default function AccountDetailsForm({
  initial,
  allowRoleChange = false,
  profileOnly = false,
  hideProfileFields = false,
  onSubmit,
  onCancel,
  submitLabel = 'Guardar datos',
}) {
  const [values, setValues] = useState(() => defaultValues(initial));
  const [boundary, setBoundary] = useState(() => initial?.fields?.[0]?.boundary ?? null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function update(event) {
    const { name, value } = event.target;
    setValues((current) => {
      if (name === 'serviceType') {
        return {
          ...current,
          serviceType: value,
          priceUnit: PRICE_UNITS[value][0][0],
          capacityUnit: CAPACITY_UNITS[value][0][0],
          details: DEFAULT_DETAILS[value],
        };
      }
      return { ...current, [name]: value };
    });
  }

  function toggleDetail(name, value) {
    setValues((current) => {
      const selected = current.details[name] ?? [];
      return {
        ...current,
        details: {
          ...current.details,
          [name]: selected.includes(value)
            ? selected.filter((item) => item !== value)
            : [...selected, value],
        },
      };
    });
  }

  function updateDetail(name, value) {
    setValues((current) => ({
      ...current,
      details: { ...current.details, [name]: value },
    }));
  }

  async function submit(event) {
    event.preventDefault();
    setError('');
    setSaving(true);
    try {
      if (!profileOnly && values.role === 'productor' && (!values.city || !boundary)) {
        throw new Error('Elegí una ciudad y dibujá el perímetro del campo.');
      }
      if (!profileOnly && values.role === 'prestador' && (!values.city || !values.baseLatitude || !values.baseLongitude)) {
        throw new Error('Elegí una ciudad y marcá la ubicación aproximada en el mapa.');
      }
      const payload = profileOnly
        ? (allowRoleChange
          ? { displayName: values.displayName, phone: values.phone, role: values.role }
          : { displayName: values.displayName, phone: values.phone })
        : toPayload({ ...values, boundary });
      await onSubmit(payload);
    } catch (reason) {
      setError(reason.message || 'No se pudieron guardar los datos.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="account-form" onSubmit={submit}>
      {!hideProfileFields && (
        <>
          <label>
            Nombre y apellido
            <input name="displayName" value={values.displayName} onChange={update} autoComplete="name" required minLength={2} maxLength={120} />
          </label>
          <label>
            Teléfono de contacto <span className="optional-label">Opcional</span>
            <input name="phone" type="tel" value={values.phone} onChange={update} autoComplete="tel" maxLength={32} placeholder="+54 9 ..." />
          </label>
        </>
      )}

      {allowRoleChange && (
        <fieldset className="role-picker">
          <legend>¿Cómo vas a usar AgroFlow?</legend>
          <label className={`role-card${values.role === 'productor' ? ' is-selected' : ''}`}>
            <input type="radio" name="role" value="productor" checked={values.role === 'productor'} onChange={update} />
            <span className="role-card-icon" aria-hidden="true">⌂</span>
            <span><strong>Tengo campo</strong><small>Registro ubicación y superficie.</small></span>
          </label>
          <label className={`role-card${values.role === 'prestador' ? ' is-selected' : ''}`}>
            <input type="radio" name="role" value="prestador" checked={values.role === 'prestador'} onChange={update} />
            <span className="role-card-icon" aria-hidden="true">↗</span>
            <span><strong>Presto servicios</strong><small>Publico un servicio y sus condiciones.</small></span>
          </label>
        </fieldset>
      )}

      {!profileOnly && (values.role === 'productor' ? (
        <section className="account-form-section">
          <div><span className="eyebrow">DATOS ESTABLES</span><h3>Tu campo</h3></div>
          <label>
            Nombre del campo
            <input name="fieldName" value={values.fieldName} onChange={update} required maxLength={120} placeholder="Ej. La Esperanza" />
          </label>
          <p className="account-form-note">Buscá la localidad en el mapa y marcá el perímetro. La superficie se calcula automáticamente; los datos de cultivo y siembra se cargan luego para cada lote.</p>
          <Suspense fallback={<p role="status">Cargando mapa…</p>}>
            <MapPicker
              latitude={values.latitude}
              longitude={values.longitude}
              city={values.city}
              onCityChange={(city) => setValues((current) => ({ ...current, city }))}
              mode="polygon"
              boundary={boundary}
              onBoundaryChange={(nextBoundary) => {
                setBoundary(nextBoundary);
                if (!nextBoundary) {
                  setValues((current) => ({ ...current, areaHa: '', latitude: '', longitude: '' }));
                  return;
                }
                const center = nextBoundary.geometry.coordinates[0].slice(0, -1)
                  .reduce(([longitude, latitude], point) => [longitude + point[0], latitude + point[1]], [0, 0])
                  .map((coordinate) => coordinate / (nextBoundary.geometry.coordinates[0].length - 1));
                setValues((current) => ({
                  ...current,
                  areaHa: nextBoundary.properties.areaHa.toFixed(2),
                  longitude: center[0].toFixed(6),
                  latitude: center[1].toFixed(6),
                }));
              }}
              onPick={(latitude, longitude) => setValues((current) => ({
                ...current,
                latitude: latitude.toFixed(6),
                longitude: longitude.toFixed(6),
              }))}
            />
          </Suspense>
          <label>
            Superficie calculada
            <input name="areaHa" type="number" value={values.areaHa} readOnly placeholder="Se calcula al dibujar el perímetro" />
          </label>
        </section>
      ) : (
        <section className="account-form-section">
          <div><span className="eyebrow">UNA OFERTA DE SERVICIO</span><h3>Qué ofrecés</h3></div>
          <label>
            Tipo de servicio
            <select name="serviceType" value={values.serviceType} onChange={update}>
              {SERVICE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label>
            Detalle / tipo
            <input name="subtype" value={values.subtype} onChange={update} required maxLength={120} placeholder={values.serviceType === 'transporte' ? 'Ej. camión semirremolque' : values.serviceType === 'maquinaria' ? 'Ej. cosechadora clase 8' : 'Ej. silo de campaña'} />
          </label>
          <div className="account-form-grid">
            <label>
              Precio
              <input name="price" type="number" min="0.01" step="any" value={values.price} onChange={update} required />
            </label>
            <label>
              Moneda
              <select name="currency" value={values.currency} onChange={update}><option value="ARS">ARS</option><option value="USD">USD</option></select>
            </label>
          </div>
          <div className="account-form-grid">
            <label>
              Unidad de precio
              <select name="priceUnit" value={values.priceUnit} onChange={update}>
                {PRICE_UNITS[values.serviceType].map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label>
              Capacidad
              <input name="capacity" type="number" min="0.01" step="any" value={values.capacity} onChange={update} required />
            </label>
          </div>
          <label>
            Unidad de capacidad
            <select name="capacityUnit" value={values.capacityUnit} onChange={update}>
              {CAPACITY_UNITS[values.serviceType].map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          {values.serviceType === 'transporte' && (
            <DetailOptions
              name="loadTypes"
              label="Qué podés transportar"
              options={DETAIL_OPTIONS.loadTypes}
              values={values.details.loadTypes ?? []}
              onToggle={toggleDetail}
            />
          )}
          {values.serviceType === 'almacenamiento' && (
            <>
              <DetailOptions
                name="storageTypes"
                label="Instalaciones disponibles"
                options={DETAIL_OPTIONS.storageTypes}
                values={values.details.storageTypes ?? []}
                onToggle={toggleDetail}
              />
              <DetailOptions
                name="crops"
                label="Cultivos que recibís"
                options={DETAIL_OPTIONS.crops}
                values={values.details.crops ?? []}
                onToggle={toggleDetail}
              />
              <label className="service-detail-option">
                <input
                  type="checkbox"
                  checked={values.details.dryingAvailable ?? false}
                  onChange={(event) => updateDetail('dryingAvailable', event.target.checked)}
                />
                <span>Ofrezco servicio de secado</span>
              </label>
            </>
          )}
          {values.serviceType === 'maquinaria' && (
            <>
              <DetailOptions
                name="activities"
                label="Tareas que realizás"
                options={DETAIL_OPTIONS.activities}
                values={values.details.activities ?? []}
                onToggle={toggleDetail}
              />
              <label className="service-detail-option">
                <input
                  type="checkbox"
                  checked={values.details.operatorIncluded ?? false}
                  onChange={(event) => updateDetail('operatorIncluded', event.target.checked)}
                />
                <span>Incluyo operador</span>
              </label>
            </>
          )}
          <label>
            Dirección o zona aproximada <span className="optional-label">Opcional</span>
            <input name="baseAddress" value={values.baseAddress} onChange={update} maxLength={160} placeholder="Ej. zona rural al norte, Ruta 8 km 220" />
          </label>
          <p className="account-form-note">La ciudad centra el mapa. Marcá una ubicación aproximada; las coordenadas no se muestran en el directorio y el domicilio solo se comparte cuando aceptás una cotización.</p>
          <Suspense fallback={<p role="status">Cargando mapa…</p>}>
            <MapPicker
              latitude={values.baseLatitude}
              longitude={values.baseLongitude}
              city={values.city}
              onCityChange={(city) => setValues((current) => ({ ...current, city }))}
              onPick={(latitude, longitude) => setValues((current) => ({
                ...current,
                baseLatitude: latitude.toFixed(6),
                baseLongitude: longitude.toFixed(6),
              }))}
            />
          </Suspense>
          <label>
            Radio de servicio (km)
            <input name="serviceRadiusKm" type="number" min="1" step="any" value={values.serviceRadiusKm} onChange={update} required />
          </label>
          <div className="account-form-grid">
            <label>
              Disponible desde <span className="optional-label">Opcional</span>
              <input name="availableFrom" type="date" value={values.availableFrom} onChange={update} />
            </label>
            <label>
              Disponible hasta <span className="optional-label">Opcional</span>
              <input name="availableUntil" type="date" value={values.availableUntil} onChange={update} />
            </label>
          </div>
          <label>
            Notas <span className="optional-label">Opcional</span>
            <textarea name="notes" value={values.notes} onChange={update} rows="3" maxLength={500} placeholder="Condiciones, zona o detalles adicionales" />
          </label>
        </section>
      ))}

      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="account-form-actions">
        {onCancel && <button className="button button--secondary" type="button" onClick={onCancel} disabled={saving}>Cancelar</button>}
        <button className="button button--primary" type="submit" disabled={saving}>{saving ? 'Guardando…' : submitLabel}</button>
      </div>
    </form>
  );
}
