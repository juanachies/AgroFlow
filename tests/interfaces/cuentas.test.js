import assert from 'node:assert/strict';
import test from 'node:test';
import { validarAltaCuenta, validarCampo } from '../../src/interfaces/http/accountValidation.js';

const perfil = { displayName: 'Ana Productora', phone: '+54 9 11 1234 5678' };

test('el alta de productor guarda solo el perfil y difiere los datos del campo', () => {
  const account = validarAltaCuenta({
    ...perfil,
    role: 'productor',
  });

  assert.equal(account.role, 'productor');
  assert.equal('field' in account, false);
});

test('valida perímetro, localidad y deriva superficie y centro del campo', () => {
  const field = validarCampo({
    name: 'La Esperanza',
    city: 'Pergamino · Buenos Aires · Argentina',
    boundary: {
      type: 'Feature',
      properties: { areaHa: 999999 },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [-60.7, -32.9],
          [-60.69, -32.9],
          [-60.69, -32.89],
          [-60.7, -32.89],
          [-60.7, -32.9],
        ]],
      },
    },
  });

  assert.ok(field.areaHa > 0);
  assert.notEqual(field.areaHa, 999999);
  assert.ok(Math.abs(field.latitude - -32.895) < 1e-10);
  assert.ok(Math.abs(field.longitude - -60.695) < 1e-10);
  assert.deepEqual(field.boundary.properties, {});
});

test('rechaza campos sin perímetro o con polígonos abiertos', () => {
  assert.throws(() => validarCampo({ name: 'Campo', city: 'Pergamino' }), /dibujá el perímetro/);
  assert.throws(() => validarCampo({
    name: 'Campo',
    city: 'Pergamino',
    boundary: {
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [[[-60.7, -32.9], [-60.69, -32.9], [-60.69, -32.89], [-60.7, -32.89]]] },
    },
  }), /tiene que estar cerrado/);
});

test('valida una oferta de prestador con capacidad, precio y disponibilidad', () => {
  const account = validarAltaCuenta({
    ...perfil,
    role: 'prestador',
    offering: {
      serviceType: 'transporte',
      subtype: 'Camión semirremolque',
      price: '85000',
      currency: 'ARS',
      priceUnit: 'por_viaje',
      capacity: '28',
      capacityUnit: 'toneladas',
      baseLatitude: '-32.95',
      baseLongitude: '-60.64',
      city: 'Rosario · Santa Fe · Argentina',
      baseAddress: 'Zona rural al oeste',
      serviceRadiusKm: '120',
      availableFrom: '2026-03-01',
      availableUntil: '2026-06-30',
      notes: '',
    },
  });

  assert.equal(account.offering.price, 85000);
  assert.equal(account.offering.capacity, 28);
  assert.equal(account.offering.notes, null);
});

test('rechaza roles desconocidos y periodos de disponibilidad invertidos', () => {
  assert.throws(() => validarAltaCuenta({ ...perfil, role: 'admin' }), /seleccioná productor o prestador/);
  assert.throws(() => validarAltaCuenta({
    ...perfil,
    role: 'prestador',
    offering: {
      serviceType: 'almacenamiento',
      subtype: 'Silo',
      price: 100,
      currency: 'ARS',
      priceUnit: 'por_tonelada_mes',
      capacity: 1000,
      capacityUnit: 'toneladas',
      baseLatitude: -32.95,
      baseLongitude: -60.64,
      city: 'Rosario · Santa Fe · Argentina',
      serviceRadiusKm: 50,
      availableFrom: '2026-06-30',
      availableUntil: '2026-03-01',
      notes: '',
    },
  }), /no puede ser anterior/);
});
