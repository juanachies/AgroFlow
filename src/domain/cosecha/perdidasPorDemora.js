export function perdidasPorDemora({
  diasDemora = 0,
  humedad = 14,
  cultivo = 'soja',
  rendimientoEsperadoKgha = 3000,
} = {}) {
  const base = {
    soja: 56,
    maiz: 70,
    trigo: 52,
  }[cultivo] ?? 56;

  const factorHumedad = humedad > 15 ? 1.35 : 1;
  const incrementoPorDia = 6.3;
  const kgPorHa = Math.max(base, base + diasDemora * incrementoPorDia * factorHumedad);
  const porcentaje = (kgPorHa / Math.max(rendimientoEsperadoKgha, 1)) * 100;

  return {
    cultivo,
    diasDemora,
    humedad,
    kgPorHa: Number(kgPorHa.toFixed(2)),
    porcentaje: Number(porcentaje.toFixed(3)),
  };
}

export default perdidasPorDemora;
