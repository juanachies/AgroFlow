import { api } from './api.js';

const HORIZONTE_DIAS = 15;

const diaIso = (fecha) => fecha.toISOString().slice(0, 10);
const sumarDias = (fecha, dias) => new Date(fecha.getTime() + dias * 86400000);

// Convierte la respuesta de GET /api/clima en el mismo formato de pronóstico que usa toda la app.
export function pronosticoDesdeClima(respuesta, lot, ahora = new Date()) {
  const dailyForecast = (respuesta?.dias ?? [])
    .filter((dia) => dia.fuente === 'pronostico')
    .map((dia) => ({
      date: dia.fecha,
      precipitationMm: dia.lluviaMm,
      temperatureMaxC: dia.tempMaxC ?? null,
      temperatureMinC: dia.tempMinC ?? null,
    }));
  if (!dailyForecast.length) return null;
  return {
    queriedAt: ahora.toISOString(),
    lote: { latitude: lot.latitude, longitude: lot.longitude },
    dailyForecast,
    sourceStatus: { requested: ['Open-Meteo'], successful: ['Open-Meteo'], failed: [], quality: 'automático' },
    limitations: [],
  };
}

export async function pronosticoDelLote(lot, ahora = new Date()) {
  const respuesta = await api.clima({
    lat: lot.latitude,
    lon: lot.longitude,
    desde: diaIso(ahora),
    hasta: diaIso(sumarDias(ahora, HORIZONTE_DIAS)),
  });
  return pronosticoDesdeClima(respuesta, lot, ahora);
}
