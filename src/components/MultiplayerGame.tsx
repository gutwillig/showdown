/**
 * Multiplayer Game screen
 * Real-time head-to-head gameplay with turn-based pitch/swing
 * Two-step flow: Pitcher clicks PITCH -> shows advantage -> player with advantage clicks SWING
 */

import { useState, useEffect, useRef } from 'react';
import { useMultiplayerStore } from '../multiplayer/gameState';
import { getTotalScore } from '../multiplayer/protocol';
import { Card } from './Card';
import { ScoreStrip, FieldDiamond, LineScoreBoard } from './TableParts';
import { DiceTray } from './DiceTray';
import { resultTone } from '../exhibition/ExhibitionGame';
import type { OutcomeType } from '../data/types';

// Local dice animation - cycles through random numbers before showing final value
function useLocalDiceAnimation(phase: string, finalValue: number | null) {
  const [displayValue, setDisplayValue] = useState<number | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const animationRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const frameRef = useRef(0);

  useEffect(() => {
    // Start animation when entering a rolling phase
    if ((phase === 'pitchRolling' || phase === 'swingRolling') && finalValue !== null) {
      setIsAnimating(true);
      frameRef.current = 0;

      const animate = () => {
        const totalFrames = 15;
        if (frameRef.current < totalFrames) {
          // Show random numbers during animation
          const randomValue = Math.floor(Math.random() * 20) + 1;
          setDisplayValue(randomValue);
          frameRef.current++;
          // Slow down towards the end
          const delay = frameRef.current < 10 ? 50 : (frameRef.current < 13 ? 100 : 150);
          animationRef.current = setTimeout(animate, delay);
        } else {
          // Show final value
          setDisplayValue(finalValue);
          setTimeout(() => setIsAnimating(false), 400);
        }
      };

      animate();
    }

    return () => {
      if (animationRef.current) {
        clearTimeout(animationRef.current);
      }
    };
  }, [phase, finalValue]);

  return { displayValue, isAnimating };
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

  // Local dice animation state
  const phase = gameState?.phase ?? 'pitching';
  const animatingDice = gameState?.animatingDice ?? null;
  const { displayValue: localDiceValue, isAnimating } = useLocalDiceAnimation(phase, animatingDice);

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
    waitingForPlayerId,
    partialAtBat,
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

  // Scores - include current inning runs (not yet in lineScore until half ends)
  const baseScores = getTotalScore(lineScore);
  const scores = {
    away: baseScores.away + (isTopHalf ? inningState.runs : 0),
    home: baseScores.home + (!isTopHalf ? inningState.runs : 0)
  };

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
      <div className="break-screen">
        <LineScoreBoard
          awayName={awayName}
          homeName={homeName}
          away={lineScore.away}
          home={lineScore.home}
          status={`End of ${isTopHalf ? 'Top' : 'Bottom'} ${inning}`}
        />
        <p className="break-hint">
          {!isTopHalf ? `Top of ${inning + 1} coming up…` : `${homeName} coming to bat…`}
        </p>
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
      <ScoreStrip
        awayName={awayName}
        homeName={homeName}
        awayScore={scores.away}
        homeScore={scores.home}
        inning={inning}
        isTopHalf={isTopHalf}
        outs={inningState.outs}
        bases={inningState.bases}
      />

      {/* Matchup */}
      <div className="matchup-area">
        <div className="matchup-card">
          <div className="matchup-role">{amPitching ? 'You (Pitching)' : `${waitingForName} (Pitching)`}</div>
          <Card
            card={currentPitcher}
            type="pitcher"
            active={(partialAtBat?.advantageHolder ?? lastAtBat?.advantageHolder) === 'pitcher' && phase !== 'pitchRolling'}
            scanRoll={phase === 'swingRolling' && isAnimating && partialAtBat?.advantageHolder === 'pitcher' ? localDiceValue : null}
            highlightedRoll={lastAtBat?.swingRoll}
            showHighlightedBand={phase === 'result' && lastAtBat?.advantageHolder === 'pitcher'}
          />
        </div>

        <div className="matchup-vs">
          <DiceTray
            pitchValue={phase === 'pitchRolling' && isAnimating ? localDiceValue : (partialAtBat?.pitchRoll ?? lastAtBat?.pitchRoll ?? null)}
            pitchRolling={phase === 'pitchRolling' && isAnimating}
            swingValue={phase === 'swingRolling' && isAnimating ? localDiceValue : (lastAtBat?.swingRoll ?? null)}
            swingRolling={phase === 'swingRolling' && isAnimating}
            control={currentPitcher.control}
            onBase={currentBatter.onBase}
            pitchTotal={partialAtBat?.pitchTotal ?? lastAtBat?.pitchTotal}
            advantage={phase === 'pitchRolling' ? null : (partialAtBat?.advantageHolder ?? lastAtBat?.advantageHolder ?? null)}
            resultLabel={phase === 'result' && lastAtBat ? `${currentBatter.name.split(' ').pop()}: ${lastAtBat.description}` : null}
            resultTone={phase === 'result' && lastAtBat ? resultTone(lastAtBat.outcome) : null}
          />
          <FieldDiamond bases={inningState.bases} outs={inningState.outs} />
        </div>

        <div className="matchup-card">
          <div className="matchup-role">{amBatting ? 'You (Batting)' : `${waitingForName} (Batting)`}</div>
          <Card
            card={currentBatter}
            type="hitter"
            active={(partialAtBat?.advantageHolder ?? lastAtBat?.advantageHolder) === 'hitter' && phase !== 'pitchRolling'}
            scanRoll={phase === 'swingRolling' && isAnimating && partialAtBat?.advantageHolder === 'hitter' ? localDiceValue : null}
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

        {phase === 'pitchRolling' && (
          <div className="rolling-indicator">Rolling...</div>
        )}

        {phase === 'pitched' && (
          <button
            className={`btn btn-primary btn-large ${isMyTurn ? '' : 'disabled'}`}
            onClick={() => performAction('swing')}
            disabled={!isMyTurn}
          >
            {isMyTurn ? 'SWING' : `Waiting for ${waitingForName} to swing...`}
          </button>
        )}

        {phase === 'swingRolling' && (
          <div className="rolling-indicator">Rolling...</div>
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
