import test from 'node:test';
import assert from 'node:assert/strict';

import { climatologiaDe, resumirClimatologia } from '../../src/domain/clima/climatologia.js';
import { calificarClimatologia, calificarPronostico, combinarPronostico } from '../../src/domain/clima/pronosticoCosecha.js';
import { decidirOperacion } from '../../src/domain/decision/decisionOperacion.js';
import { sumarDias } from '../../src/domain/shared/util.js';

function serieDiaria(desde, hasta, lluvia) {
  const fechas = [];
  for (let fecha = desde; fecha <= hasta; fecha = sumarDias(fecha, 1)) fechas.push(fecha);
  return { fechas, lluviaMm: fechas.map(lluvia) };
}

test('la climatología da la frecuencia de lluvia por fecha en años anteriores', () => {
  const serie = serieDiaria('2021-01-01', '2023-12-31', (fecha) => (fecha.slice(5) === '04-10' ? 20 : 0));
  const exacta = resumirClimatologia(serie, { radio: 0 });
  assert.equal(exacta['04-10'].probFuerte, 1);
  assert.equal(exacta['04-11'].probFuerte, 0);
  assert.equal(climatologiaDe(exacta, '2027-04-10').probLluvia, 1);

  const suavizada = resumirClimatologia(serie);
  assert.ok(suavizada['04-11'].probFuerte > 0 && suavizada['04-11'].probFuerte < 1, 'los días vecinos comparten la señal');
  assert.equal(climatologiaDe(null, '2027-04-10'), null);
});

test('califica los días por lluvia pronosticada o por probabilidad histórica', () => {
  assert.equal(calificarPronostico(0), 'bueno');
  assert.equal(calificarPronostico(2), 'regular');
  assert.equal(calificarPronostico(5), 'malo');
  assert.equal(calificarPronostico(null), 'desconocido');
  assert.equal(calificarClimatologia(0.05), 'bueno');
  assert.equal(calificarClimatologia(0.2), 'regular');
  assert.equal(calificarClimatologia(0.5), 'malo');
});

test('combina pronóstico para los días cercanos y climatología para los lejanos', () => {
  const climatologia = resumirClimatologia(serieDiaria('2021-01-01', '2023-12-31', () => 0));
  const dias = combinarPronostico({
    desde: '2027-03-20',
    hasta: '2027-03-23',
    pronostico: [{ fecha: '2027-03-20', lluviaMm: 0 }, { fecha: '2027-03-21', lluviaMm: 12 }],
    climatologia,
  });
  assert.deepEqual(dias.map((d) => [d.fuente, d.apto]), [
    ['pronostico', 'bueno'], ['pronostico', 'malo'], ['climatologia', 'bueno'], ['climatologia', 'bueno'],
  ]);
  const sinDatos = combinarPronostico({ desde: '2027-03-20', hasta: '2027-03-20' });
  assert.deepEqual(sinDatos.map((d) => [d.fuente, d.apto]), [['sin-dato', 'desconocido']]);
});

const simulacion = () => ({
  entrada: { fechaInicioCosecha: '2027-04-10' },
  distancias: [{ destino: 'Puerto Gran Rosario', km: 230, fuente: 'línea recta × 1,3' }],
  saturacion: { dias: [{ fecha: '2027-04-16', estado: 'saturado' }, { fecha: '2027-04-17', estado: 'fluido' }] },
  ventana: null,
  plan: {
    toneladas: 4560,
    dias_efectivos: 8,
    recomendado: {
      destino: 'Puerto Gran Rosario',
      tipo: 'puerto',
      pedidos: [
        { servicio: 'cosecha', recurso: 'cosechadora', cantidad: 3, pedir_antes_del: '2027-03-26', usar_desde: '2027-04-10', usar_hasta: '2027-04-17' },
        { servicio: 'transporte', recurso: 'camión', cantidad: 20, pedir_antes_del: '2027-04-03', usar_desde: '2027-04-12', usar_hasta: '2027-04-19' },
      ],
    },
  },
});

const diasConLluviaEn = (malos) => serieDiaria('2027-03-20', '2027-05-10', () => 0).fechas
  .map((fecha) => ({ fecha, fuente: 'pronostico', lluviaMm: malos.includes(fecha) ? 20 : 0, apto: malos.includes(fecha) ? 'malo' : 'bueno' }));

test('corre el inicio de cosecha para evitar los días de lluvia fuerte', () => {
  const decision = decidirOperacion({
    simulacion: simulacion(),
    dias: diasConLluviaEn(['2027-04-10', '2027-04-11', '2027-04-12']),
    hoy: '2027-03-20',
  });

  assert.equal(decision.cosecha.inicio, '2027-04-13');
  assert.equal(decision.cosecha.fin, '2027-04-20');
  assert.equal(decision.cosecha.corrimientoDias, 3);
  assert.equal(decision.cosecha.diasMalos, 0);
  assert.deepEqual([decision.transporte.desde, decision.transporte.hasta], ['2027-04-15', '2027-04-22']);
  assert.equal(decision.transporte.camiones, 20);
  assert.equal(decision.transporte.distanciaKm, 230);
  assert.equal(decision.almacenaje.modalidad, 'directo al puerto');
  assert.equal(decision.cosecha.recursos[0].pedirAntesDel, '2027-03-29');
});

test('arma el almanaque con rangos y días clave ordenados', () => {
  const decision = decidirOperacion({ simulacion: simulacion(), dias: diasConLluviaEn([]), hoy: '2027-03-20' });
  const porFecha = Object.fromEntries(decision.almanaque.map((d) => [d.fecha, d]));

  assert.equal(decision.cosecha.corrimientoDias, 0);
  assert.equal(porFecha['2027-04-10'].cosecha, true);
  assert.equal(porFecha['2027-04-09'].cosecha, false);
  assert.equal(porFecha['2027-04-12'].transporte, true);
  assert.equal(porFecha['2027-03-26'].pedir, true);
  assert.equal(porFecha['2027-04-16'].saturacion, 'saturado');
  assert.deepEqual(decision.diasClave.map((d) => d.tipo), ['pedir', 'inicio-cosecha', 'inicio-transporte', 'fin-cosecha', 'fin-transporte']);
  assert.ok(decision.diasClave.every((d, i, lista) => i === 0 || lista[i - 1].fecha <= d.fecha));
  assert.ok(decision.almanaque[0].fecha < '2027-03-26' && decision.almanaque.at(-1).fecha > '2027-04-19');
  assert.match(decision.resumen, /^Cosechá del 2027-04-10 al 2027-04-17/);
});

test('avisa de lluvia en el rango, puerto saturado, plazo vencido y clima estimado', () => {
  const sinMargen = diasConLluviaEn(serieDiaria('2027-03-20', '2027-05-10', () => 0).fechas);
  const decision = decidirOperacion({
    simulacion: simulacion(),
    dias: sinMargen.map((dia) => ({ ...dia, apto: 'malo', fuente: 'climatologia' })),
    hoy: '2027-04-01',
  });
  const mensajes = decision.alertas.map((a) => `${a.nivel}: ${a.mensaje}`).join('\n');
  assert.match(mensajes, /critico: El plazo para reservar/);
  assert.match(mensajes, /alerta: 8 día\(s\) del rango de cosecha/);
  assert.match(mensajes, /alerta: 1 día\(s\) de transporte caen con el puerto saturado/);
  assert.match(mensajes, /frecuencia histórica/);
});

test('describe el almacenaje en silobolsa y en acopio', () => {
  const silobolsa = simulacion();
  silobolsa.plan.recomendado = {
    destino: 'Silobolsa en el campo',
    tipo: 'silobolsa',
    pedidos: [
      { servicio: 'cosecha', recurso: 'cosechadora', cantidad: 2, pedir_antes_del: '2027-03-26', usar_desde: '2027-04-10', usar_hasta: '2027-04-17' },
      { servicio: 'almacenaje', recurso: 'silobolsa', cantidad: 24, pedir_antes_del: '2027-03-30', usar_desde: '2027-04-10', usar_hasta: '2027-04-17' },
    ],
  };
  const conBolsas = decidirOperacion({ simulacion: silobolsa, dias: diasConLluviaEn([]), hoy: '2027-03-20' });
  assert.equal(conBolsas.transporte, null);
  assert.deepEqual(
    [conBolsas.almacenaje.modalidad, conBolsas.almacenaje.silobolsas, conBolsas.almacenaje.pedirAntesDel],
    ['silobolsa', 24, '2027-03-30'],
  );

  const acopio = simulacion();
  acopio.plan.recomendado.tipo = 'acopio';
  acopio.plan.recomendado.destino = 'Cooperativa local';
  assert.equal(decidirOperacion({ simulacion: acopio, dias: [], hoy: '2027-03-20' }).almacenaje.modalidad, 'acopio');
});

test('sin datos de clima mantiene el plan y lo avisa', () => {
  const decision = decidirOperacion({ simulacion: simulacion(), dias: [], hoy: '2027-03-20' });
  assert.equal(decision.cosecha.inicio, '2027-04-10');
  assert.equal(decision.cosecha.fuenteClima, 'sin-dato');
  assert.ok(decision.alertas.some((a) => /No hay datos de clima/.test(a.mensaje)));
  assert.throws(() => decidirOperacion({ simulacion: {}, dias: [] }), /simularPlan/);
});
