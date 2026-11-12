import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  FlagpoleProvider,
  useFlag,
  useFlagpoleStatus,
} from '@flagpole/sdk-react';
import './style.css';
function Checkout() {
  const enabled = useFlag('new-checkout', false);
  const { loaded, error } = useFlagpoleStatus();
  return (
    <section>
      <p className="eyebrow">THE ORBIT DEMO STORE</p>
      <h1>{enabled ? 'Meet your new checkout.' : 'The classic checkout.'}</h1>
      <p>
        {enabled
          ? 'One simple step. A little less friction.'
          : 'Your familiar checkout, right where you left it.'}
      </p>
      <div className="product">
        <span>Orbit notebook</span>
        <strong>$18.00</strong>
      </div>
      <button>{enabled ? 'Express checkout' : 'Continue to checkout'}</button>
      <p role="status">
        {error
          ? 'Connection interrupted. Keeping the last flag values.'
          : loaded
            ? 'Connected to Flagpole · polling every 2 seconds'
            : 'Connecting to Flagpole…'}
      </p>
      <code>new-checkout = {String(enabled)}</code>
    </section>
  );
}
function App() {
  const [clientKey, setClientKey] = useState(
    import.meta.env.VITE_FLAGPOLE_CLIENT_KEY ?? '',
  );
  const [plan, setPlan] = useState('free');
  return (
    <main>
      <header>
        <strong>Orbit / demo</strong>
        <a href="http://localhost:3000">Open Flagpole ↗</a>
      </header>
      <aside>
        <h2>Evaluation context</h2>
        <p>
          Use a development client key from your seed output. No personal data.
        </p>
        <label>
          Client SDK key
          <input
            value={clientKey}
            onChange={(e) => setClientKey(e.target.value)}
            autoComplete="off"
          />
        </label>
        <label>
          Plan
          <select
            aria-label="Plan"
            value={plan}
            onChange={(e) => setPlan(e.target.value)}
          >
            <option value="free">Free</option>
            <option value="pro">Pro</option>
          </select>
        </label>
        <code>key: demo-visitor</code>
      </aside>
      <FlagpoleProvider
        clientKey={clientKey}
        apiUrl={
          import.meta.env.VITE_FLAGPOLE_API_URL ?? 'http://localhost:4000'
        }
        context={{ key: 'demo-visitor', plan }}
        pollInterval={2000}
      >
        <Checkout />
      </FlagpoleProvider>
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
