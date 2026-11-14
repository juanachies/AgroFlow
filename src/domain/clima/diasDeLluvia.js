function parseFecha(fecha) {
  const valor = new Date(fecha);
  if (Number.isNaN(valor.getTime())) {
    throw new TypeError(`Fecha inválida: ${String(fecha)}`);
  }
  return valor;
}

export function lluviaAcumuladaPorPeriodo(serieLluvia, dias = 7) {
  if (!Array.isArray(serieLluvia) || serieLluvia.length === 0) {
    return 0;
  }

  const ms = dias * 24 * 60 * 60 * 1000;
  const referencia = parseFecha(serieLluvia[serieLluvia.length - 1].fecha);
  const corte = referencia.getTime() - ms;

  return serieLluvia
    .filter((evento) => {
      const ts = parseFecha(evento.fecha).getTime();
      return ts >= corte && ts <= referencia.getTime();
    })
    .reduce((total, evento) => total + Number(evento.lluviaMm ?? evento.precipitacionMm ?? 0), 0);
}

export function diasConLluvia(serieLluvia, umbralMm = 0.3) {
  return serieLluvia.filter((evento) => Number(evento.lluviaMm ?? evento.precipitacionMm ?? 0) >= umbralMm).length;
}

export function lluviaEnUltimasHoras(serieLluvia, horas = 48) {
  if (!Array.isArray(serieLluvia) || serieLluvia.length === 0) {
    return 0;
  }

  const ms = horas * 60 * 60 * 1000;
  const referencia = parseFecha(serieLluvia[serieLluvia.length - 1].fecha);
  const corte = referencia.getTime() - ms;

  return serieLluvia
    .filter((evento) => {
      const ts = parseFecha(evento.fecha).getTime();
      return ts >= corte && ts <= referencia.getTime();
    })
    .reduce((total, evento) => total + Number(evento.lluviaMm ?? evento.precipitacionMm ?? 0), 0);
}

export default {
  lluviaAcumuladaPorPeriodo,
  diasConLluvia,
  lluviaEnUltimasHoras,
};
