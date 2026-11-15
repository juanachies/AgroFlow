// Único lugar que conecta casos de uso con adaptadores.

import { crearCompararDestinos } from '../application/usecases/compararDestinos.js';
import { crearDecidirVenta } from '../application/usecases/decidirVenta.js';
import { crearDecidirVentaCosecha } from '../application/usecases/decidirVentaCosecha.js';
import { crearEvaluarSilobolsa } from '../application/usecases/evaluarSilobolsa.js';
import { crearPlanificarCosecha } from '../application/usecases/planificarCosecha.js';
import { crearSimularPlan, crearConfirmarReservas } from '../application/usecases/simularPlan.js';
import { crearConsultarClima, crearDecidirOperacion } from '../application/usecases/decidirOperacion.js';
import { crearArmarEntradaDeLote } from '../application/usecases/armarEntradaDeLote.js';
import { OpenMeteoClimatologiaAdapter } from '../infrastructure/clima/openMeteoClimatologiaAdapter.js';
import { crearConsultarSaturacion } from '../application/usecases/consultarSaturacion.js';
import { crearExplicarRecomendacion, crearSimularEscenario } from '../application/usecases/explicar.js';
import { crearOpenAIAdapter } from '../infrastructure/ia/openaiAdapter.js';
import { crearExplicadorPlantillaAdapter } from '../infrastructure/ia/explicadorPlantillaAdapter.js';
import { crearMarketplaceMemoriaAdapter } from '../infrastructure/marketplace/marketplaceMemoriaAdapter.js';
import { crearTarifasJsonAdapter } from '../infrastructure/tarifas/tarifasJsonAdapter.js';
import { crearBarcosSimuladosAdapter } from '../infrastructure/barcos/barcosSimuladosAdapter.js';
import { crearBarcosManualAdapter } from '../infrastructure/barcos/barcosManualAdapter.js';
import { crearBarcosNabsaAdapter } from '../infrastructure/barcos/nabsaAdapter.js';
import { conProgramadasMAGyP } from '../infrastructure/barcos/magypAdapter.js';
import { crearNivelRioManualAdapter } from '../infrastructure/rio/nivelRioManualAdapter.js';
import { env } from './env.js';
import { FileCache } from '../infrastructure/cache/fileCache.js';
import { NasaGpmImergAdapter } from '../infrastructure/clima/nasaGpmImergAdapter.js';
import { NasaPowerAdapter } from '../infrastructure/clima/nasaPowerAdapter.js';
import { NasaSmapAdapter } from '../infrastructure/clima/nasaSmapAdapter.js';
import { OpenMeteoAdapter } from '../infrastructure/clima/openMeteoAdapter.js';
import { SmnAdapter } from '../infrastructure/clima/smnAdapter.js';
import { Era5LandAdapter } from '../infrastructure/clima/era5LandAdapter.js';
import { DatosGobArAdapter } from '../infrastructure/rinde/datosGobArAdapter.js';
import { OpenStreetMapAdapter } from '../infrastructure/rutas/openStreetMapAdapter.js';
import { OpenMeteoElevationAdapter } from '../infrastructure/terreno/openMeteoElevationAdapter.js';
import { OpenTopographyAdapter } from '../infrastructure/terreno/openTopographyAdapter.js';
import { CopernicusStacAdapter } from '../infrastructure/satellite/copernicusStacAdapter.js';
import { consultarCondicionesCosecha } from '../application/usecases/consultarCondicionesCosecha.js';

const cache = new FileCache(env.cacheDirectory);
const openMeteo = new OpenMeteoAdapter({ baseUrl: env.openMeteoBaseUrl, cache });
const smn = env.smnApiBaseUrl
  ? new SmnAdapter({
    baseUrl: env.smnApiBaseUrl,
    username: env.smnApiUsername,
    password: env.smnApiPassword,
    cache,
  })
  : null;
const serviciosFuentes = {
  openMeteo,
  clima: openMeteo,
  climatologia: new OpenMeteoClimatologiaAdapter({ cache }),
  nasaPower: new NasaPowerAdapter({ baseUrl: env.powerBaseUrl, cache }),
  smap: new NasaSmapAdapter({ earthdataToken: env.nasaEarthdataToken }),
  era5Land: new Era5LandAdapter({
    apiToken: env.copernicusCdsApiToken,
    termsAccepted: env.era5TermsAccepted,
  }),
  imerg: new NasaGpmImergAdapter({
    username: env.nasaEarthdataUsername,
    password: env.nasaEarthdataPassword,
    productBaseUrl: env.gpmProductBaseUrl,
    cache,
  }),
  smn,
  rinde: new DatosGobArAdapter({ cache }),
  rutas: new OpenStreetMapAdapter({ userAgent: env.osmUserAgent, cache }),
  elevacion: new OpenMeteoElevationAdapter({ cache }),
  dem: new OpenTopographyAdapter({ apiKey: env.openTopographyApiKey }),
  sentinel: new CopernicusStacAdapter({
    username: env.cdseUsername,
    password: env.cdsePassword,
    totp: env.cdseTotp,
  }),
};

// `barcos` puede ser un adaptador ya armado (BarcosPort) o un modo: 'simulado' | 'manual' | 'nabsa'.
function adaptadorDeBarcos(barcos, { rutaLineup, mercado, simulado }) {
  if (barcos && typeof barcos === 'object') return barcos;
  if (barcos === 'nabsa') return crearBarcosNabsaAdapter({ rutaTexto: rutaLineup, mercado });
  if (barcos === 'manual') return crearBarcosManualAdapter({ rutaCsv: rutaLineup, mercado });
  return simulado;
}

/**
 * @param {object} [opciones]
 * @param {object} [opciones.tarifas]      TarifasPort (por defecto data/tarifas.json)
 * @param {object} [opciones.silobolsas]   SilobolsasPort
 * @param {object} [opciones.lecturasIot]  LecturasIotPort
 * @param {object} [opciones.precios]      PreciosPort
 * @param {object|'simulado'|'manual'|'nabsa'} [opciones.barcos] BarcosPort o modo
 * @param {string} [opciones.rutaLineup]   CSV (manual) o texto extraído del PDF (nabsa)
 * @param {object} [opciones.mercado]      datos BCR de camiones / buques a la carga
 * @param {string} [opciones.rutaMagyp]    tabla oficial de MAGyP "Barcos anunciados" (TSV/CSV): toneladas programadas
 * @param {number|null} [opciones.nivelParanaM]
 * @param {object} [opciones.fuentes]      adaptadores de clima, suelo, rinde, rutas y satélite
 * @param {object} [opciones.marketplace]  MarketplacePort (por defecto, en memoria con ofertas de ejemplo)
 */
export function crearContenedor({
  tarifas = crearTarifasJsonAdapter(), silobolsas, lecturasIot, precios, barcos,
  rutaLineup = null, mercado = null, nivelParanaM = null, fuentes = serviciosFuentes, rutaMagyp = null,
  marketplace = crearMarketplaceMemoriaAdapter(),
  fuentesExternas = false, // true: pronóstico (Open-Meteo) y rutas (OSRM) en el simulador; usa red
  explicador = env.openAIApiKey ? crearOpenAIAdapter({ apiKey: env.openAIApiKey, modelo: env.openAIModel }) : null,
} = {}) {
  const barcosSimulado = crearBarcosSimuladosAdapter({ mercado });
  const base = adaptadorDeBarcos(barcos, { rutaLineup, mercado, simulado: barcosSimulado });
  // Fuente oficial: las toneladas programadas salen de MAGyP si se carga su tabla.
  const adaptadorBarcos = rutaMagyp ? conProgramadasMAGyP(base, { ruta: rutaMagyp, camiones: mercado?.camiones ?? null }) : base;

  const nivelRio = crearNivelRioManualAdapter(nivelParanaM);
  // Elegir destino usa los barcos del puerto solo si se pasó un BarcosPort o un modo explícito.
  const compararDestinos = crearCompararDestinos({ tarifas, barcos: barcos ? adaptadorBarcos : null, nivelRio });
  const planificarCosecha = crearPlanificarCosecha({ tarifas, compararDestinos });
  const contenedor = { tarifas, compararDestinos, planificarCosecha, marketplace, silobolsas, lecturasIot };

  // Producto central: simulador (plan + saturación del puerto) y marketplace de cadetes.
  contenedor.simularPlan = crearSimularPlan({ planificarCosecha, marketplace, barcos: adaptadorBarcos, nivelRio, clima: fuentes.openMeteo ?? null, rutas: fuentes.rutas ?? null, fuentesExternas });
  contenedor.decidirOperacion = crearDecidirOperacion({
    simularPlan: contenedor.simularPlan, clima: fuentes.openMeteo ?? null, climatologia: fuentes.climatologia ?? null, precios: precios ?? null, marketplace, tarifas, fuentesExternas,
  });
  const armarEntradaDeLote = crearArmarEntradaDeLote({ precios: precios ?? null });
  contenedor.decidirLote = async (datosLote) => {
    const { entrada, automatico } = await armarEntradaDeLote(datosLote);
    const resultado = await contenedor.decidirOperacion(entrada);
    return { ...resultado, decision: { ...resultado.decision, automatico }, entradaAutomatica: entrada };
  };
  if (fuentesExternas) {
    contenedor.consultarClima = crearConsultarClima({ clima: fuentes.openMeteo ?? null, climatologia: fuentes.climatologia ?? null });
  }
  contenedor.confirmarReservas = crearConfirmarReservas({ marketplace, tarifas });
  contenedor.consultarSaturacion = crearConsultarSaturacion({ barcos: adaptadorBarcos, marketplace, nivelRio });
  // IA: explica con OpenAI si hay OPENAI_API_KEY; si no o si falla, con la plantilla.
  contenedor.explicador = explicador;
  contenedor.explicarRecomendacion = crearExplicarRecomendacion({ explicador, respaldo: crearExplicadorPlantillaAdapter() });
  contenedor.simularEscenario = crearSimularEscenario({ simularPlan: contenedor.simularPlan, explicarRecomendacion: contenedor.explicarRecomendacion });

  // Venta durante la cosecha según los barcos (puerto si cumple los índices, acopio o silobolsa).
  contenedor.decidirVentaCosecha = crearDecidirVentaCosecha({
    barcos: adaptadorBarcos,
    nivelRio,
    respaldoBarcos: base === barcosSimulado ? null : barcosSimulado,
    precios,
  });

  // Venta de una silobolsa eligiendo barco: necesita los puertos de silobolsas, IoT, precios y barcos.
  if (silobolsas && lecturasIot) {
    contenedor.evaluarSilobolsa = crearEvaluarSilobolsa({ silobolsas, lecturasIot, tarifas });
  }
  if (contenedor.evaluarSilobolsa && precios && barcos) {
    contenedor.decidirVenta = crearDecidirVenta({ evaluarSilobolsa: contenedor.evaluarSilobolsa, precios, barcos: adaptadorBarcos, tarifas });
  }
  return {
    ...contenedor,
    env,
    cache,
    services: fuentes,
    usecases: {
      simularPlan: contenedor.simularPlan,
      decidirOperacion: contenedor.decidirOperacion,
      decidirLote: contenedor.decidirLote,
      ...(contenedor.consultarClima ? { consultarClima: contenedor.consultarClima } : {}),
      confirmarReservas: contenedor.confirmarReservas,
      consultarSaturacion: contenedor.consultarSaturacion,
      explicarRecomendacion: contenedor.explicarRecomendacion,
      simularEscenario: contenedor.simularEscenario,
      compararDestinos: contenedor.compararDestinos,
      planificarCosecha: contenedor.planificarCosecha,
      decidirVentaCosecha: contenedor.decidirVentaCosecha,
      ...(contenedor.evaluarSilobolsa ? { evaluarSilobolsa: contenedor.evaluarSilobolsa } : {}),
      ...(contenedor.decidirVenta ? { decidirVenta: contenedor.decidirVenta } : {}),
      consultarCondicionesCosecha: (params = {}) => consultarCondicionesCosecha({
        ...params,
        adapters: { ...fuentes, ...(params.adapters ?? {}) },
      }),
    },
  };
}

export const container = crearContenedor();
export default container;
