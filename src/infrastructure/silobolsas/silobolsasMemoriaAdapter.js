import { DatoNoDisponible } from '../../domain/shared/errores.js';

/** SilobolsasPort en memoria: registro de silobolsas ya embolsados. */
export function crearSilobolsasMemoriaAdapter(iniciales = []) {
  const porId = new Map(iniciales.map((silobolsa) => [silobolsa.id, silobolsa]));
  return {
    origen: 'memoria',
    registrar(silobolsa) {
      if (!silobolsa?.id) throw new RangeError('el silobolsa necesita id');
      porId.set(silobolsa.id, silobolsa);
    },
    async listar() {
      return [...porId.values()];
    },
    async obtener(id) {
      const silobolsa = porId.get(id);
      if (!silobolsa) throw new DatoNoDisponible(`silobolsa inexistente: ${id}`);
      return silobolsa;
    },
  };
}
