import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

export class FileCache {
  constructor(basePath = './data/cache', { defaultTtlMs = 60 * 60 * 1000 } = {}) {
    this.basePath = path.resolve(basePath);
    this.defaultTtlMs = defaultTtlMs;
  }

  getKey(key) {
    const digest = createHash('sha256').update(String(key)).digest('hex');
    return path.join(this.basePath, `${digest}.json`);
  }

  async get(key) {
    try {
      const cached = JSON.parse(await readFile(this.getKey(key), 'utf8'));
      if (!Number.isFinite(cached.expiresAt) || cached.expiresAt <= Date.now()) {
        return null;
      }
      return cached.value;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  async set(key, value, ttlMs = this.defaultTtlMs) {
    await mkdir(this.basePath, { recursive: true });
    const target = this.getKey(key);
    const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
    const content = JSON.stringify({ expiresAt: Date.now() + ttlMs, value });
    try {
      await writeFile(temporary, content, { encoding: 'utf8', flag: 'wx' });
      await rename(temporary, target);
    } catch (error) {
      try {
        await unlink(temporary);
      } catch (cleanupError) {
        if (cleanupError.code !== 'ENOENT') {
          throw new AggregateError([error, cleanupError], 'Falló la escritura del caché y la limpieza del temporal');
        }
      }
      throw error;
    }
    return value;
  }
}

export default FileCache;
