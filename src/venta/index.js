// Módulo Venta: vender a puerto (si cumple los índices), a acopio o silobolsa, y hasta dónde rinde vender.
export { SUPUESTOS_VENTA, PRECIOS_DEFAULT, supuestosVenta } from './datos.js';
export { UMBRALES_PUERTO, evaluarIndicesPuerto } from './criterios.js';
export { decidirVenta } from './decision.js';
