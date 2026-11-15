import { useCallback, useEffect, useState } from 'react';
import AccountDetailsForm from './components/AccountDetailsForm.jsx';
import { authClient } from './lib/auth.js';
import { accountApi } from './lib/accountApi.js';
import AuthPage from './pages/AuthPage.jsx';
import { WorkspaceApp } from './App.jsx';
import './styles.css';

const USUARIO_INVITADO = { id: 'invitado', name: 'Invitado', email: '' };

const CUENTA_INVITADO = {
  profile: { displayName: 'Invitado', role: 'productor', phone: '' },
  fields: [],
  offering: null,
};

function Loading({ message }) {
  return <main className="loading-state" role="status">{message}</main>;
}

function AccountSetup({ user, onCreated, onSignOut }) {
  const [saving, setSaving] = useState(false);

  async function createProfile(payload) {
    setSaving(true);
    try {
      await accountApi.create(payload);
      onCreated(await accountApi.get());
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="account-setup-page">
      <div className="account-setup-header">
        <span className="brand-mark">A</span>
        <button type="button" className="text-button" onClick={onSignOut}>Cerrar sesión</button>
      </div>
      <section className="panel account-setup-card">
        <span className="eyebrow">UN PASO MÁS</span>
        <h1>Completá tu perfil</h1>
        <p>Tu cuenta está activa como {user.email}. Elegí tu tipo de usuario y guardá los datos que necesitamos para la aplicación.</p>
        <AccountDetailsForm
          initial={{ displayName: user.name ?? '' }}
          allowRoleChange
          submitLabel={saving ? 'Guardando…' : 'Guardar perfil'}
          onSubmit={createProfile}
        />
      </section>
    </main>
  );
}

function SignedInApp({ user, guest = false, onSignOut, signOutError, onClearSignOutError }) {
  const [account, setAccount] = useState(guest ? CUENTA_INVITADO : null);
  const [loading, setLoading] = useState(!guest);
  const [error, setError] = useState('');

  const loadAccount = useCallback(async () => {
    if (guest) return;
    setLoading(true);
    setError('');
    try {
      setAccount(await accountApi.get());
    } catch (reason) {
      setError(reason.message || 'No se pudo cargar el perfil.');
    } finally {
      setLoading(false);
    }
  }, [guest]);

  useEffect(() => {
    if (!guest) loadAccount();
  }, [guest, loadAccount]);

  if (loading) return <Loading message="Cargando tu perfil seguro…" />;
  if (error) {
    return (
      <main className="account-setup-page">
        <section className="panel account-setup-card">
          <span className="eyebrow">NO SE PUDO CARGAR</span>
          <h1>Revisá la conexión con tu cuenta</h1>
          <p>{error}</p>
          <div className="account-form-actions">
            <button type="button" className="button button--secondary" onClick={onSignOut}>Cerrar sesión</button>
            <button type="button" className="button button--primary" onClick={loadAccount}>Reintentar</button>
          </div>
        </section>
      </main>
    );
  }

  if (!account?.profile) {
    return <AccountSetup user={user} onCreated={setAccount} onSignOut={onSignOut} />;
  }

  return (
    <>
      {signOutError && (
        <div className="app-alert signout-alert" role="alert">
          {signOutError}
          <button type="button" className="text-button" onClick={onClearSignOutError}>Cerrar</button>
        </div>
      )}
      <WorkspaceApp
        user={user}
        account={account}
        guest={guest}
        onAccountChange={setAccount}
        onSignOut={onSignOut}
      />
    </>
  );
}

export default function AuthenticatedApp() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [signOutError, setSignOutError] = useState('');
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    if (!authClient) {
      setLoading(false);
      return;
    }
    let active = true;
    authClient.getSession()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) setAuthError(error.message);
        else if (data?.session && data?.user) setSession(data);
      })
      .catch((error) => {
        if (active) setAuthError(error.message || 'No se pudo recuperar la sesión.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  async function signOut() {
    setSignOutError('');
    try {
      const { error } = await authClient.signOut();
      if (error) throw new Error(error.message);
      setSession(null);
    } catch (error) {
      setSignOutError(error.message || 'No se pudo cerrar la sesión.');
    }
  }

  if (loading) return <Loading message="Verificando sesión…" />;
  if (!authClient) {
    return (
      <SignedInApp
        user={USUARIO_INVITADO}
        guest
        onSignOut={() => {}}
        signOutError=""
        onClearSignOutError={() => {}}
      />
    );
  }
  if (authError) {
    return (
      <main className="auth-page auth-page--centered">
        <section className="panel auth-config-error" role="alert">
          <h1>No se pudo verificar la sesión</h1>
          <p>{authError}</p>
          <button type="button" className="button button--primary" onClick={() => window.location.reload()}>Reintentar</button>
        </section>
      </main>
    );
  }
  if (!session) return <AuthPage onAuthenticated={setSession} />;
  return (
    <SignedInApp
      user={session.user}
      onSignOut={signOut}
      signOutError={signOutError}
      onClearSignOutError={() => setSignOutError('')}
    />
  );
}
