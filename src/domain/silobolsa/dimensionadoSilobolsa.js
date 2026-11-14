import { elegir } from '../maquinaria/elegir.js';
import { exigirClave, exigirPositivo } from '../shared/errores.js';

export function dimensionarSilobolsa({ toneladas: tons, cultivo, dias, urgencia }, tarifas) {
  exigirPositivo('toneladas', tons);
  exigirPositivo('dias', dias);
  exigirClave('cultivo', cultivo, tarifas.silobolsa.por_cultivo);
  exigirClave('urgencia', urgencia, tarifas.urgencia);
  const grano = tarifas.silobolsa.por_cultivo[cultivo];
  const horas = tarifas.parametros_generales.horas_utiles_por_dia;
  const bolsas = Math.ceil(tons / grano.capacidad_t);
  const costoFijo = bolsas * tarifas.silobolsa.costo_usd_por_bolsa + tons * tarifas.silobolsa.costo_usd_por_t_embolsado;
  const opciones = tarifas.embolsadoras.map((maquina) => {
    const cantidad = Math.ceil(tons / (maquina.t_por_hora * horas * dias));
    return {
      id: maquina.id,
      cantidad,
      dias: Math.ceil(tons / (cantidad * maquina.t_por_hora * horas)),
      costo_usd: costoFijo,
    };
  });
  return {
    bolsas,
    embolsadora: elegir(opciones, urgencia, 'dias'),
    humedad_max_bajo_riesgo: grano.humedad_max_bajo_riesgo,
    costo_extraccion_usd: tons * tarifas.silobolsa.costo_usd_por_t_extraccion,
    costo_embolsado_usd: costoFijo,
  };
}
