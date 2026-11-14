function parseFecha(fecha) {
  const valor = new Date(fecha);
  if (Number.isNaN(valor.getTime())) {
    throw new TypeError(`Fecha inválida: ${String(fecha)}`);
  }
  return valor;
}

function sumarDias(dateLike, dias) {
  const fecha = parseFecha(dateLike);
  const resultado = new Date(fecha);
  resultado.setUTCDate(resultado.getUTCDate() + dias);
  return resultado.toISOString().slice(0, 10);
}

export function calcularVentanaCosecha({
  fechaSiembra,
  cultivo = 'soja',
  duracionDias,
  margenAntes = 15,
  margenDespues = 15,
} = {}) {
  const ciclosBase = {
    soja: 120,
    maiz: 145,
    trigo: 170,
  };

  const ciclo = Number.isFinite(duracionDias) ? Number(duracionDias) : (ciclosBase[cultivo] ?? 120);

  const inicio = sumarDias(fechaSiembra, ciclo - margenAntes);
  const optimo = sumarDias(fechaSiembra, ciclo);
  const fin = sumarDias(fechaSiembra, ciclo + margenDespues);

  return {
    cultivo,
    fechaSiembra,
    cicloDias: ciclo,
    inicio,
    optimo,
    fin,
    margenAntes,
    margenDespues,
  };
}

export const ventanaCosecha = calcularVentanaCosecha;
export default calcularVentanaCosecha;
