import { combinarPronostico } from '../../domain/clima/pronosticoCosecha.js';
import { diasEntre, sumarDias } from '../../domain/shared/util.js';

const HORIZONTE_PRONOSTICO_DIAS = 15; // Open-Meteo cubre hoy + 15 días

const mensaje = (reason) => (reason instanceof Error ? reason.message : String(reason));

/**
 * Serie diaria apta para decidir: pronóstico para los días cercanos y climatología para el resto.
 * Si una fuente falla, el resultado sigue siendo válido con la otra y deja constancia del error.
 */
export async function obtenerDiasDeClima({ latitude, longitude, desde, hasta, hoy, clima = null, climatologia = null }) {
  const errores = [];
  const fuentes = { pronostico: false, climatologia: false };
  const coordenadasValidas = Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude));
  let pronostico = [];
  let resumen = null;

  if (coordenadasValidas && clima) {
    const inicio = desde > hoy ? desde : hoy;
    const fin = sumarDias(hoy, HORIZONTE_PRONOSTICO_DIAS) < hasta ? sumarDias(hoy, HORIZONTE_PRONOSTICO_DIAS) : hasta;
    if (diasEntre(inicio, fin) >= 0) {
      try {
        const p = await clima.obtenerPronostico({
          latitude: Number(latitude), longitude: Number(longitude), startDate: inicio, endDate: fin, daily: ['precipitation_sum'], hourly: ['precipitation'],
        });
        pronostico = (p.daily?.time ?? []).map((fecha, i) => ({ fecha, lluviaMm: p.daily.precipitation_sum?.[i] }));
        fuentes.pronostico = pronostico.length > 0;
      } catch (reason) {
        errores.push(`pronóstico no disponible (${mensaje(reason)})`);
      }
    }
  }
  if (coordenadasValidas && climatologia) {
    try {
      resumen = (await climatologia.climatologiaDiaria({ latitude: Number(latitude), longitude: Number(longitude) })).resumen;
      fuentes.climatologia = true;
    } catch (reason) {
      errores.push(`climatología no disponible (${mensaje(reason)})`);
    }
  }
  return { dias: combinarPronostico({ desde, hasta, pronostico, climatologia: resumen }), fuentes, errores };
}
