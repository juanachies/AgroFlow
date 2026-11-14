// Sirve el front (src/interfaces/web) si existe. Protege contra rutas fuera de la carpeta.
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};

export function crearServidorEstatico(raiz) {
  const base = resolve(raiz);
  return async function servir(pathname, res) {
    let ruta;
    try {
      ruta = normalize(join(base, decodeURIComponent(pathname)));
    } catch {
      return false;
    }
    if (ruta !== base && !ruta.startsWith(base + sep)) return false;
    try {
      let info = await stat(ruta);
      if (info.isDirectory()) {
        ruta = join(ruta, 'index.html');
        info = await stat(ruta);
      }
      if (!info.isFile()) return false;
      const contenido = await readFile(ruta);
      res.writeHead(200, { 'content-type': TIPOS[extname(ruta).toLowerCase()] ?? 'application/octet-stream', 'content-length': contenido.length });
      res.end(contenido);
      return true;
    } catch {
      return false;
    }
  };
}
