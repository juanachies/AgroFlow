export function distanciaKm(origen, destino) {
  const lat1 = Number(origen.lat ?? 0);
  const lat2 = Number(destino.lat ?? 0);
  const lon1 = Number(origen.lon ?? 0);
  const lon2 = Number(destino.lon ?? 0);
  const dLat = (lat2 - lat1) * 111.32;
  const dLon = (lon2 - lon1) * 111.32 * Math.cos((lat1 * Math.PI) / 180);
  return Number(Math.sqrt(dLat ** 2 + dLon ** 2).toFixed(2));
}

export default { distanciaKm };
