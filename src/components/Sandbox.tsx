/**
 * At-Bat Sandbox Mode - Mode A
 */

import { useMemo } from 'react';
import { useGameStore } from '../store';
import { Card } from './Card';
import { PlayerSelect } from './PlayerSelect';
import { getTeams } from '../data/cards';
import { calculateMatchupProbabilities, calculateExpectedOBP, calculatePitcherAdvantageProb } from '../engine/engine';
import type { OutcomeType } from '../data/types';

export function Sandbox() {
  const {
    cards,
    selectedPitcher,
    selectedHitter,
    setSelectedPitcher,
    setSelectedHitter,
    phase,
    currentResult,
    eventLog,
    matchupStats,
    rollPitch,
    rollSwing,
    startNewAtBat,
    runQuickBatch
  } = useGameStore();

  const teams = useMemo(() => cards ? getTeams(cards) : [], [cards]);

  const matchupProbs = useMemo(() => {
    if (!selectedPitcher || !selectedHitter) return null;
    return calculateMatchupProbabilities(selectedPitcher, selectedHitter);
  }, [selectedPitcher, selectedHitter]);

  const pitcherAdvProb = useMemo(() => {
    if (!selectedPitcher || !selectedHitter) return 0;
    return calculatePitcherAdvantageProb(selectedPitcher.control, selectedHitter.onBase);
  }, [selectedPitcher, selectedHitter]);

  if (!cards) return <div className="loading">Loading cards...</div>;

  const canPlay = selectedPitcher && selectedHitter;
  const showPitchButton = phase === 'select' && canPlay;
  const showSwingButton = phase === 'swing';
  const showNewAtBatButton = phase === 'result';

  return (
    <div>
      {/* Player Selection */}
      <div style={{ display: 'flex', gap: '2rem', marginBottom: '2rem', flexWrap: 'wrap', justifyContent: 'center' }}>
        <PlayerSelect
          label="Select Pitcher"
          players={cards.pitchers}
          selected={selectedPitcher}
          onSelect={setSelectedPitcher}
          teams={teams}
        />
        <PlayerSelect
          label="Select Hitter"
          players={cards.hitters}
          selected={selectedHitter}
          onSelect={setSelectedHitter}
          teams={teams}
        />
      </div>

      {/* Matchup Display */}
      {canPlay && (
        <>
          <div className="matchup-area">
            <Card
              card={selectedPitcher}
              type="pitcher"
              dimmed={currentResult?.advantageHolder === 'hitter'}
              glowing={currentResult?.advantageHolder === 'pitcher'}
              highlightedRoll={currentResult?.advantageHolder === 'pitcher' ? currentResult.swingRoll : undefined}
            />

            <div className="vs-divider">
              <span className="vs-text">VS</span>

              {/* Dice Display */}
              {(phase === 'pitch' || phase === 'swing' || phase === 'result') && currentResult && (
                <div className="dice-area">
                  <div className={`dice ${phase === 'pitch' ? 'rolling' : ''}`}>
                    {currentResult.pitchRoll}
                  </div>
                  <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                    {currentResult.pitchRoll} + {selectedPitcher.control} = {currentResult.pitchTotal}
                    {' vs '}{selectedHitter.onBase}
                  </div>
                  <div className={`advantage-banner ${currentResult.advantageHolder}`}>
                    {currentResult.advantageHolder.toUpperCase()} Advantage
                  </div>

                  {(phase === 'swing' || phase === 'result') && (
                    <>
                      <div className={`dice ${phase === 'swing' ? 'rolling' : ''}`}>
                        {currentResult.swingRoll}
                      </div>
                    </>
                  )}

                  {phase === 'result' && (
                    <div className={`outcome-banner ${['HR', '3B', '2B'].includes(currentResult.outcome) ? 'style-hit' : ''}`}
                      style={{
                        background: getOutcomeColor(currentResult.outcome),
                        color: 'white'
                      }}>
                      {currentResult.description}
                    </div>
                  )}
                </div>
              )}
            </div>

            <Card
              card={selectedHitter}
              type="hitter"
              dimmed={currentResult?.advantageHolder === 'pitcher'}
              glowing={currentResult?.advantageHolder === 'hitter'}
              highlightedRoll={currentResult?.advantageHolder === 'hitter' ? currentResult.swingRoll : undefined}
            />
          </div>

          {/* Controls */}
          <div className="controls">
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
            {showNewAtBatButton && (
              <div style={{ display: 'flex', gap: '1rem' }}>
                <button className="btn btn-primary" onClick={startNewAtBat}>
                  New At-Bat
                </button>
                <button className="btn btn-secondary" onClick={() => runQuickBatch(10)}>
                  Roll x10
                </button>
              </div>
            )}
          </div>

          {/* Stats Strip */}
          <div className="stats-strip">
            <div className="stat-item">
              <div className="stat-value">{matchupStats.pa}</div>
              <div className="stat-label">PA</div>
            </div>
            <div className="stat-item">
              <div className="stat-value">{matchupStats.hits}</div>
              <div className="stat-label">H</div>
            </div>
            <div className="stat-item">
              <div className="stat-value">{matchupStats.hr}</div>
              <div className="stat-label">HR</div>
            </div>
            <div className="stat-item">
              <div className="stat-value">{matchupStats.bb}</div>
              <div className="stat-label">BB</div>
            </div>
            <div className="stat-item">
              <div className="stat-value">{matchupStats.so}</div>
              <div className="stat-label">K</div>
            </div>
            <div className="stat-item">
              <div className="stat-value">
                {matchupStats.pa > 0
                  ? ((matchupStats.hits + matchupStats.bb) / matchupStats.pa).toFixed(3).slice(1)
                  : '.000'}
              </div>
              <div className="stat-label">OBP</div>
            </div>
          </div>

          {/* Probability Display */}
          {matchupProbs && (
            <div className="probability-display">
              <div className="probability-title">Matchup Probabilities</div>
              <div className="probability-row">
                <span>Pitcher Advantage:</span>
                <span>{(pitcherAdvProb * 100).toFixed(1)}%</span>
              </div>
              <div className="probability-row">
                <span>Expected OBP:</span>
                <span>{calculateExpectedOBP(matchupProbs).toFixed(3)}</span>
              </div>
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                {(['SO', 'BB', '1B', '2B', '3B', 'HR'] as OutcomeType[]).map(outcome => (
                  <div key={outcome} style={{ fontSize: '0.75rem' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>{outcome}:</span>{' '}
                    {(matchupProbs[outcome] * 100).toFixed(1)}%
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Event Log */}
          {eventLog.length > 0 && (
            <div className="event-log" style={{ marginTop: '1rem' }}>
              <div className="event-log-title">Event Log</div>
              {eventLog.slice(0, 20).map((result, i) => (
                <div key={i} className="event-item">
                  <span style={{ color: getOutcomeColor(result.outcome) }}>
                    {result.outcome}
                  </span>
                  {' - '}
                  {result.advantageHolder === 'pitcher' ? 'P' : 'H'} advantage
                  {' '}
                  ({result.pitchRoll}+{selectedPitcher.control}={result.pitchTotal} vs {selectedHitter.onBase})
                  {' → '}roll {result.swingRoll}
                </div>
              ))}
            </div>
          )}
        </>
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
