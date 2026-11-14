/**
 * Contrato: silobolsas ya embolsados (datos que se conocen al traerlos).
 *
 * @typedef {object} SilobolsasPort
 * @property {(id: string) => Promise<{ id: string, cultivo: string, kg: number, fechaCreacion: string }>} obtener
 *   Lanza `DatoNoDisponible` si el id no existe.
 */
export {};
