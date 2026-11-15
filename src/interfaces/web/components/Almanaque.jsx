import { AlertTriangle, Anchor, CalendarCheck, Info, Truck, Wheat } from 'lucide-react';

const SEMANA = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const NOMBRE_MES = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const NOMBRE_DIA = new Intl.DateTimeFormat('es-AR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

const aFecha = (iso) => new Date(`${iso}T12:00:00Z`);
const fecha = (iso, formato = NOMBRE_DIA) => formato.format(aFecha(iso));
const dosDigitos = (n) => String(n).padStart(2, '0');

const ESTADO_CLIMA = {
  bueno: 'Día favorable',
  regular: 'Condiciones regulares',
  malo: 'Condiciones adversas',
  desconocido: 'Sin dato de clima',
};
const FUENTE_CLIMA = { pronostico: 'pronóstico', climatologia: 'frecuencia histórica', 'sin-dato': 'sin dato' };

const ICONO_CLAVE = { pedir: CalendarCheck, 'inicio-cosecha': Wheat, 'fin-cosecha': Wheat, 'inicio-transporte': Truck, 'fin-transporte': Truck };

function mesesDelRango(dias) {
  const meses = new Map();
  for (const dia of dias) {
    const clave = dia.fecha.slice(0, 7);
    if (!meses.has(clave)) meses.set(clave, { clave, anio: Number(clave.slice(0, 4)), mes: Number(clave.slice(5, 7)) });
  }
  return [...meses.values()];
}

function celdasDelMes({ anio, mes }) {
  const primero = new Date(Date.UTC(anio, mes - 1, 1));
  const cantidad = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  const huecos = (primero.getUTCDay() + 6) % 7;
  return [
    ...Array.from({ length: huecos }, () => null),
    ...Array.from({ length: cantidad }, (_, i) => `${anio}-${dosDigitos(mes)}-${dosDigitos(i + 1)}`),
  ];
}

function descripcionDelDia(dia) {
  const partes = [fecha(dia.fecha), `${ESTADO_CLIMA[dia.clima.apto]} (${FUENTE_CLIMA[dia.clima.fuente]})`];
  if (dia.clima.fuente === 'pronostico' && dia.clima.lluviaMm != null) partes.push(`${dia.clima.lluviaMm} mm`);
  if (dia.clima.fuente === 'climatologia' && dia.clima.probFuerte != null) partes.push(`${Math.round(dia.clima.probFuerte * 100)}% de probabilidad de lluvia fuerte`);
  if (dia.clima.rafagaKmh != null) partes.push(`ráfagas ${Math.round(dia.clima.rafagaKmh)} km/h`);
  if (dia.clima.probRafaga != null) partes.push(`${Math.round(dia.clima.probRafaga * 100)}% de probabilidad de viento fuerte`);
  if (dia.clima.humedadGranoPct != null) partes.push(`grano ~${dia.clima.humedadGranoPct} % de humedad`);
  if (dia.clima.motivos?.length) partes.push(dia.clima.motivos.join(', '));
  if (dia.cosecha) partes.push('cosecha');
  if (dia.transporte) partes.push('transporte');
  if (dia.pedir) partes.push('último día para reservar');
  if (dia.saturacion === 'saturado') partes.push('puerto saturado');
  return partes.join(' · ');
}

function Dia({ dia, decision }) {
  const { cosecha, transporte } = decision;
  const clases = [
    'alm-dia',
    `alm-dia--${dia.clima.apto}`,
    dia.cosecha && 'is-cosecha',
    dia.fecha === cosecha.inicio && 'is-cosecha-inicio',
    dia.fecha === cosecha.fin && 'is-cosecha-fin',
    dia.transporte && 'is-transporte',
    transporte && dia.fecha === transporte.desde && 'is-transporte-inicio',
    transporte && dia.fecha === transporte.hasta && 'is-transporte-fin',
  ].filter(Boolean).join(' ');
  return (
    <div className={clases} title={descripcionDelDia(dia)}>
      <span className="alm-numero">{Number(dia.fecha.slice(8))}</span>
      <span className="alm-marcas">
        {dia.fecha === cosecha.inicio && <Wheat size={12} aria-label="Empieza la cosecha" />}
        {transporte && dia.fecha === transporte.desde && <Truck size={12} aria-label="Empieza el transporte" />}
        {dia.pedir && <CalendarCheck size={12} aria-label="Último día para reservar" />}
        {dia.saturacion === 'saturado' && <Anchor size={12} aria-label="Puerto saturado" />}
      </span>
      <span className="alm-barra alm-barra--cosecha" />
      <span className="alm-barra alm-barra--transporte" />
    </div>
  );
}

function Mes({ mes, porFecha, decision }) {
  return (
    <div className="alm-mes">
      <h4>{NOMBRE_MES.format(aFecha(`${mes.clave}-01`))}</h4>
      <div className="alm-semana" aria-hidden="true">{SEMANA.map((letra) => <span key={letra}>{letra}</span>)}</div>
      <div className="alm-grilla">
        {celdasDelMes(mes).map((iso, indice) => {
          if (!iso) return <span key={`hueco-${indice}`} />;
          const dia = porFecha.get(iso);
          return dia
            ? <Dia key={iso} dia={dia} decision={decision} />
            : <div key={iso} className="alm-dia alm-dia--fuera"><span className="alm-numero">{Number(iso.slice(8))}</span></div>;
        })}
      </div>
    </div>
  );
}

function Rangos({ decision }) {
  const { cosecha, transporte, almacenaje } = decision;
  return (
    <div className="alm-rangos">
      <div className="alm-rango alm-rango--cosecha">
        <Wheat size={18} aria-hidden="true" />
        <div><span>Cosecha</span><strong>{fecha(cosecha.inicio)} → {fecha(cosecha.fin)}</strong><small>{cosecha.dias} días · {cosecha.diasBuenos} favorables, {cosecha.diasRegulares} regulares, {cosecha.diasMalos} adversos{cosecha.humedadGranoPct != null ? ` · grano ~${cosecha.humedadGranoPct} %` : ''}</small></div>
      </div>
      {transporte && (
        <div className="alm-rango alm-rango--transporte">
          <Truck size={18} aria-hidden="true" />
          <div><span>Transporte</span><strong>{fecha(transporte.desde)} → {fecha(transporte.hasta)}</strong><small>{transporte.camiones} camiones a {transporte.destino}{transporte.distanciaKm ? ` · ${transporte.distanciaKm} km` : ''}</small></div>
        </div>
      )}
      <div className="alm-rango alm-rango--almacenaje">
        <Anchor size={18} aria-hidden="true" />
        <div><span>Almacenaje</span><strong>{almacenaje.modalidad}</strong><small>{almacenaje.detalle}</small></div>
      </div>
    </div>
  );
}

function DiasClave({ diasClave }) {
  return (
    <ol className="alm-claves">
      {diasClave.map((clave) => {
        const Icono = ICONO_CLAVE[clave.tipo] ?? Info;
        return (
          <li key={`${clave.tipo}-${clave.fecha}`} className={`alm-clave alm-clave--${clave.tipo}`}>
            <span className="alm-clave-icono"><Icono size={15} aria-hidden="true" /></span>
            <div><strong>{clave.titulo}</strong><small>{fecha(clave.fecha)}{clave.detalle ? ` · ${clave.detalle}` : ''}</small></div>
          </li>
        );
      })}
    </ol>
  );
}

export default function Almanaque({ decision, nombreLote }) {
  const porFecha = new Map(decision.almanaque.map((dia) => [dia.fecha, dia]));
  const meses = mesesDelRango(decision.almanaque);
  const usaHistorico = decision.almanaque.some((dia) => dia.clima.fuente === 'climatologia');
  return (
    <section className="panel alm" aria-label={`Almanaque de ${nombreLote ?? 'la campaña'}`}>
      <div className="section-heading">
        <div><span className="eyebrow">ALMANAQUE DE LA CAMPAÑA</span><h3>{nombreLote ? `${nombreLote}: cuándo cosechar y transportar` : 'Cuándo cosechar y transportar'}</h3></div>
      </div>
      <p className="cl-highlight">{decision.resumen}</p>
      <Rangos decision={decision} />
      <div className="alm-cuerpo">
        <div className="alm-meses">{meses.map((mes) => <Mes key={mes.clave} mes={mes} porFecha={porFecha} decision={decision} />)}</div>
        <div className="alm-lateral">
          <h4>Días clave</h4>
          <DiasClave diasClave={decision.diasClave} />
          <div className="alm-leyenda" aria-label="Referencias">
            <span><i className="alm-chip alm-chip--bueno" />Día favorable</span>
            <span><i className="alm-chip alm-chip--regular" />Regular (lluvia leve, viento o humedad)</span>
            <span><i className="alm-chip alm-chip--malo" />Adverso (lluvia o viento fuerte, grano húmedo)</span>
            <span><i className="alm-chip alm-chip--desconocido" />Sin dato</span>
            <span><i className="alm-chip alm-chip--cosecha" />Rango de cosecha</span>
            <span><i className="alm-chip alm-chip--transporte" />Rango de transporte</span>
          </div>
        </div>
      </div>
      {decision.alertas.length > 0 && (
        <ul className="alm-alertas">
          {decision.alertas.map((alerta) => (
            <li key={alerta.mensaje} className={`alm-alerta alm-alerta--${alerta.nivel}`}>
              {alerta.nivel === 'info' ? <Info size={15} aria-hidden="true" /> : <AlertTriangle size={15} aria-hidden="true" />}
              <span>{alerta.mensaje}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="cl-muted">
        {usaHistorico
          ? 'Los días con "frecuencia histórica" no son un pronóstico: indican qué tan seguido llovió fuerte en esa fecha en los últimos 10 años. Se reemplazan por el pronóstico a medida que se acercan.'
          : 'Clima: pronóstico de Open-Meteo. No mide la transitabilidad del lote.'}
      </p>
    </section>
  );
}
