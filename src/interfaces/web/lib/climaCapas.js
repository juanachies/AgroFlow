import { colorPara, formatearValor } from './climaTiempoReal.js';

export const CAPAS_PROXIMAMENTE = [
  { id: 'elevacion', titulo: 'Elevación y pendiente' },
  { id: 'transitabilidad', titulo: 'Transitabilidad' },
  { id: 'ndvi', titulo: 'Vegetación (NDVI)' },
];

export function valorClimaActual(resumen, variableId) {
  const valor = resumen?.actual?.[variableId];
  return Number.isFinite(valor) ? valor : null;
}

export function propiedadesClima(loteId, variableId, climaPorLote) {
  if (!variableId) return {};
  const valor = valorClimaActual(climaPorLote?.get(loteId), variableId);
  return {
    climaColor: colorPara(variableId, valor),
    climaLabel: formatearValor(variableId, valor),
  };
}

export function horaActualizacion(iso) {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return null;
  return new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(fecha);
}
