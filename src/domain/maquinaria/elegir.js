export function elegir(opciones, urgencia, claveRapidez) {
  const porCosto = (a, b) => a.costo_usd - b.costo_usd || a.cantidad - b.cantidad;
  const porRapidez = (a, b) => a[claveRapidez] - b[claveRapidez] || a.costo_usd - b.costo_usd;
  return [...opciones].sort(urgencia === 'alta' ? porRapidez : porCosto)[0];
}
