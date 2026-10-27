/**
 * Shared table-top pieces: slim score strip, field diamond, line score board, game log.
 */

import { useState, useEffect } from 'react';
import type { BaseState, OutcomeType, RunnersOnBase } from '../data/types';

/* ---------- Slim score strip (in-play) ---------- */

interface ScoreStripProps {
  awayName: string;
  homeName: string;
  awayScore: number;
  homeScore: number;
  inning: number;
  isTopHalf: boolean;
  outs: number;
  bases: BaseState;
}

export function ScoreStrip({ awayName, homeName, awayScore, homeScore, inning, isTopHalf, outs, bases }: ScoreStripProps) {
  return (
    <div className="score-strip" role="status" aria-label="Score">
      <div className={`strip-team ${isTopHalf ? 'is-batting' : ''}`}>
        <span className="strip-abbr">{awayName}</span>
        <span className="strip-runs" key={`a${awayScore}`}>{awayScore}</span>
      </div>
      <span className="strip-sep" />
      <div className={`strip-team ${!isTopHalf ? 'is-batting' : ''}`}>
        <span className="strip-abbr">{homeName}</span>
        <span className="strip-runs" key={`h${homeScore}`}>{homeScore}</span>
      </div>
      <span className="strip-sep" />
      <div className="strip-inning">{isTopHalf ? 'Top' : 'Bot'} {inning}</div>
      <span className="strip-sep" />
      <div className="strip-outs" aria-label={`${outs} out`}>
        <span className={`strip-out ${outs >= 1 ? 'on' : ''}`} />
        <span className={`strip-out ${outs >= 2 ? 'on' : ''}`} />
        <span className="strip-outs-label">{Math.min(outs, 3)} out</span>
      </div>
      <MiniBases bases={bases} />
    </div>
  );
}

function MiniBases({ bases }: { bases: BaseState }) {
  return (
    <svg className="mini-bases" viewBox="0 0 44 30" aria-hidden="true">
      <rect x="16" y="2" width="11" height="11" transform="rotate(45 21.5 7.5)" className={bases.second ? 'on' : ''} />
      <rect x="29" y="14" width="11" height="11" transform="rotate(45 34.5 19.5)" className={bases.first ? 'on' : ''} />
      <rect x="3" y="14" width="11" height="11" transform="rotate(45 8.5 19.5)" className={bases.third ? 'on' : ''} />
    </svg>
  );
}

/* ---------- Field diamond ---------- */

interface FieldDiamondProps {
  bases: BaseState;
  outs: number;
  runners?: RunnersOnBase;
}

// Runner dot positions (x, y) on the basepath
const RUNNER_POSITIONS = {
  first: { x: 145, y: 105 },
  second: { x: 100, y: 55 },
  third: { x: 55, y: 105 }
};

const lastName = (name: string) => name.split(' ').slice(-1)[0];

export function FieldDiamond({ bases, outs, runners }: FieldDiamondProps) {
  const [activeTooltip, setActiveTooltip] = useState<'first' | 'second' | 'third' | null>(null);

  // Auto-hide tooltip after 2 seconds
  useEffect(() => {
    if (activeTooltip) {
      const timer = setTimeout(() => setActiveTooltip(null), 2000);
      return () => clearTimeout(timer);
    }
  }, [activeTooltip]);

  const handleRunnerClick = (base: 'first' | 'second' | 'third') => {
    setActiveTooltip(activeTooltip === base ? null : base);
  };

  return (
    <div className="field">
      <svg viewBox="0 0 200 170" className="field-svg" aria-label={`Runners: ${[bases.first && 'first', bases.second && 'second', bases.third && 'third'].filter(Boolean).join(', ') || 'bases empty'}`}>
        <path d="M100 160 L10 70 A127 127 0 0 1 190 70 Z" className="field-grass" />
        <path d="M100 150 L45 95 L100 40 L155 95 Z" className="field-infield" />
        <circle cx="100" cy="95" r="7" className="field-mound" />
        <g className={`field-base ${bases.second ? 'on' : ''}`}><rect x="93" y="33" width="14" height="14" transform="rotate(45 100 40)" /></g>
        <g className={`field-base ${bases.first ? 'on' : ''}`}><rect x="148" y="88" width="14" height="14" transform="rotate(45 155 95)" /></g>
        <g className={`field-base ${bases.third ? 'on' : ''}`}><rect x="38" y="88" width="14" height="14" transform="rotate(45 45 95)" /></g>
        <path d="M94 146 L106 146 L106 152 L100 158 L94 152 Z" className="field-plate" />

        {/* Runner dots */}
        {bases.first && (
          <g className="field-runner" onClick={() => handleRunnerClick('first')}>
            <circle cx={RUNNER_POSITIONS.first.x} cy={RUNNER_POSITIONS.first.y} r="10" />
          </g>
        )}
        {bases.second && (
          <g className="field-runner" onClick={() => handleRunnerClick('second')}>
            <circle cx={RUNNER_POSITIONS.second.x} cy={RUNNER_POSITIONS.second.y} r="10" />
          </g>
        )}
        {bases.third && (
          <g className="field-runner" onClick={() => handleRunnerClick('third')}>
            <circle cx={RUNNER_POSITIONS.third.x} cy={RUNNER_POSITIONS.third.y} r="10" />
          </g>
        )}
      </svg>

      {/* Runner name tooltips */}
      {activeTooltip && runners?.[activeTooltip] && (
        <div
          className={`field-tooltip field-tooltip-${activeTooltip}`}
          onClick={() => setActiveTooltip(null)}
        >
          {lastName(runners[activeTooltip]!)}
        </div>
      )}

      <div className="field-outs">{Math.min(outs, 3)} out{outs === 1 ? '' : 's'}</div>
    </div>
  );
}

/* ---------- Line score (inning break / final) ---------- */

interface LineScoreProps {
  awayName: string;
  homeName: string;
  away: number[];
  home: number[];
  awayHits?: number;
  homeHits?: number;
  minInnings?: number;
  status: string;
}

export function LineScoreBoard({ awayName, homeName, away, home, awayHits, homeHits, minInnings = 3, status }: LineScoreProps) {
  const cols = Math.max(minInnings, away.length, home.length);
  const sum = (a: number[]) => a.reduce((s, n) => s + n, 0);
  const showHits = awayHits !== undefined && homeHits !== undefined;

  const row = (name: string, line: number[], hits?: number) => (
    <tr>
      <th scope="row" className="ls-team">{name}</th>
      {Array.from({ length: cols }, (_, i) => (
        <td key={i} className="ls-inn" style={{ animationDelay: `${i * 60}ms` }}>{line[i] ?? ''}</td>
      ))}
      <td className="ls-tot ls-r">{sum(line)}</td>
      {showHits && <td className="ls-tot">{hits}</td>}
    </tr>
  );

  return (
    <section className="paper-panel line-score">
      <header className="paper-head">
        <h2>Line Score</h2>
        <span className="paper-status">{status}</span>
      </header>
      <div className="ls-scroll">
        <table className="ls-table">
          <thead>
            <tr>
              <th scope="col" className="ls-team">Team</th>
              {Array.from({ length: cols }, (_, i) => <th scope="col" key={i}>{i + 1}</th>)}
              <th scope="col" className="ls-r">R</th>
              {showHits && <th scope="col">H</th>}
            </tr>
          </thead>
          <tbody>
            {row(awayName, away, awayHits)}
            {row(homeName, home, homeHits)}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ---------- Game log ---------- */

export interface LogRow {
  id: number | string;
  label: string;
  text: string;
  outcome?: OutcomeType;
}

const OUT_SET = new Set(['PU', 'SO', 'GB', 'FB']);

export function GameLog({ rows, title = 'Game Log' }: { rows: LogRow[]; title?: string }) {
  return (
    <section className="game-log" aria-label={title}>
      <header className="game-log-head">
        <h3>{title}</h3>
        <span>{rows.length} plays</span>
      </header>
      {rows.length === 0 ? (
        <p className="game-log-empty">First pitch coming up.</p>
      ) : (
        <ol className="game-log-list">
          {rows.map((r, i) => (
            <li
              key={r.id}
              className={`log-row ${i === 0 ? 'is-latest' : ''} ${r.outcome && !OUT_SET.has(r.outcome) ? 'is-onbase' : ''} ${r.outcome === 'HR' ? 'is-hr' : ''}`}
            >
              <span className="log-label">{r.label}</span>
              <span className="log-text">{r.text}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
