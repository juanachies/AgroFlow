import { createRemoteJWKSet, jwtVerify } from 'jose';
import { accountRepository } from './accountRepository.js';
import {
  validarActualizacionPerfil,
  validarAltaCuenta,
  validarCampo,
  validarOferta,
} from './accountValidation.js';
import { ErrorHttp, responder, responderError } from './validacion.js';

const LIMITE_CUERPO = 64_000;
let jwksCache;
let jwksUrlCache;

function jwksActual() {
  const url = process.env.NEON_AUTH_JWKS_URL;
  const authBaseUrl = process.env.NEON_AUTH_BASE_URL;
  if (!url || !authBaseUrl) throw new Error('Faltan NEON_AUTH_JWKS_URL o NEON_AUTH_BASE_URL en el servidor.');
  if (!jwksCache || jwksUrlCache !== url) {
    jwksCache = createRemoteJWKSet(new URL(url));
    jwksUrlCache = url;
  }
  return { jwks: jwksCache, issuer: new URL(authBaseUrl).origin };
}

async function autenticar(req) {
  const authorization = req.headers?.authorization;
  if (typeof authorization !== 'string' || !/^Bearer\s+\S+$/i.test(authorization)) {
    throw new ErrorHttp(401, 'iniciá sesión para continuar');
  }
  try {
    const { jwks, issuer } = jwksActual();
    const { payload } = await jwtVerify(authorization.replace(/^Bearer\s+/i, ''), jwks, { issuer });
    if (typeof payload.sub !== 'string' || !payload.sub) throw new Error('token sin identificador de usuario');
    return payload.sub;
  } catch (error) {
    if (error instanceof ErrorHttp) throw error;
    if (!process.env.NEON_AUTH_JWKS_URL || !process.env.NEON_AUTH_BASE_URL) throw error;
    throw new ErrorHttp(401, 'la sesión no es válida o expiró; volvé a iniciar sesión');
  }
}

async function leerCuerpo(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  if (!String(req.headers?.['content-type'] ?? '').includes('application/json')) {
    throw new ErrorHttp(415, 'el cuerpo tiene que ser application/json');
  }
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      throw new ErrorHttp(400, 'el cuerpo no es JSON válido');
    }
  }
  let bytes = 0;
  const chunks = [];
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > LIMITE_CUERPO) throw new ErrorHttp(413, 'el cuerpo es demasiado grande');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new ErrorHttp(400, 'el cuerpo no es JSON válido');
  }
}

function responderJson(res, status, body) {
  return responder(res, status, body);
}

export async function manejarCuenta(req, res, resource) {
  try {
    if (req.method === 'OPTIONS') return responderJson(res, 204, {});
    const userId = await autenticar(req);
    const url = new URL(req.url, 'http://localhost');

    if (resource === 'account' && req.method === 'GET') {
      return responderJson(res, 200, await accountRepository.get(userId));
    }
    if (resource === 'account' && req.method === 'POST') {
      return responderJson(res, 201, await accountRepository.create(userId, validarAltaCuenta(await leerCuerpo(req))));
    }
    if (resource === 'account' && req.method === 'PATCH') {
      const profile = await accountRepository.updateProfile(userId, validarActualizacionPerfil(await leerCuerpo(req)));
      return responderJson(res, 200, { profile });
    }
    if (resource === 'fields' && req.method === 'GET') {
      return responderJson(res, 200, { fields: await accountRepository.listFields(userId) });
    }
    if (resource === 'fields' && req.method === 'POST') {
      const field = await accountRepository.createField(userId, validarCampo(await leerCuerpo(req)));
      return responderJson(res, 201, { field });
    }
    if (resource === 'fields' && req.method === 'PUT') {
      const id = url.searchParams.get('id');
      if (!id) throw new ErrorHttp(400, 'falta el identificador del campo');
      const field = await accountRepository.updateField(userId, id, validarCampo(await leerCuerpo(req)));
      return responderJson(res, 200, { field });
    }
    if (resource === 'fields' && req.method === 'DELETE') {
      const id = url.searchParams.get('id');
      if (!id) throw new ErrorHttp(400, 'falta el identificador del campo');
      await accountRepository.deleteField(userId, id);
      return responderJson(res, 200, { deleted: true });
    }
    if (resource === 'offering' && req.method === 'GET') {
      return responderJson(res, 200, { offering: await accountRepository.getOffering(userId) });
    }
    if (resource === 'offering' && req.method === 'PUT') {
      const offering = await accountRepository.saveOffering(userId, validarOferta(await leerCuerpo(req)));
      return responderJson(res, 200, { offering });
    }

    return responderJson(res, 405, { error: 'método no permitido' });
  } catch (error) {
    return responderError(res, error);
  }
}
