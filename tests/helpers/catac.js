const CODIFICAR = { 0: 'Ǩ', 1: 'ǩ', 2: 'Ǫ', 3: 'ǫ', 4: 'Ǭ', 5: 'ǭ', 6: 'Ǯ', 7: 'ǯ', 8: 'ǰ', 9: 'Ǳ', '.': 'Ȯ', ',': 'ȯ' };

export const codificar = (texto) => [...texto].map((c) => CODIFICAR[c] ?? c).join('');

export function textoPdf(puntos) {
  return puntos.map(({ km, ars }) => `${codificar(String(km))}   ${codificar(ars)}`).join('\n');
}

const conMiles = (km) => (km >= 1000 ? `${Math.floor(km / 1000)}.${String(km % 1000).padStart(3, '0')}` : String(km));

export function tablaSintetica(cantidad = 1000) {
  return Array.from({ length: cantidad }, (_, i) => ({
    km: conMiles(i + 1),
    ars: (9636.69 + i * 85.5).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  }));
}
