/**
 * Contrato: calendario de barcos de un puerto y datos de mercado portuario.
 *
 * Un solo contrato para los dos usos:
 *   - venta de silobolsa eligiendo barco (domain/venta/decisionVenta.js) usa id, terminal,
 *     arribo, cierreCarga y toneladasMax;
 *   - pronóstico de barcos y venta en cosecha (domain/barcos, domain/venta/ventaCosecha.js) usa
 *     puerto, cultivo, toneladas, eta y estado.
 * Los adaptadores devuelven los dos grupos de campos (ver domain/barcos/calendario.js).
 *
 * Adaptadores (infrastructure/barcos/): nabsaAdapter (line-up NABSA real), barcosManualAdapter
 * (CSV), barcosSimuladosAdapter (respaldo). bcrAdapter parsea los datos de mercado de la BCR.
 *
 * @typedef {object} Barco
 * @property {string} id
 * @property {string} terminal       nombre de la terminal o zona portuaria
 * @property {string} arribo         AAAA-MM-DD, llegada estimada (ETA + demora típica si está anunciado)
 * @property {string} cierreCarga    AAAA-MM-DD, último día en que recibe grano
 * @property {number} toneladasMax   toneladas a cargar
 * @property {'gran-rosario'|'bahia-blanca'|'quequen'} [puerto]
 * @property {'soja'|'maiz'|'trigo'} [cultivo]  si falta, el barco sirve para cualquier cultivo
 * @property {number} [toneladas]
 * @property {string} [eta]          AAAA-MM-DD declarada en el line-up
 * @property {'anunciado'|'fondeado'|'cargando'} [estado]
 *
 * @typedef {object} DatosMercado
 * @property {{desde:string, hasta:string, dias?:number, toneladas:Object<string,number>, fuente?:string}} [programadas]
 * @property {{fecha:string, camiones:Object<string,number>, fuente?:string}} [camiones]
 *
 * @typedef {object} BarcosPort
 * @property {(terminal: string, desde: string, hasta: string) => Promise<Barco[]>} calendario
 *   `terminal` acepta el puerto ('gran-rosario') o un nombre ('Puerto Gran Rosario', 'San Lorenzo').
 * @property {(puerto: string, fecha: string) => Promise<DatosMercado>} [mercado]
 *   Buques a la carga y camiones (BCR / NABSA) para los índices del puerto. Puede devolver {}.
 * @property {string} [origen]
 */
export {};
