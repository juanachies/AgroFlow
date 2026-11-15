import assert from 'node:assert/strict';
import test from 'node:test';
import { getSessionJwt } from '../../src/interfaces/web/lib/authSession.js';

test('obtiene el JWT de la sesión autenticada de Neon Auth', async () => {
  let fetchOptions;
  const token = await getSessionJwt({
    getSession: async (options) => {
      fetchOptions = options;
      return {
        data: { session: { token: 'signed-session-token' }, user: { id: 'user-id' } },
        error: null,
      };
    },
  });

  assert.equal(token, 'signed-session-token');
  assert.deepEqual(fetchOptions, {
    fetchOptions: { headers: { 'X-Force-Fetch': 'true' } },
  });
});

test('no inventa un JWT cuando no hay sesión o la consulta falla', async () => {
  const noSession = { getSession: async () => ({ data: { session: null }, error: null }) };
  assert.equal(await getSessionJwt(noSession), null);

  const failedSession = { getSession: async () => ({ data: null, error: new Error('falló Auth') }) };
  await assert.rejects(getSessionJwt(failedSession), /falló Auth/);
});
