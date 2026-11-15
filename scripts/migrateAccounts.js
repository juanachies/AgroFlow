import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

const connectionString = process.env.DATABASE_URL_UNPOOLED;
if (!connectionString) {
  throw new Error('Falta DATABASE_URL_UNPOOLED. Ejecutá el script con Neon env disponible.');
}

const migrationPath = fileURLToPath(new URL('../db/migrations/0001_accounts.sql', import.meta.url));
const migration = await readFile(migrationPath, 'utf8');
const client = new Client({ connectionString });

try {
  await client.connect();
  await client.query('BEGIN');
  await client.query(migration);
  await client.query('COMMIT');
  console.log('Migración de perfiles, campos y servicios aplicada.');
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  throw error;
} finally {
  await client.end();
}
