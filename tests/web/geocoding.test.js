import assert from 'node:assert/strict';
import test from 'node:test';
import { searchArgentineCities } from '../../src/interfaces/web/lib/geocoding.js';

test('busca localidades argentinas y descarta resultados sin coordenadas o de otro país', async () => {
  let requestedUrl;
  const places = await searchArgentineCities(' localidad de prueba ', async (url) => {
    requestedUrl = new URL(url);
    return {
      ok: true,
      async json() {
        return {
          features: [
            {
              properties: { country: 'Argentina', city: 'Pergamino', state: 'Buenos Aires', name: 'Pergamino' },
              geometry: { coordinates: [-60.566, -33.89] },
            },
            {
              properties: { country: 'Uruguay', city: 'Montevideo', name: 'Montevideo' },
              geometry: { coordinates: [-56.16, -34.9] },
            },
            {
              properties: { country: 'Argentina', city: 'Sin punto', name: 'Sin punto' },
              geometry: { coordinates: [] },
            },
          ],
        };
      },
    };
  });

  assert.equal(requestedUrl.searchParams.get('q'), 'localidad de prueba, Argentina');
  assert.equal(requestedUrl.searchParams.get('lang'), 'es');
  assert.deepEqual(places, [{
    city: 'Pergamino',
    label: 'Pergamino · Buenos Aires, Argentina',
    longitude: -60.566,
    latitude: -33.89,
  }]);
});

test('rechaza búsquedas demasiado cortas sin llamar al geocodificador', async () => {
  let called = false;
  await assert.rejects(
    searchArgentineCities('a', async () => { called = true; }),
    /Ingresá una ciudad/,
  );
  assert.equal(called, false);
});
