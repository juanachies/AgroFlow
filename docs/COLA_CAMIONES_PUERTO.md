# Cola de camiones en puerto: fuentes y tarea de ingesta

Documento para la próxima IA que tome el frente. Verificado el 15-nov-2026. No hay fuente pública con lista nominal de camiones ni con demora por camión: solo conteos diarios agregados. La demora la tiene que estimar el producto.

## Objetivo

Publicar una vista pública de la cola de camiones hacia el puerto: cuántos camiones hay en playa, cuántos se esperan y demora estimada hasta descargar. Hoy `GET /api/saturacion` pronostica saturación con reservas propias, pero no ingesta el conteo real del puerto.

## Estado actual del código

| Pieza | Archivo | Estado |
| --- | --- | --- |
| Pronóstico de saturación | `src/domain/saturacion/saturacionPuerto.js` | Funciona con reservas + `camionesPublicadosDia` |
| Caso de uso | `src/application/usecases/consultarSaturacion.js` | Horizonte 60 días, barcos + marketplace |
| Endpoint | `GET /api/saturacion?puerto&cultivo&hoy[&camionesPublicadosDia]` | Público, sin auth |
| Marketplace | `src/infrastructure/marketplace/` | En memoria, ofertas ficticias, 5% de participación |
| Página pública | — | No existe |

`PARAMS_SATURACION.camionesDiaPico` = 7.000 y `participacionMercado` = 0,05 son supuestos, no mediciones.

## Fuentes abiertas

### 1. Agroentregas — por terminal (prioridad alta)

- Página: `https://agroentregas.com.ar/total-de-camiones.html`
- Endpoint que consume la página, público y sin auth:

```
GET https://agroentregas.com.ar/RestServiceImpl.svc/camiones
```

- Respuesta XML SOAP con un JSON embebido en `<CamionesResult>`:

```json
{"Camiones":[{"fecha":"...","idDp":"...","nombreDp":"ACA - SAN LORENZO","idDe":"...","nombreDe":"A.C.A. C.L","GIRASOL":0,"SOJA":573,"TRIGO":719,"MAIZ":205,"SORGO":0,"CEBADA":7,"OTROS":18,"OBSERVACION":"SIN ACTIVIDAD"}]}
```

Claves: `Camiones` y `Camiones1` (día actual), `Camiones2` (totales del día), `Camiones3`–`Camiones8` (mismo día de 2025 y 2024 con sus totales). 28 terminales.

Campos por fila: `fecha`, `idDp`, `nombreDp` (planta), `idDe`, `nombreDe` (empresa), `GIRASOL`, `SOJA`, `TRIGO`, `MAIZ`, `SORGO`, `CEBADA`, `OTROS`, `OBSERVACION`.

Terminales relevadas: ACA San Lorenzo, ACA Timbúes, Aceitera Chabás, ADM Arroyo Seco, ADM Pto Gral San Martín, AGD Timbúes, Arcor San Pedro, Baradero, Bunge PGSM, Bunge Ramallo, Bunge San Jerónimo, Cargill Alvear, Cargill Quebracho, COFCO Lima, COFCO PGSM, COFCO Timbúes, Dreyfus Gral Lagos, Dreyfus Timbúes, Vicentín, Molino Cañuelas Las Palmas, Molino Chabás, Molinos Agro San Lorenzo, Renova, Semino, Serv. Port. Villa Constitución, Terminal 6, Terminal Puerto San Pedro, U6.

Cautelas:

- `OBSERVACION: "SIN ACTIVIDAD"` no equivale a cero camiones; es un estado informado.
- El total de `Camiones2` no siempre coincide con la suma de las filas del día. Guardar ambos valores y no corregir uno con el otro.
- Es un endpoint interno de un sitio comercial: no está documentado ni garantizado. Cachear, una consulta por día, y fallar explícito si cambia el formato.

### 2. BCR — Posición de Camiones (agregado Up River)

- Página: `https://www.bcr.com.ar/es/mercados/mercado-de-granos/informacion-comercial/informacion-comercial`
- XLSX: `https://www.bcr.com.ar/sites/default/files/{YYYY-MM}/{YYYYMMDD}.xlsx`
- Mismo dato en tabla HTML; listado paginado con `?page=N`.
- Contenido: camiones en playas Up River por producto (soja, maíz, trigo, sorgo, girasol, cebada, otros), total, semana anterior, año anterior y acumulados. Corte 7:00. Fuente CECOA.
- Sin API. Verificar el XLSX con la fecha del día; si no existe, usar el último publicado y registrar la fecha.

### 3. MAGyP — Entrada diaria de camiones

- Entrada: `https://www.magyp.gob.ar/sitio/areas/ss_mercados_agropecuarios/logistica/` → "Posición de Camiones y Vagones"
- Tabla HTML por zona (Rosario y aledaños, Dársena Bs As-Entre Ríos, Necochea, Bahía Blanca) y producto, más vagones en playa. Elaborada por Williams Entregas.
- Histórico mensual 2018–2026 en la misma página. Sin API.

## Fuentes cerradas o pagas

| Fuente | Qué aporta | Acceso |
| --- | --- | --- |
| Williams Entregas | Planilla primaria de arribos | Comercial |
| Alphacast | Serie BCR 2014–hoy para Excel/Python | Pago |
| Muvin (BCR) | Cupos, turnos y tablero de puerto en tiempo real | Privado por empresa |
| Circular (CIRO / Receptores / Web de turnos) | Arribos y turnos por planta | Privado por terminal |
| STOP 5.0 / SSTA | Turno y banda horaria obligatoria, anillo de 30 km | `ssta.gob.ar/turnos/login`; consulta por CTG, sin tablero público |

No pedir credenciales de estos sistemas sin decisión del usuario. No scrapear detrás de login.

## Brecha que cubre el producto

Ninguna fuente publica demora estimada ni cola por camión. Las tres abiertas dan conteo diario con corte 7:00; no hay intra día gratis.

## Tareas para la próxima IA

1. Crear un adaptador por fuente en `src/infrastructure/` que devuelva un contrato común:

```js
{ fuente, fechaCorte, ambito, terminal, producto, camiones, estado, crudo }
```

2. Ingesta Agroentregas: parsear el XML, extraer el JSON, normalizar `nombreDp` a una lista de terminales propia y guardar el crudo junto al normalizado. Nunca inventar ceros.
3. Ingesta BCR: bajar el XLSX del día, leer producto y total, y guardar `fecha`, `corte: '07:00'` y fuente CECOA.
4. Ingesta MAGyP: parsear la tabla por zona y producto; usar solo las zonas que existan en el HTML del mes en curso.
5. Persistir las tres corridas en un almacenamiento simple (JSON diario o la tabla que ya use el proyecto). Una corrida por día, idempotente por fecha.
6. Alimentar `consultarSaturacion` con el total del puerto como `camionesPublicadosDia` cuando no haya reservas propias, y mantener separadas las dos señales.
7. Estimar la espera con una regla explícita y auditable: camiones en playa ÷ capacidad de descarga del puerto por hora, con la capacidad como parámetro editable. Documentar el supuesto.
8. Exponer `GET /api/cola-camiones?puerto&fecha` con los conteos, la fuente, la fecha de corte y la espera estimada.
9. Página pública: tarjetas por terminal (camiones en playa, estado, espera estimada), total Up River del día y sello de fuente y hora de corte. Sin patentes ni choferes.
10. Tests: fixture del XML de Agroentregas, XLSX de BCR y HTML de MAGyP; caso de fuente caída; caso de fecha sin publicación (domingo/feriado) sin rellenar con cero.

## Criterios de aceptación

- Cada número publicado muestra fuente y fecha de corte.
- Un día sin datos aparece como "sin dato", no como 0.
- La ingesta falla con mensaje útil si cambia el formato de una fuente.
- La espera estimada es reproducible desde parámetros guardados.
- Nada de datos detrás de login.

## Riesgos

- El endpoint de Agroentregas es interno y puede cambiar sin aviso. Aislarlo en un adaptador y cachear.
- BCR publica con corte 7:00: no sirve para una cola en vivo.
- Publicar un pronóstico propio como si fuera conteo real sería engañoso. Etiquetar "pronóstico" y "dato publicado" por separado.
- La participación de mercado del 5% es un supuesto de demo; no presentarla como real.

## Referencias

- `docs/MARKETPLACE.md` — reservas y saturación
- `docs/FUENTES.md` — criterios de calidad y trazabilidad de fuentes
- `docs/API.md` — contrato de la API
