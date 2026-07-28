/**
 * Half-Inning Mode - Mode B
 */

import { useMemo } from 'react';
import { useGameStore } from '../store';
import { Card } from './Card';
import { PlayerSelect } from './PlayerSelect';
import { getTeams, autoLineup } from '../data/cards';
import type { OutcomeType } from '../data/types';

export function HalfInning() {
  const {
    cards,
    selectedPitcher,
    setSelectedPitcher,
    lineup,
    setLineup,
    inningState,
    phase,
    currentResult,
    eventLog,
    rollPitch,
    rollSwing,
    advanceHalfInning,
    startHalfInning,
    fastForwardInning
  } = useGameStore();

  const teams = useMemo(() => cards ? getTeams(cards) : [], [cards]);

  const currentHitter = lineup[inningState.batterIndex];

  const handleAutoLineup = (team: string) => {
    if (!cards) return;
    const newLineup = autoLineup(cards, team);
    setLineup(newLineup);
    startHalfInning();
  };

  if (!cards) return <div className="loading">Loading cards...</div>;

  const canPlay = selectedPitcher && lineup.length >= 1;
  const showPitchButton = phase === 'select' && canPlay && inningState.outs < 3;
  const showSwingButton = phase === 'swing';
  const showNextButton = phase === 'result' && inningState.outs < 3;
  const isInningComplete = phase === 'inningComplete' || inningState.outs >= 3;

  return (
    <div>
      {/* Setup */}
      <div style={{ display: 'flex', gap: '2rem', marginBottom: '2rem', flexWrap: 'wrap', justifyContent: 'center' }}>
        <PlayerSelect
          label="Select Pitcher"
          players={cards.pitchers}
          selected={selectedPitcher}
          onSelect={setSelectedPitcher}
          teams={teams}
        />

        <div className="select-group">
          <label className="select-label">Batting Team</label>
          <select
            className="select-input"
            onChange={(e) => handleAutoLineup(e.target.value)}
            value=""
          >
            <option value="">Select team for auto-lineup...</option>
            {teams.map(team => (
              <option key={team} value={team}>{team}</option>
            ))}
          </select>
          {lineup.length > 0 && (
            <div style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
              {lineup.length} batters loaded
            </div>
          )}
        </div>
      </div>

      {canPlay && (
        <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
          {/* Left: Pitcher Card + Controls */}
          <div style={{ flex: '1', minWidth: '300px' }}>
            <Card card={selectedPitcher} type="pitcher" />

            {/* Inning Summary */}
            <div className="inning-summary" style={{ marginTop: '1rem' }}>
              <div className="inning-runs">{inningState.runs}</div>
              <div className="inning-label">Runs</div>

              <div style={{ display: 'flex', gap: '2rem', justifyContent: 'center', marginTop: '1rem' }}>
                <div>
                  <div className="stat-value">{inningState.hits}</div>
                  <div className="stat-label">Hits</div>
                </div>
                <div>
                  <div className="stat-value">{inningState.walks}</div>
                  <div className="stat-label">Walks</div>
                </div>
              </div>
            </div>
          </div>

          {/* Center: Diamond + Controls */}
          <div style={{ flex: '1', minWidth: '300px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            {/* Outs */}
            <div className="outs-indicator">
              <div className={`out-dot ${inningState.outs >= 1 ? 'active' : ''}`} />
              <div className={`out-dot ${inningState.outs >= 2 ? 'active' : ''}`} />
              <div className={`out-dot ${inningState.outs >= 3 ? 'active' : ''}`} />
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
              {inningState.outs} Out{inningState.outs !== 1 ? 's' : ''}
            </div>

            {/* Diamond */}
            <div className="diamond">
              <div className="diamond-paths" />
              <div className={`base first ${inningState.bases.first ? 'occupied' : ''}`} />
              <div className={`base second ${inningState.bases.second ? 'occupied' : ''}`} />
              <div className={`base third ${inningState.bases.third ? 'occupied' : ''}`} />
              <div className="base home" />
            </div>

            {/* Dice + Result */}
            {(phase === 'pitch' || phase === 'swing' || phase === 'result') && currentResult && (
              <div className="dice-area">
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                  <div className={`dice ${phase === 'pitch' ? 'rolling' : ''}`}>
                    {currentResult.pitchRoll}
                  </div>
                  {(phase === 'swing' || phase === 'result') && (
                    <div className={`dice ${phase === 'swing' ? 'rolling' : ''}`}>
                      {currentResult.swingRoll}
                    </div>
                  )}
                </div>

                <div className={`advantage-banner ${currentResult.advantageHolder}`}>
                  {currentResult.advantageHolder.toUpperCase()}
                </div>

                {phase === 'result' && (
                  <div className="outcome-banner" style={{
                    background: getOutcomeColor(currentResult.outcome),
                    color: 'white'
                  }}>
                    {currentResult.description}
                  </div>
                )}
              </div>
            )}

            {/* Controls */}
            <div className="controls" style={{ marginTop: '1rem' }}>
              {showPitchButton && (
                <button className="btn btn-primary" onClick={rollPitch}>
                  PITCH
                </button>
              )}
              {showSwingButton && (
                <button className="btn btn-primary" onClick={rollSwing}>
                  SWING
                </button>
              )}
              {showNextButton && (
                <button className="btn btn-primary" onClick={advanceHalfInning}>
                  Next Batter
                </button>
              )}
              {isInningComplete && (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '1.5rem', marginBottom: '1rem', fontFamily: 'Oswald' }}>
                    INNING COMPLETE
                  </div>
                  <button className="btn btn-primary" onClick={startHalfInning}>
                    New Inning
                  </button>
                </div>
              )}

              {phase === 'select' && canPlay && inningState.outs < 3 && (
                <button className="btn btn-secondary" onClick={fastForwardInning}>
                  Fast Forward
                </button>
              )}
            </div>
          </div>

          {/* Right: Lineup + Current Batter */}
          <div style={{ flex: '1', minWidth: '300px' }}>
            {currentHitter && inningState.outs < 3 && (
              <Card
                card={currentHitter}
                type="hitter"
                glowing={currentResult?.advantageHolder === 'hitter'}
                highlightedRoll={currentResult?.advantageHolder === 'hitter' ? currentResult.swingRoll : undefined}
              />
            )}

            {/* Lineup */}
            <div className="lineup-area" style={{ marginTop: '1rem' }}>
              <div className="lineup-title">Lineup</div>
              {lineup.map((hitter, i) => (
                <div
                  key={hitter.id}
                  className={`lineup-item ${i === inningState.batterIndex && inningState.outs < 3 ? 'current' : ''}`}
                >
                  <span>{i + 1}. {hitter.name}</span>
                  <span style={{ fontFamily: 'Oswald' }}>{hitter.onBase}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Event Log */}
      {eventLog.length > 0 && (
        <div className="event-log" style={{ marginTop: '2rem' }}>
          <div className="event-log-title">Play-by-Play</div>
          {eventLog.slice(0, 20).map((result, i) => (
            <div key={i} className="event-item">
              <span style={{ color: getOutcomeColor(result.outcome), fontWeight: 600 }}>
                {result.outcome}
              </span>
              {result.runsScored > 0 && (
                <span style={{ color: '#ffd700', marginLeft: '0.5rem' }}>
                  +{result.runsScored} run{result.runsScored > 1 ? 's' : ''}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function getOutcomeColor(outcome: OutcomeType): string {
  const colors: Record<OutcomeType, string> = {
    'PU': '#6b7280',
    'SO': '#6b7280',
    'GB': '#6b7280',
    'FB': '#6b7280',
    'BB': '#60a5fa',
    '1B': '#34d399',
    '1B+': '#34d399',
    '2B': '#fbbf24',
    '3B': '#f97316',
    'HR': '#ef4444'
  };
  return colors[outcome];
}
