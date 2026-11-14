import { sumarDias } from '../shared/fechas.js';

function lineaPedido(servicio, recurso, tipo, cantidad, inicio, anticipo, diasUso, costoUsd, extra = {}) {
  return {
    servicio,
    recurso,
    tipo,
    cantidad,
    pedir_antes_del: sumarDias(inicio, -anticipo),
    usar_desde: inicio,
    usar_hasta: sumarDias(inicio, diasUso - 1),
    costo_usd: costoUsd,
    ...extra,
  };
}

export function armarPedidos(r, inicio, tarifas) {
  const anticipo = tarifas.reserva.anticipo_dias;
  const diasCosecha = r.cosechadoras.dias;
  const pedidos = [
    lineaPedido('cosecha', 'cosechadora', r.cosechadoras.id, r.cosechadoras.cantidad, inicio, anticipo.cosechadora, diasCosecha, r.cosechadoras.costo_usd),
    lineaPedido('cosecha', 'tractor con tolva', `tolva de ${r.tractores.capacidad_t} t`, r.tractores.cantidad, inicio, anticipo.tractor_tolva, diasCosecha, r.tractores.costo_usd),
  ];
  if (r.camiones) {
    const camion = r.camiones.elegido;
    pedidos.push(
      lineaPedido('transporte', 'camión', camion.id, camion.cantidad, inicio, anticipo.camion, diasCosecha, camion.costo_usd, {
        modalidad: camion.modalidad,
        viajes_por_dia: camion.viajes_por_dia,
      }),
    );
  }
  if (r.silobolsa) {
    const { embolsadora, bolsas, costo_embolsado_usd: costo } = r.silobolsa;
    pedidos.push(
      lineaPedido('almacenaje', 'embolsadora', embolsadora.id, embolsadora.cantidad, inicio, anticipo.embolsadora, embolsadora.dias, 0),
      lineaPedido('almacenaje', 'silobolsa', 'bolsa 9 pies x 60 m', bolsas, inicio, anticipo.silobolsa, embolsadora.dias, costo),
    );
  }
  return pedidos;
}

export function costosPorServicio(pedidos) {
  const totales = {};
  for (const { servicio, costo_usd: costo } of pedidos) totales[servicio] = (totales[servicio] ?? 0) + costo;
  return totales;
}
