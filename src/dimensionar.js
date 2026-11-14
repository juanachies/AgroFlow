const datos = require('../datos/maquinaria.json');

const DESTINOS_CON_FLETE = ['puerto', 'acopio'];

function exigirPositivo(nombre, valor) {
  if (!Number.isFinite(valor) || valor <= 0) {
    throw new RangeError(`${nombre} debe ser un número mayor que 0`);
  }
}

function exigirClave(nombre, valor, objeto) {
  if (!(valor in objeto)) {
    throw new RangeError(`${nombre} inválido: ${valor}. Opciones: ${Object.keys(objeto).join(', ')}`);
  }
}

function toneladas(ha, qqHa) {
  return (ha * qqHa) / 10;
}

function diasEfectivos(diasDisponibles, urgencia, d = datos) {
  exigirClave('urgencia', urgencia, d.urgencia);
  return Math.max(1, Math.floor(diasDisponibles * (1 - d.urgencia[urgencia].holgura)));
}

function elegir(opciones, urgencia, claveRapidez) {
  const porCosto = (a, b) => a.costo_usd - b.costo_usd || a.cantidad - b.cantidad;
  const porRapidez = (a, b) => a[claveRapidez] - b[claveRapidez] || a.costo_usd - b.costo_usd;
  return [...opciones].sort(urgencia === 'alta' ? porRapidez : porCosto)[0];
}

function tarifaFleteUsdPorT(km, d = datos) {
  exigirPositivo('distanciaKm', km);
  const tabla = d.flete.tabla_ars_por_t;
  const ultimo = tabla[tabla.length - 1];
  if (km > ultimo.km) {
    throw new RangeError(`distanciaKm fuera de la tabla CATAC (máximo ${ultimo.km} km)`);
  }
  const ars = interpolar(tabla, km);
  return (ars * d.flete.factor_actualizacion) / d.parametros_generales.tipo_cambio_ars_usd;
}

function interpolar(tabla, km) {
  if (km <= tabla[0].km) return tabla[0].ars;
  const i = tabla.findIndex((punto) => punto.km >= km);
  const [a, b] = [tabla[i - 1], tabla[i]];
  return a.ars + ((km - a.km) / (b.km - a.km)) * (b.ars - a.ars);
}

function costoCosechaUsdPorHa(cultivo, qqHa, d = datos) {
  exigirClave('cultivo', cultivo, d.cosecha.factor_vs_soja);
  const c = d.cosecha;
  const pendiente = (c.usd_ha_rinde_alto - c.usd_ha_rinde_base) / (c.rinde_alto_qq_ha - c.rinde_base_qq_ha);
  const usdHa = c.usd_ha_rinde_base + Math.max(0, qqHa - c.rinde_base_qq_ha) * pendiente;
  return usdHa * c.factor_vs_soja[cultivo];
}

function dimensionarCosechadoras({ ha, tons, qqHa, cultivo, dias, urgencia }, d) {
  const usdHa = costoCosechaUsdPorHa(cultivo, qqHa, d);
  const opciones = d.cosechadoras.map((maquina) => {
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

function dimensionarTractores(cantidad, diasReales, d) {
  const t = d.tractor_con_tolva;
  return {
    cantidad,
    capacidad_t: t.capacidad_t,
    costo_usd: cantidad * d.parametros_generales.horas_utiles_por_dia * diasReales * t.costo_usd_por_hora,
  };
}

function dimensionarCamiones({ tons, tPorDia, diasReales, km, urgencia }, d) {
  const { horas_utiles_por_dia: horas, velocidad_media_camion_kmh: velocidad, tipo_cambio_ars_usd: cambio } =
    d.parametros_generales;
  const tarifa = tarifaFleteUsdPorT(km, d);
  const estadiaUsd = d.flete.estadia_ars_por_dia / cambio;
  const opciones = d.camiones.map((camion) => {
    const ciclo = (2 * km) / velocidad + camion.carga_h + camion.descarga_h;
    const viajesPorDia = Math.max(1, Math.floor(horas / ciclo));
    const cantidad = Math.ceil(tPorDia / (camion.capacidad_t * viajesPorDia));
    const porViaje = tons * tarifa * camion.precio_relativo;
    const dedicado = cantidad * diasReales * estadiaUsd;
    return {
      id: camion.id,
      cantidad,
      ciclo_h: ciclo,
      viajes_por_dia: viajesPorDia,
      modalidad: porViaje <= dedicado ? 'por_viaje' : 'dedicado_por_dia',
      costo_por_viaje_usd: porViaje,
      costo_dedicado_usd: dedicado,
      costo_usd: Math.min(porViaje, dedicado),
    };
  });
  return { elegido: elegir(opciones, urgencia, 'cantidad'), opciones, tarifa_usd_por_t: tarifa };
}

function dimensionarSilobolsa({ toneladas: tons, cultivo, dias, urgencia }, d = datos) {
  exigirPositivo('toneladas', tons);
  exigirPositivo('dias', dias);
  exigirClave('cultivo', cultivo, d.silobolsa.por_cultivo);
  exigirClave('urgencia', urgencia, d.urgencia);
  const grano = d.silobolsa.por_cultivo[cultivo];
  const horas = d.parametros_generales.horas_utiles_por_dia;
  const bolsas = Math.ceil(tons / grano.capacidad_t);
  const costoFijo = bolsas * d.silobolsa.costo_usd_por_bolsa + tons * d.silobolsa.costo_usd_por_t_embolsado;
  const opciones = d.embolsadoras.map((maquina) => {
    const cantidad = Math.ceil(tons / (maquina.t_por_hora * horas * dias));
    return {
      id: maquina.id,
      cantidad,
      dias: Math.ceil(tons / (cantidad * maquina.t_por_hora * horas)),
      costo_usd: costoFijo,
    };
  });
  return {
    bolsas,
    embolsadora: elegir(opciones, urgencia, 'dias'),
    humedad_max_bajo_riesgo: grano.humedad_max_bajo_riesgo,
    costo_extraccion_usd: tons * d.silobolsa.costo_usd_por_t_extraccion,
    costo_embolsado_usd: costoFijo,
  };
}

function dimensionarCosecha(params, d = datos) {
  const { ha, qqHa, cultivo, diasDisponibles, urgencia, destino, distanciaKm } = params;
  exigirPositivo('ha', ha);
  exigirPositivo('qqHa', qqHa);
  exigirPositivo('diasDisponibles', diasDisponibles);
  const conFlete = DESTINOS_CON_FLETE.includes(destino);
  if (destino != null && !conFlete && destino !== 'silobolsa') {
    throw new RangeError(`destino inválido: ${destino}. Opciones: ${[...DESTINOS_CON_FLETE, 'silobolsa'].join(', ')}`);
  }

  const tons = toneladas(ha, qqHa);
  const dias = diasEfectivos(diasDisponibles, urgencia, d);
  const { elegida, opciones } = dimensionarCosechadoras({ ha, tons, qqHa, cultivo, dias, urgencia }, d);
  const tractores = dimensionarTractores(elegida.cantidad, elegida.dias, d);

  const camiones = conFlete
    ? dimensionarCamiones({ tons, tPorDia: elegida.t_por_dia, diasReales: elegida.dias, km: distanciaKm, urgencia }, d)
    : null;
  const silobolsa =
    destino === 'silobolsa'
      ? dimensionarSilobolsa({ toneladas: tons, cultivo, dias: elegida.dias, urgencia }, d)
      : null;

  const costoDestino = (camiones?.elegido.costo_usd ?? 0) + (silobolsa?.costo_embolsado_usd ?? 0);
  return {
    toneladas: tons,
    dias_efectivos: dias,
    cosechadoras: elegida,
    cosechadoras_alternativas: opciones,
    tractores,
    camiones,
    silobolsa,
    costo_total_usd: elegida.costo_usd + tractores.costo_usd + costoDestino,
  };
}

module.exports = {
  toneladas,
  tarifaFleteUsdPorT,
  costoCosechaUsdPorHa,
  dimensionarCosecha,
  dimensionarSilobolsa,
};
