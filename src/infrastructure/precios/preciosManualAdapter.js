// Adaptador manual de PreciosPort: precios cargados a mano en JSON.
//
// Fuentes reales: spot = pizarra de la Cámara Arbitral de Cereales de Rosario (BCR, "Cotizaciones
// Locales", ARS/t) convertida con el tipo de cambio, o el disponible en USD; futuros = posiciones
// mensuales de A3 Mercados (ex Matba-Rofex), USD/t.
//
// Formato (ver data/precios-ejemplo.json):
// { "fecha": "2026-11-14", "tipoCambio": 1450, "fuente": "...",
//   "cultivos": { "soja": { "pizarraARSt": 435000 | "disponibleUSDt": 300,
//                           "futuros": [{ "posicion": "ENE27" | "2027-01", "precioUSDt": 306 }] } } }
// Si el JSON no trae tipoCambio, se usa `tipoCambio` del adaptador (p. ej. el de data/tarifas.json).

import { readFileSync } from 'node:fs';
import { spotDesdePizarra, vencimientoDePosicion } from '../../domain/venta/precios.js';

export function crearPreciosManualAdapter({ datos = null, ruta = null, tipoCambio = null } = {}) {
  const d = datos ?? JSON.parse(readFileSync(ruta, 'utf8'));
  return {
    async precios(cultivo) {
      const x = d.cultivos?.[cultivo];
      if (!x) throw new RangeError(`no hay precios cargados para ${cultivo}`);
      const spot = x.disponibleUSDt ?? spotDesdePizarra({ pizarraARSt: x.pizarraARSt, tipoCambio: x.tipoCambio ?? d.tipoCambio ?? tipoCambio });
      const futuros = (x.futuros ?? []).map((f) => ({ mes: vencimientoDePosicion(f.posicion ?? f.mes).slice(0, 7), precio: f.precioUSDt ?? f.precio }));
      return { spot, futuros, fuente: x.fuente ?? d.fuente ?? `manual ${d.fecha ?? ''}`.trim() };
    },
    origen: `manual ${d.fecha ?? ''}`.trim(),
  };
}
