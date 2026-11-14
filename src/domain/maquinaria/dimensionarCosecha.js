import { exigirPositivo } from '../shared/errores.js';
import { toneladas } from '../shared/unidades.js';
import { dimensionarSilobolsa } from '../silobolsa/dimensionadoSilobolsa.js';
import { dimensionarCamiones } from './camiones.js';
import { diasEfectivos, dimensionarCosechadoras, dimensionarTractores } from './dimensionado.js';

const DESTINOS_CON_FLETE = ['puerto', 'acopio'];

export function dimensionarCosecha(params, tarifas) {
  const { ha, qqHa, cultivo, diasDisponibles, urgencia, destino, distanciaKm } = params;
  exigirPositivo('ha', ha);
  exigirPositivo('qqHa', qqHa);
  exigirPositivo('diasDisponibles', diasDisponibles);
  const conFlete = DESTINOS_CON_FLETE.includes(destino);
  if (destino != null && !conFlete && destino !== 'silobolsa') {
    throw new RangeError(`destino inválido: ${destino}. Opciones: ${[...DESTINOS_CON_FLETE, 'silobolsa'].join(', ')}`);
  }

  const tons = toneladas(ha, qqHa);
  const dias = diasEfectivos(diasDisponibles, urgencia, tarifas);
  const { elegida, opciones } = dimensionarCosechadoras({ ha, tons, qqHa, cultivo, dias, urgencia }, tarifas);
  const tractores = dimensionarTractores(elegida.cantidad, elegida.dias, tarifas);

  const camiones = conFlete
    ? dimensionarCamiones({ tons, tPorDia: elegida.t_por_dia, diasReales: elegida.dias, km: distanciaKm, urgencia }, tarifas)
    : null;
  const silobolsa =
    destino === 'silobolsa'
      ? dimensionarSilobolsa({ toneladas: tons, cultivo, dias: elegida.dias, urgencia }, tarifas)
      : null;

  const costoDestino = (camiones?.elegido.costo_usd ?? 0) + (silobolsa?.costo_embolsado_usd ?? 0);
  return {
    toneladas: tons,
    dias_efectivos: dias,
    cosechadoras: elegida,
    cosechadoras_alternativas: opciones,
    tractores,
    camiones,
    silobolsa,
    costo_total_usd: elegida.costo_usd + tractores.costo_usd + costoDestino,
  };
}
