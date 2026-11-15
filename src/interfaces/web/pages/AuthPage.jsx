import { useState } from 'react';
import AccountDetailsForm from '../components/AccountDetailsForm.jsx';
import { authClient } from '../lib/auth.js';
import { accountApi } from '../lib/accountApi.js';

export default function AuthPage({ onAuthenticated }) {
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  async function submitSignIn(event) {
    event.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const result = await authClient.signIn.email({ email: email.trim(), password });
      if (result.error) throw new Error(result.error.message);
      const sessionResult = await authClient.getSession();
      if (sessionResult.error) throw new Error(sessionResult.error.message);
      if (!sessionResult.data?.session || !sessionResult.data?.user) {
        throw new Error('No se pudo recuperar la sesión después de iniciar sesión.');
      }
      onAuthenticated(sessionResult.data);
    } catch (reason) {
      setError(reason.message || 'No se pudo iniciar sesión.');
    } finally {
      setBusy(false);
    }
  }

  async function submitSignUp(details) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Ingresá un correo electrónico válido.');
      return;
    }
    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const result = await authClient.signUp.email({
        name: details.displayName.trim(),
        email: email.trim(),
        password,
      });
      if (result.error) throw new Error(result.error.message);
      const sessionResult = await authClient.getSession();
      if (sessionResult.error) throw new Error(sessionResult.error.message);
      if (sessionResult.data?.session && sessionResult.data?.user) {
        try {
          await accountApi.create(details);
        } catch (profileError) {
          setNotice(`La cuenta se creó, pero falta completar el perfil: ${profileError.message}`);
        }
        onAuthenticated(sessionResult.data);
        return;
      }
      setNotice('Cuenta creada. Si Neon solicita verificar el correo, completá la verificación y luego iniciá sesión para terminar el perfil.');
      setMode('signin');
      setPassword('');
    } catch (reason) {
      setError(reason.message || 'No se pudo crear la cuenta.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-brand-panel">
        <a className="auth-brand" href="/" aria-label="AgroFlow inicio">
          <span className="brand-mark">A</span>
          <span><strong>AgroFlow</strong><small>COSECHA · LOGÍSTICA</small></span>
        </a>
        <div className="auth-brand-copy">
          <span className="eyebrow">AGTECH PARA EL CAMPO</span>
          <h1>Conectamos decisiones con datos reales.</h1>
          <p>Un espacio para organizar tu campo o compartir los servicios que ofrecés al sector.</p>
        </div>
        <div className="auth-brand-footer">Tus datos de cuenta se guardan de forma segura.</div>
      </section>

      <section className="auth-form-panel">
        <div className="auth-form-wrap">
          <div className="auth-mobile-brand"><span className="brand-mark">A</span><strong>AgroFlow</strong></div>
          <span className="eyebrow">{mode === 'signup' ? 'CREAR CUENTA' : 'BIENVENIDA/O'}</span>
          <h2>{mode === 'signup' ? 'Empezá con AgroFlow' : 'Iniciá sesión'}</h2>
          <p className="auth-subtitle">{mode === 'signup' ? 'Creá tu perfil básico; después podrás completar los datos del campo o servicio.' : 'Ingresá con el correo y la contraseña de tu cuenta.'}</p>

          {mode === 'signup' ? (
            <>
              <label className="auth-label">
                Correo electrónico
                <input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={254} />
              </label>
              <label className="auth-label">
                Contraseña
                <input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} maxLength={128} />
                <small>Usá al menos 8 caracteres.</small>
              </label>
              {error && <p className="form-error" role="alert">{error}</p>}
              {notice && <p className="form-success" role="status">{notice}</p>}
              <div className="auth-details-block">
                <AccountDetailsForm
                  allowRoleChange
                  profileOnly
                  submitLabel={busy ? 'Creando cuenta…' : 'Crear cuenta'}
                  onSubmit={submitSignUp}
                />
              </div>
            </>
          ) : (
            <form onSubmit={submitSignIn}>
                <label className="auth-label">
                  Correo electrónico
                  <input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={254} />
                </label>
                <label className="auth-label">
                  Contraseña
                  <input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
                </label>
                {error && <p className="form-error" role="alert">{error}</p>}
                {notice && <p className="form-success" role="status">{notice}</p>}
                <button type="submit" className="button button--primary auth-submit" disabled={busy}>
                  {busy ? 'Ingresando…' : 'Iniciar sesión'}
                </button>
            </form>
          )}

          <p className="auth-switch">
            {mode === 'signup' ? '¿Ya tenés cuenta?' : '¿Todavía no tenés cuenta?'}
            <button type="button" onClick={() => { setError(''); setNotice(''); setMode(mode === 'signup' ? 'signin' : 'signup'); }}>
              {mode === 'signup' ? 'Iniciar sesión' : 'Crear una cuenta'}
            </button>
          </p>
          <small className="auth-privacy-note">La contraseña se administra con Neon Auth; AgroFlow no la almacena.</small>
        </div>
      </section>
    </main>
  );
}
