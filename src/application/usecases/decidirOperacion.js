import { decidirOperacion } from '../../domain/decision/decisionOperacion.js';
import { sumarDias } from '../../domain/shared/util.js';
import { obtenerDiasDeClima } from './diasDeClima.js';

const DIAS_ANTES_DEL_INICIO = 20;
const DIAS_DESPUES_DEL_INICIO = 60;
export const MAX_DIAS_CONSULTA_CLIMA = 366;

const hoyIso = (ahora) => ahora().toISOString().slice(0, 10);

/**
 * Decisión completa (cosecha + transporte + almacenaje + almanaque): simula el plan y lo ajusta
 * con el clima del lote. Devuelve la simulación con la decisión adjunta, así que sigue siendo
 * confirmable con confirmarReservas().
 */
export function crearDecidirOperacion({ simularPlan, clima = null, climatologia = null, fuentesExternas = false, ahora = () => new Date() }) {
  return async function decidir(entrada) {
    const simulacion = await simularPlan(entrada);
    const hoy = entrada.hoy ?? hoyIso(ahora);
    const inicioPlan = simulacion.entrada?.fechaInicioCosecha ?? hoy;
    const desde = sumarDias(inicioPlan, -DIAS_ANTES_DEL_INICIO);
    const hasta = sumarDias(inicioPlan, DIAS_DESPUES_DEL_INICIO);
    const lote = simulacion.lote ?? entrada.lote ?? {};

    const climaDiario = fuentesExternas
      // El horizonte del pronóstico se cuenta desde el día real, aunque el plan simule otra fecha de "hoy".
      ? await obtenerDiasDeClima({ latitude: lote.lat, longitude: lote.lon, desde, hasta, hoy: hoyIso(ahora), clima, climatologia })
      : { dias: [], fuentes: { pronostico: false, climatologia: false }, errores: [] };

    const decision = decidirOperacion({ simulacion, dias: climaDiario.dias, hoy });
    return { ...simulacion, decision: { ...decision, clima: { fuentes: climaDiario.fuentes, errores: climaDiario.errores } } };
  };
}

/**
 * Clima público del punto: pronóstico a 16 días y, para fechas más lejanas, probabilidad histórica de lluvia.
 */
export function crearConsultarClima({ clima = null, climatologia = null, ahora = () => new Date() }) {
  return async function consultarClima({ latitude, longitude, desde, hasta }) {
    const hoy = hoyIso(ahora);
    const inicio = desde ?? hoy;
    const fin = hasta ?? sumarDias(inicio, 90);
    if (fin < inicio) throw new RangeError('hasta no puede ser anterior a desde');
    if (Date.parse(`${fin}T00:00:00Z`) - Date.parse(`${inicio}T00:00:00Z`) > MAX_DIAS_CONSULTA_CLIMA * 86400000) {
      throw new RangeError(`el rango máximo es de ${MAX_DIAS_CONSULTA_CLIMA} días`);
    }
    const { dias, fuentes, errores } = await obtenerDiasDeClima({ latitude, longitude, desde: inicio, hasta: fin, hoy, clima, climatologia });
    return {
      coordenadas: { latitude: Number(latitude), longitude: Number(longitude) },
      desde: inicio,
      hasta: fin,
      fuentes: {
        pronostico: fuentes.pronostico ? 'Open-Meteo (hasta 16 días)' : null,
        climatologia: fuentes.climatologia ? 'Open-Meteo Historical (frecuencia de lluvia de los últimos 10 años)' : null,
      },
      errores,
      dias,
    };
  };
}
