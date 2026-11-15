import assert from 'node:assert/strict';
import test from 'node:test';
import { manejarCuenta } from '../../src/interfaces/http/accountApi.js';
import {
  validarCotizacion,
  validarOferta,
  validarSolicitudCotizacion,
} from '../../src/interfaces/http/accountValidation.js';

const ids = {
  providerId: '00000000-0000-4000-8000-000000000001',
  offeringId: '00000000-0000-4000-8000-000000000002',
  fieldId: '00000000-0000-4000-8000-000000000003',
  requestId: '00000000-0000-4000-8000-000000000004',
};

function requestFor(serviceType, requestDetails) {
  return {
    ...ids,
    serviceType,
    quantity: '25',
    neededFrom: '2027-04-10',
    neededUntil: '2027-04-12',
    requestDetails,
    message: 'Necesito coordinar el servicio.',
  };
}

test('valida detalles operativos propios de cada tipo de oferta', () => {
  const storage = validarOferta({
    serviceType: 'almacenamiento',
    subtype: 'Silo bolsa',
    price: 250,
    currency: 'USD',
    priceUnit: 'por_tonelada_mes',
    capacity: 1000,
    capacityUnit: 'toneladas',
    baseLatitude: -33,
    baseLongitude: -60,
    city: 'Rosario · Santa Fe · Argentina',
    serviceRadiusKm: 80,
    details: {
      storageTypes: ['silo_bolsa', 'silo_fijo'],
      crops: ['soja', 'maiz'],
      dryingAvailable: true,
    },
  });

  assert.deepEqual(storage.details, {
    storageTypes: ['silo_bolsa', 'silo_fijo'],
    crops: ['soja', 'maiz'],
    dryingAvailable: true,
  });
  assert.throws(() => validarOferta({
    serviceType: 'maquinaria',
    subtype: 'Cosechadora',
    price: 10,
    currency: 'ARS',
    priceUnit: 'por_hectarea',
    capacity: 50,
    capacityUnit: 'hectareas_dia',
    baseLatitude: -33,
    baseLongitude: -60,
    city: 'Rosario · Santa Fe · Argentina',
    serviceRadiusKm: 100,
    details: { activities: ['vuelo'] },
  }), /opciones inválidas/);
});

test('valida pedidos de cotización con campos específicos de transporte, almacenamiento y maquinaria', () => {
  const transport = validarSolicitudCotizacion(requestFor('transporte', {
    loadType: 'granos',
    destination: 'Puerto Gran Rosario',
  }));
  assert.equal(transport.quantityUnit, 'toneladas');
  assert.deepEqual(transport.requestDetails, { loadType: 'granos', destination: 'Puerto Gran Rosario' });

  const storage = validarSolicitudCotizacion(requestFor('almacenamiento', {
    crop: 'soja',
    storageType: 'silo_bolsa',
    storageDays: '90',
  }));
  assert.equal(storage.requestDetails.storageDays, 90);

  const machinery = validarSolicitudCotizacion({
    ...requestFor('maquinaria', { activity: 'cosecha' }),
    neededUntil: null,
  });
  assert.equal(machinery.quantityUnit, 'hectareas');
  assert.equal(machinery.neededUntil, null);
});

test('rechaza detalles inconsistentes, unidades de tiempo fraccionadas y fechas invertidas', () => {
  assert.throws(() => validarSolicitudCotizacion(requestFor('transporte', {
    loadType: 'granos',
    destination: '',
  })), /falta destino/);
  assert.throws(() => validarSolicitudCotizacion(requestFor('almacenamiento', {
    crop: 'soja',
    storageType: 'silo_bolsa',
    storageDays: 2.5,
  })), /tienen que ser un entero/);
  assert.throws(() => validarSolicitudCotizacion({
    ...requestFor('maquinaria', { activity: 'cosecha' }),
    neededFrom: '2027-04-12',
    neededUntil: '2027-04-10',
  }), /anterior a la fecha desde/);
});

test('valida la propuesta económica del prestador', () => {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  assert.deepEqual(validarCotizacion({
    price: '125000',
    currency: 'ARS',
    validUntil: tomorrow,
    message: 'Incluye traslado.',
  }), {
    price: 125000,
    currency: 'ARS',
    validUntil: tomorrow,
    message: 'Incluye traslado.',
  });
  assert.throws(() => validarCotizacion({ price: 0, currency: 'ARS' }), /precio cotizado/);
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  assert.throws(() => validarCotizacion({
    price: 100,
    currency: 'ARS',
    validUntil: yesterday,
  }), /no puede ser anterior a hoy/);
});

function responseRecorder() {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    writeHead(status, headers) {
      this.statusCode = status;
      this.headers = headers;
    },
    end(body) {
      this.body = body;
    },
  };
}

async function callApi(method, url, body, repository, userId = ids.providerId) {
  const req = { method, url, headers: {}, body };
  const res = responseRecorder();
  await manejarCuenta(req, res, 'service-requests', {
    authenticate: async () => userId,
    repository,
  });
  return { status: res.statusCode, body: JSON.parse(res.body) };
}

test('expone listado, creación y respuesta de cotizaciones mediante la API autenticada', async () => {
  const calls = [];
  const repository = {
    listServiceRequests: async (userId) => {
      calls.push(['list', userId]);
      return [{ id: ids.requestId, status: 'pending' }];
    },
    createServiceRequest: async (userId, request) => {
      calls.push(['create', userId, request]);
      return { id: ids.requestId, status: 'pending' };
    },
    submitServiceQuote: async (userId, id, quote) => {
      calls.push(['quote', userId, id, quote]);
      return { id, status: 'quoted' };
    },
    respondToServiceQuote: async (userId, id, action) => {
      calls.push(['respond', userId, id, action]);
      return { id, status: 'accepted' };
    },
  };

  const list = await callApi('GET', '/api/service-requests', undefined, repository);
  assert.equal(list.status, 200);
  assert.equal(list.body.requests[0].status, 'pending');

  const created = await callApi('POST', '/api/service-requests', requestFor('transporte', {
    loadType: 'granos',
    destination: 'Rosario',
  }), repository, ids.fieldId);
  assert.equal(created.status, 201);
  assert.equal(calls.find(([type]) => type === 'create')[2].quantityUnit, 'toneladas');

  const quote = await callApi('PATCH', `/api/service-requests?id=${ids.requestId}`, {
    action: 'quote',
    price: 100000,
    currency: 'ARS',
  }, repository);
  assert.equal(quote.status, 200);
  assert.equal(quote.body.request.status, 'quoted');

  const accepted = await callApi('PATCH', `/api/service-requests?id=${ids.requestId}`, {
    action: 'accept_quote',
  }, repository, ids.fieldId);
  assert.equal(accepted.body.request.status, 'accepted');
});

test('rechaza acciones de cotización desconocidas', async () => {
  const response = await callApi('PATCH', `/api/service-requests?id=${ids.requestId}`, {
    action: 'delete',
  }, {});
  assert.equal(response.status, 400);
});
