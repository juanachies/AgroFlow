import { lazy, Suspense, useState } from 'react';
import AccountDetailsForm from '../components/AccountDetailsForm.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import { areaHa, centroide } from '../lib/geo.js';
import { nombreCultivo, nombreVariedad } from '../lib/data.js';
import { PRODUCTOR_EJEMPLO } from '../lib/productorEjemplo.js';
import { accountApi } from '../lib/accountApi.js';

const MapPicker = lazy(() => import('../components/MapPicker.jsx'));

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

function FieldForm({ field, onSave, onCancel }) {
  const [name, setName] = useState(field?.name ?? '');
  const [city, setCity] = useState(field?.city ?? '');
  const [boundary, setBoundary] = useState(field?.boundary ?? null);
  const [center, setCenter] = useState(field ? [field.longitude, field.latitude] : null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const measuredArea = boundary ? areaHa(boundary.geometry) : field?.areaHa ?? null;

  async function submit(event) {
    event.preventDefault();
    setError('');
    if (!city || !boundary || !center) {
      setError('Buscá una localidad y dibujá el perímetro del campo.');
      return;
    }
    setSaving(true);
    try {
      await onSave({
        id: field?.id,
        name,
        city,
        areaHa: measuredArea,
        longitude: center[0],
        latitude: center[1],
        boundary,
      });
    } catch (reason) {
      setError(reason.message || 'No se pudo guardar el campo.');
    } finally {
      setSaving(false);
    }
  }

  function updateBoundary(nextBoundary) {
    setBoundary(nextBoundary);
    if (!nextBoundary) {
      setCenter(null);
      return;
    }
    const point = centroide(nextBoundary.geometry.coordinates[0]);
    setCenter(point);
  }

  return (
    <form className="account-form" onSubmit={submit}>
      <label>
        Nombre del campo
        <input value={name} onChange={(event) => setName(event.target.value)} required maxLength={120} placeholder="Ej. La Esperanza" />
      </label>
      <p className="account-form-note">Buscá la localidad y dibujá el perímetro. La superficie se calcula automáticamente; los cultivos y fechas se cargan luego para cada lote.</p>
      <Suspense fallback={<p role="status">Cargando mapa…</p>}>
        <MapPicker
          latitude={center?.[1] ?? ''}
          longitude={center?.[0] ?? ''}
          city={city}
          onCityChange={setCity}
          mode="polygon"
          boundary={boundary}
          onBoundaryChange={updateBoundary}
          onPick={(latitude, longitude) => setCenter([longitude, latitude])}
        />
      </Suspense>
      <label>
        Superficie calculada
        <input value={measuredArea == null ? '' : measuredArea.toFixed(2)} readOnly placeholder="Se calcula al dibujar el perímetro" />
      </label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="account-form-actions">
        <button className="button button--secondary" type="button" onClick={onCancel} disabled={saving}>Cancelar</button>
        <button className="button button--primary" type="submit" disabled={saving}>{saving ? 'Guardando…' : field ? 'Guardar cambios' : 'Agregar campo'}</button>
      </div>
    </form>
  );
}

export default function AccountPage({ user, account, onAccountChange, onSignOut, guest = false, lots = [], onResetExample = null }) {
  const [editingProfile, setEditingProfile] = useState(false);
  const [editingOffering, setEditingOffering] = useState(false);
  const [confirmandoReinicio, setConfirmandoReinicio] = useState(false);
  const [fieldDialog, setFieldDialog] = useState({ open: false, field: null });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function updateProfile(payload) {
    setError('');
    if (guest) onAccountChange({ ...account, profile: { ...account.profile, displayName: payload.displayName, phone: payload.phone } });
    else {
      await accountApi.updateProfile({ displayName: payload.displayName, phone: payload.phone });
      onAccountChange(await accountApi.get());
    }
    setEditingProfile(false);
    setNotice('El perfil se guardó sin modificar tus datos de campo o servicio.');
  }

  async function saveOffering(payload) {
    setError('');
    if (guest) onAccountChange({ ...account, offering: payload.offering });
    else {
      await accountApi.saveOffering(payload.offering);
      onAccountChange(await accountApi.get());
    }
    setEditingOffering(false);
    setNotice('La oferta de servicio se guardó.');
  }

  async function saveField(field) {
    setError('');
    if (field.id) await accountApi.updateField(field.id, field);
    else await accountApi.createField(field);
    onAccountChange(await accountApi.get());
    setFieldDialog({ open: false, field: null });
    setNotice(field.id ? 'Campo actualizado.' : 'Campo agregado a tu cuenta.');
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

  if (guest && account.profile.role === 'productor') {
    return (
      <div className="account-page">
        <div className="page-intro">
          <div>
            <span className="eyebrow">TU PERFIL</span>
            <h2>{PRODUCTOR_EJEMPLO.establecimiento}</h2>
            <p>{PRODUCTOR_EJEMPLO.responsable} · {PRODUCTOR_EJEMPLO.zona} · {PRODUCTOR_EJEMPLO.telefono}</p>
          </div>
          {onResetExample && (
            <button type="button" className="button button--secondary" onClick={() => setConfirmandoReinicio(true)}>Restablecer datos de ejemplo</button>
          )}
        </div>
        <div className="app-alert" role="status">
          Estás usando AgroFlow en modo invitado con un productor de ejemplo: todos los datos son ficticios y se guardan en este navegador. Dibujá el perímetro de cada lote en el mapa.
        </div>
        <section className="panel">
          <div className="section-heading"><div><h3>Lotes del establecimiento</h3><p>{lots.length} lotes · {lots.reduce((suma, lot) => suma + lot.areaHa, 0).toLocaleString('es-AR')} ha</p></div></div>
          <ul className="account-lots">
            {lots.map((lot) => (
              <li key={lot.id}>
                <strong>{lot.name}</strong>
                <span>{lot.crop ? `${nombreCultivo(lot.crop)} · ${nombreVariedad(lot.crop, lot.variety)}` : 'Sin cultivo sembrado'}</span>
                <span>{lot.areaHa.toLocaleString('es-AR')} ha</span>
                <span>{lot.boundary ? 'Perímetro dibujado' : 'Falta dibujar el perímetro'}</span>
              </li>
            ))}
          </ul>
        </section>
        {confirmandoReinicio && (
          <ConfirmDialog
            title="Restablecer datos de ejemplo"
            message="Se vuelven a cargar los lotes de ejemplo con fechas de siembra actualizadas. Los perímetros que hayas dibujado en esos lotes se pierden; tus lotes propios no se tocan."
            confirmLabel="Restablecer"
            onClose={() => setConfirmandoReinicio(false)}
            onConfirm={onResetExample}
          />
        )}
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
        {!editingProfile && <button type="button" className="button button--secondary" onClick={() => { setEditingProfile(true); setNotice(''); }}>Editar perfil</button>}
      </div>

      {error && <div className="app-alert" role="alert">{error}</div>}
      {notice && <p className="form-success account-notice" role="status">{notice}</p>}

      {editingProfile ? (
        <section className="panel account-edit-panel">
          <AccountDetailsForm
            initial={account}
            profileOnly
            allowRoleChange={false}
            submitLabel="Guardar perfil"
            onCancel={() => setEditingProfile(false)}
            onSubmit={updateProfile}
          />
        </section>
      ) : (
        <>
          <section className="panel account-profile-card">
            <div className="account-profile-avatar">{account.profile.displayName.slice(0, 1).toUpperCase()}</div>
            <div className="account-profile-main">
              <span className="eyebrow">{ROLE_LABELS[account.profile.role]}</span>
              <h3>{account.profile.displayName}</h3>
              <p>{user.email || 'Modo visitante · datos ficticios'}</p>
              <small>{account.profile.phone || 'Sin teléfono de contacto'}</small>
            </div>
            <span className="status-pill status-pill--success">{guest ? 'Visitante' : 'Sesión activa'}</span>
          </section>

          {account.profile.role === 'productor' ? (
            <section className="panel account-data-panel">
              <div className="section-heading">
                <div><h3>Campos</h3><p>Ubicación, perímetro y superficie del establecimiento</p></div>
                <button type="button" className="button button--secondary button--small" onClick={() => setFieldDialog({ open: true, field: null })}>＋ Agregar campo</button>
              </div>
              {account.fields.length ? (
                <div className="account-field-list">
                  {account.fields.map((field) => (
                    <article className="account-data-card" key={field.id}>
                      <div className="account-data-icon">⌂</div>
                      <div className="account-data-content">
                        <h4>{field.name}</h4>
                        <p>{field.city || 'Localidad sin registrar'} · {new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(field.areaHa)} ha</p>
                        <small>{field.boundary ? 'Perímetro guardado en el mapa.' : 'Falta dibujar el perímetro.'} Los datos se conservan entre campañas.</small>
                      </div>
                      <button type="button" className="button button--secondary button--small" onClick={() => setFieldDialog({ open: true, field })}>Editar</button>
                      {account.fields.length > 1 && <button type="button" className="danger-text-button" onClick={() => removeField(field)} disabled={busy}>Eliminar</button>}
                    </article>
                  ))}
                </div>
              ) : <p className="compact-empty">No hay campos registrados.</p>}
            </section>
          ) : (
            <section className="panel account-data-panel">
              <div className="section-heading">
                <div><h3>Servicio ofrecido</h3><p>Configurá la oferta según el tipo de servicio</p></div>
                {!editingOffering && <button type="button" className="button button--secondary button--small" onClick={() => { setEditingOffering(true); setNotice(''); }}>{account.offering ? 'Editar oferta' : '＋ Configurar servicio'}</button>}
              </div>
              {editingOffering ? (
                <AccountDetailsForm
                  initial={account}
                  hideProfileFields
                  submitLabel="Guardar oferta"
                  onCancel={() => setEditingOffering(false)}
                  onSubmit={saveOffering}
                />
              ) : account.offering ? (
                <div className="account-data-card">
                  <div className="account-data-icon">↗</div>
                  <div className="account-data-content">
                    <h4>{SERVICE_LABELS[account.offering.serviceType]} · {account.offering.subtype}</h4>
                    <p>{account.offering.currency} {new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(account.offering.price)} {PRICE_LABELS[account.offering.priceUnit]} · Capacidad {account.offering.capacity} {CAPACITY_LABELS[account.offering.capacityUnit]}</p>
                    <small>{account.offering.city || 'Ubicación sin completar'}{account.offering.baseAddress ? ` · ${account.offering.baseAddress}` : ''} · cobertura {account.offering.serviceRadiusKm} km</small>
                    {account.offering.notes && <small>{account.offering.notes}</small>}
                  </div>
                </div>
              ) : <p className="compact-empty">Todavía no hay una oferta registrada.</p>}
            </section>
          )}
        </>
      )}

      {fieldDialog.open && (
        <div className="dialog-backdrop">
          <section className="dialog-card dialog-card--wide" role="dialog" aria-modal="true" aria-labelledby="field-dialog-title">
            <div className="dialog-heading">
              <div><span className="eyebrow">DATOS ESTABLES</span><h2 id="field-dialog-title">{fieldDialog.field ? 'Editar campo' : 'Agregar campo'}</h2></div>
              <button type="button" className="icon-button" aria-label="Cerrar" onClick={() => setFieldDialog({ open: false, field: null })}>×</button>
            </div>
            <FieldForm
              field={fieldDialog.field}
              onSave={saveField}
              onCancel={() => setFieldDialog({ open: false, field: null })}
            />
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
