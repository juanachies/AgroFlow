import { useEffect, useRef, useState } from 'react';
import { Bot, MessageCircle, SendHorizontal, Sparkles, X } from 'lucide-react';
import { api } from '../lib/api.js';
import { nombreCultivo, ventanaDelLote } from '../lib/data.js';

// Asistente de AgroFlow: entiende intenciones simples y responde con datos reales de la API
// y de los lotes guardados. No usa un modelo de lenguaje (se puede conectar uno más adelante).

const SUGGESTIONS = ['¿Cómo está el puerto?', 'Camiones disponibles', '¿Cuándo cosecho?', 'Cómo dibujo mi lote'];
const RECURSOS = [
  [/cami[oó]n|transport|flete/, 'camión'],
  [/cosechador|contratist/, 'cosechadora'],
  [/tolva|tractor/, 'tractor con tolva'],
  [/embolsador|silobolsa/, 'embolsadora'],
];
const fmt = (v, d = 0) => new Intl.NumberFormat('es-AR', { maximumFractionDigits: d }).format(v);
const fmtDate = (v) => new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${v}T12:00:00Z`));
const normalize = (text) => text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

async function answer(text, { lots, selectedLot, onNavigate }) {
  const q = normalize(text);
  const lot = selectedLot;

  if (/puerto|saturac|cola|rosario/.test(q)) {
    const hoy = new Date().toISOString().slice(0, 10);
    const { dias } = await api.saturacion({ puerto: 'gran-rosario', cultivo: lot?.crop ?? 'soja', hoy });
    const saturados = dias.filter((d) => d.estado === 'saturado');
    const cargados = dias.filter((d) => d.estado === 'cargado');
    if (!saturados.length && !cargados.length) return 'Gran Rosario se ve fluido los próximos 60 días según las reservas actuales. 🟢';
    const primero = (saturados[0] ?? cargados[0]).fecha;
    return `En los próximos 60 días Gran Rosario tiene ${saturados.length} días saturados y ${cargados.length} cargados. El primer día complicado es el ${fmtDate(primero)}. Simulá tu plan para correr el despacho a días fluidos.`;
  }

  const recurso = RECURSOS.find(([re]) => re.test(q))?.[1];
  if (recurso || /oferta|proveedor|marketplace|maquinaria/.test(q)) {
    const { ofertas } = await api.ofertas(recurso ? { recurso } : {});
    if (!ofertas.length) return `No hay ofertas publicadas${recurso ? ` de ${recurso}` : ''} por ahora.`;
    const unidades = ofertas.reduce((t, o) => t + o.unidades, 0);
    const barata = [...ofertas].sort((a, b) => a.precioRelativo - b.precioRelativo)[0];
    return `Hay ${ofertas.length} ofertas${recurso ? ` de ${recurso}` : ''} con ${fmt(unidades)} unidades en total. La más económica es ${barata.proveedor} (${barata.base.localidad ?? 'sin localidad'}), ${fmt((barata.precioRelativo - 1) * 100)}% vs. la tarifa de referencia. Las ves todas en Marketplace.`;
  }

  if (/cosech|ventana|cuando/.test(q)) {
    if (!lot) return 'Primero cargá o seleccioná un lote para estimar la ventana de cosecha.';
    const v = ventanaDelLote(lot);
    if (!v) return `${lot.name} no tiene fecha de siembra cargada.`;
    return `Para ${lot.name} (${nombreCultivo(lot.crop)}) la ventana estimada va del ${fmtDate(v.inicio)} al ${fmtDate(v.fin)}, con centro el ${fmtDate(v.optimo)}. Es orientativa: depende del ciclo declarado (${lot.cycleDays} días).`;
  }

  if (/dibuj|poligono|limite|superficie|hectar|mapa|medir/.test(q)) {
    onNavigate('lots');
    const total = lots.reduce((t, l) => t + l.areaHa, 0);
    return `Te llevé a “Lotes y mapa”. Tocá “Dibujar lote”, marcá cada esquina sobre el satélite y cerrá en el primer punto: la superficie se calcula al instante y podés arrastrar los vértices para ajustarla.${lots.length ? ` Hoy tenés ${lots.length} lotes y ${fmt(total, 1)} ha en total.` : ''}`;
  }

  if (/plan|simul|margen|destino|vender/.test(q)) {
    onNavigate('despacho');
    return 'Abrí Plan y despacho: elegí rinde, días disponibles y precios de cada destino, y AgroFlow te dice dónde conviene vender, qué maquinaria pedir y qué proveedores reservar.';
  }

  if (/hola|buenas|ayuda|que podes/.test(q)) {
    return 'Hola 👋 Puedo contarte cómo está el puerto, qué maquinaria hay disponible, cuándo cosechar tu lote o ayudarte a dibujar el campo en el mapa.';
  }

  return 'Todavía no sé responder eso. Probá preguntarme por el puerto, camiones o cosechadoras disponibles, la ventana de cosecha o cómo dibujar tu lote.';
}

export default function ChatBubble(context) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState([
    { from: 'bot', text: 'Soy el asistente de AgroFlow. Preguntame por el puerto, el marketplace o tus lotes.' },
  ]);
  const listRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    if (open) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  async function send(text) {
    const content = text.trim();
    if (!content || busy) return;
    setInput('');
    setMessages((m) => [...m, { from: 'user', text: content }]);
    setBusy(true);
    let reply;
    try {
      reply = await answer(content, context);
    } catch (error) {
      reply = `No pude consultar la API: ${error.message}`;
    }
    setMessages((m) => [...m, { from: 'bot', text: reply }]);
    setBusy(false);
  }

  return (
    <>
      {open && (
        <section className="chat-panel" role="dialog" aria-label="Asistente AgroFlow">
          <header className="chat-head">
            <span className="chat-avatar"><Sparkles size={16} aria-hidden="true" /></span>
            <div><strong>Asistente AgroFlow</strong><small><i className="live-dot" /> Conectado a tus datos</small></div>
            <button type="button" className="icon-button" aria-label="Cerrar chat" onClick={() => setOpen(false)}><X size={18} /></button>
          </header>
          <div className="chat-messages" ref={listRef} aria-live="polite">
            {messages.map((m, i) => (
              <div key={i} className={`chat-msg chat-msg--${m.from}`}>
                {m.from === 'bot' && <span className="chat-msg-icon"><Bot size={14} aria-hidden="true" /></span>}
                <p>{m.text}</p>
              </div>
            ))}
            {busy && <div className="chat-msg chat-msg--bot"><span className="chat-msg-icon"><Bot size={14} /></span><p className="typing"><i /><i /><i /></p></div>}
          </div>
          <div className="chat-suggestions">
            {SUGGESTIONS.map((s) => <button type="button" key={s} onClick={() => send(s)} disabled={busy}>{s}</button>)}
          </div>
          <form className="chat-input" onSubmit={(e) => { e.preventDefault(); send(input); }}>
            <input ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} placeholder="Escribí tu consulta…" aria-label="Mensaje" maxLength={300} />
            <button type="submit" className="chat-send" aria-label="Enviar" disabled={!input.trim() || busy}><SendHorizontal size={17} /></button>
          </form>
        </section>
      )}
      <button type="button" className={`chat-fab${open ? ' is-open' : ''}`} onClick={() => setOpen((v) => !v)} aria-label={open ? 'Cerrar asistente' : 'Abrir asistente'} aria-expanded={open}>
        {open ? <X size={24} /> : <MessageCircle size={24} />}
      </button>
    </>
  );
}
