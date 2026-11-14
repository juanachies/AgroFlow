// Adaptador en memoria de MarketplacePort.
//
// - Ofertas: las que se le pasan o las de data/marketplace-ofertas-ejemplo.json (proveedores ficticios).
// - Reservas: las confirmadas en la sesión más, opcionalmente, reservas simuladas del resto del
//   mercado (otros productores) para que el pronóstico de saturación tenga volumen en la demo.

import { readFileSync } from 'node:fs';
import { validarOferta } from '../../domain/marketplace/ofertas.js';
import { reservasEnRango } from '../../domain/marketplace/asignacion.js';
import { sumarDias, diasEntre } from '../../domain/shared/util.js';

const RUTA_OFERTAS = new URL('../../../data/marketplace-ofertas-ejemplo.json', import.meta.url);

/**
 * Reservas agregadas del resto del mercado: por día, camiones que van a `puerto`, ya multiplicados
 * por la participación de mercado (el pronóstico los divide por la misma participación).
 * @param {{ puerto:string, desde:string, dias:number, camionesBaseDia:number, picos?:{fecha:string, camionesDia:number, ancho?:number}[], participacion?:number }} p
 */
export function simularReservasMercado({ puerto, desde, dias, camionesBaseDia, picos = [], participacion = 0.05 }) {
  const reservas = [];
  for (let d = 0; d <= dias; d++) {
    const fecha = sumarDias(desde, d);
    let camiones = camionesBaseDia;
    for (const pico of picos) {
      const distancia = Math.abs(diasEntre(pico.fecha, fecha));
      const ancho = pico.ancho ?? 4;
      if (distancia <= ancho) camiones = Math.max(camiones, camionesBaseDia + (pico.camionesDia - camionesBaseDia) * (1 - distancia / (ancho + 1)));
    }
    reservas.push({
      id: `mercado-${fecha}`,
      loteId: 'mercado',
      ofertaId: null,
      proveedor: 'resto del mercado (simulado)',
      recurso: 'camión',
      unidades: Math.round(camiones * participacion),
      desde: fecha,
      hasta: fecha,
      destinoTipo: 'puerto',
      puerto,
      viajesPorDia: 1,
      capacidadT: 30,
    });
  }
  return reservas;
}

export function crearMarketplaceMemoriaAdapter({ ofertas = null, rutaOfertas = RUTA_OFERTAS, reservas = [] } = {}) {
  const catalogo = (ofertas ?? JSON.parse(readFileSync(rutaOfertas, 'utf8')).ofertas).map(validarOferta);
  let secuencia = catalogo.length;
  const confirmadas = [...reservas];
  return {
    async ofertas({ desde, hasta, recurso } = {}) {
      return catalogo.filter((o) => (!recurso || o.recurso === recurso) && (!desde || o.disponibleHasta >= desde) && (!hasta || o.disponibleDesde <= hasta));
    },
    async reservas({ desde, hasta, puerto } = {}) {
      const enRango = desde && hasta ? reservasEnRango(confirmadas, desde, hasta) : confirmadas;
      return enRango.filter((r) => !puerto || r.puerto === puerto);
    },
    async publicar(oferta) {
      const nueva = validarOferta({ ...oferta, id: oferta.id ?? `of-${String(++secuencia).padStart(3, '0')}` });
      if (catalogo.some((o) => o.id === nueva.id)) throw new RangeError(`la oferta ${nueva.id} ya existe`);
      catalogo.push(nueva);
      return nueva;
    },
    async reservar(nuevas) {
      const ids = new Set(confirmadas.map((r) => r.id));
      const repetida = nuevas.find((r) => ids.has(r.id));
      if (repetida) throw new RangeError(`la reserva ${repetida.id} ya existe`);
      confirmadas.push(...nuevas);
      return nuevas;
    },
    origen: 'marketplace en memoria (datos de ejemplo)',
  };
}
