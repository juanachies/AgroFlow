export class HttpRequestError extends Error {
  constructor(message, { url, status, cause } = {}) {
    super(message, { cause });
    this.name = 'HttpRequestError';
    this.url = url;
    this.status = status;
  }
}

export async function fetchWithRetry(url, options = {}, {
  fetchImpl = globalThis.fetch,
  retries = 2,
  timeoutMs = 15_000,
  retryDelayMs = 300,
} = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new TypeError('Este runtime no implementa fetch');
  }

  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchImpl(url, {
        ...options,
        signal: options.signal ?? controller.signal,
      });

      if (response.ok) {
        return response;
      }

      const retryable = response.status === 429 || response.status >= 500;
      const error = new HttpRequestError(
        `Solicitud HTTP fallida (${response.status})`,
        { url: String(url), status: response.status },
      );
      if (!retryable || attempt === retries) {
        throw error;
      }
      lastError = error;
    } catch (error) {
      if (error instanceof HttpRequestError) {
        const retryable = error.status === 429 || error.status >= 500;
        if (!retryable || attempt === retries) {
          throw error;
        }
        lastError = error;
      } else {
        lastError = error;
        if (attempt === retries) {
          throw new HttpRequestError('No se pudo completar la solicitud HTTP', {
            url: String(url),
            cause: error,
          });
        }
      }
    } finally {
      clearTimeout(timeout);
    }

    await new Promise((resolve) => setTimeout(resolve, retryDelayMs * (attempt + 1)));
  }

  throw new HttpRequestError('No se pudo completar la solicitud HTTP', {
    url: String(url),
    cause: lastError,
  });
}

export async function fetchJson(url, options, retryOptions) {
  const response = await fetchWithRetry(url, options, retryOptions);
  try {
    return await response.json();
  } catch (cause) {
    throw new HttpRequestError('La API respondió con JSON inválido', {
      url: String(url),
      status: response.status,
      cause,
    });
  }
}

export function validarCoordenadas(latitude, longitude) {
  if (!Number.isFinite(Number(latitude)) || Number(latitude) < -90 || Number(latitude) > 90) {
    throw new TypeError('latitude debe ser un número entre -90 y 90');
  }
  if (!Number.isFinite(Number(longitude)) || Number(longitude) < -180 || Number(longitude) > 180) {
    throw new TypeError('longitude debe ser un número entre -180 y 180');
  }
}

export function fechaUtcCompacta(fecha) {
  const date = new Date(fecha);
  if (Number.isNaN(date.getTime())) {
    throw new TypeError(`Fecha inválida: ${String(fecha)}`);
  }
  return date.toISOString().slice(0, 10).replaceAll('-', '');
}

export function crearObservacion({
  variable,
  value,
  unit,
  source,
  observedAt,
  queriedAt = new Date().toISOString(),
  coordinates,
  spatialResolutionKm = null,
  quality = 'valid',
  type = 'observed',
  uncertainty = null,
}) {
  return {
    variable,
    value,
    unit,
    source,
    observedAt,
    queriedAt,
    coordinates,
    spatialResolutionKm,
    quality,
    type,
    uncertainty,
  };
}
