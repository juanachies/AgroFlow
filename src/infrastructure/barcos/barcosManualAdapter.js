// Adaptador de BarcosPort con carga manual: line-up en CSV y datos de mercado en JSON.
//
// CSV con encabezado: buque,puerto,cultivo,toneladas,eta,estado (acepta ; o , como separador).
// Mercado (opcional): { programadas: {...}, camiones: {...} } como data/mercado-ejemplo-2026-11.json.

import { readFileSync } from 'node:fs';
import { validarBarco } from '../../domain/barcos/lineup.js';

const COLUMNAS = ['buque', 'puerto', 'cultivo', 'toneladas', 'eta', 'estado'];

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

// csv / mercado: contenido ya cargado; rutaCsv / rutaMercado: archivos a leer.
export function crearBarcosManualAdapter({ csv = null, rutaCsv = null, mercado = null, rutaMercado = null } = {}) {
  const lineup = parsearLineupCSV(csv ?? (rutaCsv ? readFileSync(rutaCsv, 'utf8') : ''));
  const datosMercado = mercado ?? (rutaMercado ? JSON.parse(readFileSync(rutaMercado, 'utf8')) : null);
  return {
    async calendario(puerto, _desde, hasta) {
      // Los anunciados con ETA vencida siguen viniendo (atrasados): se conservan.
      return lineup.filter((b) => b.puerto === puerto && (b.estado !== 'anunciado' || b.eta <= hasta));
    },
    async mercado() {
      return datosMercado ?? {};
    },
    origen: rutaCsv ?? 'CSV manual',
  };
}
