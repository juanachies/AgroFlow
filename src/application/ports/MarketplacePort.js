/**
 * Contrato: marketplace de cadetes (contratistas de cosecha, transportistas, embolsadoras).
 *
 * Es la fuente de datos PROPIA del producto: las ofertas de los proveedores y las reservas que
 * confirman los productores. Las reservas de camiones dicen cuántos camiones van a ir a qué puerto
 * y qué día, antes de que salgan: con eso se pronostica la saturación del puerto.
 *
 * Adaptadores: infrastructure/marketplace/marketplaceMemoriaAdapter (en memoria, con ofertas de
 * ejemplo y reservas simuladas del resto del mercado). Una base de datos real entra como otro adaptador.
 *
 * @typedef {object} Oferta     ver domain/marketplace/ofertas.js
 * @typedef {object} Reserva    ver domain/marketplace/asignacion.js (crearReservas)
 *
 * @typedef {object} MarketplacePort
 * @property {(filtro: { desde: string, hasta: string, recurso?: string }) => Promise<Oferta[]>} ofertas
 * @property {(filtro: { desde: string, hasta: string, puerto?: string }) => Promise<Reserva[]>} reservas
 * @property {(reservas: Reserva[]) => Promise<Reserva[]>} reservar
 * @property {(oferta: Oferta) => Promise<Oferta>} [publicar]  alta de un proveedor (id opcional)
 * @property {string} [origen]
 */
export {};
