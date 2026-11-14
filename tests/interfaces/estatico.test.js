// Servidor de archivos del front: sirve index.html y no deja salir de la carpeta.
import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { crearServidorEstatico } from '../../src/interfaces/http/estatico.js';

test('sirve index.html y archivos, y rechaza rutas fuera de la carpeta', async () => {
  const raiz = mkdtempSync(join(tmpdir(), 'agroflow-web-'));
  mkdirSync(join(raiz, 'js'));
  writeFileSync(join(raiz, 'index.html'), '<h1>AgroFlow</h1>');
  writeFileSync(join(raiz, 'js', 'app.js'), 'console.log(1)');
  const servir = crearServidorEstatico(raiz);
  const servidor = http.createServer(async (req, res) => {
    if (!(await servir(new URL(req.url, 'http://x').pathname, res))) { res.writeHead(404); res.end(); }
  });
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  try {
    const raizResp = await fetch(`${base}/`);
    assert.equal(raizResp.status, 200);
    assert.match(raizResp.headers.get('content-type'), /text\/html/);
    assert.equal(await raizResp.text(), '<h1>AgroFlow</h1>');
    const js = await fetch(`${base}/js/app.js`);
    assert.match(js.headers.get('content-type'), /javascript/);
    assert.equal((await fetch(`${base}/..%2F..%2Fpackage.json`)).status, 404);
    assert.equal((await fetch(`${base}/no.css`)).status, 404);
  } finally {
    await new Promise((ok) => servidor.close(ok));
  }
});
