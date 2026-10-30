import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useSignedUrl } from '../lib/media';
import type { PhotoRef } from '../lib/data';
import type { Member, Occurrence } from '../lib/types';

export function Photo({ path, alt = '', fallback = '🧹', className }: { path: string | null | undefined; alt?: string; fallback?: string; className?: string }) {
  const url = useSignedUrl(path);
  return url ? <img src={url} alt={alt} className={className} loading="lazy" /> : <span aria-hidden="true">{fallback}</span>;
}

/** Shows a stored photo or one just picked on this device. */
export function PhotoRefImg({ value }: { value: PhotoRef }) {
  const url = useSignedUrl('path' in value ? value.path : null);
  const src = 'path' in value ? url : value.preview;
  return src ? <img src={src} alt="" /> : null;
}

export function Avatar({ member, size }: { member: Pick<Member, 'display_name' | 'photo_path'> | undefined; size?: number }) {
  const url = useSignedUrl(member?.photo_path);
  const style = size ? { width: size, height: size } : undefined;
  return (
    <span className="avatar" style={style} title={member?.display_name}>
      {url ? <img src={url} alt="" /> : (member?.display_name ?? '?').slice(0, 1).toUpperCase()}
    </span>
  );
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="row between">
          <h2>{title}</h2>
          <button className="ghost" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ErrorBox({ error }: { error: string | null | undefined }) {
  return error ? <div className="error" role="alert">{error}</div> : null;
}

export function Loading() {
  return <div className="empty">Loading…</div>;
}

export const PRIORITY_LABEL: Record<number, string> = { 1: 'P1 urgent', 2: 'P2 high', 3: 'P3 medium', 4: 'P4 normal' };

export function PriorityPill({ p }: { p: number }) {
  if (p === 4) return null;
  return <span className={`pill ${p === 1 ? 'bad' : p === 2 ? 'warn' : 'accent'}`}>P{p}</span>;
}

export function StatusPill({ o, today }: { o: Occurrence; today: string }) {
  if (o.status === 'done') {
    if (o.review_status === 'flagged') return <span className="pill bad">Flagged</span>;
    if (o.review_status === 'approved') return <span className="pill good">Approved</span>;
    return <span className={`pill ${o.done_late ? 'warn' : 'good'}`}>{o.done_late ? 'Done late' : 'Done'}</span>;
  }
  if (o.status === 'skipped') return <span className="pill">Skipped</span>;
  if (o.status === 'missed') return <span className="pill bad">Missed</span>;
  if (o.attempt > 1) return <span className="pill warn">Redo</span>;
  return o.due_date < today ? <span className="pill bad">Overdue</span> : <span className="pill accent">To do</span>;
}

export const SLOT_ICON: Record<string, string> = { morning: '🌅', afternoon: '☀️', evening: '🌙', anytime: '' };
export const SLOT_LABEL: Record<string, string> = { morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening', anytime: 'Any time' };

/** File input that opens the camera on phones when `camera` is set. */
export function PhotoInput({ onPick, camera, children, multiple }: {
  onPick: (files: File[]) => void; camera?: boolean; multiple?: boolean; children: ReactNode;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={ref} type="file" accept="image/*" hidden multiple={multiple}
        {...(camera ? { capture: 'environment' as const } : {})}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          if (files.length) onPick(files);
        }}
      />
      <span onClick={() => ref.current?.click()} style={{ display: 'contents' }}>{children}</span>
    </>
  );
}

export function useToggleSet<T>(initial: T[] = []) {
  const [set, setSet] = useState<T[]>(initial);
  return [set, (v: T) => setSet((s) => (s.includes(v) ? s.filter((x) => x !== v) : [...s, v])), setSet] as const;
}
