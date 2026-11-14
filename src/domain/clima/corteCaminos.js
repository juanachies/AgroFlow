export function corteCaminos({
  lluvia48h = 0,
  sueloSaturado = false,
  horasUltimaLluvia = 0,
  umbralMm = 20,
  horasRecuperacion = 18,
  horasRecuperacionSaturado = 27,
} = {}) {
  const cortado = lluvia48h >= umbralMm;

  if (!cortado) {
    return {
      cortado: false,
      horasCorte: 0,
      nivel: 'TRANSITABLE',
      motivo: 'La lluvia caída en 48 h no supera el umbral de corte.',
    };
  }

  const horasCorte = sueloSaturado ? horasRecuperacionSaturado : Math.max(horasRecuperacion, horasUltimaLluvia || horasRecuperacion);

  return {
    cortado: true,
    horasCorte,
    nivel: sueloSaturado ? 'RIESGO ELEVADO' : 'CAUTION',
    motivo: sueloSaturado
      ? 'El suelo está saturado y requiere más tiempo para recuperar la capacidad portante.'
      : 'La lluvia reciente supera el umbral y el camino puede quedar intransitable.',
  };
}

export default corteCaminos;
