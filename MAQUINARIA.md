# Maquinaria, costos y dimensionado

Datos en `datos/maquinaria.json`, cálculo en `src/dimensionar.js`, actualización web en `src/actualizar.js`. Campaña 2025/26.

## Uso

```js
const { dimensionarCosecha } = require('./src/dimensionar');

dimensionarCosecha({
  ha: 2000, qqHa: 35, cultivo: 'soja',         // soja, maiz, trigo, girasol
  diasDisponibles: 20, urgencia: 'media',      // baja, media, alta
  destino: 'puerto', distanciaKm: 100,         // puerto, acopio o silobolsa
});
```

Devuelve toneladas, cosechadoras, tractores con tolva, camiones (o silobolsa si el destino es el campo), las alternativas evaluadas y el costo total en USD. Tests: `node --test src/`.

## Plan de pedido (`src/plan.js`)

`planDePedido(entrada)` junta los datos del campo y de los destinos candidatos y devuelve qué pedir, cuánto, cuándo y a qué costo.

Datos requeridos: `ha`, `qqHa`, `cultivo`, `diasDisponibles`, `urgencia`, `fechaInicioCosecha` (AAAA-MM-DD) y `destinos`. Cada destino lleva `tipo` (puerto, acopio o silobolsa) y `distanciaKm` (no hace falta para silobolsa). Opcionales por destino: `nombre`, `precioUsdPorT` y `costoAdicionalUsdPorT` (acopio). `datosFaltantes(entrada)` lista lo que falta; sin eso `planDePedido` falla con `faltan datos: ...`.

Salida:
- **Destino recomendado:** el de mayor margen neto si todos los destinos traen precio; si no, el de menor costo logístico.
- **Pedidos:** una línea por recurso (cosechadora, tractor con tolva, camión, o embolsadora y silobolsas) con cantidad, tipo, fecha límite para pedir, período de uso y costo.
- **Alternativas:** costo y margen de cada destino evaluado.

Ejemplo, 2.000 ha de soja a 35 qq/ha (7.000 t), 20 días, inicio 10/04/2027, urgencia media:

| Pedir | Cantidad | Tipo | Pedir antes del | Usar |
|---|---|---|---|---|
| Cosechadora | 3 | grande | 26/03 | 10/04 al 23/04 |
| Tractor con tolva | 3 | tolva de 25 t | 31/03 | 10/04 al 23/04 |
| Camión | 14 | bitrén, dedicado por día | 03/04 | 10/04 al 23/04 |

Los anticipos de pedido (15, 10, 7 días) son supuestos editables en `reserva` del JSON. El flete de salida del silobolsa y el costo del acopio por mes no están modelados: el acopio entra como `costoAdicionalUsdPorT`.

## Urgencia

La urgencia reserva una parte de los días para lluvia y roturas y decide con qué criterio se elige entre las opciones.

| Urgencia | Días reservados | Criterio |
|---|---|---|
| baja | 10% | menor costo |
| media | 25% | menor costo |
| alta | 40% | terminar antes |

Ejemplo, 2.000 ha de soja a 35 qq/ha, 20 días, puerto a 100 km:

| Urgencia | Días efectivos | Cosechadoras | Días de cosecha | Camiones | Costo total |
|---|---|---|---|---|---|
| baja | 18 | 3 grandes | 14 | 7 bitrenes | US$ 261.271 |
| media | 15 | 3 grandes | 14 | 7 bitrenes | US$ 261.271 |
| alta | 12 | 4 grandes | 10 | 9 bitrenes | US$ 259.180 |

Costos calculados con la tabla CATAC de abril 2026 y dólar oficial de $1.570.

## Qué se actualiza solo y qué no

`node src/actualizar.js` consulta la web y reescribe `datos/maquinaria.json`. `actualizarSiVencido({ maxHoras: 24 })` hace lo mismo solo si los datos tienen más de 24 horas: pensado para llamarlo al arrancar la aplicación.

| Dato | Fuente | Estado |
|---|---|---|
| Tipo de cambio | dolarapi.com, dólar oficial (venta) | Automático |
| Flete por km y tonelada | PDF más reciente de CATAC (api.apicatac.com) | Automático. Requiere `pdftotext` (poppler) |
| Estadía por día | El mismo PDF de CATAC | Automático |
| Cosecha por hectárea | FACMA, soja 2025/26: US$ 97/ha a 24 qq y US$ 150/ha a 50 qq | Manual: sin fuente legible por máquina |
| Tractor y tolva, silobolsa, embolsado, extracción | Rangos de INTA, UTN y prensa | Manual: sin fuente |

Si una fuente falla, se conservan los valores anteriores y `actualizacion` en el JSON dice cuál falló y por qué. El código no inventa un valor.

Limitaciones:
- La tabla de CATAC está en un PDF con fuente propia; el parser decodifica los dígitos. Si CATAC cambia el formato, la validación rechaza la tabla y se conservan los datos viejos.
- Dos km de la tabla (1.054 y 1.104) vienen mezclados con otro texto en el PDF y se interpolan.
- Maíz, trigo y girasol usan factores de costo y capacidad supuestos.
- El flete cubre hasta ~1.200 km.

## Silobolsa por grano

Bolsa de 9 pies por 60 m. Humedad de bajo riesgo según INTA.

| Grano | Capacidad por bolsa | Humedad de bajo riesgo | Estado |
|---|---|---|---|
| Soja | 190 t | 14% | Fuente |
| Maíz | 200 t | 14% | Fuente |
| Trigo | 215 t | 14% | Fuente |
| Girasol | 110 t | 11% | Capacidad supuesta |

Costos de ejemplo: bolsa US$ 250, embolsado US$ 3,5/t, extracción US$ 3/t (rangos de fuentes de más de un año).

Con 2.000 ha, urgencia media:

| Grano | Rinde | Toneladas | Bolsas | Embolsado + bolsas | Extracción |
|---|---|---|---|---|---|
| Soja | 35 qq/ha | 7.000 | 37 | US$ 33.750 | US$ 21.000 |
| Maíz | 90 qq/ha | 18.000 | 90 | US$ 85.500 | US$ 54.000 |
| Trigo | 40 qq/ha | 8.000 | 38 | US$ 37.500 | US$ 24.000 |
| Girasol | 25 qq/ha | 5.000 | 46 | US$ 29.000 | US$ 15.000 |

## Fórmulas

```
toneladas        = ha × qq/ha ÷ 10
dias_efectivos   = floor(dias × (1 − holgura_urgencia))
cosechadoras     = ceil(ha / (ha_por_dia × dias_efectivos))
ciclo_camion (h) = 2 × km / velocidad + carga + descarga
viajes_por_dia   = max(1, floor(horas_utiles / ciclo))
camiones         = ceil(t_por_dia / (capacidad × viajes_por_dia))
costo por viaje  = t × tarifa_CATAC(km) × precio_relativo_camion
costo dedicado   = camiones × dias_de_cosecha × estadia_por_dia
bolsas           = ceil(t / capacidad_del_grano)
```

Se elige la modalidad de camión de menor costo (por viaje o dedicado por día).
