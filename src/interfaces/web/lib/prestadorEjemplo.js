export const USUARIO_PRESTADOR_EJEMPLO = { id: 'invitado-prestador', name: 'Prestador de ejemplo', email: '' };

export const CUENTA_PRESTADOR_EJEMPLO = {
  profile: { displayName: 'Transportes del Litoral (ejemplo)', role: 'prestador', phone: '+54 341 555-0142' },
  fields: [],
  offering: {
    serviceType: 'transporte',
    subtype: 'Camión granelero',
    price: 95000,
    currency: 'ARS',
    priceUnit: 'por_viaje',
    capacity: 30,
    capacityUnit: 'toneladas',
    serviceRadiusKm: 250,
    city: 'Rosario',
    baseAddress: 'Av. Circunvalación 1200',
    availableFrom: null,
    availableUntil: null,
    notes: 'Datos ficticios de ejemplo.',
    details: { loadTypes: ['granos'] },
  },
};

export function solicitudesDeEjemplo() {
  return [
    {
      id: 'ej-1', status: 'pending', serviceType: 'transporte',
      requester: { displayName: 'Estancia La Esperanza', phone: '+54 3462 555-0101' },
      field: { name: 'Campo Norte' }, quantity: 60, quantityUnit: 'toneladas',
      requestDetails: { loadType: 'granos', destination: 'Puerto San Martín' },
      neededFrom: null, neededUntil: null, message: 'Necesito dos viajes con soja cosechada.', quote: null,
    },
    {
      id: 'ej-2', status: 'pending', serviceType: 'transporte',
      requester: { displayName: 'Agropecuaria Los Álamos', phone: '' },
      field: { name: 'Lote 4' }, quantity: 90, quantityUnit: 'toneladas',
      requestDetails: { loadType: 'granos', destination: 'Puerto General San Martín' },
      neededFrom: null, neededUntil: null, message: '', quote: null,
    },
    {
      id: 'ej-3', status: 'accepted', serviceType: 'transporte',
      requester: { displayName: 'Don Ramiro S.A.', phone: '+54 3471 555-0188' },
      field: { name: 'Campo Sur' }, quantity: 30, quantityUnit: 'toneladas',
      requestDetails: { loadType: 'granos', destination: 'Timbúes' },
      neededFrom: null, neededUntil: null, message: '',
      quote: { currency: 'ARS', price: 95000, priceUnit: 'por_viaje', validUntil: null, message: '' },
    },
  ];
}
