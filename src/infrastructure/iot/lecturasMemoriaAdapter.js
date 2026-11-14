import { DatoNoDisponible } from '../../domain/shared/errores.js';

/** LecturasIotPort en memoria: el IoT (o la API) agrega lecturas con `agregar`. */
export function crearLecturasMemoriaAdapter(iniciales = {}) {
  const porId = new Map(Object.entries(iniciales));
  return {
    origen: 'memoria',
    agregar(silobolsaId, lecturas) {
      porId.set(silobolsaId, [...(porId.get(silobolsaId) ?? []), ...lecturas]);
    },
    async lecturas(silobolsaId) {
      const lecturas = porId.get(silobolsaId);
      if (!lecturas?.length) throw new DatoNoDisponible(`sin lecturas del IoT para ${silobolsaId}`);
      return lecturas;
    },
  };
}
