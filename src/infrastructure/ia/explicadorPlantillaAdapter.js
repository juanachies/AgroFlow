// Explicador de respaldo (sin IA): arma el texto con una plantilla a partir del resumen.
// Garantiza que la demo siempre tenga una explicación aunque OpenAI no responda.

const PLURAL = { cosechadora: 'cosechadoras', 'tractor con tolva': 'tractores con tolva', 'camión': 'camiones', embolsadora: 'embolsadoras' };
const cantidadDe = (n, recurso) => `${n} ${n === 1 ? recurso : PLURAL[recurso] ?? recurso}`;

const usd = (n) => (n == null ? '—' : `US$ ${Math.round(n).toLocaleString('es-AR')}`);

function explicarPlan(r) {
  const partes = [];
  const alternativas = r.destino.alternativas.filter((a) => a.destino !== r.destino.recomendado && a.margenUsd != null);
  const mejorAlternativa = alternativas.sort((a, b) => b.margenUsd - a.margenUsd)[0];
  const criterio = r.destino.criterio.split(';')[0];
  const masEnElPapel = mejorAlternativa && r.destino.margenUsd != null && mejorAlternativa.margenUsd > r.destino.margenUsd;
  partes.push(`Conviene mandar las ${r.toneladas?.toLocaleString('es-AR') ?? ''} t a ${r.destino.recomendado} (${criterio})${r.destino.margenUsd != null ? `, con un margen de ${usd(r.destino.margenUsd)}` : ''}.`);
  if (masEnElPapel) {
    partes.push(`${mejorAlternativa.destino} daría ${usd(mejorAlternativa.margenUsd - r.destino.margenUsd)} más en el papel, pero se descarta porque el puerto no cumple los índices de barcos (demanda contra camiones, espera o saturación): ir ahí es arriesgarse a la cola y a un precio castigado.`);
  } else if (mejorAlternativa) {
    partes.push(`La siguiente opción, ${mejorAlternativa.destino}, deja ${usd(r.destino.margenUsd - mejorAlternativa.margenUsd)} menos.`);
  }
  if (r.puerto?.diasSaturados) {
    partes.push(`El puerto se satura ${r.puerto.diasSaturados} días entre el ${r.puerto.primerDiaSaturado} y el ${r.puerto.ultimoDiaSaturado}.`);
  }
  if (r.despacho && r.despacho.corrimientoDias !== 0 && r.despacho.diasSaturadosEvitados > 0) {
    partes.push(`Por eso conviene despachar entre el ${r.despacho.inicio} y el ${r.despacho.fin}: se evitan ${r.despacho.diasSaturadosEvitados} días de cola y el grano espera en el campo mientras tanto.`);
  }
  const pedido = r.pedido.filter((p) => p.recurso !== 'silobolsa').map((p) => cantidadDe(p.cantidad, p.recurso)).join(', ');
  const primerPlazo = r.pedido.map((p) => p.pedirAntesDel).sort()[0];
  const vencido = r.hoy && primerPlazo < r.hoy;
  if (pedido) partes.push(`Para eso hacen falta ${pedido}; ${vencido ? 'ya pasó el anticipo recomendado, así que conviene confirmar hoy' : `el primer pedido conviene cerrarlo antes del ${primerPlazo}`}.`);
  partes.push(r.marketplace.faltantes.length
    ? `En el marketplace faltan ${r.marketplace.faltantes.join(', ')}: conviene pedir antes o mover la fecha.`
    : `El marketplace cubre el ${r.marketplace.coberturaPct}% del pedido con ${r.marketplace.proveedores} proveedores de la zona (${usd(r.marketplace.costoUsd)}).`);
  if (r.clima?.diasConLluvia) partes.push(`El pronóstico marca ${r.clima.diasConLluvia} días de lluvia en la ventana, ya descontados de los días de cosecha.`);
  return partes.join(' ');
}

function explicarComparacion(comparacion, escenario) {
  const titulo = escenario?.descripcion ? `Si ${escenario.descripcion}: ` : 'En este escenario: ';
  if (!comparacion.cambios.length) return `${titulo}el plan no cambia; la recomendación sigue siendo ${comparacion.despues.destino.recomendado}.`;
  return `${titulo}${comparacion.cambios.join('; ')}.`;
}

export function crearExplicadorPlantillaAdapter() {
  return {
    origen: 'plantilla',
    async explicar({ resumen, comparacion, escenario }) {
      const texto = comparacion ? explicarComparacion(comparacion, escenario) : explicarPlan(resumen);
      return { texto, fuente: 'plantilla' };
    },
  };
}
