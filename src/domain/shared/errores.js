export function exigirPositivo(nombre, valor) {
  if (!Number.isFinite(valor) || valor <= 0) {
    throw new RangeError(`${nombre} debe ser un número mayor que 0`);
  }
}

export function exigirClave(nombre, valor, objeto) {
  if (!(valor in objeto)) {
    throw new RangeError(`${nombre} inválido: ${valor}. Opciones: ${Object.keys(objeto).join(', ')}`);
  }
}

export class DatoNoDisponible extends Error {
  constructor(mensaje) {
    super(mensaje);
    this.name = 'DatoNoDisponible';
  }
}
