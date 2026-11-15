// Utilidades HTTP: lectura de JSON, respuestas, errores y parámetros. Sin dependencias.

export const LIMITE_CUERPO_BYTES = 1_000_000;

export class ErrorHttp extends Error {
  constructor(estado, mensaje, detalle = undefined) {
    super(mensaje);
    this.estado = estado;
    this.detalle = detalle;
  }
}

export async function leerJson(req) {
  const tipo = req.headers['content-type'] ?? '';
  if (!tipo.includes('application/json')) throw new ErrorHttp(415, 'el cuerpo tiene que ser application/json');
  let total = 0;
  const partes = [];
  for await (const parte of req) {
    total += parte.length;
    if (total > LIMITE_CUERPO_BYTES) throw new ErrorHttp(413, `el cuerpo supera ${LIMITE_CUERPO_BYTES} bytes`);
    partes.push(parte);
  }
  const texto = Buffer.concat(partes).toString('utf8');
  if (!texto.trim()) throw new ErrorHttp(400, 'falta el cuerpo JSON');
  try {
    return JSON.parse(texto);
  } catch {
    throw new ErrorHttp(400, 'el cuerpo no es JSON válido');
  }
}

export function responder(res, estado, cuerpo, encabezados = {}) {
  const texto = JSON.stringify(cuerpo);
  res.writeHead(estado, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(texto), ...encabezados });
  res.end(texto);
}

// Errores del dominio (RangeError / TypeError: datos faltantes o inválidos) -> 400. El resto -> 500.
export function responderError(res, error) {
  if (error?.name === 'DatoNoDisponible') return responder(res, 404, { error: error.message });
  if (error instanceof ErrorHttp) return responder(res, error.estado, { error: error.message, ...(error.detalle ? { detalle: error.detalle } : {}) });
  if (error instanceof RangeError || error instanceof TypeError) return responder(res, 400, { error: error.message });
  console.error(error);
  return responder(res, 500, { error: 'error interno' });
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export function fechaParam(url, nombre, { requerido = false, porDefecto = null } = {}) {
  const valor = url.searchParams.get(nombre) ?? porDefecto;
  if (valor == null) {
    if (requerido) throw new ErrorHttp(400, `falta el parámetro ${nombre} (AAAA-MM-DD)`);
    return null;
  }
  if (!FECHA.test(valor)) throw new ErrorHttp(400, `${nombre} tiene que ser AAAA-MM-DD`);
  return valor;
}

export function coordenadaParam(url, nombre, maximo) {
  const texto = url.searchParams.get(nombre);
  const valor = texto == null || texto === '' ? Number.NaN : Number(texto);
  if (!Number.isFinite(valor) || Math.abs(valor) > maximo) {
    throw new ErrorHttp(400, `${nombre} tiene que ser un número entre -${maximo} y ${maximo}`);
  }
  return valor;
}

export function exigirFecha(valor, nombre) {
  if (typeof valor !== 'string' || !FECHA.test(valor)) throw new ErrorHttp(400, `${nombre} tiene que ser AAAA-MM-DD`);
  return valor;
}
