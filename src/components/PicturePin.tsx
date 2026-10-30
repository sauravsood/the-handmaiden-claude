import { useState } from 'react';

export const PIN_ICONS = ['🥭', '☕', '⭐', '🏠', '🌸', '🐟', '🚲', '🌙', '🍌'];

/** Four taps on pictures. Calls onComplete with a code like "3-0-7-1". */
export function PicturePin({ onComplete, small, disabled }: { onComplete: (pin: string) => void; small?: boolean; disabled?: boolean }) {
  const [taps, setTaps] = useState<number[]>([]);
  const tap = (i: number) => {
    const next = [...taps, i];
    if (next.length === 4) {
      setTaps([]);
      onComplete(next.join('-'));
    } else {
      setTaps(next);
    }
  };
  return (
    <div className="stack">
      <div className="pin-dots" aria-label={`${taps.length} of 4 chosen`}>
        {[0, 1, 2, 3].map((i) => <span key={i} className={i < taps.length ? 'on' : ''} />)}
      </div>
      <div className={`pin-pad${small ? ' small' : ''}`}>
        {PIN_ICONS.map((icon, i) => (
          <button key={i} type="button" onClick={() => tap(i)} disabled={disabled} aria-label={`Picture ${i + 1}`}>{icon}</button>
        ))}
      </div>
      {taps.length > 0 && (
        <button type="button" className="ghost" onClick={() => setTaps([])} aria-label="Start again">↺</button>
      )}
    </div>
  );
}

export function pinIcons(pin: string): string {
  return pin.split('-').map((i) => PIN_ICONS[Number(i)]).join(' ');
}
