// Calendario de carga: traduce el line-up (formato de Barcos) al contrato unificado de BarcosPort,
// que también usa la venta de silobolsa (id, terminal, arribo, cierreCarga, toneladasMax).
//
//   arribo      = ETA + demora media del puerto si está anunciado; la fecha del line-up si ya llegó.
//   cierreCarga = fin de carga informado (ETF de NABSA) o arribo + días de estadía del barco.

import { PUERTOS, conParams, demoraEtaDe } from './datos.js';
import { validarBarco } from './lineup.js';
import { sumarDias } from '../shared/util.js';

const ZONAS = [
  [/gran[- ]?rosario|up[- ]?river|rosario|san lorenzo|timb[uú]es|san mart[ií]n|arroyo seco|lagos|alvear|ramallo|san nicol[aá]s|villa constituci[oó]n|san pedro/i, 'gran-rosario'],
  [/bah[ií]a\s*blanca/i, 'bahia-blanca'],
  [/quequ[eé]n|necochea/i, 'quequen'],
];

// 'gran-rosario' | 'Puerto Gran Rosario' | 'San Lorenzo' -> clave de puerto del modelo.
export function puertoDeTerminal(terminal) {
  if (PUERTOS[terminal]) return terminal;
  const zona = ZONAS.find(([re]) => re.test(String(terminal)));
  if (!zona) throw new RangeError(`terminal desconocida: ${terminal}. Puertos: ${Object.keys(PUERTOS).join(', ')}`);
  return zona[1];
}

export function aCalendarioDeCarga(lineup, { params = {} } = {}) {
  const p = conParams(params);
  return lineup.map((crudo, i) => {
    const b = { ...crudo, ...validarBarco(crudo, i) };
    const demora = b.estado === 'anunciado' ? Math.round(demoraEtaDe(b.puerto, p).media) : 0;
    const arribo = sumarDias(b.eta, demora);
    const cierreCarga = crudo.cierreCarga && crudo.cierreCarga >= arribo ? crudo.cierreCarga : sumarDias(arribo, p.diasEstadiaBarco);
    return {
      ...b,
      id: crudo.id ?? b.buque,
      terminal: crudo.terminal ?? PUERTOS[b.puerto].nombre,
      arribo,
      cierreCarga,
      toneladasMax: b.toneladas,
    };
  });
}

// Filtro común de los adaptadores: barcos del puerto que siguen operando en [desde, hasta].
// Los anunciados con ETA vencida se conservan (vienen atrasados).
export function calendarioDelPuerto(lineup, terminal, desde, hasta, opciones = {}) {
  const puerto = puertoDeTerminal(terminal);
  return aCalendarioDeCarga(lineup.filter((b) => b.puerto === puerto), opciones)
    .filter((b) => b.cierreCarga >= desde && (b.estado !== 'anunciado' || b.eta <= hasta));
}
