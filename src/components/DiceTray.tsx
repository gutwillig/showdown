/**
 * DiceTray - two real 3D d20s on a felt pad.
 * Pitch die (cream) decides whose chart is used; swing die (clay) picks the row.
 */

import { Dice3D } from './Dice3D';

export interface DiceTrayProps {
  pitchValue: number | null;
  pitchRolling: boolean;
  swingValue: number | null;
  swingRolling: boolean;
  pitchTarget?: number | null;
  swingTarget?: number | null;
  control?: number;
  onBase?: number;
  pitchTotal?: number;
  advantage?: 'pitcher' | 'hitter' | null;
  resultLabel?: string | null;
  resultTone?: 'out' | 'onbase' | 'big' | null;
  showReadout?: boolean;
  size?: number;
}

export function DiceTray({
  pitchValue,
  pitchRolling,
  swingValue,
  swingRolling,
  pitchTarget,
  swingTarget,
  control,
  onBase,
  pitchTotal,
  advantage,
  resultLabel,
  resultTone,
  showReadout = true,
  size = 150
}: DiceTrayProps) {
  const showSwing = swingRolling || swingValue !== null;
  const pitchActive = pitchRolling || (pitchValue !== null && !showSwing);

  return (
    <div className="dice-tray-wrap">
      <div className="dice-pad">
        <div className={`die-slot ${pitchActive ? 'is-active' : ''} ${pitchValue === null && !pitchRolling ? 'is-waiting' : ''}`}>
          <Dice3D
            value={pitchRolling ? null : pitchValue}
            rolling={pitchRolling}
            target={pitchTarget}
            tone="cream"
            size={size}
            label="Pitch die"
          />
          <span className="die-caption">
            <span className="die-caption-label">Pitch</span>
            <span className="die-caption-num">{!pitchRolling && pitchValue !== null ? pitchValue : '—'}</span>
          </span>
        </div>
        <div className={`die-slot ${showSwing ? 'is-active' : ''} ${!showSwing ? 'is-waiting' : ''}`}>
          <Dice3D
            value={swingRolling ? null : swingValue}
            rolling={swingRolling}
            target={swingTarget}
            tone="clay"
            size={size}
            label="Swing die"
          />
          <span className="die-caption">
            <span className="die-caption-label">Swing</span>
            <span className="die-caption-num">{!swingRolling && swingValue !== null ? swingValue : '—'}</span>
          </span>
        </div>
      </div>

      {showReadout && (
        <div className="tray-readout" aria-live="polite">
          {pitchValue !== null && !pitchRolling && pitchTotal !== undefined && control !== undefined ? (
            <div className="readout-line">
              <span className="readout-math">
                {pitchValue} + {control} = <strong>{pitchTotal}</strong>
                <span className="readout-vs"> vs OB {onBase}</span>
              </span>
              {advantage && (
                <span className={`readout-adv adv-${advantage}`}>
                  {advantage === 'pitcher' ? "Pitcher's chart" : "Batter's chart"}
                </span>
              )}
            </div>
          ) : (
            <div className="readout-line readout-muted">
              {pitchRolling ? 'The pitch…' : 'Roll the pitch to set the advantage'}
            </div>
          )}
          <div className={`readout-result ${resultLabel ? `tone-${resultTone}` : ''}`}>
            {swingRolling ? <span className="readout-muted">The swing…</span> : resultLabel ?? '\u00a0'}
          </div>
        </div>
      )}
    </div>
  );
}
