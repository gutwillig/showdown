/**
 * Main App Component
 * Hash-based routing for solo modes and multiplayer
 */

import { useEffect, useState } from 'react';
import { useGameStore } from './store';
import { useMultiplayerStore } from './multiplayer/gameState';
import { useExhibitionStore, ExhibitionSetup, ExhibitionGame } from './exhibition';
import { parseHash, Route } from './multiplayer/router';
import { loadCards } from './data/cards';
import { Home } from './components/Home';
import { Sandbox } from './components/Sandbox';
import { HalfInning } from './components/HalfInning';
import { Lobby } from './components/Lobby';
import { MultiplayerGame } from './components/MultiplayerGame';
import './index.css';

function App() {
  const { cards, setCards, mode, setMode } = useGameStore();
  const { gamePhase, connectionStatus, errorMessage, roomCode } = useMultiplayerStore();
  const exhibitionPhase = useExhibitionStore(state => state.gamePhase);
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));

  // Load cards on mount
  useEffect(() => {
    loadCards()
      .then(setCards)
      .catch(err => console.error('Failed to load cards:', err));
  }, [setCards]);

  // Handle hash changes
  useEffect(() => {
    const handleHashChange = () => {
      setRoute(parseHash(window.location.hash));
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Auto-join from URL
  useEffect(() => {
    if (route.page === 'join' && route.code && connectionStatus === 'disconnected') {
      useMultiplayerStore.getState().joinGame(route.code);
    }
  }, [route, connectionStatus]);

  // Handle solo mode selection
  const handleSelectSoloMode = (newMode: 'sandbox' | 'halfInning') => {
    setMode(newMode);
    window.location.hash = '#/solo';
  };

  // Handle exhibition mode
  const handleSelectExhibition = () => {
    window.location.hash = '#/exhibition';
  };

  // Handle back to home
  const handleBackToHome = () => {
    useExhibitionStore.getState().goToSetup();
    window.location.hash = '#/';
  };

  // Error display
  if (errorMessage) {
    return (
      <div className="app">
        <div className="error-screen">
          <h2>Connection Error</h2>
          <p>{errorMessage}</p>
          <button className="btn btn-primary" onClick={handleBackToHome}>
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  // Loading cards
  if (!cards) {
    return (
      <div className="app">
        <div className="loading">Loading cards...</div>
      </div>
    );
  }

  // Connecting
  if (connectionStatus === 'connecting') {
    return (
      <div className="app">
        <div className="loading">Connecting...</div>
      </div>
    );
  }

  // Determine what to render based on route and game phase
  const renderContent = () => {
    // Multiplayer game in progress
    if (gamePhase === 'playing' || gamePhase === 'gameOver') {
      return <MultiplayerGame />;
    }

    // Multiplayer lobby
    if (gamePhase === 'lobby' && roomCode) {
      return <Lobby cards={cards} />;
    }

    // Exhibition mode
    if (window.location.hash.includes('exhibition')) {
      if (exhibitionPhase === 'setup') {
        return <ExhibitionSetup cards={cards} onBack={handleBackToHome} />;
      }
      return (
        <div className="exhibition-container">
          <header className="header">
            <button className="back-btn" onClick={handleBackToHome}>
              ← Back
            </button>
            <div className="logo">SHOWDOWN DIGITAL</div>
            <div className="mode-label">Exhibition</div>
          </header>
          <main className="main">
            <ExhibitionGame />
          </main>
        </div>
      );
    }

    // Solo mode
    if (route.page === 'home' && window.location.hash.includes('solo')) {
      return (
        <div className="solo-container">
          <header className="header">
            <button className="back-btn" onClick={handleBackToHome}>
              ← Back
            </button>
            <div className="logo">SHOWDOWN DIGITAL</div>
            <nav className="nav">
              <button
                className={`nav-btn ${mode === 'sandbox' ? 'active' : ''}`}
                onClick={() => setMode('sandbox')}
              >
                At-Bat
              </button>
              <button
                className={`nav-btn ${mode === 'halfInning' ? 'active' : ''}`}
                onClick={() => setMode('halfInning')}
              >
                Half-Inning
              </button>
            </nav>
          </header>
          <main className="main">
            {mode === 'sandbox' ? <Sandbox /> : <HalfInning />}
          </main>
        </div>
      );
    }

    // Home screen (default)
    return <Home onSelectSoloMode={handleSelectSoloMode} onSelectExhibition={handleSelectExhibition} />;
  };

  return (
    <div className="app">
      {renderContent()}
      <footer className="footer">
        Showdown Digital - A tribute to MLB Showdown (2000-2005)
        <br />
        Season {cards.meta.season} | {cards.pitchers.length} pitchers | {cards.hitters.length} hitters
      </footer>
    </div>
  );
}

export default App;
