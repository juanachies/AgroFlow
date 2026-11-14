// Parámetros y cálculos de transporte compartidos por Venta y Cadetes. Supuestos editables.

export const PARAMS_LOGISTICA = {
  velocidadCamionKmH: 60,
  horasUtilesDia: 12,
  anticipoCamionesDias: 3,
  capacidadCamionT: 30,
  horasCargaDescarga: 2,
  colaTerminalHoras: 4,
  embolsadoraTHora: 150,
  horasEmbolsadoDia: 10,
};

// Días de viaje del camión hasta destino (0 = llega el mismo día).
export function diasViaje(distanciaKm, params = {}) {
  const p = { ...PARAMS_LOGISTICA, ...params };
  return Math.floor(distanciaKm / p.velocidadCamionKmH / p.horasUtilesDia);
}
