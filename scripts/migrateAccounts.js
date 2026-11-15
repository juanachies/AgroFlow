import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

const connectionString = process.env.DATABASE_URL_UNPOOLED;
if (!connectionString) {
  throw new Error('Falta DATABASE_URL_UNPOOLED. Ejecutá el script con Neon env disponible.');
}

const migrationsDirectory = fileURLToPath(new URL('../db/migrations/', import.meta.url));
const migrations = (await readdir(migrationsDirectory))
  .filter((name) => /^\d+_.+\.sql$/.test(name))
  .sort();
if (!migrations.length) throw new Error('No hay migraciones SQL para aplicar.');

const client = new Client({ connectionString });

try {
  await client.connect();
  await client.query('BEGIN');
  for (const migrationName of migrations) {
    const migration = await readFile(new URL(`../db/migrations/${migrationName}`, import.meta.url), 'utf8');
    await client.query(migration);
  }
  await client.query('COMMIT');
  console.log(`Migraciones aplicadas: ${migrations.join(', ')}.`);
} catch (error) {
  try {
    await client.query('ROLLBACK');
  } catch (rollbackError) {
    console.error('No se pudo revertir la transacción de migración.', rollbackError);
  }
  throw error;
} finally {
  await client.end();
}
