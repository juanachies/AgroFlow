import test from 'node:test';
import assert from 'node:assert/strict';

import { ventanaDelLote } from '../../src/interfaces/web/lib/data.js';
import {
  cargarSilobolsasDeEjemplo,
  esLoteDeEjemplo,
  lecturasDeEjemplo,
  lotesDeEjemplo,
  SILOBOLSAS_EJEMPLO,
} from '../../src/interfaces/web/lib/productorEjemplo.js';

const HOY = new Date('2026-11-15T12:00:00Z');

test('el productor de ejemplo tiene varios lotes sembrados y sin perímetro', () => {
  const lotes = lotesDeEjemplo(HOY);

  assert.equal(lotes.length, 6);
  assert.equal(new Set(lotes.map((lote) => lote.id)).size, 6);
  assert.ok(lotes.every(esLoteDeEjemplo));
  assert.ok(lotes.every((lote) => lote.boundary === null), 'el perímetro lo dibuja el usuario');
  assert.ok(lotes.every((lote) => lote.crop && lote.variety && lote.sowingDate && lote.cycleDays > 0 && lote.areaHa > 0));
  assert.deepEqual([...new Set(lotes.map((lote) => lote.crop))].sort(), ['maiz', 'soja', 'trigo']);
  assert.ok(lotes.every((lote) => lote.latitude < -33.5 && lote.latitude > -34.6 && lote.longitude < -60.3 && lote.longitude > -61.2));
});

test('las siembras son relativas a hoy: hay cosechas cercanas y lejanas', () => {
  const lotes = lotesDeEjemplo(HOY);
  const diasHastaCosecha = lotes.map((lote) => {
    const { optimo } = ventanaDelLote(lote);
    return Math.round((Date.parse(`${optimo}T12:00:00Z`) - HOY.getTime()) / 86400000);
  });

  assert.ok(diasHastaCosecha.every((dias) => dias > 0), 'ninguna cosecha quedó en el pasado');
  assert.ok(diasHastaCosecha.some((dias) => dias <= 30), 'el trigo se cosecha pronto y tiene pronóstico real');
  assert.ok(diasHastaCosecha.some((dias) => dias >= 120), 'la soja se cosecha en varios meses');
  assert.equal(lotes[0].sowingDate, '2026-06-18');
  assert.deepEqual(lotesDeEjemplo(HOY).map((l) => l.cycleDays), lotes.map((l) => l.cycleDays), 'es determinista');
});

test('las lecturas de ejemplo terminan en el valor actual del sensor', () => {
  const lecturas = lecturasDeEjemplo({ humedad: 14.9, temperatura: 27, co2: 5.2 }, HOY);
  assert.equal(lecturas.length, 5);
  assert.equal(lecturas.at(-1).humedad, 14.9);
  assert.equal(lecturas.at(-1).timestamp, HOY.toISOString());
  assert.ok(lecturas[0].humedad < lecturas.at(-1).humedad);
});

test('carga las silobolsas de ejemplo una sola vez', async () => {
  const llamadas = [];
  const existentes = [];
  const api = {
    silobolsas: async () => ({ silobolsas: existentes }),
    registrarSilobolsa: async (datos) => {
      llamadas.push(['registrar', datos]);
      const silobolsa = { id: `SB-${llamadas.length}`, ...datos };
      existentes.push(silobolsa);
      return { silobolsa };
    },
    cargarLecturas: async (id, lecturas) => { llamadas.push(['lecturas', id, lecturas.length]); return { agregadas: lecturas.length }; },
  };

  await cargarSilobolsasDeEjemplo(api, HOY);
  assert.equal(llamadas.filter(([tipo]) => tipo === 'registrar').length, SILOBOLSAS_EJEMPLO.length);
  assert.deepEqual(llamadas[0][1], { cultivo: 'soja', kg: 190000, fechaCreacion: '2026-06-18', loteId: 'lote-ej-04' });
  assert.deepEqual(llamadas[1], ['lecturas', 'SB-1', 5]);

  const antes = llamadas.length;
  await cargarSilobolsasDeEjemplo(api, HOY);
  assert.equal(llamadas.length, antes, 'no duplica las silobolsas');
});
