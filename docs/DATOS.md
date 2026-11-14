# Datos: qué tenemos y qué no

Estado al 14/11/2026. Para cada dato: si ya funciona, de dónde sale, si pide cuenta y qué módulo del plan lo usa.

## Resumen

| Dato | Estado | Fuente | Cuenta | Módulo |
| --- | --- | --- | --- | --- |
| Lluvia, temperatura, humedad, viento | **Funciona** | NASA POWER | No | 1, 2, 4 |
| Humedad del suelo superficial | **Funciona** (como sustituto de SMAP) | NASA POWER, parámetro GWETTOP | No | 1, 2 |
| Evento de lluvia real para la demo | **Funciona** | NASA POWER (mayo 2025) | No | Demo |
| Lluvia fina (10 km, cada 30 min) | **Bloqueado** desde nuestra red | NASA GPM IMERG | Sí, Earthdata (ya creada y autorizada) | 1 |
| Humedad del suelo | Sin probar | NASA SMAP | Sí, Earthdata | 1, 2 |
| Nivel del río Paraná | Sin probar | SWOT (NASA/CNES) | Sí, Earthdata | 5 |
| Rinde histórico por departamento | Sin probar | datos.gob.ar | No | 1 |
| Distancias por ruta y geocodificación | Sin probar | OpenStreetMap (OSRM, Nominatim) | No | 2, 3 |
| Localidades de la zona núcleo | **Tenemos** (coordenadas aproximadas) | Lista propia, 16 localidades | — | Demo |
| Terminales del Gran Rosario | **Tenemos** (coordenadas y capacidades aproximadas) | Lista propia, 6 terminales | — | 2, 5 |
| Cifras del problema (camiones, silobolsas, flete, bajante) | **Tenemos** (de prensa que cita a BCR e INTA) | Ver "Cifras de referencia" | — | Pitch |
| Line-up de barcos | **Funciona** (parser probado con la circular 210) | NABSA, PDF diario | No | 5 |
| Buques a la carga y camiones a puerto | **Funciona** (parser de la tabla) | BCR, Excel diario | No | 5, venta |
| Altura del Paraná en Rosario | Manual (reporte diario) | INA | No | 5 |
| Ubicación de acopios y cooperativas | **Sin fuente abierta** | Lista curada de la zona de demo | — | 3 |
| Precios, tarifas, capacidades de máquinas | **Supuesto editable** | Valores de referencia | — | 2, 3 |

## Lo que funciona

### NASA POWER

- **Qué da:** lluvia (`PRECTOTCORR`), temperatura a 2 m (`T2M`), humedad relativa (`RH2M`), viento (`WS2M`) y humedad superficial del suelo (`GWETTOP`), por hora o por día, para cualquier punto.
- **Acceso:** API pública, sin cuenta ni clave. Probada desde esta red.
- **Resolución:** reanálisis MERRA-2, ~50 km. Marca bien qué zona se moja y cuándo; no da el detalle de cada lote.
- **Ejemplo:**

  ```
  https://power.larc.nasa.gov/api/temporal/hourly/point?parameters=PRECTOTCORR,GWETTOP&community=AG&longitude=-61.168&latitude=-33.044&start=20250514&end=20250521&format=JSON&time-standard=LST
  ```

- **Lo que ya tenemos bajado:** lluvia diaria de abril y mayo de 2024 y 2025, y lluvia y humedad del suelo horarias del 14 al 21 de mayo de 2025, para las 16 localidades. Están en caché en `logistica/datos/power/` del prototipo.
- **Parámetros documentados:** https://power.larc.nasa.gov/parameters/

### Eventos de lluvia reales para la demo

Buscados con NASA POWER sobre las 16 localidades, lluvia acumulada en 48 h:

| Evento | Localidades con 20 mm o más | Lluvia media | Máximos |
| --- | --- | --- | --- |
| 14 y 15 de abril de 2024 | 16 de 16 | 98 mm | Junín 158 mm, Colón 130 mm, Pergamino 126 mm |
| 17 y 18 de mayo de 2025 | 13 de 16 | 44 mm | Arrecifes 77 mm, Casilda 74 mm, Cañada de Gómez 74 mm |

El escenario de demo usa el de mayo de 2025: en la ventana del 14 al 21 de mayo cayeron hasta 117 mm (Arrecifes), y Pergamino, Rojas, Junín y Arrecifes tenían el suelo saturado según GWETTOP.

### Regla de corte por lluvia (supuesto nuestro, calibrable)

- Un camino de tierra se corta si en 48 h caen 20 mm o más.
- Reabre 18 h después de la última hora de lluvia, o 27 h si el suelo estaba saturado (GWETTOP ≥ 0,8).
- Llueve en una hora si caen al menos 0,3 mm.

Son valores razonables para la demo, no una norma. Se calibran por zona con productores.

## Lo que está bloqueado o sin probar

### NASA GPM IMERG (lluvia fina)

- **Qué da:** lluvia cada 30 minutos, en celdas de 0,1° (~10 km).
- **Dataset:** GPM_3IMERGHHL v07 (Late, ~14 h de demora). https://gpm.nasa.gov/data/imerg
- **Cuenta:** Earthdata creada y app "NASA GESDISC DATA ARCHIVE" autorizada.
- **Problema:** el servidor de datos `gpm1.gesdisc.eosdis.nasa.gov` no responde desde nuestra red (ni Chrome ni curl conectan; el portal `disc.gsfc.nasa.gov` sí). Puede ser la red o una caída.
- **Peso:** 2,8 MB por archivo global; 8 días son ~1,1 GB. Por eso conviene pedir solo el recorte de la zona núcleo por OPeNDAP:

  ```
  https://gpm1.gesdisc.eosdis.nasa.gov/opendap/GPM_L3/GPM_3IMERGHHL.07/2025/135/3B-HHR-L.MS.MRG.3IMERG.20250515-S000000-E002959.0000.V07B.HDF5.ascii?precipitation[0:0][1164:1200][549:589]
  ```

  Índices: longitud −63,5° a −60° = 1164 a 1200; latitud −35° a −31° = 549 a 589. La carpeta `135` es el día del año (15 de mayo). Las horas están en UTC; Argentina es UTC−3.
- **Plan:** usar NASA POWER y nombrar IMERG en la demo como mejora de resolución. Probar desde otra red si hay tiempo.

### NASA SMAP (humedad del suelo)

- Requiere cuenta Earthdata. No lo probamos.
- Mientras tanto usamos `GWETTOP` de NASA POWER, que es humedad superficial del suelo del reanálisis.

### SWOT (nivel del río Paraná)

- Requiere cuenta Earthdata. No lo probamos. https://swot.jpl.nasa.gov/ · https://cnes.fr/en/projects/swot
- Sirve para el módulo 5: con el río bajo cada buque carga menos.
- Alternativa a verificar: los pronósticos de altura del río del INA para Rosario, que serían más prácticos.

### datos.gob.ar (rinde histórico)

- Series de estimaciones agrícolas por departamento, sin cuenta. No lo probamos. https://datos.gob.ar/dataset?tags=agricultura

### OpenStreetMap (OSRM y Nominatim)

- Sin cuenta, pero los servidores públicos tienen límites de uso: Nominatim admite ~1 consulta por segundo y pide identificar la app. Conviene guardar en caché las distancias de la zona de demo.

## Lo que no tiene fuente abierta

| Dato | Cómo lo cubrimos |
| --- | --- |
| Arribos de barcos y cola en el puerto | Calendario manual o simulado (buque, terminal, fecha estimada, toneladas). Las agencias marítimas publican line-ups diarios del Gran Rosario: verificar si se pueden usar. |
| Ubicación de acopios y cooperativas | Lista curada de la zona de demo |
| Capacidad de descarga y de carga de cada terminal | Supuesto editable |
| Tarifas 2026 (silobolsa, embolsado, silo, alquiler de maquinaria, cosecha por servicio) | Supuesto editable con valores de referencia; decirlo en la demo |

## Listas propias

### Localidades (16, coordenadas aproximadas)

Casilda, Firmat, Venado Tuerto, Cañada de Gómez, Armstrong, Marcos Juárez, Bell Ville, Totoras, Gálvez, Pergamino, Colón, Rojas, Junín, Arrecifes, Rufino, Rafaela. Cada una tiene un peso relativo y los km promedio de camino de tierra hasta el asfalto (7 a 15 km, supuesto).

### Terminales (6, coordenadas y capacidades aproximadas)

| Terminal | Capacidad de descarga supuesta (camiones/h) |
| --- | --- |
| Timbúes | 30 |
| Pto. Gral. San Martín | 30 |
| San Lorenzo | 25 |
| Rosario sur | 20 |
| Villa Gdor. Gálvez | 25 |
| Arroyo Seco | 25 |

## Cifras de referencia para el pitch

Vienen de notas de prensa que citan a la BCR o al INTA. Verificar en el informe original antes de mostrarlas.

| Cifra | Valor | Fuente |
| --- | --- | --- |
| Camiones al Gran Rosario en 2025 | ~760.000 | [BAE Negocios](https://www.baenegocios.com/agroindustria/cosecha-record-en-rosario-ya-ingresaron-850-000-camiones-con-granos-al-polo-exportador-9932/) |
| Pico diario de camiones en cosecha | ~5.500 | [Cholila Online](https://cholilaonline.ar/2025/04/cosecha-puertos-cerealeros.html) |
| Reparto modal 2024/25 | 77% camión, 16% tren, 7% barcaza | [BCR](https://www.bcr.com.ar/es/print/pdf/node/109743) |
| Peso del flete en el precio del maíz lejano | hasta ~32% | [La Capital](https://www.lacapital.com.ar/economia/el-transporte-granos-ya-representa-el-30-del-valor-algunos-cultivos-n10263660.html) |
| Grano en silobolsas tras la cosecha gruesa | ~40 Mt | [Sitio Andino](https://www.sitioandino.com.ar/n/127878-segun-el-inta-hay-40-millones-de-toneladas-de-la-cosecha-gruesa-en-silobolsas) |
| Silobolsas con problemas | 5 a 8% | [Engormix (INTA)](https://www.engormix.com/agricultura/almacenaje-soja/argentina-inta-como-guardar_n24383/) |
| Pérdida en silobolsa en que deja de convenir frente al acopio | ~2% | [MPRA (INTA Balcarce)](https://mpra.ub.uni-muenchen.de/103146/9/MPRA_paper_103146.pdf) |
| Costo de un día de demora de buque | ~US$ 45.000 | [El Economista (BCR)](https://eleconomista.com.ar/agro/gran-rosario-bajante-historica-parana-causo-perdidas-mas-us-240-millones-n33981) |
| Carga perdida por pie de calado | 1.500 a 1.800 t por buque | [El Economista (BCR)](https://eleconomista.com.ar/agro/gran-rosario-bajante-historica-parana-causo-perdidas-mas-us-240-millones-n33981) |
| Costo de la bajante del Paraná | US$ 244 M (1er cuatrimestre 2020) | [El Economista (BCR)](https://eleconomista.com.ar/agro/gran-rosario-bajante-historica-parana-causo-perdidas-mas-us-240-millones-n33981) |

## Supuestos del prototipo

| Supuesto | Valor | Reemplazo |
| --- | --- | --- |
| Gasoil de un camión en ralentí | 3 L/h | Dato de fabricante o medido |
| CO₂ por litro de gasoil | 2,68 kg | Factor estándar |
| Velocidad en ruta / en tierra | 60 / 25 km/h | OSRM |
| Distancia | Línea recta × 1,3 | Distancia por ruta de OSRM |
| Desvío del viaje real | −10% a +25% del previsto | GPS de camiones |
| Camiones por día en la demo | 2.600, listos entre las 6 y las 22 h | — |

## Barcos y puerto (módulo 5)

Hay datos publicados todos los días hábiles, aunque sin API. Detalle de fuentes, formatos, índices y umbrales en [INDICES_PUERTO.md](INDICES_PUERTO.md).

- **NABSA, line-up:** `https://www.nabsa.com.ar/assets/vessel_update.pdf`. Tiene puerto, terminal, buque, estado (ETA / ETB / ETF / AT REC / BERTHED), toneladas, producto y destino. Adaptador: `src/infrastructure/barcos/nabsaAdapter.js`, que recibe el texto extraído del PDF.
- **BCR, "Buques a la carga" y "Posición de camiones":** Excel diario en la sección Información Comercial. El archivo de buques arranca en 2022. Adaptador: `src/infrastructure/barcos/bcrAdapter.js`.
- **MAGyP y Williams:** alternativas para los camiones a puerto.
- **INA:** altura del Paraná en Rosario, con reporte diario y series en `alerta.ina.gob.ar`.
- **aisstream.io:** posición AIS en tiempo real, gratis y en beta. Opcional.
