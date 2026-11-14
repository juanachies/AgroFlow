// Demo hardcodeada del flujo completo, de la siembra al embarque:
//   node src/interfaces/cli/demoFlujo.js    (o: npm run demo)
// Todos los datos son de ejemplo; no usa red ni keys.
import { crearContenedor } from '../../config/container.js';
import { calcularVentanaCosecha } from '../../domain/cosecha/ventanaCosecha.js';
import { perdidasPorDemora } from '../../domain/cosecha/perdidasPorDemora.js';
import { corteCaminos } from '../../domain/clima/corteCaminos.js';
import { dimensionarSilobolsa } from '../../domain/silobolsa/dimensionadoSilobolsa.js';
import { crearSilobolsasMemoriaAdapter } from '../../infrastructure/silobolsas/silobolsasMemoriaAdapter.js';
import { crearLecturasMemoriaAdapter } from '../../infrastructure/iot/lecturasMemoriaAdapter.js';
import { crearBarcosSimuladosAdapter } from '../../infrastructure/barcos/barcosSimuladosAdapter.js';
import { crearTarifasJsonAdapter } from '../../infrastructure/tarifas/tarifasJsonAdapter.js';

const usd = (n) => `US$ ${Math.round(n).toLocaleString('es-AR')}`;
const titulo = (texto) => console.log(`\n=== ${texto} ===`);
const linea = (texto) => console.log(`  ${texto}`);

const HOY = '2026-11-14';
const lote = { ha: 2000, qqHa: 35, cultivo: 'soja', fechaSiembra: '2026-12-01', diasDisponibles: 20, urgencia: 'media' };
const destinos = [
  { nombre: 'Silobolsa en el campo', tipo: 'silobolsa', precioUsdPorT: 340 },
  { nombre: 'Cooperativa local', tipo: 'acopio', distanciaKm: 40, costoAdicionalUsdPorT: 6, precioUsdPorT: 310 },
  { nombre: 'Puerto Gran Rosario', tipo: 'puerto', distanciaKm: 300, precioUsdPorT: 330 },
];

const lecturasDia = (dia, humedad, temperatura, co2) => ({ timestamp: `2026-11-${String(dia).padStart(2, '0')}T00:00:00Z`, humedad, temperatura, co2 });
const serie = (humedad, temperatura, co2) => [10, 11, 12, 13, 14].map((dia, i) => lecturasDia(dia, humedad[0] + ((humedad[1] - humedad[0]) * i) / 4, temperatura[0] + ((temperatura[1] - temperatura[0]) * i) / 4, co2[0] + ((co2[1] - co2[0]) * i) / 4));

const silobolsas = crearSilobolsasMemoriaAdapter([
  { id: 'SB-SANO', cultivo: 'soja', kg: 200000, fechaCreacion: '2026-04-20' },
  { id: 'SB-HUMEDO', cultivo: 'soja', kg: 200000, fechaCreacion: '2026-04-20' },
  { id: 'SB-CRITICO', cultivo: 'soja', kg: 200000, fechaCreacion: '2026-04-20' },
]);
const lecturasIot = crearLecturasMemoriaAdapter({
  'SB-SANO': serie([12.5, 12.5], [22, 22], [2, 2]),
  'SB-HUMEDO': serie([14, 15], [24, 24], [3, 3]),
  'SB-CRITICO': serie([15.5, 16.5], [30, 36], [6, 9]),
});
const precios = { precios: async () => ({ spot: 300, futuros: [{ mes: '2026-12', precio: 320 }] }) };
const app = crearContenedor({ silobolsas, lecturasIot, precios, barcos: crearBarcosSimuladosAdapter({ semilla: 3 }) });
const tarifas = await crearTarifasJsonAdapter().vigentes();

titulo('1. ESTIMAR COSECHA');
linea(`${lote.ha} ha × ${lote.qqHa} qq/ha de ${lote.cultivo} = ${(lote.ha * lote.qqHa) / 10} t`);

titulo('2. CUÁNDO COSECHAR');
const ventana = calcularVentanaCosecha(lote);
linea(`Siembra ${lote.fechaSiembra} → ventana ${ventana.inicio} a ${ventana.fin}, óptimo ${ventana.optimo}`);
const demora = perdidasPorDemora({ diasDemora: 10, humedad: 16, cultivo: lote.cultivo });
linea(`Demorar 10 días con 16 % de humedad pierde ${demora.kgPorHa} kg/ha (${demora.porcentaje} %)`);
const caminos = corteCaminos({ lluvia48h: 35, sueloSaturado: true });
linea(`Lluvia 35 mm con suelo saturado: ${caminos.nivel}, caminos cortados ${caminos.horasCorte} h`);

titulo('3. ELEGIR DESTINO');
const servicios = ['transporte', 'almacenaje'];
const { evaluados, mejor, criterio } = await app.compararDestinos({ ...lote, servicios, destinos });
for (const e of evaluados) linea(`${e.destino.padEnd(24)} costo ${usd(e.costo_usd).padEnd(14)} margen ${usd(e.margen_usd)}`);
linea(`→ ${mejor.destino} (${criterio})`);

titulo('4. PLAN DE PEDIDO');
const plan = await app.planificarCosecha({ ...lote, servicios, destinos });
linea(`${plan.toneladas} t en ${plan.dias_efectivos} días, inicio ${plan.recomendado.pedidos[0].usar_desde}, destino ${plan.recomendado.destino}`);
for (const p of plan.recomendado.pedidos) linea(`${p.recurso.padEnd(16)} ×${String(p.cantidad).padEnd(3)} pedir antes del ${p.pedir_antes_del}, usar ${p.usar_desde} a ${p.usar_hasta}, ${usd(p.costo_usd)}`);

titulo('5. ENTREGA EN PUERTO O ACOPIO');
const venta = await app.decidirVentaCosecha({ puerto: 'gran-rosario', cultivo: lote.cultivo, hoy: ventana.optimo, fechaGranoListo: ventana.optimo, toneladas: 1200, distanciaPuertoKm: 300, distanciaAcopioKm: 40 });
linea(`Decisión: ${venta.venta.decision}${venta.venta.canal ? ` (${venta.venta.canal})` : ''}; cadetes: ${venta.cadetes.aviso.mensaje}`);

titulo('6. EMBOLSADO');
const bolsa = dimensionarSilobolsa({ toneladas: 7000, cultivo: lote.cultivo, dias: lote.diasDisponibles, urgencia: lote.urgencia }, tarifas);
linea(`${bolsa.bolsas} bolsas, ${bolsa.embolsadora.cantidad} ${bolsa.embolsadora.id}, ${usd(bolsa.costo_embolsado_usd)}`);

const destinoVenta = { terminal: 'Puerto Gran Rosario', distanciaKm: 300, acopios: [{ nombre: 'Cooperativa local', distanciaKm: 25, precioUsdPorT: 290 }] };
for (const [id, etiqueta] of [['SB-SANO', 'sano'], ['SB-HUMEDO', 'humedad en suba'], ['SB-CRITICO', 'riesgo crítico']]) {
  titulo(`7. SILOBOLSA ${id} (${etiqueta})`);
  const { riesgo } = await app.evaluarSilobolsa(id);
  linea(`Riesgo ${riesgo.nivel}; días al nivel medio ${riesgo.diasHastaMedio ?? '—'}, al crítico ${riesgo.diasHastaCritico ?? '—'}`);
  const r = await app.decidirVenta({ silobolsaId: id, hoy: HOY, destino: destinoVenta, tasaAnual: 0.08 });
  linea(`Decisión: ${r.decision}${r.fechaLimite ? ` (fecha límite ${r.fechaLimite})` : ''}`);
  if (r.elegido) {
    const e = r.elegido;
    linea(`${e.barcoId ?? e.acopio}: carga ${e.fechaCarga}, entrega ${e.fechaEntrega}, ${e.camiones.cantidad} × ${e.camiones.tipo}, extractora ${e.extractora.desde} a ${e.extractora.hasta}, neto ${usd(e.netoUsd)}`);
  }
  if (r.recomendacion) linea(`Recomendación: ${r.recomendacion}`);
}
