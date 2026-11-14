export function compararDestinos(destinos = []) {
  const ranking = [...destinos]
    .map((destino) => ({
      ...destino,
      margenNeto: Number(destino.margenNeto ?? destino.margen ?? 0),
    }))
    .sort((a, b) => b.margenNeto - a.margenNeto);

  ranking.mejor = ranking[0] ?? null;
  ranking.ranking = ranking.map((item, index) => ({ ...item, posicion: index + 1 }));

  return ranking;
}

export default compararDestinos;
