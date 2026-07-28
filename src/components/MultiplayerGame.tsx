/**
 * Multiplayer Game screen
 * Real-time head-to-head gameplay with turn-based pitch/swing
 */

import { useMultiplayerStore } from '../multiplayer/gameState';
import { getTotalScore } from '../multiplayer/protocol';
import { Card } from './Card';
import { Scoreboard } from './Scoreboard';

export function MultiplayerGame() {
  const {
    playerId,
    gameState,
    gamePhase,
    opponentDisconnected,
    performAction,
    requestRematch,
    leaveGame
  } = useMultiplayerStore();

  if (!gameState) {
    return <div className="loading">Loading game state...</div>;
  }

  const {
    inning,
    isTopHalf,
    inningState,
    lineScore,
    homeRoster,
    awayRoster,
    homePlayerId,
    awayPlayerId,
    hostName,
    guestName,
    hostId,
    phase,
    waitingForPlayerId,
    lastAtBat,
    winner
  } = gameState;

  // Determine names
  const homeName = homePlayerId === hostId ? hostName : guestName;
  const awayName = awayPlayerId === hostId ? hostName : guestName;

  // Am I home or away?
  const amHome = playerId === homePlayerId;
  const amBatting = amHome ? !isTopHalf : isTopHalf;
  const amPitching = !amBatting;

  // Current matchup
  const battingRoster = isTopHalf ? awayRoster : homeRoster;
  const pitchingRoster = isTopHalf ? homeRoster : awayRoster;
  const batterIndex = isTopHalf ? gameState.awayBatterIndex : gameState.homeBatterIndex;
  // During an at-bat, show the batter before advancement
  const displayBatterIndex = phase === 'result' && lastAtBat
    ? (batterIndex === 0 ? 8 : batterIndex - 1)
    : batterIndex;
  const currentBatter = battingRoster.lineup[displayBatterIndex];
  const currentPitcher = pitchingRoster.pitcher;

  // Whose turn
  const isMyTurn = waitingForPlayerId === playerId;
  const waitingForName = waitingForPlayerId === hostId ? hostName : guestName;

  // Scores
  const scores = getTotalScore(lineScore);

  // Game over
  if (gamePhase === 'gameOver' || winner) {
    const winnerName = winner === homePlayerId ? homeName : awayName;
    const didWin = winner === playerId;

    return (
      <div className="game-screen game-over-screen">
        <div className="game-over-banner">
          <h1>{didWin ? 'Victory!' : 'Defeat'}</h1>
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
              <span className="team-col">{awayName}</span>
              {lineScore.away.map((runs, i) => (
                <span key={i} className="inning-col">{runs}</span>
              ))}
              <span className="total-col">{scores.away}</span>
            </div>
            <div className="line-score-row">
              <span className="team-col">{homeName}</span>
              {lineScore.home.map((runs, i) => (
                <span key={i} className="inning-col">{runs}</span>
              ))}
              <span className="total-col">{scores.home}</span>
            </div>
          </div>
        </div>

        <div className="game-over-actions">
          <button className="btn btn-primary" onClick={requestRematch}>
            Rematch
          </button>
          <button className="btn btn-secondary" onClick={leaveGame}>
            Leave
          </button>
        </div>
      </div>
    );
  }

  // Half-inning transition
  if (phase === 'halfInningEnd') {
    return (
      <div className="game-screen half-inning-transition">
        <div className="transition-content">
          <h2>End of {isTopHalf ? 'Top' : 'Bottom'} {inning}</h2>
          <div className="transition-score">
            <div className="score-team">
              <span className="score-name">{awayName}</span>
              <span className="score-value">{scores.away}</span>
            </div>
            <div className="score-divider">-</div>
            <div className="score-team">
              <span className="score-name">{homeName}</span>
              <span className="score-value">{scores.home}</span>
            </div>
          </div>
          <p className="transition-hint">
            {!isTopHalf ? `Top of ${inning + 1} coming up...` : `${homeName} coming to bat...`}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="game-screen">
      {/* Opponent disconnected banner */}
      {opponentDisconnected && (
        <div className="disconnect-banner">
          Opponent disconnected. Waiting for reconnection...
        </div>
      )}

      {/* Scoreboard */}
      <Scoreboard
        awayName={awayName}
        homeName={homeName}
        awayScore={scores.away}
        homeScore={scores.home}
        inning={inning}
        isTopHalf={isTopHalf}
        outs={inningState.outs}
        bases={inningState.bases}
        awayLineScore={lineScore.away}
        homeLineScore={lineScore.home}
      />

      {/* Matchup */}
      <div className="matchup-area">
        <div className="matchup-card">
          <div className="matchup-role">{amPitching ? 'You' : waitingForName}</div>
          <Card
            card={currentPitcher}
            type="pitcher"
            highlighted={phase === 'pitching'}
            highlightedRoll={lastAtBat?.swingRoll}
            showHighlightedBand={phase === 'result' && lastAtBat?.advantageHolder === 'pitcher'}
          />
        </div>

        <div className="matchup-vs">
          <div className="vs-text">VS</div>

          {lastAtBat && phase === 'result' && (
            <div className="result-display">
              <div className={`advantage-banner ${lastAtBat.advantageHolder}`}>
                {lastAtBat.advantageHolder === 'pitcher' ? 'Pitcher' : 'Hitter'} Advantage
              </div>
              <div className="dice-results">
                <div className="dice-result">
                  <span className="dice-label">Pitch</span>
                  <span className="dice">{lastAtBat.pitchRoll}</span>
                  <span className="dice-total">+{currentPitcher.control} = {lastAtBat.pitchTotal}</span>
                </div>
                <div className="dice-result">
                  <span className="dice-label">Swing</span>
                  <span className="dice">{lastAtBat.swingRoll}</span>
                </div>
              </div>
              <div className={`outcome-banner ${lastAtBat.outcome}`}>
                {lastAtBat.description}
              </div>
            </div>
          )}
        </div>

        <div className="matchup-card">
          <div className="matchup-role">{amBatting ? 'You' : waitingForName}</div>
          <Card
            card={currentBatter}
            type="hitter"
            highlighted={phase === 'swinging'}
            highlightedRoll={lastAtBat?.swingRoll}
            showHighlightedBand={phase === 'result' && lastAtBat?.advantageHolder === 'hitter'}
          />
        </div>
      </div>

      {/* Action button */}
      <div className="action-area">
        {phase === 'pitching' && (
          <button
            className={`btn btn-primary btn-large ${isMyTurn ? '' : 'disabled'}`}
            onClick={() => performAction('pitch')}
            disabled={!isMyTurn}
          >
            {isMyTurn ? 'PITCH' : `Waiting for ${waitingForName} to pitch...`}
          </button>
        )}

        {phase === 'swinging' && (
          <button
            className={`btn btn-primary btn-large ${isMyTurn ? '' : 'disabled'}`}
            onClick={() => performAction('swing')}
            disabled={!isMyTurn}
          >
            {isMyTurn ? 'SWING' : `Waiting for ${waitingForName} to swing...`}
          </button>
        )}

        {phase === 'result' && (
          <div className="result-waiting">
            Next batter...
          </div>
        )}
      </div>

      {/* Lineup preview */}
      <div className="lineup-preview">
        <div className="lineup-section">
          <h4>{amBatting ? 'Your Lineup' : 'Opponent Lineup'}</h4>
          <div className="lineup-mini">
            {battingRoster.lineup.map((h, i) => (
              <div
                key={h.id}
                className={`lineup-mini-item ${i === displayBatterIndex ? 'current' : ''}`}
              >
                <span className="lineup-mini-num">{i + 1}</span>
                <span className="lineup-mini-name">{h.name.split(' ').pop()}</span>
                <span className="lineup-mini-ob">{h.onBase}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
