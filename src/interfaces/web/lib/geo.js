// Geometría del lote dibujado en el mapa: superficie y perímetro geodésicos (WGS84).
// Área esférica por el método de Chamberlain & Duquette (el mismo que usa turf.area).

const RADIO_TIERRA_M = 6378137;
const rad = (grados) => (grados * Math.PI) / 180;

function areaAnilloM2(anillo) {
  const n = anillo.length;
  if (n < 3) return 0;
  let total = 0;
  for (let i = 0; i < n; i += 1) {
    const [lon1, lat1] = anillo[i];
    const [lon2, lat2] = anillo[(i + 1) % n];
    total += rad(lon2 - lon1) * (2 + Math.sin(rad(lat1)) + Math.sin(rad(lat2)));
  }
  return Math.abs((total * RADIO_TIERRA_M * RADIO_TIERRA_M) / 2);
}

function abrir(anillo) {
  const ultimo = anillo.at(-1);
  return anillo.length > 1 && ultimo[0] === anillo[0][0] && ultimo[1] === anillo[0][1]
    ? anillo.slice(0, -1)
    : anillo;
}

/** Superficie en m² de un Polygon o MultiPolygon GeoJSON (descuenta huecos). */
export function areaM2(geometry) {
  if (!geometry) return 0;
  const poligonos = geometry.type === 'Polygon' ? [geometry.coordinates]
    : geometry.type === 'MultiPolygon' ? geometry.coordinates : [];
  return poligonos.reduce((total, [exterior, ...huecos]) => total
    + areaAnilloM2(abrir(exterior))
    - huecos.reduce((suma, hueco) => suma + areaAnilloM2(abrir(hueco)), 0), 0);
}

export const areaHa = (geometry) => areaM2(geometry) / 10000;

function distanciaM([lon1, lat1], [lon2, lat2]) {
  const h = Math.sin(rad(lat2 - lat1) / 2) ** 2
    + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return 2 * RADIO_TIERRA_M * Math.asin(Math.sqrt(h));
}

/** Perímetro en metros de una lista de vértices [lon, lat] (cerrada o no). */
export function perimetroM(vertices) {
  const puntos = abrir(vertices);
  if (puntos.length < 2) return 0;
  return puntos.reduce((total, punto, i) => total + distanciaM(punto, puntos[(i + 1) % puntos.length]), 0);
}

/** Feature GeoJSON Polygon a partir de vértices abiertos [lon, lat]. */
export function poligonoDesdeVertices(vertices, properties = {}) {
  const puntos = abrir(vertices);
  if (puntos.length < 3) throw new TypeError('El polígono necesita al menos 3 vértices.');
  return {
    type: 'Feature',
    properties,
    geometry: { type: 'Polygon', coordinates: [[...puntos, puntos[0]]] },
  };
}

/** Vértices editables (abiertos) del primer anillo exterior. */
export function verticesDe(feature) {
  const geometry = feature?.geometry;
  const anillo = geometry?.type === 'Polygon' ? geometry.coordinates[0]
    : geometry?.type === 'MultiPolygon' ? geometry.coordinates[0]?.[0] : null;
  return anillo ? abrir(anillo).map(([lon, lat]) => [lon, lat]) : [];
}

/** Centroide simple (promedio de vértices); alcanza para ubicar el punto del lote. */
export function centroide(vertices) {
  const puntos = abrir(vertices);
  const suma = puntos.reduce(([x, y], [lon, lat]) => [x + lon, y + lat], [0, 0]);
  return [suma[0] / puntos.length, suma[1] / puntos.length];
}
