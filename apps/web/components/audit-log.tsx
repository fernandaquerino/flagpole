'use client';
import { useEffect, useState } from 'react';
import { ClockCounterClockwise } from '@phosphor-icons/react';
import { api, message } from '../lib/api';
import { useWorkspace } from './workspace';
import { Diff, ErrorNotice, Loading } from './ui';
type Entry = {
  id: string;
  actor: string;
  action: string;
  before: unknown;
  after: unknown;
  createdAt: string;
  flag: { key: string };
  environment: { key: string } | null;
};
export function AuditLog() {
  const { project, environment } = useWorkspace();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [applied, setApplied] = useState('');
  const [all, setAll] = useState(true);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  async function load(next?: string) {
    setBusy(true);
    setError('');
    try {
      const q = new URLSearchParams();
      if (applied) q.set('flag', applied);
      if (!all) q.set('env', environment.key);
      if (next) q.set('cursor', next);
      const response = await api<{
        entries: Entry[];
        nextCursor: string | null;
      }>(`/projects/${project.slug}/audit?${q}`);
      setEntries((old) =>
        next ? [...old, ...response.entries] : response.entries,
      );
      setCursor(response.nextCursor);
      setLoaded(true);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    setLoaded(false);
    void load();
  }, [project.slug, environment.key, all, applied]);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="breadcrumb">Workspace history</div>
          <h1>Activity log</h1>
          <p>A clear record of what changed, where, and when.</p>
        </div>
        <ClockCounterClockwise size={32} className="muted" />
      </div>
      <form
        className="audit-filters"
        onSubmit={(e) => {
          e.preventDefault();
          setApplied(filter);
        }}
      >
        <input
          aria-label="Filter by flag key"
          placeholder="Filter by exact flag key"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <button>Apply filter</button>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={all}
            onChange={(e) => setAll(e.target.checked)}
          />
          All environments
        </label>
      </form>
      {error && <ErrorNotice error={error} retry={() => void load()} />}{' '}
      {!loaded ? (
        <Loading />
      ) : entries.length === 0 ? (
        <div className="empty">
          <ClockCounterClockwise size={32} />
          <h2>No activity yet</h2>
          <p>Flag changes will appear here. Try clearing your filters.</p>
        </div>
      ) : (
        <div className="audit-list">
          {entries.map((entry) => (
            <details key={entry.id} className="audit-entry">
              <summary>
                <span className="avatar">A</span>
                <div>
                  <strong>{entry.flag.key}</strong>
                  <p>
                    {entry.action.replaceAll('.', ' ').replaceAll('_', ' ')}{' '}
                    <span className="muted">by {entry.actor}</span>
                  </p>
                </div>
                <span className="badge">
                  {entry.environment?.key ?? 'All environments'}
                </span>
                <time dateTime={entry.createdAt}>
                  {new Date(entry.createdAt).toLocaleString()}
                </time>
              </summary>
              <Diff before={entry.before} after={entry.after} />
            </details>
          ))}
        </div>
      )}
      {cursor && (
        <button
          className="load-more"
          disabled={busy}
          onClick={() => void load(cursor)}
        >
          {busy ? 'Loading…' : 'Load more activity'}
        </button>
      )}
    </>
  );
}
