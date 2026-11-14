// Módulo Cadetes: qué maquinaria pedir, cuánta, cuándo y adónde, SEGÚN la decisión de venta.
//
// Vender (puerto o acopio): camiones de ida y vuelta (modalidad B de PROYECTO.md).
//   ciclo = 2 × km ÷ velocidad + carga/descarga (+ cola de terminal si es puerto)
//   viajes por camión y día = horas útiles ÷ ciclo
//   camiones = ceil(t por día ÷ (capacidad × viajes por día))
// Silobolsa: embolsadora en el campo, sin camiones hasta que se saque a vender.

import { PARAMS_LOGISTICA } from '../comun/logistica.js';
import { iso, sumarDias, diasEntre, redondear } from '../comun/util.js';

export function avisoCadetes({ venta, toneladas, fechaGranoListo, diasCosecha = 7, distanciaPuertoKm, distanciaAcopioKm = null, hoy, logistica = {} }) {
  const p = { ...PARAMS_LOGISTICA, ...logistica };
  const listo = iso(fechaGranoListo);
  const tDia = toneladas / Math.max(1, diasCosecha);
  const destino = venta.decision === 'silobolsa' ? 'silobolsa' : venta.canal;
  const inicio = destino === 'silobolsa' ? listo : venta.mejorVenta.despacho;
  const fin = sumarDias(inicio, Math.max(1, diasCosecha) - 1);
  const pedirEl = sumarDias(inicio, -p.anticipoCamionesDias);
  const urgente = diasEntre(hoy, pedirEl) <= 0;
  const diasEnCampo = Math.max(0, diasEntre(listo, inicio));

  let pedido;
  let mensaje;
  if (destino === 'silobolsa') {
    const embolsadoras = Math.ceil(tDia / (p.embolsadoraTHora * p.horasEmbolsadoDia));
    pedido = { embolsadoras, camiones: 0, tDia: Math.round(tDia) };
    mensaje = `${embolsadoras} embolsadora(s) del ${inicio} al ${fin} (${Math.round(tDia)} t/día). Sin camiones hasta sacar la bolsa a vender (~${venta.silobolsa.detalle.venderEl}).`;
  } else {
    const km = destino === 'acopio' ? distanciaAcopioKm : distanciaPuertoKm;
    const cicloHoras = (2 * km) / p.velocidadCamionKmH + p.horasCargaDescarga + (destino === 'puerto' ? p.colaTerminalHoras : 0);
    const viajesDia = cicloHoras <= p.horasUtilesDia ? Math.floor(p.horasUtilesDia / cicloHoras) : p.horasUtilesDia / cicloHoras;
    const camiones = Math.ceil(tDia / (p.capacidadCamionT * viajesDia));
    pedido = { camiones, viajesPorCamionDia: redondear(viajesDia, 2), cicloHoras: redondear(cicloHoras, 1), tDia: Math.round(tDia), embolsadoras: 0 };
    const lugar = destino === 'puerto' ? 'al puerto' : 'al acopio';
    const espera = diasEnCampo > 0 ? ` El grano espera ${diasEnCampo} día(s) en el campo antes del despacho.` : '';
    mensaje = `${camiones} camión(es) de ${p.capacidadCamionT} t ${lugar} (${km} km) del ${inicio} al ${fin}, ${pedido.viajesPorCamionDia} viaje(s) por camión y día, ${Math.round(tDia)} t/día.${espera}`;
  }

  const aviso = {
    modulo: 'cadetes',
    tipo: 'pedir-cadetes',
    nivel: urgente ? 'critico' : 'info',
    fecha: urgente ? iso(hoy) : pedirEl,
    mensaje: `${urgente ? 'Pedí HOY' : `Pedir el ${pedirEl}`}: ${mensaje}`,
    datos: { destino, inicio, fin, pedirEl, diasEnCampo, ...pedido },
  };
  return { destino, inicio, fin, pedirEl, diasEnCampo, ...pedido, aviso };
}
