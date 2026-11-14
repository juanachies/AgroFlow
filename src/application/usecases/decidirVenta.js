import { decidirVenta } from '../../domain/venta/decisionVenta.js';

export function decidirVentaUseCase(params = {}) {
  return decidirVenta(params);
}

export default decidirVentaUseCase;
