// Marketplace de cadetes: ofertas de contratistas y transportistas (dominio puro).
//
// Una oferta es la capacidad que un proveedor publica para un recurso en un rango de fechas:
//   { id, proveedor, recurso, tipo?, unidades, base: { lat, lon, localidad? }, radioKm,
//     disponibleDesde, disponibleHasta, precioRelativo?, calificacion? }
// recurso: los mismos que arma el plan de pedido (domain/maquinaria/pedidos.js):
//   'cosechadora' | 'tractor con tolva' | 'camión' | 'embolsadora'.
// precioRelativo: 1 = tarifa de referencia de data/tarifas.json; 0,9 = 10% más barato.

import { iso } from '../shared/util.js';

export const RECURSOS = ['cosechadora', 'tractor con tolva', 'camión', 'embolsadora'];

export function validarOferta(o, i = 0) {
  const err = (m) => new RangeError(`oferta #${i + 1} (${o?.id ?? o?.proveedor ?? 'sin id'}): ${m}`);
  if (!o?.id || !o.proveedor) throw err('faltan id o proveedor');
  if (!RECURSOS.includes(o.recurso)) throw err(`recurso inválido "${o.recurso}" (opciones: ${RECURSOS.join(', ')})`);
  if (!(Number(o.unidades) > 0)) throw err('unidades debe ser mayor que 0');
  if (!Number.isFinite(Number(o.base?.lat)) || !Number.isFinite(Number(o.base?.lon))) throw err('falta la ubicación base (lat, lon)');
  if (!o.disponibleDesde || !o.disponibleHasta) throw err('faltan disponibleDesde y disponibleHasta');
  const desde = iso(o.disponibleDesde);
  const hasta = iso(o.disponibleHasta);
  if (hasta < desde) throw err('disponibleHasta es anterior a disponibleDesde');
  return {
    id: String(o.id),
    proveedor: String(o.proveedor),
    recurso: o.recurso,
    tipo: o.tipo ?? null,
    unidades: Math.floor(Number(o.unidades)),
    base: { lat: Number(o.base.lat), lon: Number(o.base.lon), localidad: o.base.localidad ?? null },
    radioKm: Number(o.radioKm ?? 100),
    disponibleDesde: desde,
    disponibleHasta: hasta,
    precioRelativo: Number(o.precioRelativo ?? 1),
    calificacion: o.calificacion == null ? null : Number(o.calificacion),
  };
}

// Distancia en línea recta (km). Para asignar alcanza; el flete usa la distancia por ruta.
export function distanciaKm(a, b) {
  const rad = (g) => (g * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}
