# Catálogo de maquinaria y dimensionado

Los valores están en `datos/maquinaria.json`. Son **ejemplos editables**, no tarifas vigentes. Rendimientos para soja con 10 horas útiles por día.

## Catálogo

| Máquina | Modelo de ejemplo | Rendimiento | Costo de ejemplo |
|---|---|---|---|
| Cosechadora | Chica (180 a 220 CV) | 25 ha/día | US$ 95/ha |
| Cosechadora | Mediana (240 a 300 CV) | 35 ha/día | US$ 90/ha |
| Cosechadora | Grande (más de 300 CV) | 50 ha/día | US$ 85/ha |
| Tractor con tolva | 150 CV, 18 t | 18 t por viaje | US$ 40/h |
| Tractor con tolva | 200 CV, 25 t | 25 t por viaje | US$ 50/h |
| Tractor con tolva | 250 CV, 30 t | 30 t por viaje | US$ 60/h |
| Camión chasis | 15 t | ciclo según distancia | US$ 0,11/t/km o US$ 250/día |
| Camión semi | 30 t | ciclo según distancia | US$ 0,094/t/km o US$ 350/día |
| Camión bitrén | 40 t | ciclo según distancia | US$ 0,085/t/km o US$ 450/día |
| Embolsadora | Chica | 150 t/h | US$ 3/t |
| Embolsadora | Grande | 250 t/h | US$ 3/t |
| Silobolsa | 9 pies por 60 m | 200 t por bolsa | US$ 5/t (bolsa) |
| Extractora | Estándar | 150 t/h | US$ 3/t |

Referencias reales: la tarifa de cosecha ronda US$ 90/ha (FACMA, soja a 24 qq/ha, campaña no indicada) y el flete ~US$ 0,094/t/km (orden de magnitud, sin fecha confirmada). El resto es supuesto.

## Fórmulas

```
toneladas        = ha × rinde (t/ha)
cosechadoras     = ceil(ha / (ha_por_dia × dias_disponibles))
t_por_dia        = cosechadoras × ha_por_dia × rinde
ciclo_camion (h) = 2 × distancia / velocidad + carga + descarga
viajes_por_dia   = floor(horas_utiles / ciclo_camion)
camiones         = ceil(t_por_dia / (capacidad_t × viajes_por_dia))
tractores_tolva  = cosechadoras (uno por cosechadora)
embolsadoras     = ceil(toneladas / (t_por_hora × horas_utiles × dias_disponibles))
bolsas           = ceil(toneladas / 200)
```

## Ejemplos (soja, 3,5 t/ha, cosechadora mediana, camión semi)

| Campo | Días disponibles | Cosechadoras | Tractores con tolva | Camiones a 50 km | Camiones a 200 km |
|---|---|---|---|---|---|
| 100 ha (350 t) | 10 | 1 | 1 | 2 | 5 |
| 500 ha (1.750 t) | 15 | 1 | 1 | 2 | 5 |
| 2.000 ha (7.000 t) | 20 | 3 | 3 | 5 | 13 |

Cálculo del campo de 2.000 ha:
- Cosechadoras: ceil(2000 / (35 × 20)) = ceil(2,86) = 3.
- Toneladas por día: 3 × 35 × 3,5 = 367,5 t.
- A 50 km: ciclo 2,92 h, 3 viajes por día, 90 t por camión y día, ceil(367,5 / 90) = 5 camiones.
- A 200 km: ciclo 7,92 h, 1 viaje por día, 30 t por camión y día, ceil(367,5 / 30) = 13 camiones.
- Cosecha por servicio: 2.000 ha × US$ 90 = US$ 180.000.
- Si el destino es silobolsa: 1 embolsadora grande (7.000 t ÷ 2.500 t por día = 3 días) y 35 bolsas.

Con menos tiempo disponible suben las cosechadoras. Con más distancia suben los camiones.
