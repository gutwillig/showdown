/**
 * Exhibition Setup
 * Step 1/2: draft the Away and Home clubs from a grid of player tiles into a dugout.
 * Step 3: the Matchup presentation (starting pitchers face off, lineups, Play Ball).
 */

import { useState, useMemo } from 'react';
import { Search, Dices, ChevronUp, ChevronDown, X, ArrowRight } from 'lucide-react';
import { useExhibitionStore } from './exhibitionStore';
import { Card, getTeamColors } from '../components/Card';
import { AppHeader } from '../components/AppHeader';
import type { Roster } from '../multiplayer/protocol';
import type { PitcherCard, HitterCard, CardsData, Chart, OutcomeType } from '../data/types';

interface ExhibitionSetupProps {
  cards: CardsData;
  onBack: () => void;
}

const OUTS: OutcomeType[] = ['PU', 'SO', 'GB', 'FB'];
const ORDER: OutcomeType[] = ['PU', 'SO', 'GB', 'FB', 'BB', '1B', '1B+', '2B', '3B', 'HR'];
const lastName = (n: string) => n.split(' ').slice(-1)[0];
const fmt3 = (n: number) => n.toFixed(3).replace(/^0/, '');

/** 20-slot chart strip: shows a card's profile at a glance */
function ChartStrip({ chart }: { chart: Chart }) {
  const segs = ORDER.flatMap(o => {
    const b = chart[o];
    return b ? [{ o, w: b[1] - b[0] + 1 }] : [];
  });
  return (
    <span className="chart-strip" aria-hidden="true">
      {segs.map(s => (
        <span key={s.o} className={`cs-seg cs-${s.o.replace('+', 'p')} ${OUTS.includes(s.o) ? 'cs-out' : ''}`} style={{ flexGrow: s.w }} />
      ))}
    </span>
  );
}

function PlayerTile({
  card, type, selected, slot, disabled, onClick, index
}: {
  card: PitcherCard | HitterCard;
  type: 'pitcher' | 'hitter';
  selected: boolean;
  slot?: string;
  disabled?: boolean;
  onClick: () => void;
  index: number;
}) {
  const colors = getTeamColors(card.team);
  const isP = type === 'pitcher';
  const p = card as PitcherCard;
  const h = card as HitterCard;
  return (
    <button
      type="button"
      className={`tile ${selected ? 'is-selected' : ''} ${disabled ? 'is-disabled' : ''}`}
      onClick={onClick}
      aria-pressed={selected}
      disabled={disabled}
      style={{ '--team': colors.primary, '--team-2': colors.secondary, animationDelay: `${Math.min(index, 24) * 22}ms` } as React.CSSProperties}
    >
      <span className="tile-band">
        <span>{card.team}</span>
        <span>{isP ? `${p.throws}HP` : h.positions?.join('/') || 'DH'}</span>
      </span>
      <span className="tile-body">
        <span className="tile-cmd">
          <span className="tile-cmd-num">{isP ? p.control : h.onBase}</span>
          <span className="tile-cmd-label">{isP ? 'CTRL' : 'OB'}</span>
        </span>
        <span className="tile-name">{card.name}</span>
      </span>
      <ChartStrip chart={card.chart} />
      <span className="tile-stats">
        {isP ? (
          <>
            <span><b>{p.realStats.era.toFixed(2)}</b> ERA</span>
            <span><b>{Math.round(p.realStats.kPct * (p.realStats.kPct < 1 ? 100 : 1))}%</b> K</span>
            <span><b>{p.ip}</b> IP</span>
          </>
        ) : (
          <>
            <span><b>{fmt3(h.realStats.avg)}</b> AVG</span>
            <span><b>{fmt3(h.realStats.obp)}</b> OBP</span>
            <span><b>{h.realStats.hr}</b> HR</span>
          </>
        )}
      </span>
      {selected && <span className="tile-badge">{slot}</span>}
    </button>
  );
}

export function ExhibitionSetup({ cards, onBack }: ExhibitionSetupProps) {
  const { setupStep, awayRoster, setAwayRoster, setHomeRoster, startGame } = useExhibitionStore();

  const [selectedPitcher, setSelectedPitcher] = useState<PitcherCard | null>(null);
  const [selectedHitters, setSelectedHitters] = useState<HitterCard[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [teamFilter, setTeamFilter] = useState<string>('');
  const [sortBy, setSortBy] = useState<'rating' | 'name' | 'power'>('rating');
  const [draftTab, setDraftTab] = useState<'pitcher' | 'hitters'>('pitcher');
  const [clubName, setClubName] = useState('');

  const teams = useMemo(() => {
    const teamSet = new Set<string>();
    cards.pitchers.forEach(p => teamSet.add(p.team));
    cards.hitters.forEach(h => teamSet.add(h.team));
    return Array.from(teamSet).sort();
  }, [cards]);

  const filteredPitchers = useMemo(() => {
    const q = searchTerm.toLowerCase();
    return cards.pitchers
      .filter(p => p.name.toLowerCase().includes(q) && (!teamFilter || p.team === teamFilter))
      .sort((a, b) => sortBy === 'name' ? a.name.localeCompare(b.name)
        : sortBy === 'power' ? b.realStats.kPct - a.realStats.kPct
        : b.control - a.control || a.realStats.era - b.realStats.era);
  }, [cards.pitchers, searchTerm, teamFilter, sortBy]);

  const filteredHitters = useMemo(() => {
    const q = searchTerm.toLowerCase();
    return cards.hitters
      .filter(h => h.name.toLowerCase().includes(q) && (!teamFilter || h.team === teamFilter))
      .sort((a, b) => sortBy === 'name' ? a.name.localeCompare(b.name)
        : sortBy === 'power' ? b.realStats.hr - a.realStats.hr
        : b.onBase - a.onBase || b.realStats.obp - a.realStats.obp);
  }, [cards.hitters, searchTerm, teamFilter, sortBy]);

  const handleSelectPitcher = (pitcher: PitcherCard) => {
    setSelectedPitcher(pitcher);
    if (selectedHitters.length < 9) setDraftTab('hitters');
  };

  const handleToggleHitter = (hitter: HitterCard) => {
    const idx = selectedHitters.findIndex(h => h.id === hitter.id);
    if (idx >= 0) setSelectedHitters(selectedHitters.filter(h => h.id !== hitter.id));
    else if (selectedHitters.length < 9) setSelectedHitters([...selectedHitters, hitter]);
  };

  const handleMoveHitter = (index: number, direction: 'up' | 'down') => {
    const next = [...selectedHitters];
    const swap = direction === 'up' ? index - 1 : index + 1;
    if (swap >= 0 && swap < next.length) {
      [next[index], next[swap]] = [next[swap], next[index]];
      setSelectedHitters(next);
    }
  };

  const handleSurpriseMe = () => {
    if (!selectedPitcher) setSelectedPitcher(cards.pitchers[Math.floor(Math.random() * cards.pitchers.length)]);
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
    const roster: Roster = { pitcher: selectedPitcher, lineup: selectedHitters };
    const name = clubName.trim() || undefined;
    if (setupStep === 'awayRoster') {
      setAwayRoster(roster, name);
      setSelectedPitcher(null);
      setSelectedHitters([]);
      setDraftTab('pitcher');
      setSearchTerm('');
      setTeamFilter('');
      setClubName('');
      window.scrollTo({ top: 0 });
    } else if (setupStep === 'homeRoster') {
      setHomeRoster(roster, name);
      window.scrollTo({ top: 0 });
    }
  };

  /* ---------------- Matchup presentation ---------------- */
  if (setupStep === 'ready') {
    const st = useExhibitionStore.getState();
    const home = st.homeRoster;
    if (!awayRoster || !home) return null;
    const sides = [
      { key: 'away', label: 'Visitors', roster: awayRoster, name: st.awayTeamName },
      { key: 'home', label: 'Home', roster: home, name: st.homeTeamName }
    ] as const;
    const avgOB = (r: Roster) => (r.lineup.reduce((s, h) => s + h.onBase, 0) / 9).toFixed(1);
    const hr = (r: Roster) => r.lineup.reduce((s, h) => s + h.realStats.hr, 0);

    return (
      <div className="matchup">
        <AppHeader onBack={onBack} right={<span className="mode-label">Exhibition · 3 innings</span>} />
        <div className="mu-stage">
          <div className="mu-lights" aria-hidden="true" />
          <div className="mu-kicker">Tonight’s matchup</div>
          <div className="mu-versus">
            <div className="mu-team mu-away">
              <span className="mu-side">{sides[0].label}</span>
              <h1>{sides[0].name}</h1>
            </div>
            <span className="mu-vs">vs</span>
            <div className="mu-team mu-home">
              <span className="mu-side">{sides[1].label}</span>
              <h1>{sides[1].name}</h1>
            </div>
          </div>

          <div className="mu-cards">
            <figure className="mu-sp mu-sp-away">
              <Card card={awayRoster.pitcher} type="pitcher" />
              <figcaption>Starting · {lastName(awayRoster.pitcher.name)}</figcaption>
            </figure>

            <div className="mu-cta">
              <div className="mu-tale">
                {sides.map(sd => (
                  <div key={sd.key} className="mu-tale-col">
                    <span className="mu-tale-name">{sd.name}</span>
                    <span><b>{sd.roster.pitcher.control}</b> Control</span>
                    <span><b>{avgOB(sd.roster)}</b> Avg OB</span>
                    <span><b>{hr(sd.roster)}</b> HR in lineup</span>
                  </div>
                ))}
              </div>
              <button className="btn btn-primary btn-large btn-playball" onClick={startGame} autoFocus>
                Play ball
              </button>
              <span className="mu-note">{sides[0].name} bat first</span>
            </div>

            <figure className="mu-sp mu-sp-home">
              <Card card={home.pitcher} type="pitcher" />
              <figcaption>Starting · {lastName(home.pitcher.name)}</figcaption>
            </figure>
          </div>

          <div className="mu-lineups">
            {sides.map(sd => (
              <section key={sd.key} className={`mu-lineup mu-lineup-${sd.key}`} aria-label={`${sd.name} lineup`}>
                <h2>{sd.name} <span>Lineup</span></h2>
                <ol>
                  {sd.roster.lineup.map((h, i) => (
                    <li key={h.id} style={{ animationDelay: `${400 + i * 45}ms` }}>
                      <span className="mu-n">{i + 1}</span>
                      <span className="mu-name">{h.name}</span>
                      <span className="mu-pos">{h.positions?.[0] ?? 'DH'}</span>
                      <span className="mu-ob" style={{ '--ob': (h.onBase - 6) / 10 } as React.CSSProperties}>
                        <span className="mu-ob-bar" />
                        <b>{h.onBase}</b>
                      </span>
                    </li>
                  ))}
                </ol>
              </section>
            ))}
          </div>
        </div>
      </div>
    );
  }

  /* ---------------- Draft ---------------- */
  const isAway = setupStep === 'awayRoster';
  const isRosterComplete = !!selectedPitcher && selectedHitters.length === 9;
  const list = draftTab === 'pitcher' ? filteredPitchers : filteredHitters;

  return (
    <div className="draft">
      <AppHeader onBack={onBack} right={<span className="mode-label">Exhibition</span>} />

      <div className="draft-hero">
        <ol className="steps" aria-label="Setup steps">
          <li className={isAway ? 'is-current' : 'is-done'}><span>1</span>Visitors</li>
          <li className={!isAway ? 'is-current' : ''}><span>2</span>Home</li>
          <li><span>3</span>Matchup</li>
        </ol>
        <div className="draft-title-row">
          <h1>Build the {isAway ? 'visiting' : 'home'} club</h1>
          <label className="club-name">
            <span>Club name</span>
            <input
              value={clubName}
              onChange={e => setClubName(e.target.value.slice(0, 18))}
              placeholder={selectedPitcher?.team ?? (isAway ? 'Visitors' : 'Home')}
            />
          </label>
        </div>
      </div>

      <div className="draft-body">
        <section className="pool" aria-label="Player pool">
          <div className="pool-tabs" role="tablist">
            <button role="tab" aria-selected={draftTab === 'pitcher'} className={draftTab === 'pitcher' ? 'is-active' : ''} onClick={() => setDraftTab('pitcher')}>
              Starting pitcher <em>{selectedPitcher ? 1 : 0}/1</em>
            </button>
            <button role="tab" aria-selected={draftTab === 'hitters'} className={draftTab === 'hitters' ? 'is-active' : ''} onClick={() => setDraftTab('hitters')}>
              Lineup <em>{selectedHitters.length}/9</em>
            </button>
          </div>

          <div className="pool-filters">
            <label className="search">
              <Search size={16} aria-hidden="true" />
              <input type="search" placeholder="Search players" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} aria-label="Search players" />
            </label>
            <select value={teamFilter} onChange={e => setTeamFilter(e.target.value)} aria-label="Filter by team">
              <option value="">All teams</option>
              {teams.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)} aria-label="Sort">
              <option value="rating">{draftTab === 'pitcher' ? 'Best control' : 'Best on-base'}</option>
              <option value="power">{draftTab === 'pitcher' ? 'Most strikeouts' : 'Most power'}</option>
              <option value="name">Name A–Z</option>
            </select>
            <button className="btn btn-secondary btn-surprise" onClick={handleSurpriseMe}>
              <Dices size={18} aria-hidden="true" /> Surprise me
            </button>
          </div>

          <div className="pool-grid" key={draftTab + teamFilter}>
            {list.length === 0 && <p className="pool-empty">No players match.</p>}
            {draftTab === 'pitcher'
              ? filteredPitchers.map((p, i) => (
                <PlayerTile key={p.id} index={i} card={p} type="pitcher" selected={selectedPitcher?.id === p.id} slot="SP" onClick={() => handleSelectPitcher(p)} />
              ))
              : filteredHitters.map((h, i) => {
                const idx = selectedHitters.findIndex(s => s.id === h.id);
                return (
                  <PlayerTile
                    key={h.id}
                    index={i}
                    card={h}
                    type="hitter"
                    selected={idx >= 0}
                    slot={idx >= 0 ? `#${idx + 1}` : undefined}
                    disabled={selectedHitters.length >= 9 && idx < 0}
                    onClick={() => handleToggleHitter(h)}
                  />
                );
              })}
          </div>
        </section>

        <aside className="dugout" aria-label="Your club">
          <header className="dugout-head">
            <h2>{clubName.trim() || selectedPitcher?.team || (isAway ? 'Visitors' : 'Home')}</h2>
            <span>{(selectedPitcher ? 1 : 0) + selectedHitters.length}/10 signed</span>
          </header>

          <button type="button" className={`sp-slot ${selectedPitcher ? 'is-filled' : ''}`} onClick={() => setDraftTab('pitcher')}>
            <span className="slot-label">SP</span>
            {selectedPitcher ? (
              <>
                <span className="slot-name">{selectedPitcher.name}</span>
                <span className="slot-meta">{selectedPitcher.team} · Control {selectedPitcher.control}</span>
              </>
            ) : (
              <span className="slot-empty">Pick a starting pitcher</span>
            )}
          </button>

          <ol className="order">
            {Array.from({ length: 9 }, (_, i) => {
              const h = selectedHitters[i];
              return (
                <li key={h?.id ?? `empty-${i}`} className={h ? 'is-filled' : ''}>
                  <span className="order-n">{i + 1}</span>
                  {h ? (
                    <>
                      <span className="order-name">{h.name}<small>{h.positions?.[0] ?? 'DH'} · {h.team}</small></span>
                      <span className="order-ob">{h.onBase}</span>
                      <span className="order-tools">
                        <button className="mini-btn" onClick={() => handleMoveHitter(i, 'up')} disabled={i === 0} aria-label={`Move ${h.name} up`}><ChevronUp size={14} /></button>
                        <button className="mini-btn" onClick={() => handleMoveHitter(i, 'down')} disabled={i === selectedHitters.length - 1} aria-label={`Move ${h.name} down`}><ChevronDown size={14} /></button>
                        <button className="mini-btn" onClick={() => handleToggleHitter(h)} aria-label={`Remove ${h.name}`}><X size={14} /></button>
                      </span>
                    </>
                  ) : (
                    <span className="order-empty">Open slot</span>
                  )}
                </li>
              );
            })}
          </ol>

          <button className="btn btn-primary dugout-cta" onClick={handleConfirmRoster} disabled={!isRosterComplete}>
            {isRosterComplete
              ? <>{isAway ? 'Lock in · build home club' : 'Lock in · to the matchup'} <ArrowRight size={18} aria-hidden="true" /></>
              : `${!selectedPitcher ? 'Need a starter' : ''}${!selectedPitcher && selectedHitters.length < 9 ? ' · ' : ''}${selectedHitters.length < 9 ? `${9 - selectedHitters.length} more batter${9 - selectedHitters.length === 1 ? '' : 's'}` : ''}`}
          </button>
        </aside>
      </div>
    </div>
  );
}
