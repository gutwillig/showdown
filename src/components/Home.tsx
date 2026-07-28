/**
 * Home screen - mode selection
 * Solo modes (At-Bat, Half-Inning) and Multiplayer
 */

import { useState } from 'react';
import { isMultiplayerConfigured } from '../multiplayer/supabase';
import { useMultiplayerStore } from '../multiplayer/gameState';
import { setPlayerName } from '../multiplayer/protocol';

interface HomeProps {
  onSelectSoloMode: (mode: 'sandbox' | 'halfInning') => void;
}

export function Home({ onSelectSoloMode }: HomeProps) {
  const [showJoinForm, setShowJoinForm] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [name, setName] = useState(useMultiplayerStore.getState().playerName);

  const { createGame, joinGame, setPlayerName: updateName } = useMultiplayerStore();

  const handleCreateGame = () => {
    if (name.trim()) {
      setPlayerName(name.trim());
      updateName(name.trim());
    }
    createGame();
  };

  const handleJoinGame = () => {
    if (joinCode.length === 4) {
      if (name.trim()) {
        setPlayerName(name.trim());
        updateName(name.trim());
      }
      joinGame(joinCode.toUpperCase());
    }
  };

  return (
    <div className="home-screen">
      <div className="home-hero">
        <h1 className="home-title">SHOWDOWN DIGITAL</h1>
        <p className="home-subtitle">The classic baseball card game, reimagined</p>
      </div>

      <div className="mode-grid">
        {/* Solo Modes */}
        <div className="mode-section">
          <h2 className="mode-section-title">Solo Play</h2>
          <div className="mode-cards">
            <button className="mode-card" onClick={() => onSelectSoloMode('sandbox')}>
              <div className="mode-icon">1</div>
              <div className="mode-name">At-Bat</div>
              <div className="mode-desc">Test matchups one at-bat at a time</div>
            </button>
            <button className="mode-card" onClick={() => onSelectSoloMode('halfInning')}>
              <div className="mode-icon">3</div>
              <div className="mode-name">Half-Inning</div>
              <div className="mode-desc">Play through a full half-inning</div>
            </button>
          </div>
        </div>

        {/* Multiplayer */}
        <div className="mode-section">
          <h2 className="mode-section-title">Multiplayer</h2>
          {!isMultiplayerConfigured ? (
            <div className="multiplayer-disabled">
              <p>Multiplayer not configured.</p>
              <p className="hint">Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY</p>
            </div>
          ) : (
            <div className="multiplayer-options">
              <div className="name-input-group">
                <label className="input-label">Your Name</label>
                <input
                  type="text"
                  className="name-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter your name"
                  maxLength={20}
                />
              </div>

              {!showJoinForm ? (
                <div className="multiplayer-buttons">
                  <button className="btn btn-primary btn-large" onClick={handleCreateGame}>
                    Create Game
                  </button>
                  <button className="btn btn-secondary btn-large" onClick={() => setShowJoinForm(true)}>
                    Join Game
                  </button>
                </div>
              ) : (
                <div className="join-form">
                  <input
                    type="text"
                    className="code-input"
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase().slice(0, 4))}
                    placeholder="ABCD"
                    maxLength={4}
                    autoFocus
                  />
                  <div className="join-buttons">
                    <button
                      className="btn btn-primary"
                      onClick={handleJoinGame}
                      disabled={joinCode.length !== 4}
                    >
                      Join
                    </button>
                    <button className="btn btn-secondary" onClick={() => setShowJoinForm(false)}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
