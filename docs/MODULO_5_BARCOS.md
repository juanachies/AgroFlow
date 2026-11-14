# Módulos Barcos, Venta y Cadetes: método y uso

Implementa **Barcos** (independiente) → **Venta** (vender o silobolsa, hasta dónde rinde) → **Cadetes** (ver [PLAN_BARCOS.md](PLAN_BARCOS.md)). Es código determinista y auditable, sin dependencias. La IA solo explica el resultado.

## Archivos

| Archivo | Qué hace |
|---|---|
| `src/domain/barcos/colaBuques.js`, `calado.js` | Disponibilidad de barcos, índice de demanda, factor de precio, calado, espera, riesgo de perder barco, señal por día y avisos de barcos |
| `src/domain/barcos/indicesMercado.js` | Índices del puerto con datos publicados |
| `src/domain/barcos/lineup.js` | Formato y validación de un barco del line-up |
| `src/infrastructure/barcos/` | Adaptadores de `BarcosPort`: NABSA, BCR, CSV manual y simulado |
| `src/domain/barcos/datos.js` | Puertos, estacionalidad y parámetros de barcos |
| `src/domain/barcos/index.js` | `analizarBarcos()`: punto de entrada del módulo |
| `src/domain/venta/ventaCosecha.js`, `criterios.js` | `decidirVentaCosecha()`: curva por fecha, índices a cumplir para vender a puerto, vender o silobolsa, hasta dónde rinde y avisos |
| `src/domain/venta/supuestos.js` | Supuestos de flete, acopio, silobolsa y precios |
| `src/domain/maquinaria/cadetes.js` | `avisoCadetes()`: camiones o embolsadora según la decisión |
| `src/domain/shared/util.js`, `src/domain/maquinaria/logistica.js` | Fechas, normal y logística de camiones |
| `src/application/usecases/decidirVentaCosecha.js` | Caso de uso: encadena Barcos → Venta → Cadetes con los puertos `BarcosPort` y `NivelRioPort` |
| `src/config/container.js` | Conecta el caso de uso con los adaptadores |

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
import { crearContenedor } from './src/config/container.js';

// barcos: 'simulado' | 'manual' (CSV) | 'nabsa' (texto del PDF); mercado: datos BCR de camiones y buques
const { decidirVentaCosecha } = crearContenedor({ barcos: 'nabsa', rutaLineup: 'nabsa.txt', mercado, nivelParanaM: 1.8 });
const r = await decidirVentaCosecha({
  puerto: 'gran-rosario', cultivo: 'soja', hoy: '2026-11-14',
  fechaGranoListo: '2026-11-14', diasCosecha: 6, toneladas: 1500,
  distanciaPuertoKm: 320, distanciaAcopioKm: 60,
});
r.barcos.senal;            // por día: probHayBarco, esperaDias, indiceDemanda, factorPrecio
r.venta.indicesPuerto;     // semáforo y checks de los índices para vender a puerto
r.venta.decision;          // 'vender' | 'silobolsa'  (r.venta.canal: 'puerto' | 'acopio')
r.venta.hastaDondeRinde;   // ventanaVenta, esperaMaxDias, precioPuertoMinimoUSDt, precioFuturoEquilibrioUSDt
r.cadetes;                 // camiones o embolsadoras, inicio, fin, pedirEl
r.fuentes;                 // de dónde salió cada dato (o si se usó el respaldo simulado)
```

```bash
npm test
npm run demo
node src/interfaces/cli/demoVenta.js soja 2026-11-14 data/lineup-ejemplo.csv
```

Todos los parámetros y precios son supuestos editables en `src/domain/barcos/datos.js`, `src/domain/venta/supuestos.js` y `src/domain/shared/ y src/domain/maquinaria/logistica.jslogistica.js`.
