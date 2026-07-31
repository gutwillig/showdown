/**
 * Exhibition Game Screen
 * Main game UI for 3-inning exhibition mode
 * Two-step at-bat flow: PITCH -> advantage -> SWING -> result
 */

import { useExhibitionStore } from './exhibitionStore';
import { getTotalScore } from '../multiplayer/protocol';
import { Card } from '../components/Card';
import { ScoreboardScoreOnly } from '../components/Scoreboard';
import type { OutcomeType } from '../data/types';

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

export function ExhibitionGame() {
  const {
    awayRoster,
    homeRoster,
    awayTeamName,
    homeTeamName,
    inning,
    isTopHalf,
    inningState,
    lineScore,
    homeBatterIndex,
    awayBatterIndex,
    playPhase,
    partialAtBat,
    lastAtBat,
    animatingDice,
    winner,
    gamePhase,
    performPitch,
    performSwing,
    advanceGame,
    resetGame,
    goToSetup
  } = useExhibitionStore();

  if (!awayRoster || !homeRoster) {
    return <div className="loading">Loading game state...</div>;
  }

  // Current matchup
  const battingRoster = isTopHalf ? awayRoster : homeRoster;
  const pitchingRoster = isTopHalf ? homeRoster : awayRoster;
  const batterIndex = isTopHalf ? awayBatterIndex : homeBatterIndex;

  // During result phase, show the batter who just hit (before index advance)
  const displayBatterIndex = playPhase === 'result' && lastAtBat
    ? (batterIndex === 0 ? 8 : batterIndex - 1)
    : batterIndex;
  const currentBatter = battingRoster.lineup[displayBatterIndex];
  const currentPitcher = pitchingRoster.pitcher;

  // Scores
  const scores = getTotalScore(lineScore);

  // Team names
  const battingTeamName = isTopHalf ? awayTeamName : homeTeamName;
  const pitchingTeamName = isTopHalf ? homeTeamName : awayTeamName;

  // Game over screen
  if (gamePhase === 'gameOver' || winner) {
    const winnerName = winner === 'home' ? homeTeamName : awayTeamName;

    return (
      <div className="game-screen game-over-screen">
        <div className="game-over-banner">
          <h1>Game Over!</h1>
          <p>{winnerName} wins!</p>
        </div>

        <div className="final-score">
          <div className="line-score-table">
            <div className="line-score-header">
              <span className="team-col"></span>
              {lineScore.away.map((_, i) => (
                <span key={i} className="inning-col">{i + 1}</span>
              ))}
              <span className="total-col">R</span>
            </div>
            <div className="line-score-row">
              <span className="team-col">{awayTeamName}</span>
              {lineScore.away.map((runs, i) => (
                <span key={i} className="inning-col">{runs}</span>
              ))}
              <span className="total-col">{scores.away}</span>
            </div>
            <div className="line-score-row">
              <span className="team-col">{homeTeamName}</span>
              {lineScore.home.map((runs, i) => (
                <span key={i} className="inning-col">{runs}</span>
              ))}
              <span className="total-col">{scores.home}</span>
            </div>
          </div>
        </div>

        <div className="game-over-actions">
          <button className="btn btn-primary" onClick={resetGame}>
            Play Again
          </button>
          <button className="btn btn-secondary" onClick={goToSetup}>
            New Game
          </button>
        </div>
      </div>
    );
  }

  // Half-inning transition
  if (playPhase === 'halfInningEnd') {
    return (
      <div className="game-screen half-inning-transition">
        <div className="transition-content">
          <h2>End of {isTopHalf ? 'Top' : 'Bottom'} {inning}</h2>
          <div className="transition-score">
            <div className="score-team">
              <span className="score-name">{awayTeamName}</span>
              <span className="score-value">{scores.away}</span>
            </div>
            <div className="score-divider">-</div>
            <div className="score-team">
              <span className="score-name">{homeTeamName}</span>
              <span className="score-value">{scores.home}</span>
            </div>
          </div>
          <p className="transition-hint">
            {!isTopHalf ? `Top of ${inning + 1} coming up...` : `${homeTeamName} coming to bat...`}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="game-screen exhibition-game">
      {/* Scoreboard (score only - diamond shown in center) */}
      <ScoreboardScoreOnly
        awayName={awayTeamName}
        homeName={homeTeamName}
        awayScore={scores.away}
        homeScore={scores.home}
        inning={inning}
        isTopHalf={isTopHalf}
        awayLineScore={lineScore.away}
        homeLineScore={lineScore.home}
      />

      {/* Main game area with 3-column layout */}
      <div className="exhibition-main">
        {/* Left: Pitcher Card */}
        <div className="exhibition-pitcher-area">
          <div className="card-role">{pitchingTeamName} Pitching</div>
          <Card
            card={currentPitcher}
            type="pitcher"
            highlighted={playPhase === 'pitching' || playPhase === 'pitchRolling'}
            highlightedRoll={lastAtBat?.swingRoll}
            showHighlightedBand={playPhase === 'result' && lastAtBat?.advantageHolder === 'pitcher'}
          />

          {/* Inning Summary */}
          <div className="inning-summary">
            <div className="inning-runs">{inningState.runs}</div>
            <div className="inning-label">Runs This Inning</div>
            <div className="inning-stats">
              <div>
                <div className="stat-value">{inningState.hits}</div>
                <div className="stat-label">Hits</div>
              </div>
            </div>
          </div>
        </div>

        {/* Center: Diamond + Dice + Controls */}
        <div className="exhibition-center">
          {/* Outs indicator */}
          <div className="outs-indicator">
            <div className={`out-dot ${inningState.outs >= 1 ? 'active' : ''}`} />
            <div className={`out-dot ${inningState.outs >= 2 ? 'active' : ''}`} />
            <div className={`out-dot ${inningState.outs >= 3 ? 'active' : ''}`} />
          </div>
          <div className="outs-label">{inningState.outs} Out{inningState.outs !== 1 ? 's' : ''}</div>

          {/* Diamond with runners */}
          <div className="diamond">
            <div className="diamond-paths" />
            <div className={`base first ${inningState.bases.first ? 'occupied' : ''}`} />
            <div className={`base second ${inningState.bases.second ? 'occupied' : ''}`} />
            <div className={`base third ${inningState.bases.third ? 'occupied' : ''}`} />
            <div className="base home" />
          </div>

          {/* Dice Area */}
          <div className="dice-area">
            {/* Pitch dice */}
            {(playPhase === 'pitchRolling' || partialAtBat || lastAtBat) && (
              <div className="dice-row">
                <div className="dice-result">
                  <span className="dice-label">Pitch</span>
                  <div className={`dice ${playPhase === 'pitchRolling' ? 'rolling' : ''}`}>
                    {playPhase === 'pitchRolling'
                      ? animatingDice
                      : (partialAtBat?.pitchRoll || lastAtBat?.pitchRoll)}
                  </div>
                  {(partialAtBat || lastAtBat) && (
                    <span className="dice-total">
                      +{currentPitcher.control} = {partialAtBat?.pitchTotal || lastAtBat?.pitchTotal}
                    </span>
                  )}
                </div>

                {/* Swing dice - only show after pitch is resolved */}
                {(playPhase === 'swingRolling' || lastAtBat) && (
                  <div className="dice-result">
                    <span className="dice-label">Swing</span>
                    <div className={`dice ${playPhase === 'swingRolling' ? 'rolling' : ''}`}>
                      {playPhase === 'swingRolling' ? animatingDice : lastAtBat?.swingRoll}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Advantage banner - show after pitch, during swing, or with result */}
            {(partialAtBat || lastAtBat) && (
              <div className={`advantage-banner ${partialAtBat?.advantageHolder || lastAtBat?.advantageHolder}`}>
                {(partialAtBat?.advantageHolder || lastAtBat?.advantageHolder)?.toUpperCase()} ADVANTAGE
              </div>
            )}

            {/* Outcome banner - only show on result */}
            {playPhase === 'result' && lastAtBat && (
              <div
                className="outcome-banner"
                style={{ background: getOutcomeColor(lastAtBat.outcome) }}
              >
                {lastAtBat.description}
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="controls">
            {playPhase === 'pitching' && (
              <button className="btn btn-primary btn-large" onClick={performPitch}>
                PITCH
              </button>
            )}

            {playPhase === 'pitchRolling' && (
              <div className="rolling-indicator">Rolling...</div>
            )}

            {playPhase === 'pitched' && (
              <button className="btn btn-primary btn-large" onClick={performSwing}>
                SWING
              </button>
            )}

            {playPhase === 'swingRolling' && (
              <div className="rolling-indicator">Rolling...</div>
            )}

            {playPhase === 'result' && (
              <button className="btn btn-primary btn-large" onClick={advanceGame}>
                {inningState.outs >= 3 ? 'Next Inning' : 'Next Batter'}
              </button>
            )}
          </div>
        </div>

        {/* Right: Hitter Card + Lineup */}
        <div className="exhibition-hitter-area">
          <div className="card-role">{battingTeamName} Batting</div>
          <Card
            card={currentBatter}
            type="hitter"
            highlighted={playPhase === 'pitched' || playPhase === 'swingRolling'}
            highlightedRoll={lastAtBat?.swingRoll}
            showHighlightedBand={playPhase === 'result' && lastAtBat?.advantageHolder === 'hitter'}
          />

          {/* Lineup */}
          <div className="lineup-area">
            <div className="lineup-title">Lineup</div>
            {battingRoster.lineup.map((hitter, i) => (
              <div
                key={hitter.id}
                className={`lineup-item ${i === displayBatterIndex && inningState.outs < 3 ? 'current' : ''}`}
              >
                <span>{i + 1}. {hitter.name.split(' ').pop()}</span>
                <span style={{ fontFamily: 'Oswald' }}>{hitter.onBase}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
