/**
 * Draft Roster Component
 * Interactive position-based roster builder with 3-column grid layout
 * Rows: OF/OF/OF, 1B/2B/3B, SS/C/DH, then Pitcher
 */

import { useState, useMemo } from 'react';
import type { PitcherCard, HitterCard, CardsData } from '../data/types';
import type { Roster } from '../multiplayer/protocol';

interface DraftRosterProps {
  cards: CardsData;
  onSubmit: (roster: Roster) => void;
  onSurpriseMe: () => { pitcher: PitcherCard; lineup: HitterCard[] };
}

type Position = 'P' | 'C' | '1B' | '2B' | 'SS' | '3B' | 'OF1' | 'OF2' | 'OF3' | 'DH';

// Simplified grid layout - 3 columns
const ROSTER_LAYOUT: { position: Position; label: string }[][] = [
  [
    { position: 'OF1', label: 'Outfield' },
    { position: 'OF2', label: 'Outfield' },
    { position: 'OF3', label: 'Outfield' },
  ],
  [
    { position: '1B', label: 'First Base' },
    { position: '2B', label: 'Second Base' },
    { position: '3B', label: 'Third Base' },
  ],
  [
    { position: 'SS', label: 'Shortstop' },
    { position: 'C', label: 'Catcher' },
    { position: 'DH', label: 'Designated Hitter' },
  ],
];

// Position filter options
const POSITION_FILTERS = [
  { value: 'ALL', label: 'All' },
  { value: 'P', label: 'P' },
  { value: 'C', label: 'C' },
  { value: 'IF', label: 'IF' },
  { value: 'OF', label: 'OF' },
  { value: 'DH', label: 'DH' }
];

// Get primary position from hitter (first in positions array, or infer from name/fallback)
function getHitterPosition(hitter: HitterCard): string {
  if (hitter.positions && hitter.positions.length > 0) {
    return hitter.positions[0];
  }
  // Fallback - return generic position based on any data we have
  return 'DH';
}

// Check if hitter matches position filter
function matchesPositionFilter(hitter: HitterCard, filter: string): boolean {
  const pos = getHitterPosition(hitter);

  if (filter === 'ALL' || filter === 'H') return true;
  if (filter === 'IF') return ['1B', '2B', 'SS', '3B', 'C'].includes(pos);
  if (filter === 'OF') return ['LF', 'CF', 'RF', 'OF'].includes(pos);
  return pos === filter;
}

export function DraftRoster({ cards, onSubmit, onSurpriseMe }: DraftRosterProps) {
  // Position slots state
  const [slots, setSlots] = useState<Record<Position, PitcherCard | HitterCard | null>>({
    P: null,
    C: null,
    '1B': null,
    '2B': null,
    SS: null,
    '3B': null,
    OF1: null,
    OF2: null,
    OF3: null,
    DH: null
  });

  // Batting order (just the 9 hitters in order)
  const [battingOrder, setBattingOrder] = useState<Position[]>([]);

  // Filters
  const [positionFilter, setPositionFilter] = useState<string>('ALL');
  const [teamFilter, setTeamFilter] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');

  // Get unique teams
  const teams = useMemo(() => {
    const teamSet = new Set<string>();
    cards.pitchers.forEach(p => teamSet.add(p.team));
    cards.hitters.forEach(h => teamSet.add(h.team));
    return Array.from(teamSet).sort();
  }, [cards]);

  // Get selected player IDs
  const selectedIds = useMemo(() => {
    return new Set(
      Object.values(slots)
        .filter((p): p is PitcherCard | HitterCard => p !== null)
        .map(p => p.id)
    );
  }, [slots]);

  // Filter available players
  const availablePlayers = useMemo(() => {
    const players: (PitcherCard | HitterCard)[] = [];

    // Add pitchers if filter allows
    if (positionFilter === 'ALL' || positionFilter === 'P') {
      cards.pitchers.forEach(p => {
        if (!selectedIds.has(p.id)) {
          const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase());
          const matchesTeam = !teamFilter || p.team === teamFilter;
          if (matchesSearch && matchesTeam) players.push(p);
        }
      });
    }

    // Add hitters if filter allows (not just pitchers)
    if (positionFilter !== 'P') {
      cards.hitters.forEach(h => {
        if (!selectedIds.has(h.id)) {
          const matchesSearch = h.name.toLowerCase().includes(searchTerm.toLowerCase());
          const matchesTeam = !teamFilter || h.team === teamFilter;
          const matchesPosition = positionFilter === 'ALL' || matchesPositionFilter(h, positionFilter);
          if (matchesSearch && matchesTeam && matchesPosition) players.push(h);
        }
      });
    }

    // Sort by stat
    return players.sort((a, b) => {
      const statA = 'control' in a ? a.control : a.onBase;
      const statB = 'control' in b ? b.control : b.onBase;
      return statB - statA;
    });
  }, [cards, selectedIds, positionFilter, teamFilter, searchTerm]);

  // Map player positions to roster slot positions
  const getMatchingSlots = (playerPositions: string[]): Position[] => {
    const matchingSlots: Position[] = [];
    for (const pos of playerPositions) {
      // Outfielders (LF, CF, RF, OF) can fill any OF slot
      if (['LF', 'CF', 'RF', 'OF'].includes(pos)) {
        if (!matchingSlots.includes('OF1')) matchingSlots.push('OF1');
        if (!matchingSlots.includes('OF2')) matchingSlots.push('OF2');
        if (!matchingSlots.includes('OF3')) matchingSlots.push('OF3');
      } else if (['1B', '2B', '3B', 'SS', 'C', 'DH'].includes(pos)) {
        if (!matchingSlots.includes(pos as Position)) matchingSlots.push(pos as Position);
      }
    }
    // Everyone can play DH
    if (!matchingSlots.includes('DH')) matchingSlots.push('DH');
    return matchingSlots;
  };

  // Check if a player can fill any empty slot
  const canPlayerBePicked = (player: PitcherCard | HitterCard): boolean => {
    return findEmptySlot(player) !== null;
  };

  // Find empty slot for a player - ONLY positions they can play
  const findEmptySlot = (player: PitcherCard | HitterCard): Position | null => {
    if ('control' in player) {
      return slots.P === null ? 'P' : null;
    } else {
      const hitter = player as HitterCard;
      const playerPositions = hitter.positions && hitter.positions.length > 0
        ? hitter.positions
        : ['DH'];

      // Only allow slots that match the player's position(s)
      const matchingSlots = getMatchingSlots(playerPositions);
      for (const pos of matchingSlots) {
        if (slots[pos] === null) return pos;
      }

      // No matching slot available - cannot pick this player
      return null;
    }
  };

  // Pick a player
  const handlePickPlayer = (player: PitcherCard | HitterCard) => {
    const emptySlot = findEmptySlot(player);
    if (!emptySlot) return;

    setSlots(prev => ({ ...prev, [emptySlot]: player }));

    // Add to batting order if hitter
    if (!('control' in player)) {
      setBattingOrder(prev => [...prev, emptySlot]);
    }
  };

  // Clear a slot
  const handleClearSlot = (position: Position) => {
    setSlots(prev => ({ ...prev, [position]: null }));
    setBattingOrder(prev => prev.filter(p => p !== position));
  };

  // Reorder batting order
  const handleReorderBatter = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= battingOrder.length) return;
    const newOrder = [...battingOrder];
    const [moved] = newOrder.splice(fromIndex, 1);
    newOrder.splice(toIndex, 0, moved);
    setBattingOrder(newOrder);
  };

  // Auto-order lineup by onBase
  const handleAutoOrder = () => {
    const orderedPositions = [...battingOrder].sort((a, b) => {
      const playerA = slots[a] as HitterCard | null;
      const playerB = slots[b] as HitterCard | null;
      if (!playerA || !playerB) return 0;
      return playerB.onBase - playerA.onBase;
    });
    setBattingOrder(orderedPositions);
  };

  // Handle surprise me
  const handleSurpriseMe = () => {
    const randomRoster = onSurpriseMe();

    // Set hitters to positions
    const newSlots: Record<Position, PitcherCard | HitterCard | null> = {
      P: randomRoster.pitcher,
      C: randomRoster.lineup[0],
      '1B': randomRoster.lineup[1],
      '2B': randomRoster.lineup[2],
      SS: randomRoster.lineup[3],
      '3B': randomRoster.lineup[4],
      OF1: randomRoster.lineup[5],
      OF2: randomRoster.lineup[6],
      OF3: randomRoster.lineup[7],
      DH: randomRoster.lineup[8]
    };
    setSlots(newSlots);
    setBattingOrder(['C', '1B', '2B', 'SS', '3B', 'OF1', 'OF2', 'OF3', 'DH']);
  };


  // Submit roster
  const handleSubmit = () => {
    const pitcher = slots.P as PitcherCard | null;
    if (!pitcher) return;

    const lineup: HitterCard[] = battingOrder
      .map(pos => slots[pos] as HitterCard)
      .filter((h): h is HitterCard => h !== null);

    if (lineup.length !== 9) return;

    onSubmit({ pitcher, lineup });
  };

  const filledCount = Object.values(slots).filter(p => p !== null).length;
  const isComplete = filledCount === 10 && battingOrder.length === 9;

  const isPitcher = (player: PitcherCard | HitterCard): player is PitcherCard => 'control' in player;

  return (
    <div className="draft-roster">
      <div className="draft-main">
      {/* Left Panel - Available Players */}
      <section className="draft-pool">
        <div className="draft-pool-header">
          <h2>Available Players</h2>
          <span className="draft-pool-count">{availablePlayers.length} cards</span>
        </div>

        <div className="draft-pool-filters">
          <div className="draft-position-filters">
            {POSITION_FILTERS.map(f => (
              <button
                key={f.value}
                className={`draft-pos-btn ${positionFilter === f.value ? 'active' : ''}`}
                onClick={() => setPositionFilter(f.value)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <div className="draft-pool-filters">
          <input
            type="text"
            className="draft-search"
            placeholder="Search player, team, or position..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <select
            className="draft-filter"
            value={teamFilter}
            onChange={(e) => setTeamFilter(e.target.value)}
          >
            <option value="">All Teams</option>
            {teams.map(team => (
              <option key={team} value={team}>{team}</option>
            ))}
          </select>
        </div>

        <div className="draft-pool-cards">
          {availablePlayers.length === 0 ? (
            <div className="draft-no-results">
              <div className="draft-no-results-title">No cards match</div>
              <div className="draft-no-results-hint">Try adjusting your filters</div>
            </div>
          ) : (
            availablePlayers.map(player => {
              const displayPos = isPitcher(player) ? 'P' : getHitterPosition(player);
              const canPick = canPlayerBePicked(player);
              return (
              <div
                key={player.id}
                className={`draft-card ${isPitcher(player) ? 'pitcher' : 'hitter'} ${!canPick ? 'disabled' : ''}`}
                onClick={() => canPick && handlePickPlayer(player)}
              >
                <div className="draft-card-header">
                  <span className="draft-card-pos">{displayPos}</span>
                  <span className="draft-card-team">{player.team}</span>
                </div>
                <div className="draft-card-photo">
                  <span className="draft-card-stat-large">
                    {isPitcher(player) ? player.control : player.onBase}
                  </span>
                </div>
                <div className="draft-card-name">{player.name}</div>
                <div className="draft-card-stat-label">
                  {isPitcher(player) ? 'CONTROL' : 'ON-BASE'}
                </div>
                <div className="draft-card-footer">
                  <span className="draft-card-sub">
                    {isPitcher(player)
                      ? `IP ${player.ip} · ${player.throws}HP`
                      : `SPD ${player.speed || '-'} · ${player.bats}`
                    }
                  </span>
                </div>
              </div>
              );
            })
          )}
        </div>
      </section>

      {/* Right Panel - Your Roster */}
      <section className="draft-roster-panel">
        <div className="draft-roster-header">
          <h2>Your Roster</h2>
          <span className="draft-roster-hint">Click a slot to release</span>
        </div>

        <div className="draft-field-grid">
          {/* 3 rows of fielding positions */}
          {ROSTER_LAYOUT.map((row, rowIdx) => (
            <div key={rowIdx} className="draft-position-row">
              {row.map(({ position, label }) => (
                <RosterSlot
                  key={position}
                  position={position}
                  label={label}
                  player={slots[position] as HitterCard | null}
                  onClear={() => handleClearSlot(position)}
                />
              ))}
            </div>
          ))}

          {/* Pitcher row - centered */}
          <div className="draft-position-row draft-pitcher-row">
            <RosterSlot
              position="P"
              label="Pitcher"
              player={slots.P}
              onClear={() => handleClearSlot('P')}
              isPitcher
            />
          </div>
        </div>

        <div className="draft-status">
          <span className="draft-status-text">
            {filledCount < 10
              ? `Select ${10 - filledCount} more player${10 - filledCount !== 1 ? 's' : ''}`
              : 'Roster complete! Set your batting order below.'
            }
          </span>
          <span className={`draft-status-tag ${isComplete ? 'complete' : ''}`}>
            {filledCount}/10
          </span>
        </div>
      </section>
      </div>

      {/* Bottom - Batting Order (Sticky) */}
      <section className="draft-lineup">
        <div className="draft-lineup-header">
          <h2>Batting Order</h2>
          <span className="draft-lineup-hint">Drag to reorder</span>
          <button className="draft-auto-order" onClick={handleAutoOrder}>
            Auto order
          </button>
          <button className="draft-surprise" onClick={handleSurpriseMe}>
            Surprise Me
          </button>
        </div>

        <div className="draft-lineup-grid">
          <div className="draft-lineup-pitcher">
            <div className="draft-lineup-pitcher-label">Starting Pitcher</div>
            {slots.P ? (
              <>
                <div className="draft-lineup-pitcher-name">{(slots.P as PitcherCard).name}</div>
                <div className="draft-lineup-pitcher-stat">
                  Control {(slots.P as PitcherCard).control} · {(slots.P as PitcherCard).team}
                </div>
              </>
            ) : (
              <div className="draft-lineup-pitcher-empty">Not selected</div>
            )}
          </div>

          <div className="draft-batting-slots">
            {battingOrder.map((pos, idx) => {
              const player = slots[pos] as HitterCard | null;
              if (!player) return null;
              return (
                <div key={pos} className="draft-batting-slot">
                  <div className="draft-batting-slot-header">
                    <span className="draft-batting-num">{idx + 1}</span>
                    <span className="draft-batting-pos">{pos}</span>
                  </div>
                  <div className="draft-batting-name">{player.name}</div>
                  <div className="draft-batting-footer">
                    <span className="draft-batting-team">{player.team}</span>
                    <span className="draft-batting-stat">{player.onBase}</span>
                  </div>
                  <div className="draft-batting-arrows">
                    <button
                      className="draft-arrow"
                      onClick={() => handleReorderBatter(idx, idx - 1)}
                      disabled={idx === 0}
                    >
                      ←
                    </button>
                    <button
                      className="draft-arrow"
                      onClick={() => handleReorderBatter(idx, idx + 1)}
                      disabled={idx === battingOrder.length - 1}
                    >
                      →
                    </button>
                  </div>
                </div>
              );
            })}
            {/* Empty slots */}
            {Array.from({ length: 9 - battingOrder.length }).map((_, idx) => (
              <div key={`empty-${idx}`} className="draft-batting-slot empty">
                <div className="draft-batting-slot-header">
                  <span className="draft-batting-num">{battingOrder.length + idx + 1}</span>
                </div>
                <div className="draft-batting-empty">—</div>
              </div>
            ))}
          </div>
        </div>

        <div className="draft-submit">
          <button
            className="btn btn-primary btn-large"
            onClick={handleSubmit}
            disabled={!isComplete}
          >
            Lock Roster
          </button>
        </div>
      </section>
    </div>
  );
}

// Roster Slot Component
interface RosterSlotProps {
  position: Position;
  label: string;
  player: PitcherCard | HitterCard | null;
  onClear: () => void;
  isPitcher?: boolean;
}

function RosterSlot({ position, label, player, onClear, isPitcher = false }: RosterSlotProps) {
  // Display position label - for OF slots, just show "OF"
  const displayPos = position.startsWith('OF') ? 'OF' : position;

  if (!player) {
    return (
      <div className="roster-slot empty">
        <div className="roster-slot-pos">{displayPos}</div>
        <div className="roster-slot-label">{label}</div>
      </div>
    );
  }

  const stat = isPitcher ? (player as PitcherCard).control : (player as HitterCard).onBase;
  const statLabel = isPitcher ? 'Control' : 'On-Base';

  return (
    <div className="roster-slot filled" onClick={onClear}>
      <div className="roster-slot-header">
        <span className="roster-slot-pos">{displayPos}</span>
        <span className="roster-slot-team">{player.team}</span>
      </div>
      <div className="roster-slot-name">{player.name}</div>
      <div className="roster-slot-stat">
        <span className="roster-slot-stat-value">{stat}</span>
        <span className="roster-slot-stat-label">{statLabel}</span>
      </div>
      <div className="roster-slot-remove">Click to remove</div>
    </div>
  );
}
