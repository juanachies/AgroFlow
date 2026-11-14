import { calcularVentanaCosecha } from '../cosecha/ventanaCosecha.js';

export const SERVICIOS = ['cosecha', 'transporte', 'almacenaje'];
const SERVICIO_DEL_DESTINO = { puerto: 'transporte', acopio: 'transporte', silobolsa: 'almacenaje' };
const CAMPOS_REQUERIDOS = ['ha', 'qqHa', 'cultivo', 'diasDisponibles', 'urgencia', 'fechaInicioCosecha'];

export function serviciosPedidos(entrada) {
  return [...new Set(['cosecha', ...(entrada.servicios ?? [])])];
}

function serviciosConDestino(entrada) {
  return serviciosPedidos(entrada).filter((servicio) => servicio !== 'cosecha');
}

// Sin fecha de inicio explícita, se cosecha en la fecha óptima de la ventana según la siembra.
export function resolverFechaInicio(entrada) {
  if (entrada.fechaInicioCosecha || !entrada.fechaSiembra) return entrada;
  const { optimo } = calcularVentanaCosecha({ fechaSiembra: entrada.fechaSiembra, cultivo: entrada.cultivo });
  return { ...entrada, fechaInicioCosecha: optimo };
}

export function datosFaltantes(original) {
  const entrada = resolverFechaInicio(original);
  const faltan = CAMPOS_REQUERIDOS.filter((campo) => entrada[campo] == null || entrada[campo] === '');
  const destinos = entrada.destinos ?? [];
  const necesarios = serviciosConDestino(entrada);
  if (necesarios.length > 0 && destinos.length === 0) {
    faltan.push(`destinos (hace falta para ${necesarios.join(' y ')})`);
  }
  destinos.forEach((destino, i) => {
    if (!destino.tipo) faltan.push(`destinos[${i}].tipo`);
    if (destino.tipo && destino.tipo !== 'silobolsa' && destino.distanciaKm == null) {
      faltan.push(`destinos[${i}].distanciaKm`);
    }
  });
  return faltan;
}

export function validarEntrada(entrada) {
  const faltan = datosFaltantes(entrada);
  if (faltan.length > 0) throw new RangeError(`faltan datos: ${faltan.join(', ')}`);

  const servicios = serviciosPedidos(entrada);
  const invalido = servicios.find((servicio) => !SERVICIOS.includes(servicio));
  if (invalido) throw new RangeError(`servicio inválido: ${invalido}. Opciones: ${SERVICIOS.join(', ')}`);
  for (const destino of entrada.destinos ?? []) {
    const requerido = SERVICIO_DEL_DESTINO[destino.tipo];
    if (!requerido) throw new RangeError(`tipo de destino inválido: ${destino.tipo}`);
    if (!servicios.includes(requerido)) {
      throw new RangeError(`el destino "${destino.nombre ?? destino.tipo}" requiere pedir el servicio "${requerido}"`);
    }
  }
}
