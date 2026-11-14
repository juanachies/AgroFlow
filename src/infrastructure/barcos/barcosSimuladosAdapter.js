// Adaptador simulado de BarcosPort: genera un line-up reproducible con la tasa estacional
// del puerto y cultivo. Es el respaldo de la demo si no hay datos reales cargados.

import { BARCOS_SEMANA_BASE, ESTACIONALIDAD, PARAMS_DEFAULT } from '../../domain/barcos/datos.js';
import { sumarDias, mesDe, rng } from '../../domain/shared/util.js';
import { calendarioDelPuerto, puertoDeTerminal } from '../../domain/barcos/calendario.js';

// Barcos ya en puerto (5 días atrás) y anunciados hasta el horizonte del line-up.
export function simularLineup({ puerto = 'gran-rosario', cultivos = ['soja', 'maiz', 'trigo'], hoy, horizonteDias = PARAMS_DEFAULT.horizonteLineupDias, semilla = 42 } = {}) {
  if (!hoy) throw new Error('simularLineup necesita la fecha `hoy`');
  const azar = rng(semilla);
  const barcos = [];
  let n = 1;
  for (const cultivo of cultivos) {
    const base = BARCOS_SEMANA_BASE[puerto]?.[cultivo] ?? 0;
    for (let d = -5; d <= horizonteDias; d++) {
      const fecha = sumarDias(hoy, d);
      const tasaDia = (base / 7) * ESTACIONALIDAD[cultivo][mesDe(fecha)];
      // Llegadas del día ~ Poisson(tasaDia), por inversión de la acumulada.
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
        barcos.push({
          buque: `MV SIM-${String(n++).padStart(3, '0')}`,
          puerto,
          cultivo,
          toneladas: Math.round((35000 + azar() * 25000) / 1000) * 1000,
          eta: fecha,
          estado: d < -2 ? 'cargando' : d < 0 ? 'fondeado' : 'anunciado',
        });
      }
    }
  }
  return barcos.sort((a, b) => a.eta.localeCompare(b.eta));
}

export function crearBarcosSimuladosAdapter({ semilla = 42, mercado = null } = {}) {
  return {
    async calendario(terminal, desde, hasta) {
      const puerto = puertoDeTerminal(terminal);
      return calendarioDelPuerto(simularLineup({ puerto, hoy: desde, semilla }), puerto, desde, hasta);
    },
    async mercado() {
      return mercado ?? {};
    },
    origen: `simulado (semilla ${semilla})`,
  };
}
