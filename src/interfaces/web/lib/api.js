// Cliente de la API de AgroFlow (docs/API.md).
// Misma URL en producción (el servidor sirve dist/); en desarrollo, Vite hace proxy de /api al
// puerto 3000. VITE_API_URL permite apuntar a una API desplegada aparte.

const BASE = (import.meta.env?.VITE_API_URL ?? '').replace(/\/$/, '');

async function pedir(ruta, { metodo = 'GET', cuerpo } = {}) {
  let respuesta;
  try {
    respuesta = await fetch(`${BASE}${ruta}`, {
      method: metodo,
      headers: cuerpo ? { 'content-type': 'application/json' } : undefined,
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
  } catch {
    throw new Error('No se pudo conectar con la API. ¿Está corriendo `npm start`?');
  }
  const datos = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) throw new Error(datos.error ?? `La API respondió ${respuesta.status}`);
  return datos;
}

export const api = {
  salud: () => pedir('/api/salud'),
  simular: (entrada) => pedir('/api/simular', { metodo: 'POST', cuerpo: entrada }),
  explicar: (simulacionId, pregunta) => pedir('/api/explicar', { metodo: 'POST', cuerpo: { simulacionId, ...(pregunta ? { pregunta } : {}) } }),
  escenario: (simulacionId, escenario) => pedir('/api/escenario', { metodo: 'POST', cuerpo: { simulacionId, escenario } }),
  confirmar: (simulacionId, loteId) => pedir('/api/reservas', { metodo: 'POST', cuerpo: { simulacionId, loteId } }),
};

// Valores de referencia editables para precargar el formulario (USD/t y qq/ha). No son cotizaciones.
export const REFERENCIAS = {
  soja: { qqHa: 35, puerto: 335, acopio: 303, silobolsa: 300 },
  maiz: { qqHa: 90, puerto: 195, acopio: 185, silobolsa: 180 },
  trigo: { qqHa: 40, puerto: 215, acopio: 205, silobolsa: 200 },
};

export const PUERTOS = [
  { id: 'Puerto Gran Rosario', label: 'Gran Rosario (Up-River)' },
  { id: 'Bahía Blanca', label: 'Bahía Blanca' },
  { id: 'Quequén', label: 'Quequén / Necochea' },
];

/**
 * Arma la entrada de POST /api/simular a partir del lote del front y del formulario.
 * El lote trae ubicación, cultivo, superficie y siembra; las distancias las calcula el servidor.
 */
export function armarEntrada(lote, f) {
  const destinos = [];
  if (f.usarSilobolsa) destinos.push({ nombre: 'Silobolsa en el campo', tipo: 'silobolsa', precioUsdPorT: Number(f.precioSilobolsa) });
  if (f.usarAcopio) {
    destinos.push({
      nombre: f.nombreAcopio || 'Acopio',
      tipo: 'acopio',
      precioUsdPorT: Number(f.precioAcopio),
      costoAdicionalUsdPorT: Number(f.tarifaAcopio || 0),
      distanciaKm: Number(f.distanciaAcopio || 15),
    });
  }
  if (f.usarPuerto) destinos.push({ nombre: f.puerto, tipo: 'puerto', terminal: f.puerto, precioUsdPorT: Number(f.precioPuerto) });
  const servicios = [];
  if (f.usarPuerto || f.usarAcopio) servicios.push('transporte');
  if (f.usarSilobolsa) servicios.push('almacenaje');
  return {
    lote: { id: lote.id, lat: lote.latitude, lon: lote.longitude },
    hoy: f.hoy,
    ha: Number(lote.areaHa),
    qqHa: Number(f.qqHa),
    cultivo: lote.crop,
    fechaSiembra: lote.sowingDate,
    fechaInicioCosecha: f.fechaInicioCosecha || undefined,
    diasDisponibles: Number(f.diasDisponibles),
    urgencia: f.urgencia,
    servicios,
    destinos,
  };
}
