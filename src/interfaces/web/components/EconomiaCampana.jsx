import { Anchor, Gauge, PiggyBank, Rocket, ShieldCheck, Trophy, Truck, Wheat } from 'lucide-react';

const numero = (valor, digitos = 0) => new Intl.NumberFormat('es-AR', { maximumFractionDigits: digitos }).format(valor);
const usd = (valor) => `${valor < 0 ? '−' : ''}US$ ${numero(Math.abs(valor))}`;
const usdQq = (valor) => `US$ ${numero(valor, 2)}/qq`;
const fecha = (iso) => new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`));

const NOMBRE_MODALIDAD = { puerto: 'Puerto directo', acopio: 'Acopio', silobolsa: 'Silobolsa' };
const ICONO_MODALIDAD = { puerto: Anchor, acopio: Wheat, silobolsa: PiggyBank };

const NIVEL_RIESGO = {
  bajo: { texto: 'Riesgo bajo', clase: 'ok' },
  medio: { texto: 'Riesgo medio', clase: 'warn' },
  alto: { texto: 'Riesgo alto', clase: 'bad' },
  'sin-dato': { texto: 'Riesgo sin dato', clase: 'none' },
};

function segmentos(modalidad) {
  const { costos, merma } = modalidad;
  return [
    { clave: 'neta', etiqueta: 'Ganancia neta', valor: Math.max(0, modalidad.gananciaNetaUSD), color: '#16a34a' },
    { clave: 'cosecha', etiqueta: 'Cosecha', valor: costos.cosecha, color: '#d97706' },
    { clave: 'transporte', etiqueta: 'Transporte', valor: costos.transporte, color: '#2563eb' },
    { clave: 'almacenaje', etiqueta: 'Almacenaje y servicios', valor: costos.almacenaje + costos.otros, color: '#0d9488' },
    { clave: 'secado', etiqueta: 'Secado del grano', valor: costos.secado ?? 0, color: '#ca8a04' },
    { clave: 'espera', etiqueta: 'Espera y riesgo de perder el barco', valor: costos.espera + costos.riesgoBarco + costos.guardarEnCampo, color: '#7c3aed' },
    { clave: 'financiero', etiqueta: 'Costo financiero', valor: costos.financiero, color: '#64748b' },
    { clave: 'merma', etiqueta: 'Merma y desperdicio', valor: merma.usd, color: '#dc2626' },
  ];
}

function BarraDeDinero({ modalidad }) {
  const partes = segmentos(modalidad);
  const total = partes.reduce((suma, parte) => suma + parte.valor, 0) || 1;
  const qq = modalidad.qqCosechados;
  return (
    <div className="eco-dinero">
      <div className="eco-barra" role="img" aria-label="Cómo se reparte el valor de la cosecha">
        {partes.filter((parte) => parte.valor > 0).map((parte) => (
          <span key={parte.clave} style={{ width: `${(parte.valor / total) * 100}%`, background: parte.color }} title={`${parte.etiqueta}: ${usd(parte.valor)}`} />
        ))}
      </div>
      <ul className="eco-desglose">
        {partes.map((parte) => (
          <li key={parte.clave} className={parte.clave === 'neta' ? 'is-neta' : ''}>
            <i style={{ background: parte.color }} />
            <span>{parte.etiqueta}</span>
            <strong>{usd(parte.clave === 'neta' ? modalidad.gananciaNetaUSD : parte.valor)}</strong>
            <small>{usdQq((parte.clave === 'neta' ? modalidad.gananciaNetaUSD : parte.valor) / qq)}</small>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Riesgo({ riesgo }) {
  const nivel = NIVEL_RIESGO[riesgo.nivel] ?? NIVEL_RIESGO['sin-dato'];
  return (
    <span className={`cl-risk cl-risk--${nivel.clase}`}>
      {riesgo.probLlegar == null ? nivel.texto : `${Math.round(riesgo.probLlegar * 100)}% de llegar al barco`}
    </span>
  );
}

function TarjetaEstrategia({ estrategia, tipo }) {
  const m = estrategia.elegida;
  const rapida = tipo === 'rapida';
  const Icono = rapida ? Rocket : Trophy;
  return (
    <article className={`eco-card eco-card--${tipo}`}>
      <header>
        <span className="eco-card-icono"><Icono size={20} aria-hidden="true" /></span>
        <div>
          <span className="eyebrow">{rapida ? 'GANANCIA MÁS RÁPIDA' : 'GANANCIA MÁS GRANDE'}</span>
          <h4>{rapida ? 'Cosechar y cobrar cuanto antes' : 'Maximizar la ganancia con poco riesgo'}</h4>
        </div>
      </header>
      <div className="eco-total">
        <strong>{usd(m.gananciaNetaUSD)}</strong>
        <span>ganancia neta · {usdQq(m.porQq.gananciaUSD)}</span>
      </div>
      <dl className="eco-fechas">
        <div><dt>Cosecha</dt><dd>{fecha(estrategia.cosecha.inicio)} → {fecha(estrategia.cosecha.fin)}</dd></div>
        <div><dt>Vendés por</dt><dd>{NOMBRE_MODALIDAD[m.tipo]}{m.mesesGuardado ? ` (${m.mesesGuardado} meses)` : ''}</dd></div>
        <div><dt>Cobrás</dt><dd>{fecha(m.fechaCobro)} · en {m.diasHastaCobro} días</dd></div>
        <div><dt>Ingreso bruto</dt><dd>{usd(m.ingresoBrutoUSD)} · {usdQq(m.porQq.ingresoUSD)}</dd></div>
        <div><dt>Ganancia bruta</dt><dd>{usd(m.gananciaBrutaUSD)}</dd></div>
        <div><dt>Costo total</dt><dd>{usd(m.costoTotalUSD)} · {usdQq(m.porQq.costoUSD)}</dd></div>
      </dl>
      <div className="eco-riesgo">
        <ShieldCheck size={15} aria-hidden="true" /><Riesgo riesgo={m.riesgo} />
        <span className="eco-merma"><Gauge size={14} aria-hidden="true" /> Merma {numero(m.merma.totalPct, 2)}% = {numero(m.merma.qq)} qq ({usd(m.merma.usd)})</span>
      </div>
      <BarraDeDinero modalidad={m} />
    </article>
  );
}

function CurvaSilobolsa({ curva, referencia }) {
  const valores = [...curva.map((p) => p.gananciaNetaUSD), referencia];
  const minimo = Math.min(...valores);
  const maximo = Math.max(...valores);
  const alto = maximo - minimo || 1;
  const x = (i) => 8 + (i / Math.max(1, curva.length - 1)) * 184;
  const y = (v) => 8 + (1 - (v - minimo) / alto) * 44;
  return (
    <svg className="eco-curva" viewBox="0 0 200 60" role="img" aria-label="Ganancia neta de la silobolsa según los meses guardada">
      <line x1="8" x2="192" y1={y(referencia)} y2={y(referencia)} className="eco-curva-ref" />
      <polyline points={curva.map((p, i) => `${x(i)},${y(p.gananciaNetaUSD)}`).join(' ')} className="eco-curva-linea" />
      {curva.map((p, i) => <circle key={p.meses} cx={x(i)} cy={y(p.gananciaNetaUSD)} r="2.6"><title>{`${p.meses} mes(es): ${usd(p.gananciaNetaUSD)}`}</title></circle>)}
    </svg>
  );
}

function ColumnaModalidad({ modalidad }) {
  const Icono = ICONO_MODALIDAD[modalidad.tipo] ?? Anchor;
  const silo = modalidad.silobolsa;
  return (
    <article className={`eco-col${modalidad.elegida ? ' is-elegida' : ''}`}>
      <header><Icono size={18} aria-hidden="true" /><h4>{NOMBRE_MODALIDAD[modalidad.tipo]}</h4>{modalidad.elegida && <span className="status-pill">Recomendada</span>}</header>
      <strong className="eco-col-neta">{usd(modalidad.gananciaNetaUSD)}</strong>
      <span className="eco-col-qq">{usdQq(modalidad.porQq.gananciaUSD)} · costo {usdQq(modalidad.porQq.costoUSD)}</span>
      <ul>
        <li><span>Cobrás</span><b>{fecha(modalidad.fechaCobro)} ({modalidad.diasHastaCobro} días)</b></li>
        <li><span>Merma</span><b>{numero(modalidad.merma.totalPct, 2)}% · {numero(modalidad.merma.qq)} qq</b></li>
        <li><span>Riesgo</span><b><Riesgo riesgo={modalidad.riesgo} /></b></li>
        <li><span>Frente a la peor opción</span><b className="eco-pos">{modalidad.ahorroVsPeorUSD > 0 ? `+${usd(modalidad.ahorroVsPeorUSD)}` : 'Es la peor'}</b></li>
      </ul>
      {modalidad.humedad?.granoPct != null && (
        <p className="eco-humedad">
          Grano ~{numero(modalidad.humedad.granoPct, 1)} % de humedad
          {modalidad.humedad.objetivoPct != null ? ` (base ${numero(modalidad.humedad.objetivoPct, 1)} %)` : ''}
          {modalidad.humedad.puntosASecar > 0 ? `: hay que sacar ${numero(modalidad.humedad.puntosASecar, 1)} puntos` : ': no necesita secado'}.
          {modalidad.tipo === 'silobolsa' && modalidad.humedad.exceso > 0 && !modalidad.humedad.secarAntes ? ' Embolsarlo así sube el riesgo y la merma mensual.' : ''}
        </p>
      )}
      {silo && (
        <div className="eco-silo">
          <CurvaSilobolsa curva={modalidad.curvaSilobolsa} referencia={modalidad.gananciaNetaUSD - silo.extraVsVenderYaUSD} />
          <p>
            {silo.mesesParaMejorar
              ? `El precio compensa el costo de guardar desde el mes ${silo.mesesParaMejorar}: podés ganar ${usd(silo.extraVsVenderYaUSD)} más que vendiendo ya.`
              : `En este escenario guardar no compensa: rinde ${usd(Math.abs(silo.extraVsVenderYaUSD))} menos que vender al cosechar. La línea punteada es vender ya.`}
          </p>
        </div>
      )}
    </article>
  );
}

function AhorroDecision({ icono: Icono, titulo, ahorro, detalle, nota }) {
  return (
    <article className="eco-ahorro">
      <span className="eco-card-icono"><Icono size={18} aria-hidden="true" /></span>
      <div>
        <span className="eyebrow">{titulo}</span>
        <strong>{ahorro > 0 ? `Ahorrás ${usd(ahorro)}` : 'Sin diferencia en este lote'}</strong>
        <small>{detalle}</small>
        <small>{nota}</small>
      </div>
    </article>
  );
}

export default function EconomiaCampana({ economia, nombreLote }) {
  const { rapida, grande, comparacion, supuestos } = economia;
  const { decisiones } = comparacion;
  return (
    <section className="panel eco" aria-label={`Economía de ${nombreLote ?? 'la campaña'}`}>
      <div className="section-heading">
        <div><span className="eyebrow">CUÁNTO GANÁS</span><h3>{nombreLote ? `${nombreLote}: dos caminos, una decisión` : 'Dos caminos, una decisión'}</h3></div>
      </div>

      <div className="eco-versus">
        <TarjetaEstrategia estrategia={rapida} tipo="rapida" />
        <TarjetaEstrategia estrategia={grande} tipo="grande" />
      </div>

      <p className={`cl-highlight eco-delta${comparacion.coinciden ? ' is-igual' : ''}`}>
        {comparacion.coinciden
          ? 'En este lote el camino más rápido también es el de mayor ganancia: las dos opciones coinciden.'
          : comparacion.gananciaExtraUSD > 0
            ? <>Esperar al camino más grande te deja <strong>{usd(comparacion.gananciaExtraUSD)} más</strong>{comparacion.gananciaExtraPct != null ? ` (+${numero(comparacion.gananciaExtraPct, 1)}%)` : ''}, cobrando {Math.abs(comparacion.diasMasLentoQueRapida)} días {comparacion.diasMasLentoQueRapida >= 0 ? 'después' : 'antes'} que el rápido.</>
            : 'El camino más rápido rinde igual o más que esperar.'}
      </p>

      <div>
        <h4 className="eco-subtitulo">Cada decisión: cuánto se ahorra</h4>
        <div className="eco-ahorros">
          <AhorroDecision
            icono={Wheat} titulo="1 · COSECHA" ahorro={decisiones.cosecha.ahorroUSD}
            detalle={`Elegida ${usd(decisiones.cosecha.costoElegidoUSD)} vs. terminar antes ${usd(decisiones.cosecha.costoRapidoUSD)}`} nota={decisiones.cosecha.nota}
          />
          <AhorroDecision
            icono={Truck} titulo="2 · TRANSPORTE" ahorro={decisiones.transporte.ahorroUSD}
            detalle={`Costo total elegido ${usd(decisiones.transporte.costoElegidoUSD)}`} nota={decisiones.transporte.nota}
          />
          <AhorroDecision
            icono={PiggyBank} titulo="3 · ALMACENAJE" ahorro={decisiones.almacenaje.ahorroUSD}
            detalle={`Elegida ${usd(decisiones.almacenaje.gananciaElegidaUSD)} vs. peor ${usd(decisiones.almacenaje.gananciaPeorUSD)}`} nota={decisiones.almacenaje.nota}
          />
        </div>
      </div>

      <div>
        <h4 className="eco-subtitulo">Dónde guardar o vender: puerto, acopio o silobolsa</h4>
        <div className="eco-cols">
          {[...grande.modalidades].sort((a, b) => b.gananciaNetaUSD - a.gananciaNetaUSD).map((modalidad) => <ColumnaModalidad key={modalidad.tipo} modalidad={modalidad} />)}
        </div>
      </div>

      <p className="cl-muted">
        Precios: {economia.fuentePrecios}. Supuestos editables: costo financiero {numero(supuestos.tasaAnual * 100)}% anual,
        merma de manipuleo {supuestos.mermaManipuleoPct}% por tramo, silobolsa {supuestos.mermaSilobolsaMensualPct}% por mes,
        espera en puerto US$ {supuestos.costoEsperaUSDtDia}/t/día y {supuestos.diasPerdidaBarco} días de espera si el barco se va.
        Son estimaciones para decidir, no una cotización ni una garantía de resultado.
      </p>
    </section>
  );
}
