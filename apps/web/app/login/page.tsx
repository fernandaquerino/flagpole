'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Flag, ArrowRight } from '@phosphor-icons/react';
import { api, message } from '../../lib/api';
import { ErrorNotice } from '../../components/ui';
export default function Login() {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  return (
    <main className="login-page">
      <div className="login-story">
        <div className="brand">
          <span className="brand-mark">
            <Flag weight="fill" size={24} />
          </span>
          flagpole
        </div>
        <div>
          <h1>
            Release on
            <br />
            your terms.
          </h1>
          <p>
            A little control goes a long way.
            <br />
            Roll out thoughtfully. Switch off instantly.
          </p>
        </div>
        <span>Self-hosted feature management</span>
      </div>
      <section className="login-form">
        <span className="badge">Your private workspace</span>
        <h2>Welcome back.</h2>
        <p>Sign in to manage your feature flags.</p>
        {error && <ErrorNotice error={error} />}
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError('');
            try {
              await api('/auth/login', {
                method: 'POST',
                body: JSON.stringify({ password }),
              });
              router.push('/');
            } catch (err) {
              setError(message(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Admin password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoFocus
            />
          </label>
          <button className="primary" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
            <ArrowRight size={18} />
          </button>
        </form>
        <p className="small">
          Use the password configured by your instance administrator.
        </p>
      </section>
    </main>
  );
}
