# marcianos

Proyecto base para la planificación de cosecha y logística de granos en la zona núcleo de Rosario.

## Stack

- Node.js 18+
- ES modules
- Pruebas con `node:test`

## Ejecutar

```bash
npm test
```

## Arquitectura

El núcleo del negocio vive en `src/domain` y es independiente de HTTP, APIs externas y IA. Los casos de uso viven en `src/application/usecases` y los adaptadores externos en `src/infrastructure`.

## Módulo principal

La evaluación de condiciones meteorológicas está disponible en `src/application/usecases/consultarCondicionesCosecha.js`. Usa Open-Meteo y permite agregar NASA POWER, SMN, IMERG y elevación; errores de fuentes opcionales quedan registrados en el resultado.

## Fuentes y actualización

Revisar [`docs/FUENTES.md`](./docs/FUENTES.md) para fuentes integradas, límites, credenciales y productos que requieren procesamiento raster. Los secretos se leen del entorno o `~/.env`, nunca se guardan en el repositorio.

Con `LOT_LATITUDE` y `LOT_LONGITUDE` configurados, ejecutar `npm run update:weather` para guardar una instantánea del pronóstico de 16 días y el histórico de lluvia/clima de NASA POWER. El comando puede programarse diariamente con Task Scheduler o cron.

## Validar

```bash
npm test
```

