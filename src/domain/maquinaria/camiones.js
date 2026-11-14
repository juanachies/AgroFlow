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
    const porViaje = tons * tarifa * camion.precio_relativo;
    const dedicado = cantidad * diasReales * estadiaUsd;
    return {
      id: camion.id,
      cantidad,
      ciclo_h: ciclo,
      viajes_por_dia: viajesPorDia,
      modalidad: porViaje <= dedicado ? 'por_viaje' : 'dedicado_por_dia',
      costo_por_viaje_usd: porViaje,
      costo_dedicado_usd: dedicado,
      costo_usd: Math.min(porViaje, dedicado),
    };
  });
  return { elegido: elegir(opciones, urgencia, 'cantidad'), opciones, tarifa_usd_por_t: tarifa };
}
