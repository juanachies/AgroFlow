import { calcularVentanaCosecha } from '../../domain/cosecha/ventanaCosecha.js';
import { lluviaAcumuladaPorPeriodo, diasConLluvia } from '../../domain/clima/diasDeLluvia.js';
import { corteCaminos } from '../../domain/clima/corteCaminos.js';

export function planificarCosecha({
  lote = {},
  pronostico = [],
  cultivo = lote.cultivo ?? 'soja',
} = {}) {
  const ventana = calcularVentanaCosecha({
    fechaSiembra: lote.fechaSiembra ?? '2025-10-15',
    cultivo,
    duracionDias: lote.cicloDias,
  });

  const lluvia7d = lluviaAcumuladaPorPeriodo(pronostico, 7);
  const diasLluvia = diasConLluvia(pronostico);

  const transitabilidad = pronostico.map((dia) => ({
    fecha: dia.fecha,
    lluvia48h: Number(dia.lluvia48h ?? dia.lluviaMm ?? 0),
    ...corteCaminos({
      lluvia48h: Number(dia.lluvia48h ?? dia.lluviaMm ?? 0),
      sueloSaturado: Boolean(dia.sueloSaturado),
      horasUltimaLluvia: Number(dia.horasUltimaLluvia ?? 0),
    }),
  }));

  const recomendacion = lluvia7d > 100
    ? 'Se recomienda acortar la ventana operativa y controlar el riesgo de falta de piso.'
    : 'La ventana parece viable con monitoreo de la humedad del suelo y del pronóstico.';

  return {
    lote,
    ventana,
    lluvia7d: Number(lluvia7d.toFixed(2)),
    diasLluvia,
    transitabilidad,
    recomendacion,
  };
}

export default planificarCosecha;
