/**
 * Lobby/Draft screen
 * Room code display, roster building, ready check, roll-off
 */

import { useState } from 'react';
import { useMultiplayerStore } from '../multiplayer/gameState';
import { getShareableLink } from '../multiplayer/router';
import { DraftRoster } from './DraftRoster';
import type { Roster } from '../multiplayer/protocol';
import type { CardsData } from '../data/types';

interface LobbyProps {
  cards: CardsData;
}

export function Lobby({ cards }: LobbyProps) {
  const {
    roomCode,
    lobbyState,
    myRoster,
    isHost,
    playerId,
    opponentConnected,
    opponentDisconnected,
    submitRoster,
    setReady,
    leaveGame
  } = useMultiplayerStore();

  const [copied, setCopied] = useState(false);

  const handleCopyLink = () => {
    if (roomCode) {
      navigator.clipboard.writeText(getShareableLink(roomCode));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSurpriseMe = () => {
    // Generate random roster
    const randomPitcher = cards.pitchers[Math.floor(Math.random() * cards.pitchers.length)];
    const shuffledHitters = [...cards.hitters].sort(() => Math.random() - 0.5);
    const randomLineup = shuffledHitters.slice(0, 9);
    return { pitcher: randomPitcher, lineup: randomLineup };
  };

  const handleSubmitRoster = (roster: Roster) => {
    submitRoster(roster);
  };

  const handleReady = () => {
    setReady();
  };

  const hasSubmittedRoster = myRoster !== null;
  const myPickCount = hasSubmittedRoster ? 10 : 0;
  const opponentPickCount = isHost ? (lobbyState?.guestPickCount || 0) : (lobbyState?.hostPickCount || 0);
  const opponentName = isHost ? lobbyState?.guestName : lobbyState?.hostName;
  const amReady = isHost ? lobbyState?.hostReady : lobbyState?.guestReady;
  const opponentReady = isHost ? lobbyState?.guestReady : lobbyState?.hostReady;

  // Roll-off display
  if (lobbyState?.rollOff) {
    const { hostRoll, guestRoll, homePlayerId } = lobbyState.rollOff;
    const amHome = homePlayerId === playerId;

    return (
      <div className="lobby-screen">
        <div className="roll-off">
          <h2>Roll-Off for Home Field</h2>
          <div className="roll-off-dice">
            <div className="roll-off-player">
              <div className="roll-off-name">{lobbyState.hostName}</div>
              <div className="dice rolling">{hostRoll}</div>
            </div>
            <div className="vs-text">VS</div>
            <div className="roll-off-player">
              <div className="roll-off-name">{lobbyState.guestName}</div>
              <div className="dice rolling">{guestRoll}</div>
            </div>
          </div>
          <div className="roll-off-result">
            {amHome ? "You're the HOME team!" : "You're the AWAY team!"}
          </div>
          <p className="roll-off-hint">Game starting...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="lobby-screen">
      {/* Header with room code */}
      <div className="lobby-header">
        <div className="room-code-display">
          <span className="room-code-label">Room Code</span>
          <span className="room-code">{roomCode}</span>
          <button className="btn btn-secondary btn-small" onClick={handleCopyLink}>
            {copied ? 'Copied!' : 'Copy Link'}
          </button>
        </div>
        <button className="btn btn-secondary btn-small" onClick={leaveGame}>
          Leave
        </button>
      </div>

      {/* Connection status */}
      <div className="lobby-status">
        <div className="player-slot">
          <div className="player-name">{isHost ? 'You (Host)' : 'You'}</div>
          <div className="player-progress">{myPickCount}/10 picks</div>
          {hasSubmittedRoster && <div className="roster-locked">Roster Locked</div>}
          {amReady && <div className="ready-badge">Ready</div>}
        </div>

        <div className="vs-divider-small">VS</div>

        <div className="player-slot">
          {opponentConnected ? (
            <>
              <div className="player-name">{opponentName || 'Opponent'}</div>
              <div className="player-progress">{opponentPickCount}/10 picks</div>
              {opponentPickCount === 10 && <div className="roster-locked">Roster Locked</div>}
              {opponentReady && <div className="ready-badge">Ready</div>}
              {opponentDisconnected && <div className="disconnected-badge">Reconnecting...</div>}
            </>
          ) : (
            <div className="waiting-opponent">Waiting for opponent...</div>
          )}
        </div>
      </div>

      {/* Draft area */}
      {!hasSubmittedRoster ? (
        <DraftRoster
          cards={cards}
          onSubmit={handleSubmitRoster}
          onSurpriseMe={handleSurpriseMe}
        />
      ) : (
        <div className="roster-summary">
          <h3>Your Roster</h3>
          <div className="roster-pitcher">
            <span className="roster-label">Pitcher:</span>
            <span className="roster-value">{myRoster?.pitcher.name} (Control: {myRoster?.pitcher.control})</span>
          </div>
          <div className="roster-lineup">
            <span className="roster-label">Lineup:</span>
            <ol className="roster-list">
              {myRoster?.lineup.map((h) => (
                <li key={h.id}>{h.name} (OB: {h.onBase})</li>
              ))}
            </ol>
          </div>

          {!amReady && opponentConnected && opponentPickCount === 10 && (
            <button className="btn btn-primary btn-large" onClick={handleReady}>
              Ready to Play
            </button>
          )}

          {amReady && !opponentReady && (
            <p className="waiting-text">Waiting for opponent to ready up...</p>
          )}

          {!opponentConnected && (
            <p className="waiting-text">Waiting for opponent to join...</p>
          )}

          {opponentConnected && opponentPickCount < 10 && (
            <p className="waiting-text">Waiting for opponent to finish drafting...</p>
          )}
        </div>
      )}
    </div>
  );
}
