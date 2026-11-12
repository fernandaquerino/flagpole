'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, MagnifyingGlass, Flag, ArrowRight } from '@phosphor-icons/react';
import { useWorkspace } from './workspace';
import { api, configBody, message, type StoredFlag } from '../lib/api';
import { ErrorNotice, Loading, Modal, Toggle } from './ui';
export function FlagsList() {
  const { project, environment } = useWorkspace();
  const [flags, setFlags] = useState<StoredFlag[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [create, setCreate] = useState(false);
  const [confirm, setConfirm] = useState<StoredFlag | null>(null);
  const [busy, setBusy] = useState(false);
  const base = `/projects/${project.slug}/flags`;
  async function load() {
    setError('');
    try {
      setFlags(await api<StoredFlag[]>(base));
      setLoaded(true);
    } catch (e) {
      setError(message(e));
    }
  }
  useEffect(() => {
    setLoaded(false);
    void load();
  }, [project.slug]);
  async function toggle(flag: StoredFlag) {
    const c = flag.configs.find((c) => c.environmentId === environment.id);
    if (!c) return;
    setBusy(true);
    try {
      await api(`${base}/${flag.key}/environments/${environment.key}`, {
        method: 'PUT',
        body: JSON.stringify({ ...configBody(c), enabled: !c.enabled }),
      });
      setConfirm(null);
      await load();
    } catch (e) {
      setError(message(e));
      setConfirm(null);
    } finally {
      setBusy(false);
    }
  }
  const filtered = flags.filter((f) =>
    `${f.key} ${f.description}`.toLowerCase().includes(query.toLowerCase()),
  );
  const active = flags.filter(
    (f) => f.configs.find((c) => c.environmentId === environment.id)?.enabled,
  ).length;
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="breadcrumb">Feature management</div>
          <h1>
            Feature flags <span className="count">{flags.length}</span>
          </h1>
          <p>Ship at your pace. Control what goes live.</p>
        </div>
        <button className="primary" onClick={() => setCreate(true)}>
          <Plus size={18} />
          Create flag
        </button>
      </div>
      <div className="list-summary">
        <span>
          <span className="status-dot" />
          {active} enabled
        </span>
        <span>{flags.length - active} disabled</span>
        <span className="summary-end">{environment.key} environment</span>
      </div>
      {error && <ErrorNotice error={error} retry={() => void load()} />}
      <div className="flag-table">
        <div className="table-tools">
          <div className="search">
            <MagnifyingGlass size={18} />
            <input
              aria-label="Search flags"
              placeholder="Search flags by key or description…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <span>{filtered.length} flags</span>
        </div>
        <div className="table-heading">
          <span>Flag</span>
          <span>Type</span>
          <span>Targeting</span>
          <span>Status</span>
          <span />
        </div>
        {!loaded ? (
          <Loading />
        ) : filtered.length === 0 ? (
          <div className="empty">
            <Flag size={32} />
            <h2>
              {query ? 'No matching flags' : 'Your first release starts here'}
            </h2>
            <p>
              {query
                ? 'Try another key or description.'
                : 'Create a flag, add it to your app, and choose who sees it.'}
            </p>
            {!query && (
              <button onClick={() => setCreate(true)}>
                Create your first flag
              </button>
            )}
          </div>
        ) : (
          filtered.map((f) => {
            const c = f.configs.find((c) => c.environmentId === environment.id);
            return (
              <div className="flag-row" key={f.id}>
                <Link className="flag-name" href={`${base}/${f.key}`}>
                  <span className="flag-icon">
                    <Flag size={20} />
                  </span>
                  <div>
                    <strong>{f.key}</strong>
                    <p>{f.description || 'No description yet'}</p>
                  </div>
                </Link>
                <span className="type-badge">{f.type}</span>
                <span className="targeting-summary">
                  {c?.rules.length
                    ? `${c.rules.length} targeting rule${c.rules.length === 1 ? '' : 's'}`
                    : 'Default variation'}
                </span>
                <div className="status-cell">
                  <Toggle
                    checked={c?.enabled ?? false}
                    disabled={busy || !c}
                    label={`Toggle ${f.key}`}
                    onChange={() =>
                      environment.key === 'production'
                        ? setConfirm(f)
                        : void toggle(f)
                    }
                  />
                  <span>{c?.enabled ? 'On' : 'Off'}</span>
                </div>
                <Link
                  href={`${base}/${f.key}`}
                  className="icon-button"
                  aria-label={`Edit ${f.key}`}
                >
                  <ArrowRight size={18} />
                </Link>
              </div>
            );
          })
        )}
      </div>
      <div className="help-strip">
        <Flag size={22} />
        <div>
          <strong>Every release starts with a small switch.</strong>
          <p>Your flags are evaluated in memory. Contexts are never stored.</p>
        </div>
        <a href="http://localhost:3001" target="_blank" rel="noreferrer">
          Try the example app <ArrowRight size={16} />
        </a>
      </div>
      {create && (
        <CreateFlag
          base={base}
          onClose={() => setCreate(false)}
          onCreated={() => {
            setCreate(false);
            void load();
          }}
        />
      )}
      {confirm && (
        <Modal
          title="Change production targeting?"
          onClose={() => setConfirm(null)}
        >
          <p>
            This changes <strong>{confirm.key}</strong> for live production
            traffic.
          </p>
          <div className="dialog-actions">
            <button onClick={() => setConfirm(null)}>Cancel</button>
            <button
              className="primary"
              disabled={busy}
              onClick={() => void toggle(confirm)}
            >
              {busy ? 'Saving…' : 'Confirm production change'}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
function CreateFlag({
  base,
  onClose,
  onCreated,
}: {
  base: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [key, setKey] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'boolean' | 'string'>('boolean');
  const [values, setValues] = useState(['control', 'treatment']);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Modal title="Create a feature flag" onClose={onClose}>
      <p>Start disabled in every environment. Enable it when you’re ready.</p>
      {error && <ErrorNotice error={error} />}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await api(base, {
              method: 'POST',
              body: JSON.stringify({
                key,
                description,
                type,
                variations: type === 'boolean' ? [false, true] : values,
              }),
            });
            onCreated();
          } catch (err) {
            setError(message(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Flag key
          <input
            required
            aria-label="Flag key"
            aria-describedby="flag-key-help"
            pattern="[a-z0-9][a-z0-9_-]*"
            maxLength={100}
            placeholder="new-checkout"
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
          <small id="flag-key-help">
            Permanent identifier used in your code.
          </small>
        </label>
        <label>
          Description
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What does this flag control?"
            maxLength={2000}
          />
        </label>
        <label>
          Flag type
          <select
            value={type}
            onChange={(e) => setType(e.target.value as 'boolean' | 'string')}
          >
            <option value="boolean">Boolean · true / false</option>
            <option value="string">String · custom values</option>
          </select>
        </label>
        {type === 'string' &&
          values.map((v, i) => (
            <label key={i}>
              Variation {i + 1}
              <input
                required
                value={v}
                onChange={(e) =>
                  setValues(
                    values.map((old, n) => (i === n ? e.target.value : old)),
                  )
                }
              />
            </label>
          ))}
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" disabled={busy}>
            {busy ? 'Creating…' : 'Create flag'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
