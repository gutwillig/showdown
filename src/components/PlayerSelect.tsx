/**
 * Player selection component with search
 */

import { useState, useMemo } from 'react';
import type { PitcherCard, HitterCard } from '../data/types';

interface PlayerSelectProps<T extends PitcherCard | HitterCard> {
  label: string;
  players: T[];
  selected: T | null;
  onSelect: (player: T) => void;
  teams: string[];
}

export function PlayerSelect<T extends PitcherCard | HitterCard>({
  label,
  players,
  selected,
  onSelect,
  teams
}: PlayerSelectProps<T>) {
  const [search, setSearch] = useState('');
  const [teamFilter, setTeamFilter] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  const filteredPlayers = useMemo(() => {
    let filtered = players;

    if (teamFilter) {
      filtered = filtered.filter(p => p.team === teamFilter);
    }

    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.team.toLowerCase().includes(q)
      );
    }

    return filtered.slice(0, 20);
  }, [players, search, teamFilter]);

  return (
    <div className="select-group">
      <label className="select-label">{label}</label>

      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <select
          className="select-input"
          value={teamFilter}
          onChange={(e) => setTeamFilter(e.target.value)}
          style={{ width: '100px' }}
        >
          <option value="">All Teams</option>
          {teams.map(team => (
            <option key={team} value={team}>{team}</option>
          ))}
        </select>

        <input
          type="text"
          className="search-input"
          placeholder="Search by name..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
        />
      </div>

      {selected && !isOpen && (
        <div
          className="player-option"
          style={{
            background: 'var(--accent-blue)',
            borderRadius: '4px',
            marginTop: '0.5rem'
          }}
          onClick={() => setIsOpen(true)}
        >
          {selected.name} ({selected.team})
        </div>
      )}

      {isOpen && (
        <div className="player-list">
          {filteredPlayers.map(player => (
            <div
              key={player.id}
              className="player-option"
              onClick={() => {
                onSelect(player);
                setIsOpen(false);
                setSearch('');
              }}
            >
              <strong>{player.name}</strong>
              <span style={{ marginLeft: '0.5rem', color: 'var(--text-secondary)' }}>
                {player.team}
              </span>
              <span style={{ float: 'right', fontFamily: 'Oswald' }}>
                {'control' in player ? player.control : (player as HitterCard).onBase}
              </span>
            </div>
          ))}
          {filteredPlayers.length === 0 && (
            <div className="player-option" style={{ color: 'var(--text-secondary)' }}>
              No players found
            </div>
          )}
        </div>
      )}
    </div>
  );
}
