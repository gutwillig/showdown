/**
 * Exhibition Game Screen
 * Calm card-table layout: slim score strip, pitcher | dice tray + field | batter, game log.
 * Two-step at-bat: PITCH -> advantage -> SWING -> result.
 * Big line score only appears at the inning break.
 */

import { useExhibitionStore, type PlayLogEntry } from './exhibitionStore';
import { getTotalScore } from '../multiplayer/protocol';
import { LineScoreBoard } from '../components/TableParts';
import { AtBatStage } from './AtBatStage';
import type { OutcomeType } from '../data/types';

const VERBS: Record<OutcomeType, string> = {
  PU: 'pops up',
  SO: 'strikes out',
  GB: 'grounds out',
  FB: 'flies out',
  BB: 'draws a walk',
  '1B': 'singles',
  '1B+': 'singles, runners take an extra base',
  '2B': 'doubles',
  '3B': 'triples',
  HR: 'homers'
};

const lastName = (n: string) => n.split(' ').slice(-1)[0];

export function playText(e: Pick<PlayLogEntry, 'batterName' | 'outcome' | 'runsScored'>) {
  let t = `${lastName(e.batterName)} ${VERBS[e.outcome]}`;
  if (e.outcome === 'HR') t += e.runsScored > 1 ? ` — ${e.runsScored} runs score` : ' — solo shot';
  else if (e.runsScored > 0) t += ` — ${e.runsScored} run${e.runsScored > 1 ? 's' : ''} score${e.runsScored === 1 ? 's' : ''}`;
  return t;
}

export function resultTone(o: OutcomeType): 'out' | 'onbase' | 'big' {
  if (['PU', 'SO', 'GB', 'FB'].includes(o)) return 'out';
  if (o === 'HR' || o === '3B') return 'big';
  return 'onbase';
}

const halfLabel = (inning: number, top: boolean) => `${top ? 'Top' : 'Bot'} ${inning}`;
const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

export function ExhibitionGame() {
  const {
    awayRoster,
    homeRoster,
    awayTeamName,
    homeTeamName,
    inning,
    isTopHalf,
    inningState,
    lineScore,
    homeBatterIndex,
    awayBatterIndex,
    playPhase,
    winner,
    gamePhase,
    playLog,
    teamHits,
    startNextHalf,
    resetGame,
    goToSetup
  } = useExhibitionStore();

  if (!awayRoster || !homeRoster) {
    return <div className="loading">Loading game state...</div>;
  }

  const committed = getTotalScore(lineScore);

  /* ---------- Game over ---------- */
  if (gamePhase === 'gameOver' || winner) {
    const winnerName = winner === 'home' ? homeTeamName : awayTeamName;
    const finalScores = getTotalScore(lineScore);
    const heroes = [...playLog].reverse().filter(p => p.runsScored > 0).slice(0, 4);
    return (
      <div className="break-screen">
        <BreakHero
          kicker="Final"
          title={`${winnerName} win`}
          awayName={awayTeamName}
          homeName={homeTeamName}
          away={finalScores.away}
          home={finalScores.home}
        />
        <LineScoreBoard
          awayName={awayTeamName}
          homeName={homeTeamName}
          away={lineScore.away}
          home={lineScore.home}
          awayHits={teamHits.away}
          homeHits={teamHits.home}
          status="Final"
        />
        <div className="break-grid">
          <section className="paper-panel">
            <header className="paper-head"><h2>{winnerName} win</h2><span className="paper-status">{Math.max(finalScores.away, finalScores.home)}–{Math.min(finalScores.away, finalScores.home)}</span></header>
            <RecapList plays={heroes} empty="A pitchers' duel from start to finish." />
          </section>
          <section className="paper-panel">
            <header className="paper-head"><h2>Box</h2></header>
            <ul className="notes-list">
              <li>{awayTeamName}: {finalScores.away} R, {teamHits.away} H</li>
              <li>{homeTeamName}: {finalScores.home} R, {teamHits.home} H</li>
              <li>{playLog.length} plate appearances</li>
            </ul>
          </section>
        </div>
        <div className="break-actions">
          <button className="btn btn-primary btn-large" onClick={resetGame}>Play Again</button>
          <button className="btn btn-secondary" onClick={goToSetup}>New Matchup</button>
        </div>
      </div>
    );
  }

  /* ---------- Inning break: the scoreboard reset ---------- */
  if (playPhase === 'halfInningEnd') {
    // State has already flipped to the upcoming half; the half that just ended is the previous one
    const endedTop = !isTopHalf;
    const endedInning = isTopHalf ? inning - 1 : inning;
    const halfPlays = playLog.filter(p => p.inning === endedInning && p.isTopHalf === endedTop);
    const notable = halfPlays.filter(p => p.runsScored > 0 || !['PU', 'SO', 'GB', 'FB'].includes(p.outcome));
    const ks = halfPlays.filter(p => p.outcome === 'SO').length;
    const runs = halfPlays.reduce((s, p) => s + p.runsScored, 0);
    const battingTeam = endedTop ? awayTeamName : homeTeamName;
    const fieldingRoster = endedTop ? homeRoster : awayRoster;
    const lead = committed.away === committed.home
      ? `All square at ${committed.away}`
      : `${committed.away > committed.home ? awayTeamName : homeTeamName} lead ${Math.max(committed.away, committed.home)}–${Math.min(committed.away, committed.home)}`;
    const nextLabel = `Start ${isTopHalf ? 'Top' : 'Bottom'} ${inning}`;
    const dueUp = (isTopHalf ? awayRoster : homeRoster).lineup;
    const dueIdx = isTopHalf ? awayBatterIndex : homeBatterIndex;

    return (
      <div className="break-screen">
        <BreakHero
          kicker={`${endedTop ? 'Middle' : 'End'} of the ${ordinal(endedInning)}`}
          title={lead}
          awayName={awayTeamName}
          homeName={homeTeamName}
          away={committed.away}
          home={committed.home}
        />
        <LineScoreBoard
          awayName={awayTeamName}
          homeName={homeTeamName}
          away={lineScore.away}
          home={lineScore.home}
          awayHits={teamHits.away}
          homeHits={teamHits.home}
          status={`${endedTop ? 'Mid' : 'End'} ${ordinal(endedInning)}`}
        />
        <div className="break-grid">
          <section className="paper-panel">
            <header className="paper-head">
              <h2>Inning Recap</h2>
              <span className="paper-status">{halfLabel(endedInning, endedTop)}</span>
            </header>
            {notable.length === 0 && ks === 3 ? (
              <p className="recap-empty">{lastName(fieldingRoster.pitcher.name)} strikes out the side.</p>
            ) : (
              <RecapList plays={notable} empty={`${lastName(fieldingRoster.pitcher.name)} sets them down in order.`} />
            )}
          </section>
          <section className="paper-panel">
            <header className="paper-head"><h2>Game Notes</h2></header>
            <ul className="notes-list">
              <li>{lead}</li>
              <li>{battingTeam}: {runs} run{runs === 1 ? '' : 's'} on {halfPlays.filter(p => ['1B', '1B+', '2B', '3B', 'HR'].includes(p.outcome)).length} hits this half</li>
              {ks > 0 && <li>{lastName(fieldingRoster.pitcher.name)} with {ks} strikeout{ks > 1 ? 's' : ''} in the inning</li>}
              <li>Due up: {[0, 1, 2].map(k => lastName(dueUp[(dueIdx + k) % 9].name)).join(', ')}</li>
            </ul>
          </section>
        </div>
        <div className="break-actions">
          <button className="btn btn-primary btn-large" onClick={startNextHalf} autoFocus>
            {nextLabel} →
          </button>
        </div>
      </div>
    );
  }

  /* ---------- In play ---------- */
  return <AtBatStage />;
}

function RecapList({ plays, empty }: { plays: PlayLogEntry[]; empty: string }) {
  if (plays.length === 0) return <p className="recap-empty">{empty}</p>;
  return (
    <ul className="recap-list">
      {plays.map(p => (
        <li key={p.id}>
          <span className="recap-inn">{halfLabel(p.inning, p.isTopHalf)}</span>
          <div>
            <strong>{playText(p)}</strong>
            <span className="recap-sub">Roll {p.swingRoll} off {p.advantageHolder === 'pitcher' ? lastName(p.pitcherName) + "'s" : lastName(p.batterName) + "'s"} chart</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

function BreakHero({ kicker, title, awayName, homeName, away, home }: { kicker: string; title: string; awayName: string; homeName: string; away: number; home: number }) {
  return (
    <header className="break-hero">
      <div className="break-kicker">{kicker}</div>
      <div className="break-score">
        <span className={`bh-team ${away > home ? 'is-lead' : ''}`}><span className="bh-name">{awayName}</span><span className="bh-runs">{away}</span></span>
        <span className="bh-dash" aria-hidden="true" />
        <span className={`bh-team ${home > away ? 'is-lead' : ''}`}><span className="bh-runs">{home}</span><span className="bh-name">{homeName}</span></span>
      </div>
      <h1 className="break-title">{title}</h1>
    </header>
  );
}
