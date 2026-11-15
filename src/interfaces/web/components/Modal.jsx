import { useEffect, useId } from 'react';
import { X } from 'lucide-react';

export default function Modal({ eyebrow, title, onClose, busy = false, wide = false, children }) {
  const titleId = useId();

  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  return (
    <div className="dialog-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) onClose();
    }}>
      <section className={`dialog-card${wide ? ' dialog-card--wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="dialog-heading">
          <div>
            {eyebrow && <span className="eyebrow">{eyebrow}</span>}
            <h2 id={titleId}>{title}</h2>
          </div>
          <button type="button" className="icon-button" aria-label="Cerrar" onClick={onClose} disabled={busy}><X size={18} /></button>
        </div>
        {children}
      </section>
    </div>
  );
}
