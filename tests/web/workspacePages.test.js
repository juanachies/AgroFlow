import assert from 'node:assert/strict';
import test from 'node:test';
import { getHomePageForRole, getWorkspacePages } from '../../src/interfaces/web/lib/workspacePages.js';

test('el productor recibe funcionalidades de campo y acceso separado al Marketplace', () => {
  const producerPages = getWorkspacePages('productor');
  const pages = producerPages.map(({ id }) => id);

  assert.deepEqual(pages, ['summary', 'centro', 'lots', 'planning', 'technical', 'silobolsas', 'despacho', 'marketplace', 'account']);
  assert.equal(producerPages.find(({ id }) => id === 'marketplace').group, 'marketplace');
  assert.equal(getHomePageForRole('productor'), 'summary');
});

test('el prestador solo recibe su espacio de servicios, Marketplace y cuenta', () => {
  const providerPages = getWorkspacePages('prestador');
  const pages = providerPages.map(({ id }) => id);

  assert.deepEqual(pages, ['services', 'marketplace', 'account']);
  assert.equal(providerPages.find(({ id }) => id === 'marketplace').group, 'marketplace');
  assert.equal(getHomePageForRole('prestador'), 'services');
});

test('un rol desconocido no recibe páginas de trabajo', () => {
  assert.deepEqual(getWorkspacePages('otro'), []);
  assert.equal(getHomePageForRole('otro'), null);
});
