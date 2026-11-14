// Índices a cumplir para VENDER A PUERTO.
//
// Cada índice (calculado en Barcos con datos publicados) se compara con dos umbrales:
//   verde   = cumple holgado        (+1)
//   amarillo= zona gris              (0)
//   rojo    = no cumple              (−1)
// Regla: se puede vender a puerto si NINGÚN índice bloqueante está en rojo y la suma es ≥ 0.
// Si no cumple, Venta elige la mejor alternativa (acopio o silobolsa) aunque el puerto
// muestre más margen en el papel.
//
// Umbrales iniciales: razonados a partir de datos publicados (ver docs/INDICES_PUERTO.md).
// Se calibran con la serie histórica (BCR buques y camiones desde 2022, INA alturas).

export const UMBRALES_PUERTO = {
  demandaOferta: {
    nombre: 'Demanda de barcos ÷ oferta de camiones',
    unidad: 'x',
    verde: 1.1, rojo: 0.8, mayorEsMejor: true, bloqueante: true,
    explicacion: 'Si los barcos necesitan menos grano por día del que entra en camión, hay cola y descuentos.',
  },
  espera: {
    nombre: 'Espera estimada hasta tener barco',
    unidad: 'días',
    verde: 1, rojo: 3, mayorEsMejor: false, bloqueante: true,
    explicacion: 'Más de 3 días de espera se come el margen del puerto (estadía, camión parado).',
  },
  saturacion: {
    nombre: 'Saturación de descarga (camiones ÷ pico)',
    unidad: 'x',
    verde: 0.6, rojo: 0.85, mayorEsMejor: false, bloqueante: false,
    explicacion: 'Cerca del pico de descarga del Up-River hay colas en rutas y playas.',
  },
  demandaBarcos: {
    nombre: 'Barcos en puerto ÷ normal del mes',
    unidad: 'x',
    verde: 1.0, rojo: 0.8, mayorEsMejor: true, bloqueante: false,
    explicacion: 'Menos barcos que lo habitual presiona el disponible a la baja.',
  },
  nivelParana: {
    nombre: 'Altura del Paraná en Rosario',
    unidad: 'm',
    verde: 2.5, rojo: 1.5, mayorEsMejor: true, bloqueante: false,
    explicacion: 'Con bajante los buques salen con menos carga y el Up-River paga menos.',
  },
};

function estadoDe(valor, u) {
  if (valor == null || !Number.isFinite(valor)) return 'sin-dato';
  if (u.mayorEsMejor) return valor >= u.verde ? 'verde' : valor < u.rojo ? 'rojo' : 'amarillo';
  return valor <= u.verde ? 'verde' : valor > u.rojo ? 'rojo' : 'amarillo';
}

function textoUmbral(u) {
  return u.mayorEsMejor
    ? `verde ≥ ${u.verde} ${u.unidad} · rojo < ${u.rojo} ${u.unidad}`
    : `verde ≤ ${u.verde} ${u.unidad} · rojo > ${u.rojo} ${u.unidad}`;
}

const PUNTOS = { verde: 1, amarillo: 0, rojo: -1 };

export function evaluarIndicesPuerto(indices, umbrales = {}) {
  const U = Object.fromEntries(Object.entries(UMBRALES_PUERTO).map(([k, v]) => [k, { ...v, ...umbrales[k] }]));
  const checks = Object.entries(U).map(([id, u]) => {
    const ind = indices[id];
    const estado = estadoDe(ind?.valor, u);
    return {
      id,
      nombre: u.nombre,
      valor: ind?.valor ?? null,
      unidad: u.unidad,
      estado,
      bloqueante: u.bloqueante,
      umbral: textoUmbral(u),
      detalle: ind?.detalle ?? 'sin dato cargado',
      nota: ind?.nota ?? null,
      fuente: ind?.fuente ?? null,
      explicacion: u.explicacion,
    };
  });
  const evaluados = checks.filter((c) => c.estado !== 'sin-dato');
  const puntaje = evaluados.reduce((a, c) => a + PUNTOS[c.estado], 0);
  const bloqueos = evaluados.filter((c) => c.bloqueante && c.estado === 'rojo');
  const cumple = evaluados.length > 0 && bloqueos.length === 0 && puntaje >= 0;
  const semaforo = !cumple ? 'rojo' : puntaje > 0 && !evaluados.some((c) => c.estado === 'rojo') ? 'verde' : 'amarillo';
  return {
    cumple,
    semaforo,
    puntaje,
    evaluados: evaluados.length,
    fallas: evaluados.filter((c) => c.estado === 'rojo').map((c) => c.id),
    bloqueos: bloqueos.map((c) => c.id),
    checks,
  };
}
