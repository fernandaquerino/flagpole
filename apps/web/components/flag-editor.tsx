'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Flask, Archive, Check, Plus } from '@phosphor-icons/react';
import {
  configSchema,
  contextSchema,
  flagSchema,
  validConfigReferences,
  type Config,
  type FlagValue,
} from '@flagpole/shared';
import { evaluate } from '@flagpole/evaluator';
import { useWorkspace } from './workspace';
import { api, configBody, message, type StoredFlag } from '../lib/api';
import { Diff, ErrorNotice, Loading, Modal, Toggle } from './ui';
import { RulesBuilder, ServeEditor, VariationSelect } from './rules';
export function FlagEditor() {
  const { project, environment } = useWorkspace();
  const { key } = useParams<{ key: string }>();
  const router = useRouter();
  const base = `/projects/${project.slug}/flags/${encodeURIComponent(key)}`;
  const [flag, setFlag] = useState<StoredFlag | null>(null);
  const [draft, setDraft] = useState<Config | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState<
    'config' | 'metadata' | 'archive' | null
  >(null);
  const [description, setDescription] = useState('');
  const [values, setValues] = useState<FlagValue[]>([]);
  const [tab, setTab] = useState('targeting');
  const [saved, setSaved] = useState(false);
  async function load() {
    setError('');
    try {
      const f = await api<StoredFlag>(base);
      setFlag(f);
      setDescription(f.description);
      setValues(f.variations);
      const config = f.configs.find((c) => c.environmentId === environment.id);
      if (!config)
        throw new Error('No configuration exists for this environment.');
      setDraft(config);
    } catch (e) {
      setError(message(e));
    }
  }
  useEffect(() => {
    setFlag(null);
    setDraft(null);
    setReview(null);
    void load();
  }, [base, environment.id]);
  const original = flag?.configs.find(
    (c) => c.environmentId === environment.id,
  );
  const dirty =
    !!flag &&
    !!draft &&
    (JSON.stringify(configBody(draft)) !==
      JSON.stringify(configBody(original!)) ||
      description !== flag.description ||
      JSON.stringify(values) !== JSON.stringify(flag.variations));
  useEffect(() => {
    if (!dirty) return;
    const guard = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [dirty]);
  function preview(kind: 'config' | 'metadata') {
    setSaved(false);
    setError('');
    try {
      if (!flag || !draft) return;
      if (kind === 'config') {
        const parsed = configSchema.parse(draft);
        if (!validConfigReferences(flag, parsed))
          throw new Error('A variation reference is invalid.');
      } else flagSchema.parse({ ...flag, description, variations: values });
      setReview(kind);
    } catch (e) {
      setError(message(e));
    }
  }
  async function save() {
    if (!flag || !draft || !review) return;
    setBusy(true);
    setError('');
    try {
      if (review === 'archive') {
        await api(`${base}/archive`, { method: 'POST' });
        router.push(`/projects/${project.slug}/flags`);
        return;
      }
      if (review === 'config')
        await api(`${base}/environments/${environment.key}`, {
          method: 'PUT',
          body: JSON.stringify(configBody(draft)),
        });
      else
        await api(base, {
          method: 'PATCH',
          body: JSON.stringify({ description, variations: values }),
        });
      setReview(null);
      await load();
      setSaved(true);
    } catch (e) {
      setError(message(e));
      setReview(null);
    } finally {
      setBusy(false);
    }
  }
  if (!flag || !draft)
    return error ? (
      <ErrorNotice error={error} retry={() => void load()} />
    ) : (
      <Loading />
    );
  return (
    <>
      <Link href={`/projects/${project.slug}/flags`} className="back">
        <ArrowLeft size={16} />
        All flags
      </Link>
      <div className="page-heading editor-heading">
        <div>
          <h1>{flag.key}</h1>
          <p>
            {flag.description ||
              'Add a description to explain what this flag controls.'}
          </p>
        </div>
        <span className="type-badge">{flag.type}</span>
      </div>
      <div className="editor-toolbar">
        <div className="editor-tabs">
          <button
            className={tab === 'targeting' ? 'selected' : ''}
            onClick={() => setTab('targeting')}
          >
            Targeting
          </button>
          <button
            className={tab === 'variations' ? 'selected' : ''}
            onClick={() => setTab('variations')}
          >
            Variations & details
          </button>
        </div>
        <span>Version {original?.version}</span>
        <button
          className="primary"
          disabled={busy}
          onClick={() => preview(tab === 'targeting' ? 'config' : 'metadata')}
        >
          Review changes
        </button>
      </div>
      {error && <ErrorNotice error={error} retry={() => void load()} />}{' '}
      {saved && (
        <div className="notice success" role="status">
          <Check size={18} />
          Changes saved.
        </div>
      )}
      <div className="editor-grid">
        <div>
          {tab === 'targeting' ? (
            <>
              <section className="targeting-switch">
                <div>
                  <h2>Flag is {draft.enabled ? 'on' : 'off'}</h2>
                  <p>
                    {draft.enabled
                      ? 'Evaluate targeting rules for this environment.'
                      : 'All contexts receive the off variation.'}
                  </p>
                </div>
                <Toggle
                  checked={draft.enabled}
                  label="Enable flag"
                  onChange={() =>
                    setDraft({ ...draft, enabled: !draft.enabled })
                  }
                />
              </section>
              <RulesBuilder
                rules={draft.rules}
                values={flag.variations}
                onChange={(rules) => setDraft({ ...draft, rules })}
              />
              <section className="editor-section">
                <h2>Default rule</h2>
                <p>When no targeting rule matches.</p>
                <ServeEditor
                  value={draft.fallthrough}
                  values={flag.variations}
                  label="Default serves"
                  onChange={(fallthrough) =>
                    setDraft({ ...draft, fallthrough })
                  }
                />
              </section>
              <section className="editor-section off-section">
                <div>
                  <h2>When the flag is off</h2>
                  <p>A reliable fallback for every context.</p>
                </div>
                <VariationSelect
                  values={flag.variations}
                  value={draft.offVariation}
                  label="Off variation"
                  onChange={(offVariation) =>
                    setDraft({ ...draft, offVariation })
                  }
                />
              </section>
            </>
          ) : (
            <section className="editor-section">
              <h2>Variations & details</h2>
              <p>Changes here apply to every environment.</p>
              <label>
                Description
                <textarea
                  value={description}
                  maxLength={2000}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </label>
              {values.map((v, i) => (
                <div className="variation-row" key={i}>
                  <label>
                    Variation {i + 1}
                    {flag.type === 'boolean' ? (
                      <select
                        value={String(v)}
                        onChange={(e) =>
                          setValues(
                            values.map((old, n) =>
                              n === i ? e.target.value === 'true' : old,
                            ),
                          )
                        }
                      >
                        <option value="false">false</option>
                        <option value="true">true</option>
                      </select>
                    ) : (
                      <input
                        value={String(v)}
                        maxLength={1000}
                        onChange={(e) =>
                          setValues(
                            values.map((old, n) =>
                              n === i ? e.target.value : old,
                            ),
                          )
                        }
                      />
                    )}
                  </label>
                  {values.length > 2 && (
                    <button
                      onClick={() =>
                        setValues(values.filter((_, n) => n !== i))
                      }
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
              {flag.type === 'string' && (
                <button onClick={() => setValues([...values, 'new-value'])}>
                  <Plus size={16} />
                  Add variation
                </button>
              )}
              <p className="small">
                Referenced variations cannot be removed. Reordering changes what
                existing indexes serve.
              </p>
            </section>
          )}
          <button
            className="archive-button"
            onClick={() => setReview('archive')}
          >
            <Archive size={17} />
            Archive flag
          </button>
        </div>
        <ContextTester flag={flag} config={draft} />
      </div>
      {review && (
        <Modal
          title={
            review === 'archive' ? 'Archive this flag?' : 'Review your changes'
          }
          onClose={() => setReview(null)}
        >
          {review === 'archive' ? (
            <p>
              <strong>{flag.key}</strong> will stop appearing in evaluations in
              every environment. SDKs will use their defaults after the next
              refresh.
            </p>
          ) : (
            <>
              <p>
                {review === 'metadata'
                  ? 'This changes variations and details in every environment.'
                  : `Saving to ${environment.key}.`}
              </p>
              {(environment.key === 'production' || review === 'metadata') && (
                <div className="notice warning">
                  This change can affect production traffic. Review it
                  carefully.
                </div>
              )}
              <Diff
                before={
                  review === 'config'
                    ? configBody(original!)
                    : {
                        description: flag.description,
                        variations: flag.variations,
                      }
                }
                after={
                  review === 'config'
                    ? configBody(draft)
                    : { description, variations: values }
                }
              />
            </>
          )}
          <div className="dialog-actions">
            <button onClick={() => setReview(null)}>Keep editing</button>
            <button
              className={review === 'archive' ? 'danger' : 'primary'}
              disabled={busy}
              onClick={() => void save()}
            >
              {busy
                ? 'Saving…'
                : review === 'archive'
                  ? 'Archive flag'
                  : environment.key === 'production'
                    ? 'Confirm production save'
                    : 'Save changes'}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
function ContextTester({ flag, config }: { flag: StoredFlag; config: Config }) {
  const [text, setText] = useState(
    '{\n  "key": "demo-visitor",\n  "plan": "pro"\n}',
  );
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  return (
    <aside className="context-panel">
      <div className="section-heading">
        <Flask size={22} />
        <h2>Test a context</h2>
      </div>
      <p>See what this draft serves before saving.</p>
      <label className="sr-only" htmlFor="context-json">
        Context JSON
      </label>
      <textarea
        id="context-json"
        spellCheck={false}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setResult('');
        }}
      />
      <button
        onClick={() => {
          try {
            setError('');
            setResult(
              JSON.stringify(
                evaluate(flag, config, contextSchema.parse(JSON.parse(text))),
                null,
                2,
              ),
            );
          } catch (e) {
            setError(message(e));
            setResult('');
          }
        }}
      >
        Evaluate context
      </button>
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      {result && (
        <pre className="evaluation-result" role="status">
          {result}
        </pre>
      )}
      <div className="context-note">
        Evaluated in your browser.
        <br />
        Use opaque keys, never names or emails.
      </div>
    </aside>
  );
}
