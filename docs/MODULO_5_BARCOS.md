# Módulos Barcos, Venta y Cadetes: método y uso

Implementa **Barcos** (independiente) → **Venta** (vender o silobolsa, hasta dónde rinde) → **Cadetes** (ver [PLAN_BARCOS.md](PLAN_BARCOS.md)). Es código determinista y auditable, sin dependencias. La IA solo explica el resultado.

## Archivos

| Archivo | Qué hace |
|---|---|
| `src/barcos/prediccion.js` | Disponibilidad de barcos, índice de demanda, factor de precio, calado, espera, riesgo de perder barco, señal por día y avisos de barcos |
| `src/barcos/lineup.js` | Line-up manual en CSV y simulador reproducible |
| `src/barcos/datos.js` | Puertos, estacionalidad y parámetros de barcos |
| `src/barcos/index.js` | `analizarBarcos()`: punto de entrada del módulo |
| `src/venta/decision.js` | `decidirVenta()`: curva por fecha, vender o silobolsa, hasta dónde rinde y avisos |
| `src/venta/datos.js` | Supuestos de flete, acopio, silobolsa y precios |
| `src/cadetes/index.js` | `avisoCadetes()`: camiones o embolsadora según la decisión |
| `src/comun/` | Fechas, normal y logística de camiones |
| `src/planificar.js` | Encadena Barcos → Venta → Cadetes |

## Entradas

| Dato | De dónde viene |
|---|---|
| Line-up (buque, puerto, cultivo, t, ETA, estado) | CSV manual (`data/lineup-ejemplo.csv`) o simulación |
| Puerto, cultivo, toneladas | Lote y módulo 1 |
| Fecha en que el grano está listo y días de cosecha | Módulo 1 (ventana de cosecha) |
| Distancia al puerto y al acopio | Módulo 2 (OSRM) |
| Nivel del Paraná en Rosario (m) | Manual, opcional |
| Precios hoy y futuro, supuestos de acopio y silobolsa | Valores por defecto editables |
| Barco contratado por el comprador | Opcional |

## Método

**1. Barcos**
- Arribos por día = barcos del line-up + tasa estacional de los barcos no nominados.
  - Cada barco del line-up llega en ETA + demora, con demora ~ Normal(media, desvío) por puerto.
  - Los no nominados entran con un peso que va de 0 hoy a 1 en el día 21.
- Barcos en puerto = arribos de los últimos 5 días (fondeo + carga).
- P(hay barco) = 1 − e^(−barcos).
- Índice de demanda = barcos en puerto ÷ barcos normales del mes.
- Capacidad = toneladas declaradas de cada barco del line-up + carga típica, ajustada por calado, de los no nominados.
- Calado: cada metro de bajante resta ~3,3 pies, y cada pie son ~1.800 t menos por barco.
- Espera desde la llegada del grano = Σₖ Πⱼ<ₖ (1 − pⱼ). Trata los días como independientes, lo que es una aproximación.
- Mejor despacho = mín(espera × costo de espera + días guardado × costo de guardar).

**2. Venta**
- Para cada fecha de despacho:
  - vender = máx(puerto, acopio).
  - Puerto: t × precio × factorPrecio(llegada) − flete − espera − días en campo.
  - Acopio: t × (precio − descuento) − flete corto − tarifa − días en campo.
- Silobolsa: t × (1 − merma) × futuro − bolsa, embolsado y extracción − flete − interés.
- Decisión: vender en la mejor fecha si supera a la silobolsa; si no, silobolsa.
- Hasta dónde rinde: ventana de venta (fechas en las que vender ≥ silobolsa), espera máxima en puerto, precio disponible mínimo y precio futuro de equilibrio.

**3. Cadetes**
- Puerto o acopio:
  - Ciclo = 2 × km ÷ 60 km/h + 2 h de carga y descarga, más 4 h de cola si es puerto.
  - Viajes por día = 12 h ÷ ciclo.
  - Camiones = ceil(t/día ÷ (30 × viajes)).
- Silobolsa: embolsadoras = ceil(t/día ÷ (150 t/h × 10 h)).
- Fecha de pedido = inicio − 3 días. Es crítico si esa fecha es hoy o ya pasó.

## Avisos

| Módulo | Tipo | Nivel | Cuándo |
|---|---|---|---|
| venta | `decision-venta` | info | Siempre: vender o silobolsa, margen, diferencia y qué tendría que cambiar |
| venta | `cierre-ventana` | alerta | La ventana de venta se cierra en 7 días o menos |
| venta | `cola` | alerta | Conviene postergar el despacho al puerto por la espera |
| cadetes | `pedir-cadetes` | crítico / info | Siempre: qué pedir, cuántos, adónde y desde cuándo |
| barcos | `bajante` | alerta | La carga por barco cae más de 10% |
| barcos | `poca-disponibilidad` | alerta | Solo si se vende al puerto: P(barco en 3 días o menos) < 80% |
| barcos | `perder-barco` | crítico | Solo si se vende al puerto: riesgo > 20% de llegar tarde al barco contratado |
| barcos | `baja-confianza` / `fuera-de-horizonte` | info | La llegada cae fuera del line-up o del horizonte |

## Uso

```js
import { analizarBarcos, parsearLineupCSV } from './src/barcos/index.js';
import { planificar } from './src/planificar.js';

// Barcos solo
const barcos = analizarBarcos({ lineup: parsearLineupCSV(csv), puerto: 'gran-rosario', cultivo: 'soja', hoy: '2027-04-22', nivelParanaM: 1.8 });
barcos.senal;   // por día: probHayBarco, esperaDias, indiceDemanda, factorPrecio

// Flujo completo
const r = planificar({
  lineup: parsearLineupCSV(csv), puerto: 'gran-rosario', cultivo: 'soja', hoy: '2027-04-22',
  fechaGranoListo: '2027-04-25', diasCosecha: 6, toneladas: 1500,
  distanciaPuertoKm: 320, distanciaAcopioKm: 60, nivelParanaM: 1.8,
});
r.venta.decision;          // 'vender' | 'silobolsa'
r.venta.hastaDondeRinde;   // ventanaVenta, esperaMaxDias, precioPuertoMinimoUSDt, precioFuturoEquilibrioUSDt
r.cadetes;                 // camiones o embolsadoras, inicio, fin, pedirEl
```

```bash
npm test
npm run demo
node src/demo.js data/lineup-ejemplo.csv 2027-04-22
```

Todos los parámetros y precios son supuestos editables en `src/barcos/datos.js`, `src/venta/datos.js` y `src/comun/logistica.js`.
