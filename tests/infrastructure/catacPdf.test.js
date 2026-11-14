import assert from 'node:assert/strict';
import test from 'node:test';
import { decodificarGlifos, parsearEstadiaCatac, parsearTablaCatac } from '../../src/infrastructure/tarifas/catacPdf.js';
import { codificar, tablaSintetica, textoPdf } from '../helpers/catac.js';

test('decodifica los glifos de la fuente de CATAC', () => {
  assert.equal(decodificarGlifos('ǱȮǮǫǮȯǮǱ'), '9.636,69');
  assert.equal(decodificarGlifos(codificar('1.003')), '1.003');
});

test('parsea la tabla de km y precios', () => {
  const tabla = parsearTablaCatac(textoPdf(tablaSintetica()));
  assert.equal(tabla.length, 1000);
  assert.deepEqual(tabla[0], { km: 1, ars: 9636.69 });
});

test('lee km con separador de miles y la estadía', () => {
  const puntos = [...tablaSintetica(1000), { km: '1.003', ars: '108.196,08' }];
  const texto = `${textoPdf(puntos)}\nValor de estadía:   $214.146,67`;
  const tabla = parsearTablaCatac(texto);
  assert.deepEqual(tabla[tabla.length - 1], { km: 1003, ars: 108196.08 });
  assert.equal(parsearEstadiaCatac(texto), 214146.67);
});

test('sin estadía en el PDF devuelve null', () => {
  assert.equal(parsearEstadiaCatac(textoPdf(tablaSintetica(10))), null);
});

test('una tabla incompleta se rechaza', () => {
  assert.throws(() => parsearTablaCatac(textoPdf(tablaSintetica(50))), /incompleta/);
});

test('una tabla con tarifas que bajan se rechaza', () => {
  const puntos = tablaSintetica();
  puntos[500].ars = '1,00';
  assert.throws(() => parsearTablaCatac(textoPdf(puntos)), /inconsistente/);
});
