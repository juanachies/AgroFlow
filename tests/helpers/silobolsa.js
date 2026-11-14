const MS_POR_DIA = 86400000;

/** Serie diaria con variación lineal entre el primer y el último valor de cada variable. */
export function lecturasLineales({ inicio, dias, humedad, temperatura, co2 }) {
  const desde = Date.parse(inicio);
  return Array.from({ length: dias + 1 }, (_, i) => {
    const avance = i / dias;
    const valor = ([a, b]) => a + (b - a) * avance;
    return {
      timestamp: new Date(desde + i * MS_POR_DIA).toISOString(),
      humedad: valor(humedad),
      temperatura: valor(temperatura),
      co2: valor(co2),
    };
  });
}

export const lecturasSanas = lecturasLineales({
  inicio: '2026-11-07T00:00:00Z',
  dias: 7,
  humedad: [12.5, 12.5],
  temperatura: [22, 22],
  co2: [2, 2],
});

export const lecturasHumedadSube = lecturasLineales({
  inicio: '2026-11-09T00:00:00Z',
  dias: 5,
  humedad: [14, 15],
  temperatura: [24, 24],
  co2: [3, 3],
});

export const lecturasCriticas = lecturasLineales({
  inicio: '2026-11-09T00:00:00Z',
  dias: 5,
  humedad: [15.5, 16.5],
  temperatura: [30, 36],
  co2: [6, 9],
});

export const silobolsaSoja = { id: 'SB-001', cultivo: 'soja', kg: 200000, fechaCreacion: '2026-04-20' };

export const barcos = [
  { id: 'cierra-antes', terminal: 'Puerto Gran Rosario', arribo: '2026-11-10', cierreCarga: '2026-11-18', toneladasMax: 5000 },
  { id: 'barco-noviembre', terminal: 'Puerto Gran Rosario', arribo: '2026-11-25', cierreCarga: '2026-11-30', toneladasMax: 5000 },
  { id: 'barco-diciembre', terminal: 'Puerto Gran Rosario', arribo: '2026-12-20', cierreCarga: '2026-12-28', toneladasMax: 5000 },
];

export const precio = { spot: 300, futuros: [{ mes: '2026-12', precio: 320 }] };

/** Adaptadores simulados de los puertos que provee el resto de los módulos. */
export function puertosSimulados({ lecturas, silobolsa = silobolsaSoja, calendario = barcos, cotizacion = precio } = {}) {
  const llamadasBarcos = [];
  return {
    llamadasBarcos,
    silobolsas: { obtener: async () => silobolsa },
    lecturasIot: { lecturas: async () => lecturas },
    precios: { precios: async () => cotizacion },
    barcos: {
      calendario: async (terminal, desde, hasta) => {
        llamadasBarcos.push({ terminal, desde, hasta });
        return calendario;
      },
    },
  };
}
