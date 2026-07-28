/**
 * Broadcast-style Scoreboard component
 * Features visual diamond with lit-up bases, count, outs, and line score
 */

import type { BaseState } from '../data/types';

interface ScoreboardProps {
  awayName: string;
  homeName: string;
  awayScore: number;
  homeScore: number;
  inning: number;
  isTopHalf: boolean;
  outs: number;
  bases: BaseState;
  awayLineScore?: number[];
  homeLineScore?: number[];
}

export function Scoreboard({
  awayName,
  homeName,
  awayScore,
  homeScore,
  inning,
  isTopHalf,
  outs,
  bases,
  awayLineScore,
  homeLineScore
}: ScoreboardProps) {
  return (
    <div className="broadcast-scoreboard">
      {/* Main Score Display */}
      <div className="scoreboard-main">
        {/* Teams and Scores */}
        <div className="scoreboard-teams-panel">
          <div className={`scoreboard-team-row ${isTopHalf ? 'at-bat' : ''}`}>
            <span className="team-indicator">{isTopHalf ? '>' : ''}</span>
            <span className="team-abbr">{awayName}</span>
            <span className="team-score">{awayScore}</span>
          </div>
          <div className={`scoreboard-team-row ${!isTopHalf ? 'at-bat' : ''}`}>
            <span className="team-indicator">{!isTopHalf ? '>' : ''}</span>
            <span className="team-abbr">{homeName}</span>
            <span className="team-score">{homeScore}</span>
          </div>
        </div>

        {/* Diamond and Count */}
        <div className="scoreboard-situation-panel">
          {/* Visual Diamond */}
          <div className="scoreboard-diamond">
            <svg viewBox="0 0 60 60" className="diamond-svg">
              {/* Diamond outline */}
              <path
                d="M30 5 L55 30 L30 55 L5 30 Z"
                fill="none"
                stroke="#3a4a5a"
                strokeWidth="2"
              />
              {/* Base paths */}
              <line x1="30" y1="5" x2="55" y2="30" stroke="#3a4a5a" strokeWidth="1" />
              <line x1="55" y1="30" x2="30" y2="55" stroke="#3a4a5a" strokeWidth="1" />
              <line x1="30" y1="55" x2="5" y2="30" stroke="#3a4a5a" strokeWidth="1" />
              <line x1="5" y1="30" x2="30" y2="5" stroke="#3a4a5a" strokeWidth="1" />

              {/* Second Base */}
              <rect
                x="24" y="-1"
                width="12" height="12"
                transform="rotate(45 30 5)"
                className={`base-indicator ${bases.second ? 'base-occupied' : 'base-empty'}`}
              />
              {/* First Base */}
              <rect
                x="49" y="24"
                width="12" height="12"
                transform="rotate(45 55 30)"
                className={`base-indicator ${bases.first ? 'base-occupied' : 'base-empty'}`}
              />
              {/* Third Base */}
              <rect
                x="-1" y="24"
                width="12" height="12"
                transform="rotate(45 5 30)"
                className={`base-indicator ${bases.third ? 'base-occupied' : 'base-empty'}`}
              />
              {/* Home Plate */}
              <polygon
                points="30,50 25,55 30,60 35,55"
                fill="#3a4a5a"
              />
            </svg>
          </div>

          {/* Outs */}
          <div className="scoreboard-outs">
            <span className="outs-label">OUT</span>
            <div className="outs-dots">
              <div className={`out-indicator ${outs >= 1 ? 'out-active' : ''}`} />
              <div className={`out-indicator ${outs >= 2 ? 'out-active' : ''}`} />
            </div>
          </div>
        </div>

        {/* Inning */}
        <div className="scoreboard-inning-panel">
          <div className="inning-arrow">{isTopHalf ? '▲' : '▼'}</div>
          <div className="inning-number">{inning}</div>
        </div>
      </div>

      {/* Line Score (optional expanded view) */}
      {awayLineScore && homeLineScore && (awayLineScore.length > 0 || homeLineScore.length > 0) && (
        <div className="scoreboard-linescore">
          <div className="linescore-row linescore-header">
            <span className="linescore-team"></span>
            {Array.from({ length: Math.max(awayLineScore.length, homeLineScore.length, 3) }, (_, i) => (
              <span key={i} className="linescore-inning">{i + 1}</span>
            ))}
            <span className="linescore-total">R</span>
          </div>
          <div className="linescore-row">
            <span className="linescore-team">{awayName}</span>
            {Array.from({ length: Math.max(awayLineScore.length, homeLineScore.length, 3) }, (_, i) => (
              <span key={i} className="linescore-inning">
                {awayLineScore[i] !== undefined ? awayLineScore[i] : '-'}
              </span>
            ))}
            <span className="linescore-total">{awayScore}</span>
          </div>
          <div className="linescore-row">
            <span className="linescore-team">{homeName}</span>
            {Array.from({ length: Math.max(awayLineScore.length, homeLineScore.length, 3) }, (_, i) => (
              <span key={i} className="linescore-inning">
                {homeLineScore[i] !== undefined ? homeLineScore[i] : '-'}
              </span>
            ))}
            <span className="linescore-total">{homeScore}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// Compact scoreboard for tighter layouts
export function ScoreboardCompact({
  awayName,
  homeName,
  awayScore,
  homeScore,
  inning,
  isTopHalf,
  outs,
  bases
}: Omit<ScoreboardProps, 'awayLineScore' | 'homeLineScore'>) {
  return (
    <div className="scoreboard-compact">
      <div className="compact-teams">
        <div className={`compact-team ${isTopHalf ? 'batting' : ''}`}>
          <span className="compact-name">{awayName}</span>
          <span className="compact-score">{awayScore}</span>
        </div>
        <div className={`compact-team ${!isTopHalf ? 'batting' : ''}`}>
          <span className="compact-name">{homeName}</span>
          <span className="compact-score">{homeScore}</span>
        </div>
      </div>

      <div className="compact-situation">
        <div className="compact-inning">
          <span className="compact-half">{isTopHalf ? '▲' : '▼'}</span>
          <span className="compact-num">{inning}</span>
        </div>

        <div className="compact-diamond">
          <div className={`compact-base second ${bases.second ? 'on' : ''}`} />
          <div className="compact-diamond-row">
            <div className={`compact-base third ${bases.third ? 'on' : ''}`} />
            <div className={`compact-base first ${bases.first ? 'on' : ''}`} />
          </div>
        </div>

        <div className="compact-outs">
          <div className={`compact-out ${outs >= 1 ? 'active' : ''}`} />
          <div className={`compact-out ${outs >= 2 ? 'active' : ''}`} />
        </div>
      </div>
    </div>
  );
}
