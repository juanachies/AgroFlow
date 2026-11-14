# API HTTP de AgroFlow

API para el front. Usa el módulo `http` de Node, sin dependencias, en `src/interfaces/http/`. Solo llama casos de uso del contenedor.

```bash
npm start
```

| Variable | Por defecto | Qué hace |
| --- | --- | --- |
| `PORT` | `3000` | Puerto |
| `HOST` | `0.0.0.0` | Interfaz |
| `CORS_ORIGIN` | `*` | Origen permitido para el front (por ejemplo `https://agroflow.vercel.app`) |
| `AGROFLOW_MERCADO_DEMO` | activado | Carga reservas simuladas del resto del mercado, con pico en Gran Rosario a mediados de abril de 2027. `0` lo desactiva |

**Front en la misma URL:** si existe `dist/` (el front de `src/interfaces/web` compilado con `npm run build`), el servidor sirve el front y la API desde la misma dirección, sin configurar CORS. Si el front se despliega aparte, apuntarlo a la URL de la API y configurar `CORS_ORIGIN`.

**Estado en memoria:** las simulaciones, ofertas y reservas viven en memoria y se pierden al reiniciar el servidor.

## Endpoints

| Método y ruta | Para qué |
| --- | --- |
| `GET /api/salud` | Estado del servicio |
| `GET /api/ejemplo` | Entrada de ejemplo para `POST /api/simular` (sirve para precargar el formulario) |
| `POST /api/simular` | Plan + saturación del puerto + asignación del marketplace |
| `POST /api/reservas` | Confirma una simulación |
| `GET /api/reservas?desde&hasta&puerto` | Reservas confirmadas |
| `GET /api/ofertas?desde&hasta&recurso` | Proveedores del marketplace |
| `POST /api/ofertas` | Alta de un proveedor |
| `GET /api/saturacion?puerto&cultivo&hoy[&camionesPublicadosDia]` | Pronóstico de saturación por día (60 días) |
| `POST /api/explicar` | Explicación del plan en lenguaje de productor (IA o plantilla) |
| `POST /api/escenario` | "¿Y si…?": vuelve a simular con un cambio y explica la diferencia |
| `GET /api/escenarios` | Tipos de escenario disponibles |
| `POST /api/venta-cosecha` | Venta durante la cosecha según barcos e índices del puerto |
| `GET /api/silobolsas` / `POST /api/silobolsas` | Silobolsas registrados / registrar uno |
| `POST /api/silobolsas/:id/lecturas` | Cargar lecturas del IoT |
| `GET /api/silobolsas/:id/riesgo` | Riesgo de la bolsa según las lecturas |
| `POST /api/silobolsas/:id/venta` | Barco y fletes, plan B urgente o acopio |

Las fechas van siempre en formato `AAAA-MM-DD`.

### `POST /api/simular`

Entrada (`GET /api/ejemplo` devuelve una completa):

```json
{
  "lote": { "id": "lote-pergamino", "lat": -33.95, "lon": -60.6 },
  "hoy": "2027-03-20",
  "ha": 1200, "qqHa": 38, "cultivo": "soja",
  "diasDisponibles": 12, "urgencia": "media",
  "fechaInicioCosecha": "2027-04-10",
  "servicios": ["transporte", "almacenaje"],
  "destinos": [
    { "nombre": "Silobolsa en el campo", "tipo": "silobolsa", "precioUsdPorT": 300 },
    { "nombre": "Cooperativa local", "tipo": "acopio", "distanciaKm": 35, "costoAdicionalUsdPorT": 6, "precioUsdPorT": 303 },
    { "nombre": "Puerto Gran Rosario", "tipo": "puerto", "terminal": "Puerto Gran Rosario", "distanciaKm": 230, "precioUsdPorT": 335 }
  ]
}
```

- `cultivo`: `soja`, `maiz` o `trigo`.
- `urgencia`: `baja`, `media` o `alta`.
- `servicios`: `transporte` (para puerto o acopio) y `almacenaje` (para silobolsa). `cosecha` va siempre.
- En lugar de `fechaInicioCosecha` se puede mandar `fechaSiembra`: el sistema usa la fecha óptima de la ventana de cosecha.
- `distanciaKm` es opcional si el destino trae `lat` y `lon` (o si es un puerto con `terminal`). El servidor la calcula por ruta (OSRM) y, si OSRM falla, usa línea recta × 1,3. `distancias` en la respuesta dice de dónde salió cada una.
- Con el lote ubicado (`lote.lat`, `lote.lon`) y la ventana dentro de los próximos ~16 días, el servidor descuenta los días de lluvia del pronóstico de Open-Meteo (5 mm o más) de `diasDisponibles`. Se puede apagar con `usarClima: false`. `clima` en la respuesta lo detalla.
- Opcionales:
  - `margenDiasDespacho`: cuántos días puede correrse el despacho (10 por defecto).
  - `camionesPublicadosDia`: dato de camiones del día, si se tiene.
  - `nivelParanaM`: altura del Paraná en Rosario, en metros.

Respuesta (resumida):

```json
{
  "simulacionId": "b4030e71-…",
  "lote": { "id": "lote-pergamino", "lat": -33.95, "lon": -60.6 },
  "plan": {
    "toneladas": 4560,
    "recomendado": {
      "destino": "Puerto Gran Rosario", "tipo": "puerto", "criterio": "mayor margen neto",
      "margen_usd": 1360405,
      "pedidos": [
        { "recurso": "cosechadora", "tipo": "cosechadora-grande", "cantidad": 3, "pedir_antes_del": "2027-03-26", "usar_desde": "2027-04-10", "usar_hasta": "2027-04-17", "costo_usd": 142000 },
        { "recurso": "camión", "tipo": "camion-bitren", "cantidad": 15, "usar_desde": "2027-04-20", "usar_hasta": "2027-04-27", "viajes_por_dia": 2 }
      ]
    },
    "alternativas": [{ "destino": "Cooperativa local", "tipo": "acopio", "costo_usd": 0, "margen_usd": 1193750 }]
  },
  "puerto": "gran-rosario",
  "saturacion": {
    "dias": [{ "fecha": "2027-04-14", "estado": "saturado", "camionesEsperados": 7200, "saturacion": 1.03, "esperaDias": 0, "fuenteCamiones": "reservas del marketplace" }],
    "diasSaturados": ["2027-04-12", "2027-04-13", "2027-04-14", "2027-04-15", "2027-04-16"]
  },
  "ventana": { "inicio": "2027-04-20", "fin": "2027-04-27", "desplazamientoDias": 10, "diasSaturados": 0, "diasSaturadosOriginal": 5 },
  "asignacion": {
    "coberturaPct": 100, "completa": true, "costoUsd": 154561, "faltantes": [],
    "lineas": [{ "linea": { "recurso": "camión", "cantidad": 15 }, "asignaciones": [{ "proveedor": "Transporte Rojas 2", "unidades": 9, "distanciaKm": 30.3, "precioRelativo": 0.93, "costoUsd": 9133 }], "faltan": 0 }]
  },
  "avisos": [{ "modulo": "plan", "tipo": "ventana-despacho", "nivel": "alerta", "mensaje": "El puerto se satura 5 de los días previstos para despachar. Despachá entre el 2027-04-20 y el 2027-04-27…" }]
}
```

**Qué mostrar en la vista:**

| Bloque | Campo de la respuesta | Cómo |
| --- | --- | --- |
| Destino | `plan.recomendado` y `plan.alternativas` | Tarjeta del recomendado y tabla de margen de las tres opciones |
| Saturación | `saturacion.dias` | Calendario o barras por día, coloreado por `estado` (`fluido`, `cargado`, `saturado`) |
| Ventana de despacho | `ventana` | Marcarla sobre el calendario |
| Pedido | `plan.recomendado.pedidos` | Tabla con el anticipo para pedir cada recurso |
| Marketplace | `asignacion.lineas[].asignaciones` | Proveedor, unidades, distancia y costo; `asignacion.faltantes` en rojo |
| Avisos | `avisos` | Ordenados por gravedad: `critico`, `alerta`, `info` |
| Confirmar | — | Botón que llama a `POST /api/reservas` con el `simulacionId` |

### `POST /api/reservas`

```json
{ "simulacionId": "b4030e71-…", "loteId": "lote-pergamino" }
```

Devuelve `201 { "reservas": [...] }`.

- **Consumo:** la simulación se usa una sola vez. Si vence (se guardan las últimas 500) o ya se confirmó, devuelve `404` y hay que volver a simular.
- **Efecto:** las reservas de camiones a puerto pasan a contar en `GET /api/saturacion` y en las simulaciones siguientes.

### `POST /api/ofertas`

```json
{
  "proveedor": "Transportes del Sur", "recurso": "camión", "tipo": "camion-bitren", "unidades": 5,
  "base": { "lat": -33.9, "lon": -60.6, "localidad": "Pergamino" }, "radioKm": 120,
  "disponibleDesde": "2027-03-01", "disponibleHasta": "2027-06-30", "precioRelativo": 0.9
}
```

- `recurso`: `cosechadora`, `tractor con tolva`, `camión` o `embolsadora`.
- `tipo`: los ids de `data/tarifas.json`.
- Respuesta: `201 { "oferta": { "id": "of-051", … } }`.

### `GET /api/saturacion`

Por ejemplo: `/api/saturacion?puerto=gran-rosario&cultivo=soja&hoy=2027-03-20`.

- `puerto` acepta la clave (`gran-rosario`, `bahia-blanca`, `quequen`) o un nombre (`Puerto Gran Rosario`, `San Lorenzo`).
- Devuelve los 60 días con estado, el calado y los avisos de barcos.

### `POST /api/explicar`

```json
{ "simulacionId": "b4030e71-…", "pregunta": "¿Por qué no al acopio?" }
```

`pregunta` es opcional. La respuesta trae `texto`, `fuente` y `resumen`, más `modelo` cuando la fuente es OpenAI:

- `fuente: "openai"`: hay `OPENAI_API_KEY` en el servidor.
- `fuente: "plantilla"`: no hay key, o la IA falló. En ese caso viene también `aviso`.

La IA solo recibe el `resumen`, que tiene los números del motor, así que no puede inventar cálculos.

### `POST /api/escenario`

```json
{ "simulacionId": "b4030e71-…", "escenario": { "tipo": "lluvia", "valor": 5 }, "pregunta": "¿Qué hago?" }
```

| `tipo` | `valor` | Qué cambia |
| --- | --- | --- |
| `lluvia` | días | Resta días hábiles de cosecha |
| `demora` | días (puede ser negativo) | Corre el inicio de la cosecha |
| `precioPuerto` | US$/t (puede ser negativo) | Precio de los destinos puerto |
| `flete` | % | Encarece o abarata el flete de los destinos con distancia |
| `saturacion` | % | Más camiones llegando al puerto |

Devuelve:
- `escenario` (con `descripcion`);
- `resultado`: la simulación completa;
- `explicacion`: incluye `comparacion.cambios`, la lista de lo que cambió;
- un `simulacionId` nuevo: el escenario también se puede confirmar con `POST /api/reservas`.

### Silobolsas

1. `POST /api/silobolsas` con `{ "id": "SB-01", "cultivo": "soja", "kg": 200000, "fechaCreacion": "2026-04-20" }`. El `id` es opcional; si falta, se genera.
2. `POST /api/silobolsas/SB-01/lecturas` con `{ "lecturas": [{ "timestamp": "2026-11-14T00:00:00Z", "humedad": 14.2, "temperatura": 24, "co2": 3 }] }`. El gateway del IoT puede llamar a este endpoint directamente.
3. `GET /api/silobolsas/SB-01/riesgo` devuelve el nivel de riesgo y los días hasta el nivel medio y el crítico.
4. `POST /api/silobolsas/SB-01/venta` con `{ "hoy": "2026-11-14", "destino": { "terminal": "Puerto Gran Rosario", "distanciaKm": 300, "acopios": [{ "nombre": "Coop", "distanciaKm": 25 }] }, "tasaAnual": 0.08 }`. Devuelve la decisión:
   - `embarcar`, con barco, fecha de carga, camiones y extractora;
   - venta urgente o en acopio;
   - `sin_barco_factible`.

### `POST /api/venta-cosecha`

```json
{ "puerto": "gran-rosario", "cultivo": "soja", "hoy": "2027-03-20", "fechaGranoListo": "2027-04-10",
  "toneladas": 1200, "distanciaPuertoKm": 230, "distanciaAcopioKm": 35 }
```

Devuelve:
- `venta.decision`: `vender` o `silobolsa`, con canal;
- `venta.indicesPuerto`;
- `venta.hastaDondeRinde`;
- `cadetes`: qué pedir;
- `avisos`.

## Errores

Todos los errores devuelven `{ "error": "mensaje" }`.

| Estado | Cuándo |
| --- | --- |
| 400 | Datos faltantes o inválidos. El mensaje lista qué falta, por ejemplo `faltan datos: ha, qqHa` |
| 404 | Ruta, simulación o silobolsa inexistente, o silobolsa sin lecturas |
| 405 | Método no permitido en una ruta que existe |
| 413 | Cuerpo de más de 1 MB |
| 415 | El cuerpo no es `application/json` |
| 501 | Función no configurada en el servidor (altas del marketplace, silobolsas) |
| 500 | Error interno |
