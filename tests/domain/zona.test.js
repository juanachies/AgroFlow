import test from 'node:test';
import assert from 'node:assert/strict';

import { acopioMasCercano, factorZonaTransporte, fleterosDeLaZona, transporteDeLaZona } from '../../src/domain/destino/zona.js';

const lote = { lat: -33.9, lon: -60.6 };
const oferta = (proveedor, recurso, lat, lon, radioKm, extra = {}) => ({ proveedor, recurso, unidades: 2, radioKm, base: { lat, lon }, precioRelativo: 1, calificacion: 4, ...extra });

test('resume los fleteros cuyo radio alcanza al lote, por recurso', () => {
  const zona = fleterosDeLaZona({
    lote,
    ofertas: [
      oferta('Transporte A', 'camión', -33.95, -60.6, 100, { unidades: 10, precioRelativo: 1.1, calificacion: 5 }),
      oferta('Transporte B', 'camión', -34.2, -60.6, 100, { unidades: 5, precioRelativo: 0.9, calificacion: 3 }),
      oferta('Transporte A', 'cosechadora', -33.95, -60.6, 80),
      oferta('Lejano', 'camión', -38, -62, 100),
    ],
  });

  assert.equal(zona.ofertas, 3);
  assert.equal(zona.proveedores, 2);
  assert.deepEqual([zona.porRecurso['camión'].proveedores, zona.porRecurso['camión'].unidades], [2, 15]);
  assert.equal(zona.porRecurso['camión'].precioRelativoMedio, 1);
  assert.equal(zona.porRecurso['camión'].calificacionMedia, 4);
  assert.ok(zona.porRecurso['camión'].masCercanoKm < 10);
  assert.equal(zona.porRecurso.cosechadora.proveedores, 1);
  assert.deepEqual(fleterosDeLaZona({ lote, ofertas: [] }), { ofertas: 0, proveedores: 0, porRecurso: {} });
});

test('el factor de la zona compara lo que cobran los fleteros contratados con la tarifa de referencia', () => {
  const asignacion = {
    lineas: [
      { linea: { recurso: 'camión' }, asignaciones: [{ costoUsd: 1100, precioRelativo: 1.1 }, { costoUsd: 900, precioRelativo: 0.9 }] },
      { linea: { recurso: 'cosechadora' }, asignaciones: [{ costoUsd: 5000, precioRelativo: 2 }] },
    ],
  };
  assert.ok(Math.abs(factorZonaTransporte(asignacion) - 2000 / 2000) < 1e-9);
  const cara = { lineas: [{ linea: { recurso: 'camión' }, asignaciones: [{ costoUsd: 1200, precioRelativo: 1.2 }] }] };
  assert.ok(Math.abs(factorZonaTransporte(cara) - 1.2) < 1e-9);
  assert.equal(factorZonaTransporte({ lineas: [] }), 1);
  assert.equal(factorZonaTransporte(undefined), 1);
});

test('elige el acopio más cercano y estima la distancia por ruta', () => {
  const acopio = acopioMasCercano({ lat: -33.9, lon: -60.6 });
  assert.match(acopio.nombre, /Pergamino/);
  assert.ok(acopio.distanciaKm >= 1 && acopio.distanciaKm <= 10);
  const lejos = acopioMasCercano({ lat: -32.7, lon: -62.0 });
  assert.match(lejos.nombre, /Marcos Juárez/);
  assert.equal(lejos.distanciaKm, Math.round(lejos.rectaKm * 1.3));
});

test('el costo del transporte por la zona sale de la tarifa CATAC y del factor de los fleteros', () => {
  const tarifas = {
    flete: { tabla_ars_por_t: [{ km: 1, ars: 10000 }, { km: 101, ars: 30000 }], factor_actualizacion: 1, estadia_ars_por_dia: 200000, fuente_url: 'https://catac.example/tarifa.pdf', fuente_fecha: '2026-04-20' },
    parametros_generales: { tipo_cambio_ars_usd: 1000 },
  };
  const zona = transporteDeLaZona({ distanciaKm: 51, tarifas, factor: 1.1 });

  assert.equal(zona.tarifaCatacUSDt, 20);
  assert.equal(zona.costoUSDt, 22);
  assert.equal(zona.costoUSDqq, 2.2);
  assert.equal(zona.estadiaUSDDia, 200);
  assert.equal(zona.fuente, 'https://catac.example/tarifa.pdf');
  assert.equal(transporteDeLaZona({ distanciaKm: 0, tarifas }), null);
});
