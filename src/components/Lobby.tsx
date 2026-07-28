/**
 * Lobby/Draft screen
 * Room code display, roster building, ready check, roll-off
 */

import { useState, useMemo } from 'react';
import { useMultiplayerStore } from '../multiplayer/gameState';
import { getShareableLink } from '../multiplayer/router';
import type { Roster } from '../multiplayer/protocol';
import type { PitcherCard, HitterCard, CardsData } from '../data/types';

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

  // Draft state
  const [selectedPitcher, setSelectedPitcher] = useState<PitcherCard | null>(null);
  const [selectedHitters, setSelectedHitters] = useState<HitterCard[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [teamFilter, setTeamFilter] = useState<string>('');
  const [draftTab, setDraftTab] = useState<'pitcher' | 'hitters'>('pitcher');
  const [copied, setCopied] = useState(false);

  // Get unique teams
  const teams = useMemo(() => {
    const teamSet = new Set<string>();
    cards.pitchers.forEach(p => teamSet.add(p.team));
    cards.hitters.forEach(h => teamSet.add(h.team));
    return Array.from(teamSet).sort();
  }, [cards]);

  // Filter pitchers
  const filteredPitchers = useMemo(() => {
    return cards.pitchers.filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesTeam = !teamFilter || p.team === teamFilter;
      return matchesSearch && matchesTeam;
    }).sort((a, b) => b.control - a.control);
  }, [cards.pitchers, searchTerm, teamFilter]);

  // Filter hitters
  const filteredHitters = useMemo(() => {
    return cards.hitters.filter(h => {
      const matchesSearch = h.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesTeam = !teamFilter || h.team === teamFilter;
      return matchesSearch && matchesTeam;
    }).sort((a, b) => b.onBase - a.onBase);
  }, [cards.hitters, searchTerm, teamFilter]);

  const handleCopyLink = () => {
    if (roomCode) {
      navigator.clipboard.writeText(getShareableLink(roomCode));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSelectPitcher = (pitcher: PitcherCard) => {
    setSelectedPitcher(pitcher);
    setDraftTab('hitters');
  };

  const handleToggleHitter = (hitter: HitterCard) => {
    const idx = selectedHitters.findIndex(h => h.id === hitter.id);
    if (idx >= 0) {
      setSelectedHitters(selectedHitters.filter(h => h.id !== hitter.id));
    } else if (selectedHitters.length < 9) {
      setSelectedHitters([...selectedHitters, hitter]);
    }
  };

  const handleMoveHitter = (index: number, direction: 'up' | 'down') => {
    const newOrder = [...selectedHitters];
    const swapIdx = direction === 'up' ? index - 1 : index + 1;
    if (swapIdx >= 0 && swapIdx < newOrder.length) {
      [newOrder[index], newOrder[swapIdx]] = [newOrder[swapIdx], newOrder[index]];
      setSelectedHitters(newOrder);
    }
  };

  const handleSurpriseMe = () => {
    // Fill remaining slots randomly
    if (!selectedPitcher) {
      const randomPitcher = cards.pitchers[Math.floor(Math.random() * cards.pitchers.length)];
      setSelectedPitcher(randomPitcher);
    }

    const needed = 9 - selectedHitters.length;
    if (needed > 0) {
      const available = cards.hitters.filter(h => !selectedHitters.find(s => s.id === h.id));
      const shuffled = [...available].sort(() => Math.random() - 0.5);
      setSelectedHitters([...selectedHitters, ...shuffled.slice(0, needed)]);
    }

    setDraftTab('hitters');
  };

  const handleSubmitRoster = () => {
    if (selectedPitcher && selectedHitters.length === 9) {
      const roster: Roster = {
        pitcher: selectedPitcher,
        lineup: selectedHitters
      };
      submitRoster(roster);
    }
  };

  const handleReady = () => {
    setReady();
  };

  const isRosterComplete = selectedPitcher && selectedHitters.length === 9;
  const hasSubmittedRoster = myRoster !== null;

  const myPickCount = hasSubmittedRoster ? 10 : (selectedPitcher ? 1 : 0) + selectedHitters.length;
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
        <div className="draft-area">
          <div className="draft-tabs">
            <button
              className={`draft-tab ${draftTab === 'pitcher' ? 'active' : ''}`}
              onClick={() => setDraftTab('pitcher')}
            >
              Pitcher {selectedPitcher ? '(1/1)' : '(0/1)'}
            </button>
            <button
              className={`draft-tab ${draftTab === 'hitters' ? 'active' : ''}`}
              onClick={() => setDraftTab('hitters')}
            >
              Lineup ({selectedHitters.length}/9)
            </button>
          </div>

          <div className="draft-controls">
            <input
              type="text"
              className="search-input"
              placeholder="Search players..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <select
              className="select-input"
              value={teamFilter}
              onChange={(e) => setTeamFilter(e.target.value)}
            >
              <option value="">All Teams</option>
              {teams.map(team => (
                <option key={team} value={team}>{team}</option>
              ))}
            </select>
            <button className="btn btn-secondary" onClick={handleSurpriseMe}>
              Surprise Me
            </button>
          </div>

          <div className="draft-content">
            {draftTab === 'pitcher' ? (
              <div className="pitcher-list">
                {filteredPitchers.map(pitcher => (
                  <div
                    key={pitcher.id}
                    className={`draft-card ${selectedPitcher?.id === pitcher.id ? 'selected' : ''}`}
                    onClick={() => handleSelectPitcher(pitcher)}
                  >
                    <div className="draft-card-main">
                      <span className="draft-card-name">{pitcher.name}</span>
                      <span className="draft-card-team">{pitcher.team}</span>
                    </div>
                    <div className="draft-card-stat control">{pitcher.control}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="draft-split">
                <div className="hitter-list">
                  {filteredHitters.map(hitter => {
                    const isSelected = selectedHitters.some(h => h.id === hitter.id);
                    return (
                      <div
                        key={hitter.id}
                        className={`draft-card ${isSelected ? 'selected' : ''} ${selectedHitters.length >= 9 && !isSelected ? 'disabled' : ''}`}
                        onClick={() => handleToggleHitter(hitter)}
                      >
                        <div className="draft-card-main">
                          <span className="draft-card-name">{hitter.name}</span>
                          <span className="draft-card-team">{hitter.team}</span>
                        </div>
                        <div className="draft-card-stat onbase">{hitter.onBase}</div>
                      </div>
                    );
                  })}
                </div>

                <div className="lineup-order">
                  <h3>Batting Order</h3>
                  {selectedHitters.length === 0 ? (
                    <p className="lineup-hint">Select 9 hitters</p>
                  ) : (
                    <div className="lineup-slots">
                      {selectedHitters.map((hitter, idx) => (
                        <div key={hitter.id} className="lineup-slot">
                          <span className="lineup-num">{idx + 1}</span>
                          <span className="lineup-name">{hitter.name}</span>
                          <span className="lineup-ob">{hitter.onBase}</span>
                          <div className="lineup-arrows">
                            <button
                              className="arrow-btn"
                              onClick={(e) => { e.stopPropagation(); handleMoveHitter(idx, 'up'); }}
                              disabled={idx === 0}
                            >
                              ↑
                            </button>
                            <button
                              className="arrow-btn"
                              onClick={(e) => { e.stopPropagation(); handleMoveHitter(idx, 'down'); }}
                              disabled={idx === selectedHitters.length - 1}
                            >
                              ↓
                            </button>
                          </div>
                          <button
                            className="remove-btn"
                            onClick={(e) => { e.stopPropagation(); handleToggleHitter(hitter); }}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="draft-actions">
            <button
              className="btn btn-primary btn-large"
              onClick={handleSubmitRoster}
              disabled={!isRosterComplete}
            >
              Lock Roster
            </button>
          </div>
        </div>
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
