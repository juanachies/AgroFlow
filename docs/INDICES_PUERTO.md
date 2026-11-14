# Vender o no a puerto: índices a cumplir y fuentes de datos

El módulo **Venta** solo recomienda vender **a puerto** si el puerto cumple estos índices. Los índices se calculan en **Barcos** con datos publicados. Si el puerto no cumple, Venta elige acopio o silobolsa aunque en el papel el puerto dé más margen.

## 1. Fuentes de datos de llegada de barcos y de puerto

| Fuente | Qué publica | Formato y frecuencia | Dirección | Uso en el modelo |
|---|---|---|---|---|
| **NABSA** (North American Shipping Agencies), line-up | Cada buque por puerto y terminal: estado (ETA / ETB / ETF / AT REC / BERTHED), fecha, operación (carga o descarga), toneladas, producto, destino y cargador | PDF exportado de Excel, días hábiles (circular numerada) | `https://www.nabsa.com.ar/assets/vessel_update.pdf` (versiones anteriores: `vessel_prior1..4.pdf`) | `parsearLineupNABSA` → `nabsaALineup` alimenta el pronóstico de Barcos; `toneladasProgramadas` alimenta el índice I1 |
| **NABSA**, buques zarpados | Embarques realizados | PDF diario y XLSX histórico | `https://www.nabsa.com.ar/assets/vessels_sailed_update.pdf`, `https://www.nabsa.com.ar/SAILED/` | Calibración: estacionalidad y demora de ETA (pendiente) |
| **BCR**, "Buques a la carga" | Toneladas programadas por producto (trigo, maíz, soja, harinas, aceites…) y por zona (ROS/SL, Necochea, Bahía Blanca, otros), para unas 3 semanas. Fuente: NABSA | Tabla web + Excel diario (`buques_AAAAMMDD.xls`), archivo desde 2022 | [bcr.com.ar → Información Comercial](https://www.bcr.com.ar/es/mercados/mercado-de-granos/informacion-comercial/informacion-comercial) | `parsearBuquesBCR` → índice I1 (demanda de los barcos) |
| **BCR**, "Posición de camiones" | Camiones ingresados a la zona portuaria de Rosario por producto y en playas a las 7 h. Fuente: BCR en base a CECOA | Tabla web + Excel diario (`AAAAMMDD.xlsx`) | misma página | `parsearCamionesBCR` → índices I1 (oferta) e I2 (saturación) |
| **MAGyP**, Subsecretaría de Mercados Agropecuarios | Entrada diaria de camiones y vagones por zona portuaria y producto; posición de buques y anunciados (line-up) | HTML / PDF | [magyp.gob.ar, logística](https://www.magyp.gob.ar/mercadosagropecuarios/infraestructura.php) | Alternativa a la BCR para camiones y line-up |
| **Williams Entregas** | Camiones arribados a terminales del Gran Rosario hasta las 7 h. Es una muestra: la BCR estima que cubre ~50% del ingreso anual | Consulta histórica en su web | williams.com.ar | Alternativa para camiones |
| **INA**, Instituto Nacional del Agua | Altura del Paraná en Rosario y otras estaciones, con umbrales | PDF diario y series en `alerta.ina.gob.ar/a5/secciones` | [alerta.ina.gob.ar](https://alerta.ina.gob.ar/) | Índice I5 (calado) |
| **aisstream.io** (opcional) | Posición AIS de buques en tiempo real por WebSocket | Gratis con API key, beta sin SLA, solo desde backend | [aisstream.io](https://aisstream.io) | Fase posterior: ETA propia de los buques en ruta |

> Referencia: el proyecto público `Diegof10/cola-buques-rosario` ingiere NABSA, MAGyP y Williams para un tablero del Up-River. Sirve para comparar enfoques, pero no tiene licencia declarada, así que no se copia código.

**Cómo entran los datos a la app:**
1. El PDF de NABSA se descarga y su texto se extrae con `pdf-parse` en el servidor, para pasarlo a `parsearLineupNABSA`.
2. Los Excel de la BCR se leen con `xlsx`. También se puede pegar la tabla copiada de la web en `parsearBuquesBCR` y `parsearCamionesBCR`.
3. Se guarda una copia por día para armar la serie histórica que sirve para calibrar.

## 2. Índices

| # | Índice | Fórmula | Fuente | Verde | Rojo | ¿Bloquea? |
|---|---|---|---|---|---|---|
| I1 | **Demanda de barcos ÷ oferta de camiones** | (t programadas del cultivo ÷ días del período) ÷ (camiones/día del cultivo × 30 t) | BCR buques o NABSA + BCR camiones | ≥ 1,1 | < 0,8 | **Sí** |
| I2 | **Saturación de descarga** | camiones/día totales ÷ camiones de un día pico (7.000) | BCR camiones | ≤ 0,6 | > 0,85 | No |
| I3 | **Barcos en puerto ÷ normal del mes** | pronóstico de Barcos con line-up NABSA | NABSA + estacionalidad | ≥ 1,0 | < 0,8 | No |
| I4 | **Espera estimada hasta tener barco** | días esperados si el grano llega en la mejor fecha | pronóstico de Barcos | ≤ 1 día | > 3 días | **Sí** |
| I5 | **Altura del Paraná en Rosario** | metros en el hidrómetro de Rosario (solo Up-River) | INA | ≥ 2,5 m | < 1,5 m | No |

**Soja equivalente:** la soja argentina sale mayormente como harina y aceite. La demanda de soja de los barcos se calcula como `soja grano + harina de soja ÷ 0,78`, porque de cada tonelada de soja que se muele sale alrededor de 0,78 t de harina. La tabla de la BCR agrupa todas las harinas, así que el índice sobreestima un poco. El line-up de NABSA separa la harina de soja.

**Regla:** verde suma +1, amarillo 0 y rojo −1. Se puede vender a puerto si **ningún índice bloqueante está en rojo** y la **suma es ≥ 0**. Un índice sin dato no cuenta. Si ninguno tiene dato, no se habilita el puerto.

### Por qué esos umbrales

- **I1:** con un valor menor a 1 entra más grano del que los barcos necesitan, y la terminal descarga con cola y presiona el precio. Con un valor mayor a 1 las exportadoras y la molienda necesitan originar. El margen de ±10 a 20% alrededor de 1 evita decidir por ruido.
- **I2:** el ingreso de camiones al Gran Rosario llega a picos de unos 5.500 a 7.000 camiones por día. Por encima del 85% de ese pico hay colas en rutas y playas.
- **I4:** con un costo de espera de 1,2 US$/t/día, 3 días se comen unos 3,6 US$/t, que es del mismo orden que la ventaja del disponible sobre el acopio.
- **I5:** el INA registró 1,54 m en Rosario el 1/4/2026 como "aguas bajas/medias bajas". Con bajante, los buques salen del Up-River con hasta un 25% menos de carga y completan en Bahía Blanca o Necochea.

Todos los umbrales son editables (`umbrales` en la entrada de `decidirVenta`) y son **iniciales**. Se calibran con la serie histórica: el Excel diario de la BCR existe desde 2022. El método es cruzar cada índice con el spread entre el disponible de Rosario y el FAS teórico, y con la espera real.

## 3. Ejemplo con datos de esta semana (11 al 13/11/2026)

Datos cargados en `data/mercado-ejemplo-2026-11.json`:
- **Buques a la carga (BCR, fuente NABSA), del 11/11 al 3/12:** trigo 792.300 t, maíz 1.189.733 t, soja 443.400 t y harinas 1.473.250 t. Son totales de todos los puertos.
- **Camiones del 13/11:** maíz 2.559, soja 2.276 y trigo 2.132 en zonas portuarias. El total de la zona de Rosario fue 5.068 (BCR).

| Cultivo | I1 demanda ÷ oferta | Resultado |
|---|---|---|
| Soja | (443.400 + 1.473.250 ÷ 0,78) ÷ 23 = 101.399 t/día, contra 2.276 × 30 = 68.280 t/día → **1,49** 🟢 | Falta soja: el puerto cumple |
| Maíz | 1.189.733 ÷ 23 = 51.727 t/día, contra 2.559 × 30 = 76.770 t/día → **0,67** 🔴 | Sobra maíz: **el puerto no cumple** y se descarta |
| Trigo | 792.300 ÷ 23 = 34.448 t/día, contra 2.132 × 30 = 63.960 t/día → **0,54** 🔴 | Arranca la cosecha fina: el puerto no cumple |

La saturación da 5.068 ÷ 7.000 = 0,72 🟡.

El line-up real de NABSA (circular 210, 10/11/2026) dio con el parser 273 filas: 182 en Up-River, 33 en Bahía Blanca y 14 en Quequén/Necochea. Las barcos de maíz en el Up-River dan un I3 de 1,72 🟢. Hay muchos barcos de maíz, pero entra todavía más maíz en camión (I1 rojo), y por eso la decisión correcta es no vender a puerto.

```bash
npm run demo                 # soja, line-up simulado, datos de mercado de la semana
node src/interfaces/cli/demoVenta.js maiz 2026-11-14 ruta/al/texto_nabsa.txt   # con el line-up real de NABSA
```

## 4. Limitaciones

- **Fechas de los datos:** el line-up y los camiones son de días distintos (NABSA a veces se publica con atraso). Cada índice informa su fuente y fecha.
- **Camiones:** el informe de Williams es una muestra. La BCR y MAGyP son más completos.
- **Toneladas por zona:** las toneladas programadas tienen que ser de la misma zona que los camiones (ROS / SL para el Up-River). El ejemplo usa totales y sobreestima un poco la demanda de Rosario.
- **Umbrales:** son iniciales y sin calibrar. Hay que decirlo en la demo.
