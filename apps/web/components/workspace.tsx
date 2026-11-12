'use client';
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Flag,
  ClockCounterClockwise,
  ArrowSquareOut,
  SignOut,
  Stack,
  TerminalWindow,
} from '@phosphor-icons/react';
import { api, message, type Project, type Environment } from '../lib/api';
import { ErrorNotice, Loading } from './ui';
const WorkspaceContext = createContext<{
  project: Project;
  environment: Environment;
} | null>(null);
export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error('Workspace unavailable');
  return context;
}
export function Workspace({ children }: { children: ReactNode }) {
  const { slug } = useParams<{ slug: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [env, setEnv] = useState('development');
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  async function load() {
    setError('');
    try {
      setProjects(await api<Project[]>('/projects'));
      setLoaded(true);
    } catch (e) {
      setError(message(e));
    }
  }
  useEffect(() => {
    void load();
  }, []);
  const project = projects.find((p) => p.slug === slug);
  const environment =
    project?.environments.find((e) => e.key === env) ??
    project?.environments[0];
  return (
    <div className="workspace">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className="sidebar">
        <Link href="/" className="brand">
          <span className="brand-mark">
            <Flag weight="fill" size={23} />
          </span>
          flagpole<span className="version">v0.1</span>
        </Link>
        <label className="project-picker">
          <span>Workspace</span>
          <select
            aria-label="Project"
            value={slug}
            onChange={(e) => router.push(`/projects/${e.target.value}/flags`)}
          >
            {projects.map((p) => (
              <option key={p.id} value={p.slug}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <nav>
          <Link
            className={!pathname.endsWith('/audit') ? 'active' : ''}
            href={`/projects/${slug}/flags`}
          >
            <Flag size={20} />
            Feature flags
          </Link>
          <Link
            className={pathname.endsWith('/audit') ? 'active' : ''}
            href={`/projects/${slug}/audit`}
          >
            <ClockCounterClockwise size={20} />
            Activity log
          </Link>
        </nav>
        <div className="sidebar-bottom">
          <a href="http://localhost:3001" target="_blank" rel="noreferrer">
            <TerminalWindow size={18} />
            Example app
            <ArrowSquareOut size={14} />
          </a>
          <div className="hosting">
            <Stack size={18} />
            <div>
              Self-hosted<span>Your infrastructure. Your control.</span>
            </div>
          </div>
          <button
            className="logout"
            onClick={async () => {
              try {
                await api('/auth/logout', { method: 'POST' });
                router.push('/login');
              } catch (e) {
                setError(message(e));
              }
            }}
          >
            <span className="avatar">A</span>
            <span>
              Administrator<small>Workspace owner</small>
            </span>
            <SignOut size={18} />
          </button>
        </div>
      </aside>
      <div className="main-area">
        <header className="topbar">
          <div>
            <span className="muted">Workspace</span>
            <span className="slash">/</span>
            {project?.name ?? slug}
          </div>
          <span className="private-label">
            <span className="status-dot" />
            Private instance
          </span>
        </header>
        <div className="environment-bar">
          <span>Environment</span>
          <div className="env-tabs" role="group" aria-label="Environment">
            {project?.environments.map((e) => (
              <button
                key={e.id}
                aria-pressed={environment?.id === e.id}
                onClick={() => setEnv(e.key)}
                className={environment?.id === e.id ? 'selected' : ''}
              >
                <span className={`env-dot ${e.key}`} />
                {e.key}
              </button>
            ))}
          </div>
          {environment?.key === 'production' && (
            <span className="production-note">Changes affect live traffic</span>
          )}
        </div>
        <main id="main">
          {error ? (
            <ErrorNotice error={error} retry={() => void load()} />
          ) : !loaded ? (
            <Loading />
          ) : !project || !environment ? (
            <div className="empty">
              <h1>Workspace not found</h1>
              <p>Select an available project, or run the demo seed.</p>
            </div>
          ) : (
            <WorkspaceContext.Provider value={{ project, environment }}>
              {children}
            </WorkspaceContext.Provider>
          )}
        </main>
        <footer>
          Flagpole <span>Small changes. Confident releases.</span>
        </footer>
      </div>
    </div>
  );
}
