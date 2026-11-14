/**
 * Contrato: lecturas de los sensores del silobolsa, las actualiza el IoT.
 *
 * @typedef {{ timestamp: string, humedad?: number, temperatura?: number, co2?: number }} Lectura
 *   humedad en %, temperatura en °C, co2 en %; timestamp ISO 8601.
 * @typedef {object} LecturasIotPort
 * @property {(silobolsaId: string) => Promise<Lectura[]>} lecturas
 */
export {};
