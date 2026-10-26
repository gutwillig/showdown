import { useState, type ReactNode } from 'react';
import { Volume2, VolumeX, ArrowLeft } from 'lucide-react';
import { isMuted, setMuted } from './sfx';

export function AppHeader({ onBack, right }: { onBack?: () => void; right?: ReactNode }) {
  const [muted, setM] = useState(isMuted());
  return (
    <header className="app-header">
      <div className="app-header-left">
        {onBack && (
          <button className="icon-btn" onClick={onBack} aria-label="Back to home">
            <ArrowLeft size={18} />
          </button>
        )}
        <a href="#/" className="wordmark" onClick={onBack ? (e) => { e.preventDefault(); onBack(); } : undefined}>
          <span className="wordmark-mark" aria-hidden="true" />
          Showdown <span>Digital</span>
        </a>
      </div>
      <div className="app-header-right">
        {right}
        <button
          className="icon-btn"
          onClick={() => { setMuted(!muted); setM(!muted); }}
          aria-label={muted ? 'Unmute dice sounds' : 'Mute dice sounds'}
          aria-pressed={muted}
        >
          {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>
      </div>
    </header>
  );
}
