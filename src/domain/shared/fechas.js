const MS_POR_DIA = 86400000;

export function sumarDias(fechaIso, dias) {
  const fecha = new Date(`${fechaIso}T00:00:00Z`);
  if (Number.isNaN(fecha.getTime())) throw new RangeError(`fecha inválida: ${fechaIso}`);
  return new Date(fecha.getTime() + dias * MS_POR_DIA).toISOString().slice(0, 10);
}
