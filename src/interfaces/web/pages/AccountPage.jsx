import { useState } from 'react';
import AccountDetailsForm from '../components/AccountDetailsForm.jsx';
import { accountApi } from '../lib/accountApi.js';

const ROLE_LABELS = { productor: 'Dueño/a de campo', prestador: 'Prestador/a de servicios' };
const SERVICE_LABELS = {
  transporte: 'Transporte',
  almacenamiento: 'Almacenamiento',
  maquinaria: 'Maquinaria',
};
const PRICE_LABELS = {
  por_viaje: 'por viaje',
  por_km: 'por km',
  por_dia: 'por día',
  por_tonelada: 'por tonelada',
  por_tonelada_mes: 'por tonelada / mes',
  por_tonelada_dia: 'por tonelada / día',
  por_hectarea: 'por hectárea',
  por_hora: 'por hora',
};
const CAPACITY_LABELS = {
  toneladas: 'toneladas',
  hectareas_dia: 'ha/día',
  hectareas: 'hectáreas',
  metros_cubicos: 'm³',
};

function FieldForm({ profile, onSave, onCancel }) {
  return (
    <AccountDetailsForm
      initial={{ profile, role: 'productor' }}
      allowRoleChange={false}
      submitLabel="Agregar campo"
      onCancel={onCancel}
      onSubmit={async (payload) => onSave(payload.field)}
    />
  );
}

export default function AccountPage({ user, account, onAccountChange, onSignOut, guest = false }) {
  const [editing, setEditing] = useState(false);
  const [addingField, setAddingField] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function updateAccount(payload) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await accountApi.updateProfile({ displayName: payload.displayName, phone: payload.phone });
      if (account.profile.role === 'productor' && payload.field) {
        const field = account.fields[0];
        if (field) await accountApi.updateField(field.id, payload.field);
        else await accountApi.createField(payload.field);
      }
      if (account.profile.role === 'prestador' && payload.offering) {
        await accountApi.saveOffering(payload.offering);
      }
      onAccountChange(await accountApi.get());
      setEditing(false);
      setNotice('Los cambios de tu cuenta se guardaron.');
    } catch (reason) {
      setError(reason.message || 'No se pudieron guardar los cambios.');
    } finally {
      setBusy(false);
    }
  }

  async function addField(field) {
    await accountApi.createField(field);
    onAccountChange(await accountApi.get());
    setAddingField(false);
    setNotice('Campo agregado a tu cuenta.');
  }

  async function removeField(field) {
    if (!window.confirm(`¿Eliminar el campo “${field.name}” de tu cuenta?`)) return;
    setBusy(true);
    setError('');
    try {
      await accountApi.deleteField(field.id);
      onAccountChange(await accountApi.get());
      setNotice('Campo eliminado.');
    } catch (reason) {
      setError(reason.message || 'No se pudo eliminar el campo.');
    } finally {
      setBusy(false);
    }
  }

  if (guest) {
    return (
      <div className="account-page">
        <div className="page-intro">
          <div>
            <span className="eyebrow">TU PERFIL</span>
            <h2>Modo invitado</h2>
          </div>
        </div>
        <div className="app-alert" role="status">
          Cuentas no configuradas: estás usando AgroFlow en modo invitado. Los lotes se guardan en este navegador.
        </div>
      </div>
    );
  }

  return (
    <div className="account-page">
      <div className="page-intro">
        <div>
          <span className="eyebrow">TU PERFIL</span>
          <h2>Cuenta y datos estables</h2>
          <p>La información de tu cuenta está guardada en PostgreSQL y asociada a tu usuario.</p>
        </div>
        {!editing && <button type="button" className="button button--secondary" onClick={() => { setEditing(true); setNotice(''); }}>Editar datos</button>}
      </div>

      {error && <div className="app-alert" role="alert">{error}</div>}
      {notice && <p className="form-success account-notice" role="status">{notice}</p>}

      {editing ? (
        <section className="panel account-edit-panel">
          <AccountDetailsForm
            initial={account}
            allowRoleChange={false}
            submitLabel={busy ? 'Guardando…' : 'Guardar cambios'}
            onCancel={() => setEditing(false)}
            onSubmit={updateAccount}
          />
        </section>
      ) : (
        <>
          <section className="panel account-profile-card">
            <div className="account-profile-avatar">{account.profile.displayName.slice(0, 1).toUpperCase()}</div>
            <div className="account-profile-main">
              <span className="eyebrow">{ROLE_LABELS[account.profile.role]}</span>
              <h3>{account.profile.displayName}</h3>
              <p>{user.email}</p>
              <small>{account.profile.phone || 'Sin teléfono de contacto'}</small>
            </div>
            <span className="status-pill status-pill--success">Sesión activa</span>
          </section>

          {account.profile.role === 'productor' ? (
            <section className="panel account-data-panel">
              <div className="section-heading">
                <div><h3>Campos</h3><p>Ubicación y superficie del establecimiento</p></div>
                <button type="button" className="button button--secondary button--small" onClick={() => setAddingField(true)}>＋ Agregar campo</button>
              </div>
              {account.fields.length ? (
                <div className="account-field-list">
                  {account.fields.map((field) => (
                    <article className="account-data-card" key={field.id}>
                      <div className="account-data-icon">⌂</div>
                      <div className="account-data-content">
                        <h4>{field.name}</h4>
                        <p>{new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(field.areaHa)} ha · {field.latitude.toFixed(5)}, {field.longitude.toFixed(5)}</p>
                        <small>Coordenadas y superficie se conservan entre campañas.</small>
                      </div>
                      {account.fields.length > 1 && <button type="button" className="danger-text-button" onClick={() => removeField(field)} disabled={busy}>Eliminar</button>}
                    </article>
                  ))}
                </div>
              ) : <p className="compact-empty">No hay campos registrados.</p>}
            </section>
          ) : (
            <section className="panel account-data-panel">
              <div className="section-heading"><div><h3>Servicio ofrecido</h3><p>Una oferta por cuenta, como elegiste</p></div></div>
              {account.offering ? (
                <div className="account-data-card">
                  <div className="account-data-icon">↗</div>
                  <div className="account-data-content">
                    <h4>{SERVICE_LABELS[account.offering.serviceType]} · {account.offering.subtype}</h4>
                    <p>{account.offering.currency} {new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(account.offering.price)} {PRICE_LABELS[account.offering.priceUnit]} · Capacidad {account.offering.capacity} {CAPACITY_LABELS[account.offering.capacityUnit]}</p>
                    <small>Base {account.offering.baseLatitude.toFixed(5)}, {account.offering.baseLongitude.toFixed(5)} · cobertura {account.offering.serviceRadiusKm} km</small>
                    {account.offering.notes && <small>{account.offering.notes}</small>}
                  </div>
                </div>
              ) : <p className="compact-empty">Todavía no hay una oferta registrada.</p>}
            </section>
          )}
        </>
      )}

      {addingField && (
        <div className="dialog-backdrop">
          <section className="dialog-card" role="dialog" aria-modal="true" aria-labelledby="add-field-title">
            <div className="dialog-heading">
              <div><span className="eyebrow">DATOS ESTABLES</span><h2 id="add-field-title">Agregar campo</h2></div>
              <button type="button" className="icon-button" aria-label="Cerrar" onClick={() => setAddingField(false)}>×</button>
            </div>
            <FieldForm profile={account.profile} onSave={addField} onCancel={() => setAddingField(false)} />
          </section>
        </div>
      )}

      <section className="panel account-security-panel">
        <div><span className="eyebrow">ACCESO</span><h3>Sesión segura</h3><p>El inicio de sesión y las contraseñas los administra Neon Auth.</p></div>
        <button type="button" className="button button--secondary" onClick={onSignOut}>Cerrar sesión</button>
      </section>
    </div>
  );
}
