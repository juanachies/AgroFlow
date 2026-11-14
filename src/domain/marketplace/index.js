// Dominio Marketplace de cadetes: ofertas de contratistas y transportistas, asignación del plan de
// pedido y reservas. Las reservas de camiones alimentan el pronóstico de saturación del puerto.
export { RECURSOS, validarOferta, distanciaKm } from './ofertas.js';
export { unidadesLibres, asignarLinea, asignarPlan, crearReservas, reservasEnRango } from './asignacion.js';
