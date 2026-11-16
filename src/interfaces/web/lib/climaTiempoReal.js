const URL_OPEN_METEO = 'https://api.open-meteo.com/v1/forecast';
const ZONA_HORARIA = 'America/Argentina/Buenos_Aires';
const CAMPOS_ACTUALES = 'temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,wind_gusts_10m';
const CAMPOS_HORARIOS = `${CAMPOS_ACTUALES},soil_moisture_0_to_1cm,soil_moisture_3_to_9cm,precipitation_probability`;

export const VARIABLES_CLIMA = [
  {
    id: 'precipitacion',
    titulo: 'Precipitación',
    unidad: 'mm',
    icono: 'CloudRain',
    escala: [
      { hasta: 0, color: '#94a3b8', etiqueta: 'Sin lluvia' },
      { hasta: 1, color: '#22d3ee', etiqueta: 'Lluvia leve' },
      { hasta: 5, color: '#3b82f6', etiqueta: 'Lluvia moderada' },
      { hasta: 20, color: '#8b5cf6', etiqueta: 'Lluvia fuerte' },
      { hasta: Infinity, color: '#dc2626', etiqueta: 'Lluvia muy fuerte' },
    ],
    descripcion: 'Agua caída en la última hora y acumulada en las últimas 24 horas.',
  },
  {
    id: 'humedadAire',
    titulo: 'Humedad del aire',
    unidad: '%',
    icono: 'Droplets',
    escala: [
      { hasta: 30, color: '#f59e0b', etiqueta: 'Muy seco' },
      { hasta: 50, color: '#eab308', etiqueta: 'Seco' },
      { hasta: 70, color: '#22c55e', etiqueta: 'Normal' },
      { hasta: 85, color: '#0ea5e9', etiqueta: 'Húmedo' },
      { hasta: Infinity, color: '#6366f1', etiqueta: 'Muy húmedo' },
    ],
    descripcion: 'Humedad relativa del aire a 2 metros del suelo.',
  },
  {
    id: 'humedadSuelo',
    titulo: 'Humedad del suelo',
    unidad: '%',
    icono: 'Droplet',
    escala: [
      { hasta: 10, color: '#dc2626', etiqueta: 'Muy seco' },
      { hasta: 20, color: '#f97316', etiqueta: 'Seco' },
      { hasta: 30, color: '#eab308', etiqueta: 'Justo' },
      { hasta: 40, color: '#22c55e', etiqueta: 'Adecuado' },
      { hasta: Infinity, color: '#0284c7', etiqueta: 'Saturado' },
    ],
    descripcion: 'Humedad volumétrica en los primeros centímetros del suelo.',
  },
  {
    id: 'temperatura',
    titulo: 'Temperatura',
    unidad: '°C',
    icono: 'Thermometer',
    escala: [
      { hasta: 0, color: '#3b82f6', etiqueta: 'Helada' },
      { hasta: 10, color: '#22d3ee', etiqueta: 'Frío' },
      { hasta: 20, color: '#22c55e', etiqueta: 'Templado' },
      { hasta: 30, color: '#f59e0b', etiqueta: 'Cálido' },
      { hasta: Infinity, color: '#dc2626', etiqueta: 'Muy caluroso' },
    ],
    descripcion: 'Temperatura del aire a 2 metros del suelo.',
  },
  {
    id: 'viento',
    titulo: 'Viento',
    unidad: 'km/h',
    icono: 'Wind',
    escala: [
      { hasta: 5, color: '#22c55e', etiqueta: 'Calmo' },
      { hasta: 20, color: '#eab308', etiqueta: 'Moderado' },
      { hasta: 40, color: '#f97316', etiqueta: 'Fuerte' },
      { hasta: 60, color: '#ef4444', etiqueta: 'Muy fuerte' },
      { hasta: Infinity, color: '#7c3aed', etiqueta: 'Peligroso' },
    ],
    descripcion: 'Velocidad sostenida y ráfagas a 10 metros del suelo.',
  },
];

const numero = (valor) => (Number.isFinite(valor) ? valor : null);
const coordenadaValida = (valor) => valor !== null && valor !== undefined
  && valor !== '' && Number.isFinite(Number(valor));
const tieneCoordenadas = (lote) => coordenadaValida(lote?.latitude) && coordenadaValida(lote?.longitude);

function construirUrl(lotes) {
  const param = (nombre, valor) => `${nombre}=${valor}`;
  const consulta = [
    param('latitude', lotes.map((lote) => lote.latitude).join(',')),
    param('longitude', lotes.map((lote) => lote.longitude).join(',')),
    param('current', CAMPOS_ACTUALES),
    param('hourly', CAMPOS_HORARIOS),
    param('past_days', 1),
    param('forecast_days', 3),
    param('timezone', ZONA_HORARIA),
  ].join('&');
  return `${URL_OPEN_METEO}?${consulta}`;
}

function normalizarRespuesta(respuesta) {
  if (Array.isArray(respuesta)) return respuesta;
  if (respuesta && typeof respuesta === 'object') return [respuesta];
  throw new Error('Open-Meteo devolvió una respuesta inesperada.');
}

function indiceMasCercano(horas, referencia) {
  const objetivo = new Date(referencia).getTime();
  if (!Number.isFinite(objetivo)) return -1;
  let indice = -1;
  let distancia = Infinity;
  horas.forEach((hora, i) => {
    const diferencia = Math.abs(new Date(hora).getTime() - objetivo);
    if (diferencia < distancia) {
      distancia = diferencia;
      indice = i;
    }
  });
  return indice;
}

function acumulado24h(serie, indiceActual) {
  if (indiceActual < 0) return 0;
  const desde = Math.max(0, indiceActual - 23);
  return serie
    .slice(desde, indiceActual + 1)
    .reduce((total, hora) => total + (hora.precipitacion ?? 0), 0);
}

function normalizarLote(lote, item) {
  const horario = item?.hourly ?? {};
  const horas = horario.time ?? [];
  const valorHorario = (lista, i) => numero(lista?.[i]);
  const serieHoraria = horas.map((hora, i) => ({
    hora,
    precipitacion: valorHorario(horario.precipitation, i),
    humedadAire: valorHorario(horario.relative_humidity_2m, i),
    humedadSuelo: valorHorario(horario.soil_moisture_0_to_1cm, i),
    humedadSueloProfundo: valorHorario(horario.soil_moisture_3_to_9cm, i),
    temperatura: valorHorario(horario.temperature_2m, i),
    viento: valorHorario(horario.wind_speed_10m, i),
    rafagas: valorHorario(horario.wind_gusts_10m, i),
    probabilidadLluvia: valorHorario(horario.precipitation_probability, i),
  }));
  const indiceActual = indiceMasCercano(horas, item?.current?.time);
  return {
    loteId: lote.id ?? lote.loteId ?? null,
    actual: {
      precipitacion: numero(item?.current?.precipitation),
      humedadAire: numero(item?.current?.relative_humidity_2m),
      humedadSuelo: indiceActual >= 0 ? serieHoraria[indiceActual].humedadSuelo : null,
      temperatura: numero(item?.current?.temperature_2m),
      viento: numero(item?.current?.wind_speed_10m),
      rafagas: numero(item?.current?.wind_gusts_10m),
      hora: item?.current?.time ?? null,
    },
    acumulado24hMm: acumulado24h(serieHoraria, indiceActual),
    serieHoraria,
  };
}

export async function consultarClimaLotes(lotes, { fetchImpl = fetch, ahora = new Date() } = {}) {
  const conCoordenadas = (Array.isArray(lotes) ? lotes : []).filter(tieneCoordenadas);
  if (!conCoordenadas.length) throw new Error('No hay lotes con coordenadas para consultar el clima.');

  let respuesta;
  try {
    respuesta = await fetchImpl(construirUrl(conCoordenadas));
  } catch {
    throw new Error('No se pudo conectar con Open-Meteo.');
  }
  if (!respuesta?.ok) {
    throw new Error(`Open-Meteo respondió con error HTTP ${respuesta?.status ?? 'desconocido'}.`);
  }

  let cuerpo;
  try {
    cuerpo = await respuesta.json();
  } catch {
    throw new Error('Open-Meteo devolvió una respuesta ilegible.');
  }
  const items = normalizarRespuesta(cuerpo);
  if (items.length < conCoordenadas.length) {
    throw new Error('Open-Meteo no devolvió datos para todos los lotes.');
  }

  return {
    consultadoEn: ahora.toISOString(),
    lotes: conCoordenadas.map((lote, i) => normalizarLote(lote, items[i])),
  };
}

// La humedad del suelo llega en m³/m³ y se muestra en porcentaje.
export function valorEnUnidadMostrada(variableId, valor) {
  if (!Number.isFinite(valor)) return null;
  return variableId === 'humedadSuelo' ? valor * 100 : valor;
}

const HORAS_ATRAS = 24;
const HORAS_ADELANTE = 48;

export function ventanaHoraria(resumen) {
  const serie = resumen?.serieHoraria ?? [];
  // current.time trae minutos (p. ej. 15:30) y hourly.time va por hora exacta.
  const indice = indiceMasCercano(serie.map((punto) => punto.hora), resumen?.actual?.hora);
  if (indice < 0) return { puntos: [], indiceAhora: -1 };
  const inicio = Math.max(0, indice - (HORAS_ATRAS - 1));
  const fin = Math.min(serie.length, indice + HORAS_ADELANTE + 1);
  return { puntos: serie.slice(inicio, fin), indiceAhora: indice - inicio };
}

function extremos(valores) {
  const finitos = valores.filter(Number.isFinite);
  if (!finitos.length) return null;
  return { minimo: Math.min(...finitos), maximo: Math.max(...finitos) };
}

function sumar(valores) {
  return valores.reduce((total, valor) => total + (valor ?? 0), 0);
}

export function resumenVariable(resumen, variableId) {
  const { puntos, indiceAhora } = ventanaHoraria(resumen);
  const actual = resumen?.actual?.[variableId] ?? null;
  if (indiceAhora < 0) return { actual, puntos, indiceAhora };
  const valores = (lista, clave = variableId) => lista.map((punto) => punto[clave]);
  const pasadas = puntos.slice(0, indiceAhora + 1);
  const proximas = puntos.slice(indiceAhora + 1);
  const base = { actual, puntos, indiceAhora };

  if (variableId === 'precipitacion') {
    return {
      ...base,
      acumulado24: sumar(valores(pasadas)),
      acumulado48: sumar(valores(proximas)),
      probabilidadMaxima48: extremos(valores(proximas, 'probabilidadLluvia'))?.maximo ?? null,
    };
  }
  if (variableId === 'viento') {
    return {
      ...base,
      rafagaActual: resumen?.actual?.rafagas ?? null,
      rafaga24: extremos(valores(pasadas, 'rafagas'))?.maximo ?? null,
      rafaga48: extremos(valores(proximas, 'rafagas'))?.maximo ?? null,
    };
  }
  return {
    ...base,
    extremo24: extremos(valores(pasadas)),
    extremo48: extremos(valores(proximas)),
  };
}

const NUMERO_ES_AR = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 });

export function formatearValor(variableId, valor) {
  const numeroMostrado = valorEnUnidadMostrada(variableId, valor);
  if (numeroMostrado === null) return '—';
  const texto = NUMERO_ES_AR.format(numeroMostrado);
  const variable = VARIABLES_CLIMA.find(({ id }) => id === variableId);
  if (!variable?.unidad) return texto;
  return variable.unidad === '%' ? `${texto} %` : `${texto} ${variable.unidad}`;
}

export function colorPara(variableId, valor) {
  const escala = VARIABLES_CLIMA.find(({ id }) => id === variableId)?.escala ?? [];
  const numeroMostrado = valorEnUnidadMostrada(variableId, valor);
  if (numeroMostrado === null) return escala[0]?.color ?? '#94a3b8';
  return (escala.find(({ hasta }) => numeroMostrado <= hasta) ?? escala.at(-1))?.color ?? '#94a3b8';
}
