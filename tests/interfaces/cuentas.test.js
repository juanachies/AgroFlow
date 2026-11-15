import assert from 'node:assert/strict';
import test from 'node:test';
import { validarAltaCuenta } from '../../src/interfaces/http/accountValidation.js';

const perfil = { displayName: 'Ana Productora', phone: '+54 9 11 1234 5678' };

test('valida una cuenta de productor con coordenadas y hectáreas', () => {
  const account = validarAltaCuenta({
    ...perfil,
    role: 'productor',
    field: { name: 'La Esperanza', areaHa: '125.5', latitude: '-32.95', longitude: '-60.64' },
  });

  assert.equal(account.role, 'productor');
  assert.equal(account.field.areaHa, 125.5);
  assert.equal(account.field.latitude, -32.95);
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
      serviceRadiusKm: 50,
      availableFrom: '2026-06-30',
      availableUntil: '2026-03-01',
      notes: '',
    },
  }), /no puede ser anterior/);
});
