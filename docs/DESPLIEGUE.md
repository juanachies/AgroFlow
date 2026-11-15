# Despliegue: URL pública

La API y el front corren en un solo proceso de Node (`npm start`). Si existe `dist/`, el front compilado con `npm run build`, se sirve en la misma URL que la API.

## Opción A: servidor del evento (pm2)

Requisitos: Node 22.23.5 (fijada en `package.json`, `.nvmrc` y el `Dockerfile`).

1. Clonar el repo e instalar dependencias:
   ```bash
   git clone https://github.com/juanachies/marcianos.git
   ```
   ```bash
   cd marcianos
   ```
   ```bash
   npm install
   ```
2. Compilar el front, si ya está en el repo:
   ```bash
   npm run build --if-present
   ```
3. Poner las keys en `~/.env` del servidor, **nunca en el proyecto**:
   ```
   OPENAI_API_KEY=...
   ```
4. Levantar el proceso con pm2 para que se reinicie solo:
   ```bash
   npm install -g pm2
   ```
   ```bash
   PORT=3000 pm2 start src/interfaces/http/server.js --name agroflow
   ```
   ```bash
   pm2 save
   ```
5. Comprobar que responde:
   ```bash
   curl http://localhost:3000/api/salud
   ```
6. Exponerlo con nginx en el puerto 80. Configuración mínima:
   ```nginx
   server {
     listen 80;
     location / {
       proxy_pass http://127.0.0.1:3000;
       proxy_set_header Host $host;
     }
   }
   ```

**Versión de Node:** la regla del evento pide fijar la versión del servidor en `package.json`. Está fijada en 22.23.5. Correr `node -v` en el servidor: si da otra versión, instalar la 22.23.5 o cambiarla en `engines.node`, `.nvmrc` y el `Dockerfile` para que coincidan.

## Opción B: Docker (Render, Railway, Fly.io o cualquier servidor con Docker)

```bash
docker build -t agroflow .
```

```bash
docker run -p 3000:3000 -e OPENAI_API_KEY=... agroflow
```

En Render o Railway alcanza con conectar el repo, elegir "Dockerfile" y cargar las variables de entorno en el panel del servicio.

## Variables de entorno

| Variable | Por defecto | Qué hace |
| --- | --- | --- |
| `PORT` / `HOST` | `3000` / `0.0.0.0` | Dónde escucha |
| `CORS_ORIGIN` | `*` | Origen permitido si el front se despliega aparte |
| `OPENAI_API_KEY` | — | IA para explicar el plan. Sin key, la explicación sale de la plantilla |
| `OPENAI_MODEL` | `gpt-4o-mini` | Modelo de OpenAI |
| `AGROFLOW_FUENTES_EXTERNAS` | activado | Pronóstico (Open-Meteo) y distancias por ruta (OSRM) en el simulador. `0` lo apaga |
| `AGROFLOW_MERCADO_DEMO` | activado | Reservas simuladas del resto del mercado (pico en Gran Rosario a mediados de abril de 2027). `0` lo apaga |
| `AGROFLOW_PRECIOS` | `data/precios-ejemplo.json` | Precios del día: pizarra y futuros |
| `AGROFLOW_LINEUP` | barcos simulados | Line-up real: texto del PDF de NABSA (`.txt`) o CSV manual (`.csv`) |
| `AGROFLOW_MAGYP` | — | Tabla oficial "Barcos anunciados" de MAGyP (TSV/CSV): toneladas programadas |
| `AGROFLOW_MERCADO` | — | JSON con `{ programadas?, camiones? }` del día (BCR / MAGyP) |

## Datos reales para la demo

1. **Precios:** copiar `data/precios-ejemplo.json`, cargar la pizarra de la Cámara Arbitral de Rosario y los futuros de A3 del día, y apuntar `AGROFLOW_PRECIOS` al archivo nuevo.
2. **Barcos:** bajar la tabla "Barcos anunciados" de MAGyP (o copiarla de la web, separada por tabulador) y apuntar `AGROFLOW_MAGYP`.
3. **Camiones:** armar el JSON de mercado con los camiones del día (formato de `data/mercado-ejemplo-2026-11.json`) y apuntar `AGROFLOW_MERCADO`.

## Límites

- **Estado en memoria:** simulaciones, ofertas, reservas y silobolsas viven en memoria y se pierden al reiniciar.
- **Pronóstico:** Open-Meteo cubre unos 16 días hacia adelante. Si la ventana de cosecha está más lejos, el simulador no descuenta lluvia y lo informa en `clima`.
