import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { coverPath } from '../lib/data';
import type { Comment, Occurrence, TaskFull } from '../lib/types';
import { Photo, PhotoInput, SLOT_ICON } from '../components/ui';
import { useSignedUrl } from '../lib/media';

export function WorkerTask({ o, t, today, comments, queued, onDone, onBack }: {
  o: Occurrence; t: TaskFull; today: string; comments: Comment[]; queued: boolean;
  onDone: (photo: Blob | null, steps: string[]) => void; onBack: () => void;
}) {
  const [params] = useSearchParams();
  const [steps, setSteps] = useState<string[]>([]);
  const [photo, setPhoto] = useState<File | null>(null);
  const [showText, setShowText] = useState(false);
  const [zoom, setZoom] = useState<string | null>(null);
  const isDone = o.status === 'done';
  const extra = t.task_media.filter((m) => m.kind === 'photo');
  const notes = comments.filter((c) => c.body || c.photo_path);
  const wantsCamera = params.get('camera') === '1';

  return (
    <div className="worker">
      <div className="row between">
        <button className="w-back" onClick={onBack} aria-label="Back">←</button>
        <div className="row" style={{ fontSize: 28 }}>
          {SLOT_ICON[t.time_slot]}
          {t.exact_time && <span style={{ fontSize: 22, fontWeight: 700 }}>{t.exact_time.slice(0, 5)}</span>}
          {o.due_date < today && !isDone && <span aria-label="Late">⏰</span>}
          {queued && <span aria-label="Waiting for internet">📵</span>}
        </div>
        <button className="w-back" onClick={() => setShowText(!showText)} aria-label="Show words" aria-pressed={showText}>📝</button>
      </div>

      <div className="w-detail">
        <button style={{ padding: 0, border: 0, background: 'none' }} onClick={() => setZoom(coverPath(t))} aria-label="Show photo large">
          <span className="hero" style={{ display: 'grid', placeItems: 'center', fontSize: 80, overflow: 'hidden' }}>
            <Photo path={coverPath(t)} alt={t.title} className="hero" />
          </span>
        </button>

        {showText && (
          <div className="w-text">
            <h2 style={{ fontSize: 22 }}>{t.title}</h2>
            {t.description && <p style={{ whiteSpace: 'pre-wrap', fontSize: 18, marginTop: 8 }}>{t.description}</p>}
          </div>
        )}

        {notes.length > 0 && (
          <div className="stack">
            {notes.map((c) => (
              <div key={c.id} className="w-note">
                <span style={{ fontSize: 28 }} aria-hidden="true">{c.kind === 'reopen' ? '↺' : c.kind === 'flag' ? '⚠️' : '💬'}</span>
                <div className="stack" style={{ gap: 6 }}>
                  {c.body && <p style={{ fontSize: 17 }}>{c.body}</p>}
                  {c.photo_path && <div className="thumb" style={{ width: 120, height: 120 }}><Photo path={c.photo_path} /></div>}
                </div>
              </div>
            ))}
          </div>
        )}

        {extra.length > 0 && (
          <div className="w-strip">
            {extra.map((m) => (
              <button key={m.id} style={{ padding: 0, border: 0, background: 'none' }} onClick={() => setZoom(m.storage_path)} aria-label="Show photo large">
                <Photo path={m.storage_path} />
              </button>
            ))}
          </div>
        )}

        {t.task_steps.length > 0 && (
          <div className="w-steps">
            {t.task_steps.map((s, i) => {
              const on = isDone ? o.steps_done.includes(s.id) : steps.includes(s.id);
              return (
                <button key={s.id} className={`w-step${on ? ' on' : ''}`} disabled={isDone} aria-pressed={on}
                  onClick={() => setSteps(on ? steps.filter((x) => x !== s.id) : [...steps, s.id])}>
                  <span className="pic"><Photo path={s.photo_path} fallback={on ? '✅' : String(i + 1)} /></span>
                  <span className="lbl">{on ? '✅ ' : ''}{showText ? s.label : ''}</span>
                </button>
              );
            })}
          </div>
        )}

        {isDone ? (
          <div className="w-big go" style={{ textAlign: 'center' }} aria-label="Done">✅</div>
        ) : t.photo_required ? (
          photo ? (
            <div className="stack">
              <img src={URL.createObjectURL(photo)} alt="Your photo" className="hero" />
              <div className="row" style={{ flexWrap: 'nowrap' }}>
                <PhotoInput camera onPick={([f]) => setPhoto(f)}><button className="w-big" style={{ width: 'auto' }} aria-label="Take again">↺</button></PhotoInput>
                <button className="w-big go" onClick={() => onDone(photo, steps)} aria-label="Done">✓</button>
              </div>
            </div>
          ) : (
            <PhotoInput camera onPick={([f]) => setPhoto(f)}>
              <button className={`w-big cam${wantsCamera ? ' pulse' : ''}`} aria-label="Take a photo to finish">📷</button>
            </PhotoInput>
          )
        ) : (
          <button className="w-big go" onClick={() => onDone(null, steps)} aria-label="Done">✓</button>
        )}
      </div>

      {zoom && <Zoom path={zoom} onClose={() => setZoom(null)} />}
    </div>
  );
}

function Zoom({ path, onClose }: { path: string; onClose: () => void }) {
  const url = useSignedUrl(path);
  return (
    <div className="modal-back" onClick={onClose} role="dialog" aria-label="Photo">
      {url && <img src={url} alt="" style={{ maxHeight: '90vh', borderRadius: 16 }} />}
    </div>
  );
}
