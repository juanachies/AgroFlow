# Frente del producto: cosecha y despacho sin colas

Decisión del equipo (14-nov-2026): el producto se presenta como **un simulador de cosecha y despacho conectado a un marketplace de cadetes**, que evita la cola del pico en el puerto. La predicción de barcos deja de ser el titular y pasa a ser un insumo interno del **pronóstico de saturación del puerto**.

## 1. Problema

En el pico de cosecha miles de camiones llegan al mismo puerto los mismos días. En mayo de 2026 descargaron más de 850.000 camiones en el Gran Rosario (BCR). En agosto de 2026 la crisis del practicaje inmovilizó buques y cortó cupos de descarga, frenando camiones desde los acopios.

El productor decide sin ver esa cola:

- cuándo cosechar y qué maquinaria contratar;
- adónde mandar el grano: puerto, acopio o silobolsa;
- cuándo vender.

Lo paga en espera, flete de temporada alta, merma y ventas apuradas.

## 2. Solución

1. **Simulador**, para el productor. Con su lote, el sistema calcula:
   - la ventana de cosecha;
   - el destino por margen neto;
   - si conviene vender ya o guardar (spot y futuros);
   - la maquinaria y los camiones que hacen falta, y cuándo pedirlos.
2. **Marketplace de cadetes.** El plan se convierte en un pedido. El sistema lo asigna a contratistas, transportistas y embolsadoras de la zona con disponibilidad, y el productor confirma las reservas.
3. **Pronóstico de saturación del puerto.** Cruza la demanda de los barcos, de fuente oficial, con los camiones que van a llegar, que salen de las reservas del marketplace. Si el despacho cae en días saturados:
   - corre los camiones a la ventana fluida más cercana, sin mover la cosecha;
   - o, si no hay ventana, recomienda acopio o silobolsa.

**Ciclo:** cada reserva confirmada mejora el pronóstico de todos los productores, y un pronóstico mejor trae más reservas.

## 3. Qué existe y dónde entramos

Resumen del benchmark del 14-nov-2026. Se relevaron 38 soluciones y **ninguna hace la integración completa**.

| Necesidad | Lo que existe | Qué le falta | Nuestro rol |
| --- | --- | --- | --- |
| Turnos y cupos de camiones | Circular, Muvin (BCR), ACA GIRO | No dimensionan ni contratan la maquinaria del plan; no usan precio ni margen | **Integrarnos** para el turno en terminal |
| Monitoreo de silobolsa | Wiagro + IpesaSilo, Silcheck, SiloReal, Agrobait | Alertan o financian, pero no recomiendan vender con precio y canal | Usar sus lecturas como fuente; nosotros decidimos |
| Momento de venta | Hedgit, Agro Digital Assist | No usan costo de guardar, estado del grano, logística ni canal | La venta es una parte del plan, no el producto |
| Line-up y congestión | Kpler, Signal Ocean, Argus, DATAGRO; tableros abiertos del Up-River | Son para traders o muestran datos; no llegan a una decisión del productor | Fuente oficial como insumo; **el dato diferencial es el de reservas propias** |
| Canal por margen neto | fyo (servicio humano), Uagri (almacenaje), Grão Direto (Brasil) | Ninguno compara puerto, acopio y silobolsa con flete, merma, base y saturación | **Núcleo del simulador** |
| Dimensionar y contratar maquinaria | — | Nadie lo hace para el productor | **Núcleo del marketplace** |

## 4. Qué decimos y qué no

| Decimos | No decimos |
| --- | --- |
| "Planificá la cosecha y el despacho para no quedar en la cola" | "Predecimos barcos" o "semáforo de buques" (ya existen tableros y servicios para traders) |
| "Contratá la maquinaria y los camiones que tu plan necesita, con proveedores de tu zona" | "Elegimos el buque": en Argentina el buque lo nomina el exportador. Esa función queda para acopios y grandes productores con venta directa |
| "Sabemos cuántos camiones van a ir al puerto antes de que salgan, porque se reservan en la plataforma" | "Usamos los datos de NABSA o de la BCR" como diferencial |
| "Usamos fuentes públicas oficiales: MAGyP, INA, NASA, datos.gob.ar" | Que reemplazamos a Circular, Muvin o a los entregadores |
| "Gratis para el productor; el ingreso es una comisión por servicio contratado" | Que la recomendación es una garantía: es una ayuda a la decisión, con supuestos visibles |

## 5. Barreras y riesgos

- **Dato propio:** las reservas del marketplace (camiones por puerto y día) no existen en ninguna fuente pública. Cuanto más se usa, mejor pronostica.
- **Arranque del marketplace:** sin proveedores no hay asignación. Para arrancar sirven los contratistas y transportistas de la zona de demo, y las cooperativas como canal (marca blanca, como hace Hedgit con los originadores).
- **Participación mínima:** el pronóstico propio necesita una fracción del tráfico para ser confiable (hoy un supuesto de 5%). Mientras tanto, se completa con el dato publicado de camiones del día.
- **Licencias de datos:** se priorizan las fuentes oficiales (MAGyP para el line-up agregado, INA para el río). NABSA, la BCR, la pizarra y A3 quedan como complemento opcional, con permiso de uso a confirmar.
- **Responsabilidad:** se muestran los supuestos y las fuentes de cada número. La decisión es del productor.

## 6. Aliados posibles

| Aliado | Qué aporta | Cómo |
| --- | --- | --- |
| Circular / Muvin | Turno de descarga en terminal | Integración: el marketplace pide el turno con los camiones reservados |
| Cooperativas y acopios | Distribución y productores | Marca blanca del simulador |
| Wiagro / Silcheck / SiloReal | Lecturas de silobolsa | Fuente del puerto `LecturasIotPort` |
| MAGyP / INA | Line-up agregado y altura del río | Datos públicos oficiales |
| Contratistas y transportistas | Oferta del marketplace | Alta gratuita; reciben pedidos con fecha y lugar |

## 7. Guion de pitch (2 minutos)

1. **El problema (20 s):** "En abril, miles de camiones llegan juntos al puerto. El productor no lo ve venir: paga espera, flete caro y merma."
2. **La demo (60 s):** `npm run demo`
   - Lote de soja en Pergamino. Conviene el puerto por margen.
   - El puerto se satura del 12 al 16 de abril.
   - El sistema corre los camiones al 20-27 de abril, sin mover la cosecha.
   - El marketplace asigna cosechadoras, tolvas y camiones de la zona.
   - El productor confirma, y esos camiones ya cuentan en el pronóstico de los demás.
3. **Por qué ganamos (25 s):** "Hay apps de turnos, de sensores y de precios. Nadie une todo en una decisión de margen y la ejecuta. Y nadie sabe cuántos camiones van a ir antes de que salgan: nosotros sí, porque se reservan acá."
4. **Negocio (15 s):** gratis para el productor, comisión por servicio contratado, y el dato de saturación para acopios y exportadores.
