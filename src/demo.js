// Demo por consola:
//   node src/demo.js [cultivo] [hoy] [lineup.csv | nabsa.txt]
// Barcos (independiente) -> Venta (índices del puerto, vender o silobolsa, hasta dónde rinde) -> Cadetes.
// Usa los datos de mercado publicados de data/mercado-ejemplo-2026-11.json.
import { readFileSync } from 'node:fs';
import { parsearLineupCSV, simularLineup, parsearLineupNABSA, nabsaALineup } from './barcos/index.js';
import { planificar } from './planificar.js';

const [cultivo = 'soja', hoy = '2026-11-14', archivo] = process.argv.slice(2);
let lineup;
let origen = 'simulado';
if (!archivo) lineup = simularLineup({ hoy, semilla: 7 });
else if (archivo.endsWith('.csv')) { lineup = parsearLineupCSV(readFileSync(archivo, 'utf8')); origen = archivo; }
else { const n = parsearLineupNABSA(readFileSync(archivo, 'utf8')); lineup = nabsaALineup(n); origen = `NABSA ${n.fecha} circ. ${n.circular}`; }
const mercado = JSON.parse(readFileSync(new URL('../data/mercado-ejemplo-2026-11.json', import.meta.url), 'utf8'));

const r = planificar({
  lineup,
  puerto: 'gran-rosario',
  cultivo,
  hoy,
  fechaGranoListo: hoy, // grano ya disponible (cosechado o en silobolsa)
  diasCosecha: 6,
  toneladas: 1500,
  distanciaPuertoKm: 320,
  distanciaAcopioKm: 60,
  mercado,
});
const usd = (n) => `US$ ${Math.round(n).toLocaleString('es-AR')}`;
const COLOR = { verde: '🟢', amarillo: '🟡', rojo: '🔴', 'sin-dato': '⚪' };

console.log(`=== ${cultivo.toUpperCase()} · hoy ${hoy} · line-up ${origen} ===\n`);
console.log('1) BARCOS');
for (const d of r.barcos.senal.slice(0, 7)) {
  console.log(`   ${d.fecha}  P(barco) ${String(Math.round(d.probHayBarco * 100)).padStart(3)}%  espera ${d.esperaDias.toFixed(1)} d  demanda ${d.indiceDemanda.toFixed(2)}  (${d.fuente})`);
}

console.log('\n2) ÍNDICES PARA VENDER A PUERTO');
for (const c of r.venta.indicesPuerto.checks) {
  const v = c.valor == null ? '—' : `${c.valor} ${c.unidad}`;
  console.log(`   ${COLOR[c.estado]} ${c.nombre.padEnd(42)} ${v.padEnd(10)} ${c.umbral}${c.bloqueante ? ' [bloqueante]' : ''}`);
  if (c.valor != null) console.log(`      ${c.detalle}${c.nota ? ` · ${c.nota}` : ''}`);
}
console.log(`   => ${r.venta.puertoHabilitado ? 'CUMPLE' : 'NO CUMPLE'} (semáforo ${r.venta.indicesPuerto.semaforo}, puntaje ${r.venta.indicesPuerto.puntaje})`);

console.log('\n3) VENTA');
console.log(`   Mejor puerto (sin índices): ${usd(r.venta.mejorPuerto.margenUSD)} despachando ${r.venta.mejorPuerto.despacho}`);
if (r.venta.mejorVenta) console.log(`   Mejor venta permitida:      ${usd(r.venta.mejorVenta.margenUSD)} (${r.venta.mejorVenta.canal}) despachando ${r.venta.mejorVenta.despacho}`);
console.log(`   Silobolsa ${r.venta.silobolsa.detalle.mesesGuardado} meses:          ${usd(r.venta.silobolsa.margenUSD)}`);
console.log(`   DECISIÓN: ${r.venta.decision.toUpperCase()}${r.venta.canal ? ` (${r.venta.canal})` : ''}`);
const h = r.venta.hastaDondeRinde;
console.log(`   Hasta dónde rinde: ventana ${h.ventanaVenta ? `${h.ventanaVenta.desde} a ${h.ventanaVenta.hasta}${h.ventanaVenta.abiertaAlFinal ? '+' : ''}` : 'ninguna'} · espera máx. ${h.esperaMaxDias} d · disponible mín. US$ ${h.precioPuertoMinimoUSDt}/t · futuro equilibrio US$ ${h.precioFuturoEquilibrioUSDt}/t`);

console.log('\n4) CADETES');
console.log(`   ${r.cadetes.aviso.mensaje}`);

console.log('\nAVISOS');
for (const a of r.avisos) console.log(`   [${a.nivel.toUpperCase()}] ${a.modulo}/${a.tipo}: ${a.mensaje}`);
