export function costoCamionesContratados({ camiones = 0, dias = 0, tarifaDiaria = 0 } = {}) {
  return Number((camiones * dias * tarifaDiaria).toFixed(2));
}

export function costoCamionesViaje({
  toneladasPorDia = 0,
  distanciaKm = 0,
  tarifaPorTonKm = 0.094,
  velocidadKmH = 60,
  horasCarga = 1.2,
  horasDescarga = 1,
  horasCola = 1.5,
  capacidadToneladas = 30,
  horasUtiles = 12,
} = {}) {
  const cicloHoras = (2 * distanciaKm) / velocidadKmH + horasCarga + horasDescarga + horasCola;
  const viajesPorCamionPorDia = Math.max(1, Math.floor(horasUtiles / Math.max(cicloHoras, 1)));
  const camionesNecesarios = Math.max(1, Math.ceil(toneladasPorDia / (capacidadToneladas * viajesPorCamionPorDia)));
  const costoFlete = toneladasPorDia * distanciaKm * tarifaPorTonKm;

  return {
    cicloHoras: Number(cicloHoras.toFixed(2)),
    viajesPorCamionPorDia,
    camionesNecesarios,
    costoFlete: Number(costoFlete.toFixed(2)),
    costoTotal: Number((costoFlete + camionesNecesarios * 0).toFixed(2)),
  };
}

export function compararModalidadesCamiones({
  camiones = 5,
  dias = 5,
  tarifaDiaria = 250,
  toneladasPorDia = 200,
  distanciaKm = 100,
  tarifaPorTonKm = 0.094,
} = {}) {
  const modalidadA = costoCamionesContratados({ camiones, dias, tarifaDiaria });
  const modalidadB = costoCamionesViaje({ toneladasPorDia, distanciaKm, tarifaPorTonKm });

  const ganador = modalidadA <= modalidadB.costoFlete ? 'A' : 'B';

  return {
    modalidadA,
    modalidadB: modalidadB.costoFlete,
    ganador,
    diferencia: Math.abs(modalidadA - modalidadB.costoFlete),
  };
}

export default {
  costoCamionesContratados,
  costoCamionesViaje,
  compararModalidadesCamiones,
};
