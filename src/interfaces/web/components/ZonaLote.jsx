import { Anchor, Droplets, Gauge, MapPin, Truck, Wheat, Wind } from 'lucide-react';

const numero = (valor, digitos = 0) => new Intl.NumberFormat('es-AR', { maximumFractionDigits: digitos }).format(valor);
const usd = (valor) => `US$ ${numero(valor, 2)}`;

const NOMBRE_RECURSO = { 'camión': 'Camiones', cosechadora: 'Cosechadoras', 'tractor con tolva': 'Tractores con tolva', embolsadora: 'Embolsadoras' };

function Dato({ icono: Icono, titulo, valor, detalle }) {
  return (
    <article className="zona-dato">
      <span className="zona-icono"><Icono size={17} aria-hidden="true" /></span>
      <div>
        <span className="zona-titulo">{titulo}</span>
        <strong>{valor}</strong>
        {detalle && <small>{detalle}</small>}
      </div>
    </article>
  );
}

// Todo lo que el sistema asumió para este lote sin pedirle nada al productor, con su origen.
export default function ZonaLote({ decision }) {
  const { zona, automatico, condiciones, economia } = decision;
  if (!zona && !automatico) return null;
  const camiones = zona?.fleteros?.porRecurso?.['camión'];
  const transporte = zona?.transporte;
  const supuestos = economia?.supuestos;

  return (
    <section className="panel zona" aria-label="Datos de la zona calculados automáticamente">
      <div className="section-heading">
        <div><span className="eyebrow">DATOS DE TU ZONA · AUTOMÁTICOS</span><h3>Con qué números se calculó todo</h3></div>
        <span className="status-pill">Se recalcula al abrir</span>
      </div>
      <div className="zona-grilla">
        {zona?.fleteros && (
          <Dato
            icono={Truck} titulo="Fleteros en la zona"
            valor={`${zona.fleteros.proveedores} proveedores`}
            detalle={Object.entries(zona.fleteros.porRecurso).map(([recurso, datos]) => `${NOMBRE_RECURSO[recurso] ?? recurso}: ${datos.unidades} u. (×${datos.precioRelativoMedio})`).join(' · ')}
          />
        )}
        {transporte && (
          <Dato
            icono={Gauge} titulo={`Transporte a ${transporte.distanciaKm} km`}
            valor={`${usd(transporte.costoUSDt)}/t · ${usd(transporte.costoUSDqq)}/qq`}
            detalle={`Tarifa CATAC ${usd(transporte.tarifaCatacUSDt)}/t × ${transporte.factorZona}${camiones ? ` (precio de los ${camiones.proveedores} transportistas de la zona)` : ''}. Estadía ${usd(transporte.estadiaUSDDia)}/día por camión.`}
          />
        )}
        {automatico?.acopio && (
          <Dato
            icono={Wheat} titulo="Acopio más cercano"
            valor={`${automatico.acopio.nombre} · ${automatico.acopio.distanciaKm} km`}
            detalle={`Recepción ${usd(automatico.acopio.tarifaRecepcionUSDt)}/t y paga ${usd(automatico.acopio.descuentoPrecioUSDt)}/t menos que la pizarra. Dato de ejemplo: aún no hay padrón oficial de acopios.`}
          />
        )}
        {automatico?.precios && (
          <Dato
            icono={Anchor} titulo={`Precio de referencia · ${automatico.puerto?.nombre ?? 'puerto'}`}
            valor={`${usd(automatico.precios.spotUSDt)}/t`}
            detalle={`${automatico.precios.fuente}. Rinde usado: ${automatico.rinde.qqHa} qq/ha (${automatico.rinde.origen}).`}
          />
        )}
        {condiciones && (
          <Dato
            icono={Droplets} titulo="Humedad y mermas del grano"
            valor={`Recibo hasta ${condiciones.humedadBaseRecibo} % · silobolsa hasta ${condiciones.humedadMaximaSilobolsa} %`}
            detalle={`Base de recibo de la norma de comercialización (Cámara Arbitral de Cereales, BCR). ${supuestos ? `Merma de manipuleo ${supuestos.mermaManipuleoPct} % por tramo; secado: merma ${supuestos.secadoMermaPorPuntoPct ?? 1.2} % por punto.` : ''}`}
          />
        )}
        {condiciones && (
          <Dato
            icono={Wind} titulo="Viento y humedad ideales de cosecha"
            valor={`Ráfagas bajo ${condiciones.viento.regularKmh} km/h · grano ${condiciones.cosechaOptima.minPct}–${condiciones.cosechaOptima.maxPct} %`}
            detalle={`${condiciones.nota} Referencia técnica general, no norma oficial.`}
          />
        )}
        <Dato
          icono={MapPin} titulo="Cuándo se cosecha"
          valor={decision.cosecha ? `${decision.cosecha.inicio} → ${decision.cosecha.fin}` : '—'}
          detalle={automatico?.fechaInicioCosecha ? `Centro de la ventana por siembra y ciclo: ${automatico.fechaInicioCosecha}; se ajusta por clima.` : undefined}
        />
      </div>
    </section>
  );
}
