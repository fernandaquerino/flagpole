'use client';
import { useEffect, useRef, type ReactNode } from 'react';
import { X, WarningCircle } from '@phosphor-icons/react';
export function ErrorNotice({
  error,
  retry,
}: {
  error: string;
  retry?: () => void;
}) {
  return (
    <div className="notice error" role="alert">
      <WarningCircle size={20} />
      <span>{error}</span>
      {retry && <button onClick={retry}>Reload latest</button>}
    </div>
  );
}
export function Loading() {
  return (
    <div className="loading" role="status">
      <span className="loading-dot" /> Loading workspace…
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog ref={ref} onCancel={onClose} aria-label={title}>
      <div className="dialog-heading">
        <h2>{title}</h2>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Diff({ before, after }: { before: unknown; after: unknown }) {
  return (
    <div className="diff">
      <div>
        <h3>Before</h3>
        <pre>{JSON.stringify(before, null, 2)}</pre>
      </div>
      <div>
        <h3>After</h3>
        <pre>{JSON.stringify(after, null, 2)}</pre>
      </div>
    </div>
  );
}
export function Toggle({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={`toggle ${checked ? 'on' : ''}`}
      onClick={onChange}
    >
      <span />
    </button>
  );
}
