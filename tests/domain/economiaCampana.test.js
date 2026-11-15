import test from 'node:test';
import assert from 'node:assert/strict';

import { armarEstrategia, compararEstrategias, evaluarModalidades } from '../../src/domain/economia/economiaCampana.js';
import { sumarDias } from '../../src/domain/shared/util.js';
import { construirCurva } from '../../src/domain/venta/precios.js';

const HOY = '2027-03-20';
const COSECHA = { inicio: '2027-04-01', fin: '2027-04-05' };

function saturacion() {
  const dias = [];
  for (let fecha = '2027-04-01'; fecha <= '2027-06-30'; fecha = sumarDias(fecha, 1)) {
    const temprano = fecha < '2027-04-12';
    dias.push({ fecha, probBarco: temprano ? 0.6 : 0.95, esperaDias: temprano ? 3 : 0, estado: 'fluido' });
  }
  return { dias };
}

function simulacion({ urgencia = 'media' } = {}) {
  return {
    entrada: {
      cultivo: 'soja',
      qqHa: 38,
      destinos: [
        { nombre: 'Silobolsa en el campo', tipo: 'silobolsa', precioUsdPorT: 300 },
        { nombre: 'Cooperativa local', tipo: 'acopio', precioUsdPorT: 303, distanciaKm: 35 },
        { nombre: 'Puerto Gran Rosario', tipo: 'puerto', precioUsdPorT: 335, distanciaKm: 230 },
      ],
    },
    saturacion: saturacion(),
    plan: {
      toneladas: 1000,
      urgencia,
      alternativas: [
        { destino: 'Silobolsa en el campo', tipo: 'silobolsa', costo_usd: 30000, costo_extraccion_usd: 3000, ingreso_usd: 300000, margen_usd: 270000, costos_por_servicio: { cosecha: 20000, almacenaje: 7000 } },
        { destino: 'Cooperativa local', tipo: 'acopio', costo_usd: 29000, costo_extraccion_usd: 0, ingreso_usd: 303000, margen_usd: 274000, costos_por_servicio: { cosecha: 20000, transporte: 3000 } },
        { destino: 'Puerto Gran Rosario', tipo: 'puerto', costo_usd: 25000, costo_extraccion_usd: 0, ingreso_usd: 335000, margen_usd: 310000, costos_por_servicio: { cosecha: 20000, transporte: 5000 } },
      ],
    },
  };
}

const porTipo = (modalidades, tipo) => modalidades.find((m) => m.tipo === tipo);
const evaluar = (opciones = {}) => evaluarModalidades({ simulacion: simulacion(), hoy: HOY, cosecha: COSECHA, ...opciones });

test('el puerto descuenta mermas, costos y costo financiero del ingreso', () => {
  const puerto = porTipo(evaluar({ modo: 'grande' }), 'puerto');
  const mermaPct = puerto.merma.totalPct;

  assert.equal(puerto.toneladasCosechadas, 1000);
  assert.ok(Math.abs(puerto.toneladasVendidas - 1000 * (1 - mermaPct / 100)) < 0.2);
  assert.ok(Math.abs(puerto.ingresoBrutoUSD - 1000 * (1 - mermaPct / 100) * 335) <= 20, 'el % de merma viene redondeado a 2 decimales');
  assert.equal(puerto.costos.cosecha, 20000);
  assert.equal(puerto.costos.transporte, 5000);
  assert.ok(puerto.costos.financiero > 0);
  assert.equal(puerto.gananciaBrutaUSD, puerto.ingresoBrutoUSD - 25000);
  assert.ok(Math.abs(puerto.gananciaNetaUSD - (puerto.ingresoBrutoUSD - puerto.costoTotalUSD)) <= 1);
  assert.equal(puerto.qqCosechados, 10000);
  assert.ok(Math.abs(puerto.porQq.gananciaUSD - puerto.gananciaNetaUSD / 10000) < 0.01);
});

test('la demora de cosecha aumenta la merma de cabezal', () => {
  const sinDemora = porTipo(evaluar({ modo: 'grande', diasDemora: 0 }), 'acopio');
  const conDemora = porTipo(evaluar({ modo: 'grande', diasDemora: 10 }), 'acopio');
  assert.ok(conDemora.merma.cosechaPct > sinDemora.merma.cosechaPct);
  assert.ok(conDemora.gananciaNetaUSD < sinDemora.gananciaNetaUSD);
});

test('la rápida entrega apenas hay un barco posible y la grande espera el de menor riesgo', () => {
  const rapida = porTipo(evaluar({ modo: 'rapida' }), 'puerto');
  const grande = porTipo(evaluar({ modo: 'grande' }), 'puerto');

  assert.equal(rapida.riesgo.probLlegar, 0.6);
  assert.ok(rapida.costos.espera > 0, 'cola de 3 días en puerto');
  assert.ok(rapida.costos.riesgoBarco > 0);
  assert.equal(grande.riesgo.probLlegar, 0.95);
  assert.equal(grande.costos.espera, 0);
  assert.ok(grande.fechaCobro > rapida.fechaCobro);
  assert.ok(grande.ahorroPorFechaUSD > 0, 'elegir la fecha evita espera y riesgo');
});

test('la silobolsa solo mejora el precio si el mercado paga la espera', () => {
  const alcista = construirCurva({ hoy: HOY, spot: { disponibleUSDt: 300 }, futuros: [{ posicion: 'JUN27', precioUSDt: 360 }] });
  const plana = construirCurva({ hoy: HOY, spot: { disponibleUSDt: 300 }, futuros: [{ posicion: 'JUN27', precioUSDt: 300 }] });

  const conCarry = evaluarModalidades({ simulacion: simulacion(), modo: 'grande', hoy: HOY, cosecha: COSECHA, curva: alcista });
  const sinCarry = evaluarModalidades({ simulacion: simulacion(), modo: 'grande', hoy: HOY, cosecha: COSECHA, curva: plana });
  const estrategiaAlcista = armarEstrategia({ modo: 'grande', simulacion: simulacion(), hoy: HOY, cosecha: COSECHA, curva: alcista });
  const estrategiaPlana = armarEstrategia({ modo: 'grande', simulacion: simulacion(), hoy: HOY, cosecha: COSECHA, curva: plana });

  const siloAlcista = porTipo(estrategiaAlcista.modalidades, 'silobolsa');
  const siloPlano = porTipo(estrategiaPlana.modalidades, 'silobolsa');
  assert.ok(porTipo(conCarry, 'silobolsa').gananciaNetaUSD > porTipo(sinCarry, 'silobolsa').gananciaNetaUSD);
  assert.ok(siloAlcista.silobolsa.extraVsVenderYaUSD > 0);
  assert.ok(siloAlcista.silobolsa.mesesParaMejorar >= 1);
  assert.equal(siloAlcista.curvaSilobolsa.length, 6);
  assert.ok(siloPlano.silobolsa.extraVsVenderYaUSD < 0);
  assert.equal(siloPlano.silobolsa.mesesParaMejorar, null);
  assert.equal(estrategiaAlcista.elegida.tipo, 'silobolsa');
  assert.equal(estrategiaPlana.elegida.tipo, 'puerto');
});

test('la estrategia rápida descarta la silobolsa y la grande exige poco riesgo de perder el barco', () => {
  const rapida = armarEstrategia({ modo: 'rapida', simulacion: simulacion({ urgencia: 'alta' }), hoy: HOY, cosecha: COSECHA });
  const grande = armarEstrategia({ modo: 'grande', simulacion: simulacion({ urgencia: 'baja' }), hoy: HOY, cosecha: { inicio: '2027-04-08', fin: '2027-04-13' } });

  assert.notEqual(rapida.elegida.tipo, 'silobolsa');
  assert.ok(grande.elegida.riesgo.probLlegar == null || grande.elegida.riesgo.probLlegar >= 0.8);
  assert.ok(rapida.modalidades.every((m) => typeof m.ahorroVsPeorUSD === 'number'));
  assert.equal(rapida.modalidades.filter((m) => m.elegida).length, 1);

  const comparacion = compararEstrategias({ rapida, grande });
  assert.equal(comparacion.coinciden, false);
  assert.equal(typeof comparacion.gananciaExtraUSD, 'number');
  assert.ok(comparacion.decisiones.transporte.ahorroUSD >= 0);
  assert.ok(comparacion.decisiones.almacenaje.ahorroUSD >= 0);
  assert.equal(compararEstrategias({ rapida: null, grande }), null);
});

test('si las dos estrategias son iguales lo informa en vez de inventar una diferencia', () => {
  const unica = armarEstrategia({ modo: 'grande', simulacion: simulacion(), hoy: HOY, cosecha: COSECHA });
  assert.equal(compararEstrategias({ rapida: unica, grande: unica }).coinciden, true);
  assert.equal(compararEstrategias({ rapida: unica, grande: unica }).gananciaExtraUSD, 0);
});
