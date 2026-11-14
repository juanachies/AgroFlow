// Line-up de barcos: carga manual (CSV) y simulación reproducible.
//
// Formato de cada barco:
//   { buque, puerto, cultivo, toneladas, eta: 'YYYY-MM-DD', estado }
// estado: 'anunciado' (todavía no llegó), 'fondeado' o 'cargando' (ya está en el puerto).

import { PUERTOS, BARCOS_SEMANA_BASE, ESTACIONALIDAD, PARAMS_DEFAULT } from './datos.js';
import { iso, sumarDias, mesDe, rng } from '../comun/util.js';

const ESTADOS = new Set(['anunciado', 'fondeado', 'cargando']);
const COLUMNAS = ['buque', 'puerto', 'cultivo', 'toneladas', 'eta', 'estado'];

export function validarBarco(b, i = 0) {
  const err = (m) => new Error(`Barco #${i + 1} (${b?.buque ?? 'sin nombre'}): ${m}`);
  if (!b || typeof b !== 'object') throw err('registro vacío');
  if (!PUERTOS[b.puerto]) throw err(`puerto desconocido "${b.puerto}" (válidos: ${Object.keys(PUERTOS).join(', ')})`);
  if (!ESTACIONALIDAD[b.cultivo]) throw err(`cultivo desconocido "${b.cultivo}"`);
  const estado = b.estado || 'anunciado';
  if (!ESTADOS.has(estado)) throw err(`estado inválido "${b.estado}"`);
  const toneladas = Number(b.toneladas) || PARAMS_DEFAULT.cargaBarcoBaseT;
  return { buque: String(b.buque || `Buque ${i + 1}`), puerto: b.puerto, cultivo: b.cultivo, toneladas, eta: iso(b.eta), estado };
}

// CSV con encabezado: buque,puerto,cultivo,toneladas,eta,estado (acepta ; o , como separador).
export function parsearLineupCSV(texto) {
  const lineas = String(texto).split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  if (lineas.length === 0) return [];
  const sep = lineas[0].includes(';') ? ';' : ',';
  const cab = lineas[0].split(sep).map((c) => c.trim().toLowerCase());
  const faltan = COLUMNAS.filter((c) => c !== 'estado' && c !== 'toneladas' && !cab.includes(c));
  if (faltan.length) throw new Error(`Faltan columnas en el CSV: ${faltan.join(', ')}`);
  return lineas.slice(1).map((linea, i) => {
    const celdas = linea.split(sep).map((c) => c.trim());
    const fila = Object.fromEntries(cab.map((c, j) => [c, celdas[j]]));
    return validarBarco(fila, i);
  });
}

// Simula un line-up publicado: barcos ya en puerto y anunciados para las próximas semanas,
// con la tasa estacional del puerto y cultivo. Reproducible con `semilla`.
export function simularLineup({ puerto = 'gran-rosario', cultivos = ['soja', 'maiz', 'trigo'], hoy, horizonteDias = PARAMS_DEFAULT.horizonteLineupDias, semilla = 42 } = {}) {
  if (!hoy) throw new Error('simularLineup necesita la fecha `hoy`');
  const azar = rng(semilla);
  const barcos = [];
  let n = 1;
  for (const cultivo of cultivos) {
    const base = BARCOS_SEMANA_BASE[puerto]?.[cultivo] ?? 0;
    // Desde 5 días atrás (barcos ya en puerto) hasta el horizonte del line-up.
    for (let d = -5; d <= horizonteDias; d++) {
      const fecha = sumarDias(hoy, d);
      const tasaDia = (base / 7) * ESTACIONALIDAD[cultivo][mesDe(fecha)];
      // Poisson por día con tasa baja: aproximación por Bernoulli repetida.
      let llegadas = 0;
      let p = Math.exp(-tasaDia);
      let acum = p;
      const u = azar();
      while (u > acum && llegadas < 10) {
        llegadas++;
        p *= tasaDia / llegadas;
        acum += p;
      }
      for (let k = 0; k < llegadas; k++) {
        const estado = d < -2 ? 'cargando' : d < 0 ? 'fondeado' : 'anunciado';
        barcos.push({
          buque: `MV SIM-${String(n++).padStart(3, '0')}`,
          puerto,
          cultivo,
          toneladas: Math.round((35000 + azar() * 25000) / 1000) * 1000,
          eta: fecha,
          estado,
        });
      }
    }
  }
  return barcos.sort((a, b) => a.eta.localeCompare(b.eta));
}
