import { estadiaUsdPorDia, tarifaFleteUsdPorT } from '../flete/costoFlete.js';
import { elegir } from './elegir.js';

export function dimensionarCamiones({ tons, tPorDia, diasReales, km, urgencia }, tarifas) {
  const { horas_utiles_por_dia: horas, velocidad_media_camion_kmh: velocidad } = tarifas.parametros_generales;
  const tarifa = tarifaFleteUsdPorT(km, tarifas);
  const estadiaUsd = estadiaUsdPorDia(tarifas);
  const opciones = tarifas.camiones.map((camion) => {
    const ciclo = (2 * km) / velocidad + camion.carga_h + camion.descarga_h;
    const viajesPorDia = Math.max(1, Math.floor(horas / ciclo));
    const cantidad = Math.ceil(tPorDia / (camion.capacidad_t * viajesPorDia));
    // La tarifa CATAC por tonelada es el precio de mercado del flete. La estadía que publica CATAC es
    // lo que se paga por cada día de espera del camión: no es una tarifa de camión dedicado.
    const costo = tons * tarifa * camion.precio_relativo;
    return {
      id: camion.id,
      cantidad,
      ciclo_h: ciclo,
      viajes_por_dia: viajesPorDia,
      modalidad: 'por_tonelada',
      costo_usd: costo,
      estadia_usd_por_dia: estadiaUsd * cantidad,
    };
  });
  return { elegido: elegir(opciones, urgencia, 'cantidad'), opciones, tarifa_usd_por_t: tarifa };
}
