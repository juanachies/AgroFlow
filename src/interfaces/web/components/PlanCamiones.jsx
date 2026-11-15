import { useMemo, useState } from 'react';
import { Anchor, CalendarCheck, CheckCircle2, Star, Truck, Wheat } from 'lucide-react';
import ConfirmDialog from './ConfirmDialog.jsx';
import { armarPlanDeProveedores } from '../lib/logistica.js';

const numero = (valor, digitos = 0) => new Intl.NumberFormat('es-AR', { maximumFractionDigits: digitos }).format(valor);
const usd = (valor) => `US$ ${numero(valor)}`;
const fecha = (iso) => new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`));
const dosFechas = (desde, hasta) => (desde === hasta ? fecha(desde) : `${fecha(desde)} → ${fecha(hasta)}`);

const NOMBRE_RECURSO = { 'camión': 'Camiones', cosechadora: 'Cosechadoras', 'tractor con tolva': 'Tractores con tolva', embolsadora: 'Embolsadoras' };
const ESTADO_PUERTO = { fluido: 'Puerto fluido', cargado: 'Puerto cargado', saturado: 'Puerto saturado' };

function diasEntre(desde, hasta) {
  const dias = [];
  for (let t = Date.parse(`${desde}T12:00:00Z`); t <= Date.parse(`${hasta}T12:00:00Z`); t += 86400000) dias.push(new Date(t).toISOString().slice(0, 10));
  return dias;
}

function Kpi({ icono: Icono, etiqueta, valor, detalle }) {
  return (
    <article className="cam-kpi">
      <span className="cam-kpi-icono"><Icono size={17} aria-hidden="true" /></span>
      <div><span>{etiqueta}</span><strong>{valor}</strong>{detalle && <small>{detalle}</small>}</div>
    </article>
  );
}

function TablaProveedores({ grupos }) {
  return (
    <div className="cam-tabla-envoltorio">
      <table className="cam-tabla">
        <thead>
          <tr><th>Quién viene</th><th>Desde</th><th>Unidades</th><th>Km</th><th>Califica</th><th>Precio</th><th>Cuándo</th><th>Costo</th></tr>
        </thead>
        {grupos.map((grupo) => (
          <tbody key={grupo.recurso}>
            <tr className="cam-grupo"><th colSpan={8}>{grupo.etapa} · {NOMBRE_RECURSO[grupo.recurso] ?? grupo.recurso}</th></tr>
            {grupo.filas.map((fila) => (
              <tr key={`${fila.recurso}-${fila.proveedor}-${fila.desde}`}>
                <td><strong>{fila.proveedor}</strong></td>
                <td>{fila.localidad ?? '—'}</td>
                <td>{fila.unidades}</td>
                <td>{numero(fila.distanciaKm)}</td>
                <td>{fila.calificacion != null ? <span className="cam-estrella"><Star size={12} aria-hidden="true" />{fila.calificacion}</span> : '—'}</td>
                <td>×{fila.precioRelativo}</td>
                <td>{dosFechas(fila.desde, fila.hasta)}<small>reservar antes del {fecha(fila.pedirAntesDel)}</small></td>
                <td><strong>{usd(fila.costoUSD)}</strong></td>
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}

function CronogramaCamiones({ transporte, camionesPorDia, saturacionPorFecha }) {
  const dias = diasEntre(transporte.desde, transporte.hasta);
  return (
    <div className="cam-cronograma" role="list" aria-label="Camiones por día">
      {dias.map((dia) => {
        const estado = saturacionPorFecha.get(dia);
        return (
          <div key={dia} role="listitem" className={`cam-dia cam-dia--${estado ?? 'sin-dato'}`} title={`${fecha(dia)} · ${camionesPorDia} camiones${estado ? ` · ${ESTADO_PUERTO[estado] ?? estado}` : ''}`}>
            <span>{fecha(dia)}</span>
            <strong>{camionesPorDia}</strong>
            <small>camiones</small>
            {estado === 'saturado' && <em>puerto saturado</em>}
          </div>
        );
      })}
    </div>
  );
}

export default function PlanCamiones({ sim, ofertas, nombreLote, reservas = [], onConfirmar }) {
  const [confirmando, setConfirmando] = useState(false);
  const [aviso, setAviso] = useState('');
  const decision = sim.decision;
  const transporte = decision.transporte;
  const plan = useMemo(
    () => armarPlanDeProveedores({ asignacion: sim.asignacion, ofertas, toneladas: sim.plan.toneladas }),
    [sim, ofertas],
  );
  const saturacionPorFecha = useMemo(() => new Map((sim.saturacion?.dias ?? []).map((dia) => [dia.fecha, dia.estado])), [sim]);
  const camionesPorDia = sim.plan.recomendado.pedidos.find((p) => p.recurso === 'camión')?.cantidad ?? 0;
  const elegida = decision.economia?.grande?.elegida;
  const yaReservado = reservas.length > 0;
  const desplazamiento = sim.ventana?.desplazamientoDias ?? 0;

  async function confirmar() {
    await onConfirmar();
    setAviso('Reservas confirmadas: los camiones ya cuentan en el pronóstico de saturación del puerto.');
  }

  return (
    <section className="panel cam" aria-label={`Camiones y despacho de ${nombreLote ?? 'la campaña'}`}>
      <div className="section-heading">
        <div><span className="eyebrow">CAMIONES Y DESPACHO</span><h3>{nombreLote ? `${nombreLote}: quién viene, cuánto cuesta y cuándo se va a puerto` : 'Quién viene, cuánto cuesta y cuándo se va a puerto'}</h3></div>
        {plan.coberturaPct != null && <span className={`status-pill${plan.coberturaPct >= 100 ? '' : ' status-pill--muted'}`}>Cobertura {plan.coberturaPct}%</span>}
      </div>

      <div className="cam-decision">
        <div>
          <span className="eyebrow">DECISIÓN</span>
          <p className="cam-resumen">{decision.resumen}</p>
          {transporte ? (
            <ul className="cam-puntos">
              <li><Anchor size={14} aria-hidden="true" /> Llevar a <strong>{transporte.destino}</strong>: salen el <strong>{fecha(transporte.desde)}</strong> y terminan el <strong>{fecha(transporte.hasta)}</strong>.</li>
              {desplazamiento > 0 && <li><CalendarCheck size={14} aria-hidden="true" /> Se corrió la entrega {desplazamiento} días para evitar la cola del puerto: el grano espera en el campo.</li>}
              {elegida?.riesgo?.probLlegar != null && <li><CheckCircle2 size={14} aria-hidden="true" /> {Math.round(elegida.riesgo.probLlegar * 100)}% de probabilidad de llegar a tiempo al barco.</li>}
              {transporte.pedirAntesDel && <li><CalendarCheck size={14} aria-hidden="true" /> Reservar los camiones antes del <strong>{fecha(transporte.pedirAntesDel)}</strong>.</li>}
            </ul>
          ) : (
            <p className="cl-muted">La mejor opción para este lote no necesita camiones a puerto: el grano se queda en el campo.</p>
          )}
        </div>
        <div className="cam-accion">
          {yaReservado ? (
            <span className="cam-reservado"><CheckCircle2 size={16} aria-hidden="true" /> Reservas confirmadas</span>
          ) : (
            <button type="button" className="button button--primary" onClick={() => { setAviso(''); setConfirmando(true); }} disabled={!plan.filas.length}>Confirmar reservas</button>
          )}
          {!yaReservado && plan.filas.length > 0 && <small>{usd(plan.costoTotalUSD)} en {plan.filas.length} contrataciones</small>}
        </div>
      </div>
      {aviso && <p className="result-note">{aviso}</p>}

      {plan.filas.length > 0 && (
        <div className="cam-kpis">
          <Kpi icono={Truck} etiqueta="Camiones" valor={plan.camiones.unidades} detalle={`${plan.camiones.transportistas} transportistas · ${camionesPorDia} por día`} />
          <Kpi icono={Wheat} etiqueta="Costo del transporte" valor={usd(plan.camiones.costoUSD)} detalle={plan.camiones.costoUSDqq != null ? `US$ ${numero(plan.camiones.costoUSDqq, 2)}/qq · US$ ${numero(plan.camiones.costoUSDt, 2)}/t` : undefined} />
          <Kpi icono={CalendarCheck} etiqueta="Costo total contratado" valor={usd(plan.costoTotalUSD)} detalle="cosecha, tolvas, camiones y embolsado" />
          {transporte && <Kpi icono={Anchor} etiqueta="Salida a puerto" valor={fecha(transporte.desde)} detalle={`llegan hasta el ${fecha(transporte.hasta)}`} />}
        </div>
      )}

      {plan.grupos.length > 0 && <TablaProveedores grupos={plan.grupos} />}
      {plan.faltantes.map((falta) => (
        <p key={`${falta.recurso}-${falta.desde}`} className="pd-aviso pd-aviso--critico"><strong>Faltan {falta.faltan} {NOMBRE_RECURSO[falta.recurso] ?? falta.recurso}</strong> del {dosFechas(falta.desde, falta.hasta)}: ningún proveedor de la zona tiene disponibilidad.</p>
      ))}

      {transporte && camionesPorDia > 0 && (
        <div>
          <h4 className="eco-subtitulo">Cronograma de camiones al puerto</h4>
          <CronogramaCamiones transporte={transporte} camionesPorDia={camionesPorDia} saturacionPorFecha={saturacionPorFecha} />
        </div>
      )}

      {yaReservado && (
        <div>
          <h4 className="eco-subtitulo">Ya reservado para este lote</h4>
          <ul className="cam-reservas">
            {reservas.map((reserva) => (
              <li key={reserva.id}><CheckCircle2 size={14} aria-hidden="true" /><strong>{reserva.proveedor}</strong><span>{reserva.unidades} × {NOMBRE_RECURSO[reserva.recurso] ?? reserva.recurso}</span><span>{dosFechas(reserva.desde, reserva.hasta)}</span></li>
            ))}
          </ul>
        </div>
      )}

      {confirmando && (
        <ConfirmDialog
          title="Confirmar reservas"
          message={`Se reservan ${plan.filas.length} contrataciones (${plan.camiones.unidades} camiones de ${plan.camiones.transportistas} transportistas, más cosecha y embolsado) por ${usd(plan.costoTotalUSD)} para ${nombreLote ?? 'este lote'}. Los camiones a puerto pasan a contar en la saturación del puerto de todos los productores.`}
          confirmLabel="Confirmar reservas"
          onClose={() => setConfirmando(false)}
          onConfirm={confirmar}
        />
      )}
    </section>
  );
}
