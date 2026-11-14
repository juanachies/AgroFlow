export function evaluarRiesgoSilobolsa({
  humedad = 14,
  temperatura = 20,
  mesesGuardado = 0,
  hermeticidad = 1,
  roturas = 0,
} = {}) {
  const umbrales = {
    bajo: 14,
    medio: 16,
  };

  let nivel = 'BAJO';
  if (humedad > umbrales.bajo && humedad <= umbrales.medio) {
    nivel = 'MEDIO';
  } else if (humedad > umbrales.medio) {
    nivel = 'ALTO';
  }

  if (temperatura > 20) {
    nivel = nivel === 'BAJO' ? 'MEDIO' : nivel === 'MEDIO' ? 'ALTO' : 'ALTO';
  }

  const mesesSeguro = {
    BAJO: humedad <= 14 ? 12 : 6,
    MEDIO: humedad <= 16 ? 6 : 2,
    ALTO: 2,
}[nivel];

  const riesgo = Math.min(100, Math.max(0, (humedad * 4) + (temperatura > 20 ? 18 : 0) + (roturas * 12) - (hermeticidad * 12)));

  const recomendacion = riesgo >= 70
    ? 'Conviene sacar y vender antes de acumular más deterioro.'
    : 'Se puede sostener el almacenamiento con control de humedad y temperatura.';

  return {
    nivel,
    riesgo: Number(riesgo.toFixed(2)),
    mesesSeguro,
    mesesGuardado,
    recomendacion,
  };
}

export default evaluarRiesgoSilobolsa;
