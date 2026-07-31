/**
 * Exhibition Setup Screen
 * Two-step roster wizard: build Away team, then Home team
 */

import { useState, useMemo } from 'react';
import { useExhibitionStore } from './exhibitionStore';
import type { Roster } from '../multiplayer/protocol';
import type { PitcherCard, HitterCard, CardsData } from '../data/types';

interface ExhibitionSetupProps {
  cards: CardsData;
  onBack: () => void;
}

export function ExhibitionSetup({ cards, onBack }: ExhibitionSetupProps) {
  const {
    setupStep,
    awayRoster,
    setAwayRoster,
    setHomeRoster,
    startGame
  } = useExhibitionStore();

  // Draft state
  const [selectedPitcher, setSelectedPitcher] = useState<PitcherCard | null>(null);
  const [selectedHitters, setSelectedHitters] = useState<HitterCard[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [teamFilter, setTeamFilter] = useState<string>('');
  const [draftTab, setDraftTab] = useState<'pitcher' | 'hitters'>('pitcher');

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

  const handleConfirmRoster = () => {
    if (!selectedPitcher || selectedHitters.length !== 9) return;

    const roster: Roster = {
      pitcher: selectedPitcher,
      lineup: selectedHitters
    };

    if (setupStep === 'awayRoster') {
      setAwayRoster(roster);
      // Reset for home team
      setSelectedPitcher(null);
      setSelectedHitters([]);
      setDraftTab('pitcher');
      setSearchTerm('');
      setTeamFilter('');
    } else if (setupStep === 'homeRoster') {
      setHomeRoster(roster);
    }
  };

  const handleStartGame = () => {
    startGame();
  };

  const isRosterComplete = selectedPitcher && selectedHitters.length === 9;
  const currentTeam = setupStep === 'awayRoster' ? 'AWAY' : 'HOME';

  // Ready screen - both rosters complete
  if (setupStep === 'ready') {
    return (
      <div className="exhibition-setup">
        <div className="exhibition-header">
          <button className="back-btn" onClick={onBack}>
            ← Back
          </button>
          <h2>Exhibition Game</h2>
        </div>

        <div className="rosters-preview">
          <div className="roster-preview">
            <h3>Away Team</h3>
            <div className="roster-pitcher">
              <span className="roster-label">Pitcher:</span>
              <span className="roster-value">{awayRoster?.pitcher.name} ({awayRoster?.pitcher.team})</span>
            </div>
            <div className="roster-lineup">
              <span className="roster-label">Lineup:</span>
              <ol className="roster-list">
                {awayRoster?.lineup.map((h) => (
                  <li key={h.id}>{h.name} (OB: {h.onBase})</li>
                ))}
              </ol>
            </div>
          </div>

          <div className="vs-divider">VS</div>

          <div className="roster-preview">
            <h3>Home Team</h3>
            <div className="roster-pitcher">
              <span className="roster-label">Pitcher:</span>
              <span className="roster-value">{useExhibitionStore.getState().homeRoster?.pitcher.name} ({useExhibitionStore.getState().homeRoster?.pitcher.team})</span>
            </div>
            <div className="roster-lineup">
              <span className="roster-label">Lineup:</span>
              <ol className="roster-list">
                {useExhibitionStore.getState().homeRoster?.lineup.map((h) => (
                  <li key={h.id}>{h.name} (OB: {h.onBase})</li>
                ))}
              </ol>
            </div>
          </div>
        </div>

        <div className="ready-actions">
          <button className="btn btn-primary btn-large" onClick={handleStartGame}>
            Play Ball!
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="exhibition-setup">
      <div className="exhibition-header">
        <button className="back-btn" onClick={onBack}>
          ← Back
        </button>
        <h2>Build {currentTeam} Team</h2>
        <div className="step-indicator">
          Step {setupStep === 'awayRoster' ? '1' : '2'} of 2
        </div>
      </div>

      {/* Draft area */}
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
            onClick={handleConfirmRoster}
            disabled={!isRosterComplete}
          >
            {setupStep === 'awayRoster' ? 'Continue to Home Team' : 'Confirm Roster'}
          </button>
        </div>
      </div>
    </div>
  );
}
