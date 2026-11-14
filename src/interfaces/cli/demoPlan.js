// Demo del producto: planificá la cosecha y el despacho para no quedar en la cola del pico.
//   node src/interfaces/cli/demoPlan.js
// Lote de soja cerca de Pergamino, cosecha en abril (pico). El resto del mercado (simulado) satura
// Gran Rosario a mediados de abril. Proveedores ficticios de data/marketplace-ofertas-ejemplo.json.
import { crearContenedor } from '../../config/container.js';
import { crearMarketplaceMemoriaAdapter, simularReservasMercado } from '../../infrastructure/marketplace/marketplaceMemoriaAdapter.js';
import { crearBarcosSimuladosAdapter } from '../../infrastructure/barcos/barcosSimuladosAdapter.js';

const HOY = '2027-03-20';
const mercado = simularReservasMercado({
  puerto: 'gran-rosario', desde: HOY, dias: 60, camionesBaseDia: 3800,
  picos: [{ fecha: '2027-04-14', camionesDia: 7200, ancho: 5 }],
});
const marketplace = crearMarketplaceMemoriaAdapter({ reservas: mercado });
const { simularPlan, confirmarReservas } = crearContenedor({ marketplace, barcos: crearBarcosSimuladosAdapter({ semilla: 7 }) });

const entrada = {
  lote: { id: 'lote-pergamino', lat: -33.95, lon: -60.6 },
  hoy: HOY,
  ha: 1200, qqHa: 38, cultivo: 'soja', diasDisponibles: 12, urgencia: 'media',
  fechaInicioCosecha: '2027-04-10',
  servicios: ['transporte', 'almacenaje'],
  destinos: [
    { nombre: 'Silobolsa en el campo', tipo: 'silobolsa', precioUsdPorT: 300 },
    { nombre: 'Cooperativa local', tipo: 'acopio', distanciaKm: 35, costoAdicionalUsdPorT: 6, precioUsdPorT: 303 },
    { nombre: 'Puerto Gran Rosario', tipo: 'puerto', terminal: 'Puerto Gran Rosario', distanciaKm: 230, precioUsdPorT: 335 },
  ],
};

const usd = (n) => `US$ ${Math.round(n).toLocaleString('es-AR')}`;
const ICONO = { fluido: '🟢', cargado: '🟡', saturado: '🔴' };
const r = await simularPlan(entrada);

console.log(`=== Plan de cosecha y despacho · ${entrada.lote.id} · ${entrada.ha} ha de ${entrada.cultivo} · hoy ${HOY} ===\n`);
console.log('1) ADÓNDE MANDAR EL GRANO (margen neto)');
for (const a of r.plan.alternativas) console.log(`   ${a.destino.padEnd(24)} margen ${a.margen_usd == null ? '—' : usd(a.margen_usd)}`);
console.log(`   → ${r.plan.recomendado.destino} (${r.plan.recomendado.criterio})`);

console.log('\n2) SATURACIÓN DEL PUERTO (barcos + camiones reservados en el marketplace)');
for (const d of r.saturacion.dias.filter((x) => x.fecha >= '2027-04-08' && x.fecha <= '2027-04-30')) {
  console.log(`   ${d.fecha} ${ICONO[d.estado]} ${d.estado.padEnd(9)} camiones esperados ${String(d.camionesEsperados ?? '—').padStart(5)}  espera de barco ${d.esperaDias} d`);
}
if (r.ventana) console.log(`   Ventana de despacho: ${r.ventana.inicio} a ${r.ventana.fin} (corrimiento ${r.ventana.desplazamientoDias} días; días saturados ${r.ventana.diasSaturadosOriginal} → ${r.ventana.diasSaturados})`);

console.log('\n3) MARKETPLACE DE CADETES');
for (const l of r.asignacion.lineas) {
  console.log(`   ${l.linea.recurso.padEnd(18)} ${String(l.linea.cantidad).padStart(3)} u. del ${l.linea.usar_desde} al ${l.linea.usar_hasta} (pedir antes del ${l.linea.pedir_antes_del})`);
  for (const a of l.asignaciones) console.log(`      · ${a.proveedor.padEnd(32)} ${String(a.unidades).padStart(3)} u.  ${a.distanciaKm} km  precio ×${a.precioRelativo}  ${usd(a.costoUsd)}`);
  if (l.faltan) console.log(`      ✗ faltan ${l.faltan}`);
}
console.log(`   Cobertura ${r.asignacion.coberturaPct}% · costo estimado ${usd(r.asignacion.costoUsd)}`);

console.log('\nAVISOS');
for (const a of r.avisos) console.log(`   [${a.nivel.toUpperCase()}] ${a.mensaje}`);

const reservas = await confirmarReservas({ simulacion: r, loteId: entrada.lote.id });
console.log(`\n4) CONFIRMADO: ${reservas.length} reservas. Los camiones a puerto ya cuentan en el pronóstico de saturación de todos los productores.`);
