// Puerto de salida: datos de barcos y del mercado portuario.
//
// Adaptadores: infrastructure/barcos/
//   barcosSimuladosAdapter  (respaldo de la demo)
//   barcosManualAdapter     (CSV + JSON cargados a mano)
//   nabsaAdapter            (line-up NABSA; texto del PDF)
//   bcrAdapter              (parsers de "Buques a la carga" y "Posición de camiones")

/**
 * @typedef {Object} Barco
 * @property {string} buque
 * @property {'gran-rosario'|'bahia-blanca'|'quequen'} puerto
 * @property {'soja'|'maiz'|'trigo'} cultivo
 * @property {number} toneladas
 * @property {string} eta        YYYY-MM-DD (llegada estimada; para los que ya están, la fecha de llegada)
 * @property {'anunciado'|'fondeado'|'cargando'} estado
 */

/**
 * @typedef {Object} DatosMercado
 * @property {{desde:string, hasta:string, dias?:number, toneladas:Object<string,number>, fuente?:string}} [programadas]
 *           Toneladas a cargar por producto en el período (BCR "Buques a la carga" o NABSA).
 * @property {{fecha:string, camiones:Object<string,number>, fuente?:string}} [camiones]
 *           Camiones ingresados por día por producto y total (BCR / MAGyP / Williams).
 */

/**
 * @typedef {Object} BarcosPort
 * @property {(puerto:string, desde:string, hasta:string) => Promise<Barco[]>} calendario
 *           Line-up del puerto: barcos en puerto y anunciados entre `desde` y `hasta`.
 * @property {(puerto:string, fecha:string) => Promise<DatosMercado>} [mercado]
 *           Datos publicados para los índices del puerto. Puede devolver {} si no hay.
 * @property {string} [origen] Descripción de la fuente, para mostrar en la UI.
 */

export {};
