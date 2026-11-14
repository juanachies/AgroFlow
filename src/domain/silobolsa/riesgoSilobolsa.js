import { exigirClave } from '../shared/errores.js';

const MS_POR_DIA = 86400000;
const NIVELES = ['bajo', 'medio', 'alto'];
const VARIABLES = ['humedad', 'temperatura', 'co2'];

function nivelDe(valor, { medio, alto }) {
  if (valor > alto) return 'alto';
  if (valor > medio) return 'medio';
  return 'bajo';
}

function ordenarPorTiempo(lecturas) {
  return [...lecturas].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
}

function pendientePorDia(serie, variable) {
  const puntos = serie.filter((lectura) => Number.isFinite(lectura[variable]));
  if (puntos.length < 2) return null;
  const [primero, ultimo] = [puntos[0], puntos[puntos.length - 1]];
  const dias = (Date.parse(ultimo.timestamp) - Date.parse(primero.timestamp)) / MS_POR_DIA;
  return dias > 0 ? (ultimo[variable] - primero[variable]) / dias : null;
}

function diasHastaAlto(actual, pendiente, alto) {
  if (actual > alto) return 0;
  if (pendiente === null || pendiente <= 0) return null;
  return Math.ceil((alto - actual) / pendiente);
}

/**
 * Nivel de riesgo de un silobolsa a partir de la serie de lecturas del IoT.
 * `diasHastaCritico` proyecta cada variable con su pendiente; es null si ninguna sube.
 */
export function evaluarRiesgo({ cultivo, lecturas }, tarifas) {
  exigirClave('cultivo', cultivo, tarifas.silobolsa.por_cultivo);
  if (!Array.isArray(lecturas) || lecturas.length === 0) {
    throw new RangeError('lecturas debe tener al menos una medición');
  }
  const { umbrales } = tarifas.silobolsa.por_cultivo[cultivo];
  const serie = ordenarPorTiempo(lecturas);
  const ultima = serie[serie.length - 1];
  const variables = {};
  for (const variable of VARIABLES) {
    if (!Number.isFinite(ultima[variable])) continue;
    const pendiente = pendientePorDia(serie, variable);
    variables[variable] = {
      valor: ultima[variable],
      nivel: nivelDe(ultima[variable], umbrales[variable]),
      pendientePorDia: pendiente,
      diasHastaCritico: diasHastaAlto(ultima[variable], pendiente, umbrales[variable].alto),
    };
  }
  const medidas = Object.entries(variables);
  if (medidas.length === 0) throw new RangeError('la última lectura no trae humedad, temperatura ni co2');
  const nivel = NIVELES[Math.max(...medidas.map(([, v]) => NIVELES.indexOf(v.nivel)))];
  const plazos = medidas.map(([, v]) => v.diasHastaCritico).filter((dias) => dias !== null);
  return {
    nivel,
    timestamp: ultima.timestamp,
    diasHastaCritico: plazos.length > 0 ? Math.min(...plazos) : null,
    variables,
    motivos: medidas.filter(([, v]) => v.nivel !== 'bajo').map(([nombre, v]) => `${nombre} ${v.valor} (${v.nivel})`),
  };
}
