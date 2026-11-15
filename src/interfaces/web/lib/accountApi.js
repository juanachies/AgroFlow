import { authClient } from './auth.js';
import { getSessionJwt } from './authSession.js';

export class AccountApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'AccountApiError';
    this.status = status;
  }
}

async function request(path, { method = 'GET', body } = {}) {
  if (!authClient) throw new AccountApiError('La autenticación no está configurada para esta aplicación.', 503);
  let token;
  try {
    token = await getSessionJwt(authClient);
  } catch (error) {
    throw new AccountApiError(error.message || 'No se pudo verificar la sesión.', 401);
  }
  if (!token) throw new AccountApiError('No se pudo obtener el token seguro de la sesión. Cerrá sesión y volvé a ingresar.', 401);

  let response;
  try {
    response = await fetch(path, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new AccountApiError('No se pudo conectar con el servidor de cuentas.', 0);
  }

  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new AccountApiError(result.error ?? `El servidor respondió ${response.status}.`, response.status);
  return result;
}

export const accountApi = {
  get: () => request('/api/account'),
  create: (profile) => request('/api/account', { method: 'POST', body: profile }),
  updateProfile: (profile) => request('/api/account', { method: 'PATCH', body: profile }),
  listFields: () => request('/api/fields'),
  createField: (field) => request('/api/fields', { method: 'POST', body: field }),
  updateField: (id, field) => request(`/api/fields?id=${encodeURIComponent(id)}`, { method: 'PUT', body: field }),
  deleteField: (id) => request(`/api/fields?id=${encodeURIComponent(id)}`, { method: 'DELETE' }),
  getOffering: () => request('/api/offering'),
  saveOffering: (offering) => request('/api/offering', { method: 'PUT', body: offering }),
  listServiceOfferings: (serviceType = '') => request(`/api/service-offerings${serviceType ? `?serviceType=${encodeURIComponent(serviceType)}` : ''}`),
  listServiceRequests: () => request('/api/service-requests'),
  createServiceRequest: (serviceRequest) => request('/api/service-requests', { method: 'POST', body: serviceRequest }),
  submitServiceQuote: (id, quote) => request(`/api/service-requests?id=${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: { action: 'quote', ...quote },
  }),
  declineServiceRequest: (id) => request(`/api/service-requests?id=${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: { action: 'decline' },
  }),
  respondToServiceQuote: (id, action) => request(`/api/service-requests?id=${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: { action },
  }),
};
