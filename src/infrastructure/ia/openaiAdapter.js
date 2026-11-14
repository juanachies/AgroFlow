// Explicador con OpenAI (Chat Completions). La key es compartida en el evento: reintentos con
// espera exponencial ante 429 y 5xx (respetando Retry-After), timeout por pedido y un tope de
// tokens. Si todo falla, el caso de uso cae a la plantilla.
//
// Configuración: OPENAI_API_KEY (en ~/.env, nunca en el proyecto), OPENAI_MODEL (opcional).

const SISTEMA = [
  'Sos un asesor de logística de cosecha que le habla a un productor agropecuario argentino.',
  'Explicá la recomendación en lenguaje simple, en español rioplatense, en 120 palabras como máximo.',
  'Usá SOLO los números del JSON que recibís; no inventes datos, precios ni fechas.',
  'Explicá el porqué (el trade-off) y qué tiene que hacer y cuándo. Si hay avisos críticos, empezá por ellos.',
  'Si te hacen una pregunta, respondela con esos datos; si no alcanzan, decilo.',
].join(' ');

const espera = (ms) => new Promise((ok) => setTimeout(ok, ms));

export function crearOpenAIAdapter({
  apiKey,
  modelo = 'gpt-4o-mini',
  baseUrl = 'https://api.openai.com/v1',
  reintentos = 3,
  timeoutMs = 20000,
  maxTokens = 400,
  fetchImpl = globalThis.fetch,
  esperar = espera,
} = {}) {
  if (!apiKey) throw new RangeError('falta OPENAI_API_KEY');

  async function pedir(mensajes) {
    let ultimoError;
    for (let intento = 0; intento <= reintentos; intento++) {
      const control = new AbortController();
      const reloj = setTimeout(() => control.abort(), timeoutMs);
      try {
        const res = await fetchImpl(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ model: modelo, messages: mensajes, temperature: 0.3, max_tokens: maxTokens }),
          signal: control.signal,
        });
        if (res.ok) {
          const datos = await res.json();
          const texto = datos.choices?.[0]?.message?.content?.trim();
          if (!texto) throw new Error('OpenAI respondió sin texto');
          return { texto, modelo: datos.model ?? modelo };
        }
        ultimoError = new Error(`OpenAI respondió ${res.status}`);
        if (res.status !== 429 && res.status < 500) throw ultimoError; // error del pedido: no reintentar
        const retryAfter = Number(res.headers.get?.('retry-after'));
        await esperar(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 500 * 2 ** intento + Math.random() * 250);
      } catch (error) {
        ultimoError = error;
        if (error.message?.startsWith('OpenAI respondió 4') && !error.message.includes('429')) throw error;
        if (intento < reintentos) await esperar(500 * 2 ** intento);
      } finally {
        clearTimeout(reloj);
      }
    }
    throw ultimoError ?? new Error('OpenAI no respondió');
  }

  return {
    origen: `openai (${modelo})`,
    async explicar({ resumen, pregunta, comparacion, escenario }) {
      const datos = comparacion ? { escenario, comparacion } : { simulacion: resumen };
      const consigna = pregunta
        ?? (comparacion ? 'Explicá qué cambia en este escenario respecto del plan original y qué conviene hacer.' : 'Explicá esta recomendación.');
      const { texto, modelo: usado } = await pedir([
        { role: 'system', content: SISTEMA },
        { role: 'user', content: `${consigna}\n\nDatos (JSON):\n${JSON.stringify(datos)}` },
      ]);
      return { texto, fuente: 'openai', modelo: usado };
    },
  };
}
