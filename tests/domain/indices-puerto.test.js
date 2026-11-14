// Índices de mercado del puerto y criterios para vender a puerto (dominio puro).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularIndicesMercado, demandaDiariaBarcos } from '../../src/domain/barcos/index.js';
import { evaluarIndicesPuerto, decidirVentaCosecha } from '../../src/domain/venta/index.js';
import { sumarDias } from '../../src/domain/shared/util.js';

test('índices: demanda/oferta con soja equivalente (grano + harina) y saturación', () => {
  const programadas = { desde: '2026-11-11', hasta: '2026-12-03', toneladas: { soja: 400000, maiz: 900000, harinas: 1400000 }, fuente: 'BCR' };
  const camiones = { fecha: '2026-11-13', camiones: { soja: 2276, maiz: 2559, total: 6967 }, fuente: 'BCR' };
  const dSoja = demandaDiariaBarcos('soja', programadas);
  assert.equal(dSoja.dias, 23);
  assert.ok(Math.abs(dSoja.toneladas - (400000 + 1400000 / 0.78)) < 1);
  const iSoja = calcularIndicesMercado({ cultivo: 'soja', puerto: 'gran-rosario', programadas, camiones });
  const iMaiz = calcularIndicesMercado({ cultivo: 'maiz', puerto: 'gran-rosario', programadas, camiones });
  assert.ok(iSoja.demandaOferta.valor > 1.1); // falta soja: los barcos (y la molienda) necesitan más de lo que entra
  assert.ok(iMaiz.demandaOferta.valor < 0.8); // sobra maíz respecto de lo programado
  assert.ok(Math.abs(iSoja.saturacion.valor - 6967 / 7000) < 0.01);
  // Saturación y nivel del Paraná solo aplican al Up-River.
  const bb = calcularIndicesMercado({ cultivo: 'maiz', puerto: 'bahia-blanca', camiones, nivelParanaM: 1 });
  assert.equal(bb.saturacion, undefined);
  assert.equal(bb.nivelParana, undefined);
});

test('criterios: verde, amarillo, rojo y bloqueantes', () => {
  const ok = evaluarIndicesPuerto({ demandaOferta: { valor: 1.4 }, espera: { valor: 0.5 }, saturacion: { valor: 0.7 } });
  assert.equal(ok.cumple, true);
  assert.equal(ok.semaforo, 'verde');
  const bloqueado = evaluarIndicesPuerto({ demandaOferta: { valor: 0.6 }, espera: { valor: 0.2 }, nivelParana: { valor: 3 } });
  assert.equal(bloqueado.cumple, false);
  assert.deepEqual(bloqueado.bloqueos, ['demandaOferta']);
  const negativo = evaluarIndicesPuerto({ espera: { valor: 2 }, saturacion: { valor: 0.95 }, nivelParana: { valor: 1.2 } });
  assert.equal(negativo.cumple, false); // sin bloqueos pero puntaje < 0
  const sinDatos = evaluarIndicesPuerto({});
  assert.equal(sinDatos.cumple, false);
  // Umbrales editables.
  assert.equal(evaluarIndicesPuerto({ demandaOferta: { valor: 0.7 } }, { demandaOferta: { rojo: 0.5, verde: 0.6 } }).cumple, true);
});

test('Venta: si el puerto no cumple los índices, elige acopio o silobolsa aunque el puerto dé más margen', () => {
  const HOY = '2026-11-14';
  const senal = Array.from({ length: 31 }, (_, d) => ({
    fecha: sumarDias(HOY, d), probHayBarco: 0.95, indiceDemanda: 1.1, factorPrecio: 1.003,
    capacidadT: 200000, esperaDias: 0.2, probBarcoEnTolerancia: 0.99, confiable: true, fuente: 'line-up',
  }));
  const barcos = { puerto: 'gran-rosario', cultivo: 'maiz', hoy: HOY, senal };
  const base = { barcos, cultivo: 'maiz', toneladas: 1000, fechaGranoListo: HOY, distanciaPuertoKm: 100, distanciaAcopioKm: 40 };

  const sinMercado = decidirVentaCosecha(base);
  assert.equal(sinMercado.canal, 'puerto');
  assert.equal(sinMercado.puertoHabilitado, true);

  const mercado = {
    programadas: { desde: HOY, hasta: sumarDias(HOY, 22), toneladas: { maiz: 900000 }, fuente: 'BCR' },
    camiones: { fecha: HOY, camiones: { maiz: 2559, total: 6967 }, fuente: 'BCR' },
  };
  const conMercado = decidirVentaCosecha({ ...base, mercado });
  assert.equal(conMercado.puertoHabilitado, false);
  assert.ok(conMercado.indicesPuerto.bloqueos.includes('demandaOferta'));
  assert.notEqual(conMercado.canal, 'puerto');
  assert.ok(conMercado.mejorPuerto.margenUSD > (conMercado.mejorVenta?.margenUSD ?? 0)); // el puerto daba más en el papel
  assert.match(conMercado.avisos.find((a) => a.tipo === 'indices-puerto').mensaje, /NO cumple/);
});
