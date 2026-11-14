// Módulo Venta: vender a puerto (si cumple los índices), a acopio o silobolsa, y hasta dónde rinde vender.
export { SUPUESTOS_VENTA, PRECIOS_DEFAULT, supuestosVenta } from './supuestos.js';
export { UMBRALES_PUERTO, evaluarIndicesPuerto } from './criterios.js';
export { decidirVenta } from './decisionVenta.js';
