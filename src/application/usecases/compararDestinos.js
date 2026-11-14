import { elegirDestino, evaluarDestino } from '../../domain/destino/comparadorDestinos.js';
import { resolverFechaInicio, validarEntrada } from '../../domain/destino/servicios.js';
import { ajustarDestinoPuerto } from '../../domain/destino/barcosDelPuerto.js';
import { analizarBarcos, puertoDeTerminal } from '../../domain/barcos/index.js';
import { diasViaje } from '../../domain/maquinaria/logistica.js';
import { sumarDias } from '../../domain/shared/util.js';

const HORIZONTE_BARCOS_DIAS = 60;

// Barcos del puerto: si hay BarcosPort, cada destino de tipo puerto se ajusta con la señal de barcos
// en la fecha de llegada del grano (precio, espera e índices a cumplir). Sin BarcosPort, no cambia nada.
async function conBarcos(entrada, { barcos, nivelRio }) {
  const destinos = entrada.destinos ?? [];
  if (!barcos || !destinos.some((d) => d.tipo === 'puerto')) return destinos;
  const hoy = entrada.hoy ?? entrada.fechaInicioCosecha;
  const nivelParanaM = entrada.nivelParanaM ?? (nivelRio ? await nivelRio.nivel(hoy).catch(() => null) : null);
  const porPuerto = new Map();
  return Promise.all(destinos.map(async (destino) => {
    if (destino.tipo !== 'puerto') return destino;
    const puerto = puertoDeTerminal(destino.terminal ?? destino.nombre ?? 'gran-rosario');
    if (!porPuerto.has(puerto)) {
      porPuerto.set(puerto, (async () => {
        const lineup = await barcos.calendario(puerto, hoy, sumarDias(hoy, HORIZONTE_BARCOS_DIAS));
        const mercado = (await barcos.mercado?.(puerto, hoy).catch(() => ({}))) ?? {};
        return { analisis: analizarBarcos({ lineup, puerto, cultivo: entrada.cultivo, hoy, horizonteDias: HORIZONTE_BARCOS_DIAS, nivelParanaM }), mercado };
      })());
    }
    const { analisis, mercado } = await porPuerto.get(puerto);
    const fechaLlegada = sumarDias(entrada.fechaInicioCosecha, diasViaje(destino.distanciaKm ?? 0));
    return ajustarDestinoPuerto({ destino, barcos: analisis, fechaLlegada, cultivo: entrada.cultivo, mercado: { ...mercado, ...entrada.mercado }, nivelParanaM, umbrales: entrada.umbrales });
  }));
}

/**
 * Evalúa cada destino candidato (o solo la cosecha si no hay ninguno) y elige el mejor.
 * @param {{ tarifas: import('../ports/TarifasPort.js').TarifasPort,
 *           barcos?: import('../ports/BarcosPort.js').BarcosPort,
 *           nivelRio?: import('../ports/NivelRioPort.js').NivelRioPort }} puertos
 */
export function crearCompararDestinos({ tarifas, barcos = null, nivelRio = null }) {
  return async function compararDestinos(original) {
    validarEntrada(original);
    const entrada = resolverFechaInicio(original);
    const [vigentes, destinos] = await Promise.all([tarifas.vigentes(), conBarcos(entrada, { barcos, nivelRio })]);
    const candidatos = destinos.length > 0 ? destinos : [null];
    const evaluados = candidatos.map((destino) => evaluarDestino(entrada, destino, vigentes));
    return { evaluados, ...elegirDestino(evaluados) };
  };
}
