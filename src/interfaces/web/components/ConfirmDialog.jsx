import { useState } from 'react';
import Modal from './Modal.jsx';

export default function ConfirmDialog({ title, message, confirmLabel = 'Confirmar', onConfirm, onClose }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function confirm() {
    setBusy(true);
    setError('');
    try {
      await onConfirm();
      onClose();
    } catch (reason) {
      setError(reason.message || 'No se pudo completar la acción.');
      setBusy(false);
    }
  }

  return (
    <Modal title={title} onClose={onClose} busy={busy}>
      <p className="dialog-message">{message}</p>
      {error && <div className="form-error" role="alert">{error}</div>}
      <div className="dialog-actions">
        <button type="button" className="button button--secondary" onClick={onClose} disabled={busy}>Cancelar</button>
        <button type="button" className="button button--danger" onClick={confirm} disabled={busy}>{busy ? 'Procesando…' : confirmLabel}</button>
      </div>
    </Modal>
  );
}
