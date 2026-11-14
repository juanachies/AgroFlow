# Flujo completo: de la orden de cosecha al embarque en puerto

Verde: ya implementado y testeado. Naranja: falta o está incompleto. Gris: lo provee otro módulo o dispositivo.

```mermaid
flowchart TD
    subgraph F1["1. Orden de cosecha"]
        A[Datos del campo: ha, qq/ha, cultivo, días, urgencia, fecha de inicio] --> B[compararDestinos: puerto, acopio o silobolsa]
        B --> C[dimensionarCosecha: cosechadoras, tractores, camiones, embolsadora]
        C --> D[armarPedidos: qué pedir, cuánto y fecha límite de cada pedido]
    end

    subgraph F2["2. Pedidos y cosecha"]
        D --> E[Contratar cosechadoras, tractores, camiones, embolsadora y bolsas]
        E --> G[Cosecha]
        G --> H[Embolsado]
    end

    subgraph F3["3. Silobolsa cerrado"]
        H --> I[Registrar cada bolsa: id, cultivo, kg reales, fecha]
        I --> J[(SilobolsasPort)]
    end

    subgraph F4["4. Monitoreo"]
        K[IoT: humedad, temperatura, CO2] --> L[(LecturasIotPort)]
        L --> M[evaluarRiesgo: nivel y días hasta el nivel alto]
        J --> M
    end

    subgraph F5["5. Decisión de venta"]
        N[Precios spot y futuros] --> O[(PreciosPort)]
        P[Barcos: arribo, cierre de carga, capacidad] --> Q[(BarcosPort)]
        M --> R[decidirVenta: barco, fecha de carga, camiones]
        O --> R
        Q --> R
        R --> S{Hay barco a tiempo?}
        S -- sí --> T[Pedir fletes con fecha de carga]
        S -- no --> U[sin_barco_factible + fecha límite]
    end

    subgraph F6["6. Salida"]
        T --> V[Extraer el silobolsa]
        V --> W[Camiones al puerto]
        W --> X[Entrega y embarque]
    end

    U --> Y[Vender en acopio o a otro destino]

    M -. cada lectura nueva .-> R

    classDef ok fill:#d4edda,stroke:#2e7d32,color:#000
    classDef falta fill:#ffe0b2,stroke:#e65100,color:#000
    classDef externo fill:#e0e0e0,stroke:#616161,color:#000
    class A,B,C,D,M,R,S,T,U ok
    class E,G,H,V,W,X externo
    class I,J,Y falta
    class K,L,N,O,P,Q externo
```

## Qué falta

| # | Falta | Detalle | Efecto |
| --- | --- | --- | --- |
| 1 | Puente cosecha → silobolsa | `planificarCosecha` calcula cuántas bolsas, pero nada crea los registros que lee `SilobolsasPort` (id, kg reales, fecha de cierre). | La decisión de venta no se conecta sola con el plan de cosecha. |
| 2 | Costo y tiempo de extracción en la venta | `tarifas.json` tiene `extractora` (150 t/h) y `dimensionadoSilobolsa` calcula `costo_extraccion_usd`, pero `decisionVenta` no lo suma al neto ni reserva días de extracción. | El neto de cada barco está sobrestimado y la fecha de carga no considera cuánto tarda extraer. |
| 3 | Pedido de la extractora | `reserva.anticipo_dias` no tiene extractora; `armarPedidos` no la pide. | Falta un recurso en la lista de fletes y servicios a contratar. |
| 4 | Varias bolsas por lote | `decidirVenta` evalúa una bolsa por vez; la capacidad de un barco no se descuenta entre bolsas. | Dos bolsas pueden elegir el mismo barco y superar `toneladasMax`. |
| 5 | Re-evaluación automática | La decisión es una consulta puntual; nada la dispara con cada lectura nueva ni avisa cuando cambia. | Hay que llamarla a mano. |
| 6 | Alternativa sin barco | `sin_barco_factible` solo informa; no compara contra vender en acopio, que `compararDestinos` ya sabe evaluar. | El camino "no" del diagrama termina en una decisión manual. |
| 7 | Costos de esperar incompletos | El neto descuenta costo financiero, pero no almacenaje ni seguro; la merma usa el riesgo de hoy hasta la carga. | Esperar parece más barato de lo que es. |
| 8 | Adaptadores reales | Solo existe el de tarifas. Faltan IoT, precios, barcos y silobolsas (hoy hay simulados en los tests) y la interfaz HTTP. | El módulo no corre fuera de los tests. |
| 9 | Distancia y terminal separadas | `destino` lleva `terminal` y `distanciaKm` cargados a mano. | Sin `RutasPort`, un error de km cambia el flete. |
| 10 | Umbrales supuestos | Temperatura, CO₂ y merma por mes no tienen fuente abierta. | Validar con INTA antes de usar en serio. |

Prioridad sugerida: 2 y 3 (afectan el resultado de la decisión), después 1 y 4 (conectan el flujo), después 5 y 8 (lo hacen operable).
