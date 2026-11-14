import { exigirClave } from '../shared/errores.js';
import { costoCosechaUsdPorHa } from './costoCosecha.js';
import { elegir } from './elegir.js';

export function diasEfectivos(diasDisponibles, urgencia, tarifas) {
  exigirClave('urgencia', urgencia, tarifas.urgencia);
  return Math.max(1, Math.floor(diasDisponibles * (1 - tarifas.urgencia[urgencia].holgura)));
}

export function dimensionarCosechadoras({ ha, tons, qqHa, cultivo, dias, urgencia }, tarifas) {
  const usdHa = costoCosechaUsdPorHa(cultivo, qqHa, tarifas);
  const opciones = tarifas.cosechadoras.map((maquina) => {
    const cantidad = Math.ceil(ha / (maquina.ha_por_dia * dias));
    return {
      id: maquina.id,
      cantidad,
      dias: Math.ceil(ha / (cantidad * maquina.ha_por_dia)),
      ha_por_dia: maquina.ha_por_dia,
      t_por_dia: Math.min(cantidad * maquina.ha_por_dia * (qqHa / 10), tons),
      costo_usd: ha * usdHa * maquina.precio_relativo,
    };
  });
  return { elegida: elegir(opciones, urgencia, 'dias'), opciones };
}

export function dimensionarTractores(cantidad, diasReales, tarifas) {
  const tractor = tarifas.tractor_con_tolva;
  return {
    cantidad,
    capacidad_t: tractor.capacidad_t,
    costo_usd: cantidad * tarifas.parametros_generales.horas_utiles_por_dia * diasReales * tractor.costo_usd_por_hora,
  };
}
