# Fuentes de datos: integración y límites

Las fuentes entregan observaciones, reanálisis, pronósticos o cartografía; esos tipos no son intercambiables. Todo dato utilizado debe conservar fuente, fecha, unidad, ubicación y condición de calidad. La falta de una observación se representa como `null`/`missing`, nunca como cero.

## Conectores implementados

| Fuente | Acceso implementado | Requisitos / límite |
|---|---|---|
| Open-Meteo Forecast | Pronóstico horario y diario, precipitación, probabilidad, temperatura, humedad, viento, radiación, ET0 y humedad modelada del suelo. | API pública, sin clave; hasta 16 días de pronóstico. El modelo elegido se conserva cuando la API lo informa. |
| NASA POWER | API horaria para lluvia, temperatura, humedad relativa, viento y humedad superficial `GWETTOP`. | API pública; reanálisis regional, no medición del lote. Fechas consultadas en UTC. |
| NASA GPM IMERG Late V07B | Lectura puntual de precipitación por OPeNDAP cada 30 minutos. | Requiere usuario y contraseña Earthdata; hasta 3 días por llamada al adaptador (144 lecturas escalares en 72 h). La latencia puede hacer que las granulas recientes aún no existan. Intensidad del producto convertida a mm/30 min. |
| SMN | Pronóstico por coordenadas, alertas y avisos de corto plazo; consulta de precipitación histórica por localidad de referencia. | API documentada encontrada bajo `api-test.smn.gob.ar`, con login/token. No se confirmó la URL de producción; el conector solo se activa con `SMN_API_BASE_URL` explícita. |
| Copernicus ERA5-Land timeseries | Solicita una serie CSV al Retrieve API, espera el trabajo asíncrono y descarga el resultado. | Requiere token personal CDS y aceptación manual de los términos. La API timeseries documenta variables/formato/área, pero no rango de fechas; por eso no se ejecuta en cada actualización diaria y el CSV queda como archivo para ingesta posterior. Es reanálisis regional. |
| datos.gob.ar / Estimaciones Agrícolas | Consulta CKAN Datastore por cultivo, provincia y departamento y calcula promedio de los últimos años disponibles en kg/ha, qq/ha y t/ha. | Sin clave. La cobertura depende del dataset. En la consulta de verificación del 14/11/2026, el departamento Rosario no devolvió registros de soja; el adaptador informa ausencia en vez de inventar o sustituir con otro departamento. |
| OpenStreetMap Nominatim + OSRM | Geocodificación y ruta vial (distancia/tiempo), con caché y espera de 1 s entre consultas Nominatim. | Servicios públicos con política de uso y disponibilidad no garantizada; configurar un User-Agent identificable y usar proveedor propio para operación de volumen. No usa línea recta como si fuera ruta. |
| Open-Meteo Elevation | Consulta puntual de elevación DEM. | Público. Es una cota regional: no determina microdepresiones ni capacidad portante. |
| OpenTopography | Descarga DEM SRTM/COP30 GeoTIFF para un bbox. | Requiere `OPENTOPOGRAPHY_API_KEY`; el raster se descarga, pero aún no se procesa para obtener pendiente/depresiones. |
| NASA CMR / SMAP L4 | Descubrimiento público de granulos `SPL4SMGP` versión 008; descarga de HDF5 si se provee token Earthdata. | La búsqueda funciona sin clave; descarga requiere `NASA_EARTHDATA_TOKEN`. Los HDF5 se guardan sin interpretación raster, no alimentan el cálculo de transitabilidad. |
| Copernicus Data Space STAC / Sentinel-1 y 2 | Búsqueda pública de productos por colección, bbox y fechas; descarga de activos por API OAuth. | Descargar requiere cuenta (`CDSE_USERNAME`/`CDSE_PASSWORD`; TOTP opcional). Los activos aún no se procesan en humedad, NDVI o transitabilidad. Radar e índices ópticos no son mediciones directas del piso. |
| INTA | Se documentan referencias técnicas para calibración y validación. | No se encontró un endpoint abierto y estable de cartas de suelo/estaciones que pueda seleccionarse automáticamente para cualquier lote. No se atribuye un valor edáfico a una ubicación sin cobertura comprobada. |

## Qué usa el planificador

`consultarCondicionesCosecha` consulta Open-Meteo como fuente requerida. NASA POWER, SMN, elevación e IMERG se agregan como fuentes opcionales cuando hay rango de fechas y configuración; los errores opcionales aparecen en `sourceStatus.failed` y no se ocultan. El resultado contiene el pronóstico diario y los datos originales de cada fuente.

El planificador no produce un porcentaje de probabilidad global de cosecha ni declara transitable un lote por ausencia de lluvia. La humedad modelada del suelo, ET0 y elevación son contexto regional. Faltan observaciones locales para calibrar capacidad portante, secado del perfil, umbrales por suelo y efecto de la maquinaria.

## Actualización diaria

Configurar `LOT_LATITUDE` y `LOT_LONGITUDE` y ejecutar:

```powershell
npm run update:weather
```

La ejecución consulta el pronóstico de hasta 16 días, trae 14 días de histórico horario NASA POWER y guarda una instantánea JSON diaria bajo `data/cache/harvest/` (ignorada por Git). Se puede programar con Task Scheduler/cron. IMERG está desactivado por defecto porque cada día puede generar hasta 144 consultas y requiere Earthdata; activar con `INCLUDE_IMERG=1`.

## Configuración privada

El cargador lee variables de entorno del proceso y, si existen, de `~/.env` (en Windows, `%USERPROFILE%\.env`). No se suben credenciales al repositorio:

```dotenv
LOT_LATITUDE=-32.95
LOT_LONGITUDE=-60.64
NASA_EARTHDATA_USERNAME=
NASA_EARTHDATA_PASSWORD=
NASA_EARTHDATA_TOKEN=
COPERNICUS_CDS_API_TOKEN=
ERA5_TERMS_ACCEPTED=0
OPENTOPOGRAPHY_API_KEY=
CDSE_USERNAME=
CDSE_PASSWORD=
CDSE_TOTP=
SMN_API_BASE_URL=
SMN_API_USERNAME=
SMN_API_PASSWORD=
```

Para SMN, indicar una base URL de producción solo después de validarla con el proveedor. No usar la API de prueba como fuente productiva.

## Referencias oficiales

- [Open-Meteo Forecast API](https://open-meteo.com/en/docs)
- [NASA POWER Hourly API](https://power.larc.nasa.gov/docs/services/api/temporal/hourly/)
- [NASA GPM IMERG](https://gpm.nasa.gov/data/imerg)
- [NASA CMR](https://cmr.earthdata.nasa.gov/search/site/docs/search/api.html)
- [NASA SMAP L4 V008](https://nsidc.org/data/spl4smgp/versions/8)
- [Copernicus ERA5-Land timeseries](https://cds.climate.copernicus.eu/datasets/reanalysis-era5-land-timeseries)
- [Copernicus CDS API setup](https://cds.climate.copernicus.eu/how-to-api)
- [Copernicus Data Space STAC](https://documentation.dataspace.copernicus.eu/APIs/)
- [Copernicus Data Space token docs](https://documentation.dataspace.copernicus.eu/APIs/Token.html)
- [OpenTopography APIs](https://www.opentopography.org/developers)
- [datos.gob.ar CKAN API](https://datos.gob.ar/api/3/action/help_show?name=datastore_search)
- [SMN API de prueba](https://api-test.smn.gob.ar/v1/api-docs)
- [GeoINTA](https://geoportal.inta.gob.ar/)
- [INTA: información agroclimática](https://www.argentina.gob.ar/inta/informacion-agroclimatica)
