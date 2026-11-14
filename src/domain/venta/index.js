// Dominio Venta: venta en cosecha (puerto si cumple los índices, acopio o silobolsa; hasta dónde rinde)
// y venta de silobolsa eligiendo barco.
export { SUPUESTOS_VENTA, PRECIOS_DEFAULT, supuestosVenta } from './supuestos.js';
export { UMBRALES_PUERTO, evaluarIndicesPuerto } from './criterios.js';
export { decidirVentaCosecha } from './ventaCosecha.js';
export { decidirVenta } from './decisionVenta.js'; // venta de silobolsa eligiendo barco (módulo silobolsa-venta)
export { construirCurva, curvaDesdePrecios, precioEsperado, futuroEn, curvaDeVenta, spotDesdePizarra, vencimientoDePosicion } from './precios.js';
