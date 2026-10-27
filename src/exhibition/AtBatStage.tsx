/**
 * At-bat stage: pitcher and batter cards face off across a lit table,
 * two 3D dice in the middle, and a broadcast-style headline that tells the story
 * of each beat (matchup -> pitch -> advantage -> swing -> result).
 */
import { useEffect, useRef } from 'react';
import { useExhibitionStore } from './exhibitionStore';
import { getTotalScore } from '../multiplayer/protocol';
import { Card, OUTCOME_NAMES } from '../components/Card';
import { DiceTray } from '../components/DiceTray';
import { ScoreStrip, FieldDiamond, GameLog } from '../components/TableParts';
import { playCrowd, playOut } from '../components/sfx';
import { playText, resultTone } from './ExhibitionGame';

const lastName = (n: string) => n.split(' ').slice(-1)[0];
const halfLabel = (inning: number, top: boolean) => `${top ? 'Top' : 'Bot'} ${inning}`;

export function AtBatStage() {
  const s = useExhibitionStore();
  const {
    awayRoster, homeRoster, awayTeamName, homeTeamName, inning, isTopHalf, inningState, lineScore,
    homeBatterIndex, awayBatterIndex, playPhase, partialAtBat, lastAtBat, animatingDice, rollTarget,
    playLog, runners, performPitch, performSwing, advanceGame
  } = s;

  // Result sounds
  const lastSounded = useRef<number | null>(null);
  useEffect(() => {
    if (playPhase !== 'result' || !lastAtBat) return;
    const id = playLog.length;
    if (lastSounded.current === id) return;
    lastSounded.current = id;
    const tone = resultTone(lastAtBat.outcome);
    if (tone === 'out') playOut();
    else playCrowd(tone === 'big' || lastAtBat.runsScored > 0 ? 'big' : 'soft');
  }, [playPhase, lastAtBat, playLog.length]);

  if (!awayRoster || !homeRoster) return null;

  const committed = getTotalScore(lineScore);
  const scores = {
    away: committed.away + (isTopHalf ? inningState.runs : 0),
    home: committed.home + (!isTopHalf ? inningState.runs : 0)
  };

  const battingRoster = isTopHalf ? awayRoster : homeRoster;
  const pitchingRoster = isTopHalf ? homeRoster : awayRoster;
  const batterIndex = isTopHalf ? awayBatterIndex : homeBatterIndex;
  const displayBatterIndex = playPhase === 'result' && lastAtBat ? (batterIndex + 8) % 9 : batterIndex;
  const batter = battingRoster.lineup[displayBatterIndex];
  const pitcher = pitchingRoster.pitcher;
  const battingTeam = isTopHalf ? awayTeamName : homeTeamName;
  const pitchingTeam = isTopHalf ? homeTeamName : awayTeamName;

  const pitchRolling = playPhase === 'pitchRolling';
  const swingRolling = playPhase === 'swingRolling';
  const adv = pitchRolling ? null : (partialAtBat?.advantageHolder ?? lastAtBat?.advantageHolder ?? null);
  const pitchValue = partialAtBat?.pitchRoll ?? lastAtBat?.pitchRoll ?? null;
  const swingValue = lastAtBat && playPhase === 'result' ? lastAtBat.swingRoll : null;
  const pitchTotal = partialAtBat?.pitchTotal ?? lastAtBat?.pitchTotal;
  const result = playPhase === 'result' ? lastAtBat : null;
  const chartOwner = adv === 'pitcher' ? lastName(pitcher.name) : lastName(batter.name);

  /* ---- headline copy per beat ---- */
  let kicker = '';
  let title = '';
  let sub = '';
  let tone = 'neutral';
  if (playPhase === 'pitching') {
    kicker = `${halfLabel(inning, isTopHalf)} · Batting ${displayBatterIndex + 1}${['st', 'nd', 'rd'][displayBatterIndex] ?? 'th'}`;
    title = `${lastName(batter.name)} vs ${lastName(pitcher.name)}`;
    sub = `Control ${pitcher.control} against On-Base ${batter.onBase}. Beat ${batter.onBase} to own the at-bat.`;
  } else if (pitchRolling) {
    kicker = 'The pitch';
    title = 'Here it comes';
    sub = `d20 + ${pitcher.control} control`;
    tone = 'rolling';
  } else if (playPhase === 'pitched' && partialAtBat) {
    kicker = `${partialAtBat.pitchRoll} + ${pitcher.control} = ${partialAtBat.pitchTotal} vs On-Base ${batter.onBase}`;
    title = adv === 'pitcher' ? "Pitcher's advantage" : "Batter's advantage";
    sub = `The swing reads off ${chartOwner}'s chart.`;
    tone = adv === 'pitcher' ? 'pitcher' : 'hitter';
  } else if (swingRolling) {
    kicker = `Off ${chartOwner}'s chart`;
    title = 'The swing';
    sub = '';
    tone = 'rolling';
  } else if (result) {
    kicker = `Rolled ${result.swingRoll} on ${chartOwner}'s chart`;
    title = OUTCOME_NAMES[result.outcome];
    sub = playText({ batterName: batter.name, outcome: result.outcome, runsScored: result.runsScored });
    tone = `result tone-${resultTone(result.outcome)}`;
  }
  const headlineKey = `${playPhase}-${playLog.length}`;

  const logRows = [...playLog].reverse().slice(0, 30).map(p => ({
    id: p.id,
    label: halfLabel(p.inning, p.isTopHalf),
    text: playText(p),
    outcome: p.outcome
  }));

  const act = () => {
    if (playPhase === 'pitching') performPitch();
    else if (playPhase === 'pitched') performSwing();
    else if (playPhase === 'result') advanceGame();
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    if ((e.target as HTMLElement).tagName === 'BUTTON') return;
    e.preventDefault();
    act();
  };

  const cardState = (side: 'pitcher' | 'hitter') =>
    adv === null ? '' : adv === side ? 'is-ahead' : 'is-behind';

  return (
    <div className={`arena phase-${playPhase} ${result ? `result-${resultTone(result.outcome)}` : ''}`} onKeyDown={onKey} tabIndex={-1}>
      <ScoreStrip
        awayName={awayTeamName}
        homeName={homeTeamName}
        awayScore={scores.away}
        homeScore={scores.home}
        inning={inning}
        isTopHalf={isTopHalf}
        outs={inningState.outs}
        bases={inningState.bases}
      />

      <div className="stage">
        <div className="stage-lights" aria-hidden="true" />

        <div className={`stage-side side-left ${cardState('pitcher')}`}>
          <div className="stage-tag"><span>{pitchingTeam}</span> Pitching</div>
          <div className="stage-card" key={pitcher.id}>
            <Card
              card={pitcher}
              type="pitcher"
              active={adv === 'pitcher'}
              scanRoll={swingRolling && adv === 'pitcher' ? animatingDice : null}
              highlightedRoll={lastAtBat?.swingRoll}
              showHighlightedBand={!!result && result.advantageHolder === 'pitcher'}
            />
          </div>
        </div>

        <div className="stage-center">
          <div className={`headline ${tone}`} key={headlineKey} aria-live="polite">
            <div className="headline-kicker">{kicker}</div>
            <h2 className="headline-title">{title}</h2>
            {sub && <p className="headline-sub">{sub}</p>}
            {result && result.runsScored > 0 && (
              <div className="runs-chip">+{result.runsScored} run{result.runsScored > 1 ? 's' : ''}</div>
            )}
          </div>

          <DiceTray
            pitchValue={pitchValue}
            pitchRolling={pitchRolling}
            pitchTarget={pitchRolling ? rollTarget : null}
            swingValue={swingValue}
            swingRolling={swingRolling}
            swingTarget={swingRolling ? rollTarget : null}
            control={pitcher.control}
            onBase={batter.onBase}
            pitchTotal={pitchTotal}
            advantage={adv}
            showReadout={false}
          />

          <div className="stage-actions">
            {playPhase === 'pitching' && (
              <button className="btn btn-primary btn-roll" onClick={performPitch} autoFocus>Roll the pitch</button>
            )}
            {playPhase === 'pitched' && (
              <button className="btn btn-primary btn-roll" onClick={performSwing} autoFocus>Roll the swing</button>
            )}
            {(pitchRolling || swingRolling) && (
              <button className="btn btn-primary btn-roll" disabled>Rolling…</button>
            )}
            {playPhase === 'result' && (
              <button className="btn btn-secondary btn-roll" onClick={advanceGame} autoFocus>
                {inningState.outs >= 3 ? 'End the inning' : 'Next batter'} →
              </button>
            )}
            <span className="key-hint"><kbd>Space</kbd> to continue</span>
          </div>
        </div>

        <div className={`stage-side side-right ${cardState('hitter')}`}>
          <div className="stage-tag"><span>{battingTeam}</span> At bat · #{displayBatterIndex + 1}</div>
          <div className="stage-card" key={batter.id}>
            <Card
              card={batter}
              type="hitter"
              active={adv === 'hitter'}
              scanRoll={swingRolling && adv === 'hitter' ? animatingDice : null}
              highlightedRoll={lastAtBat?.swingRoll}
              showHighlightedBand={!!result && result.advantageHolder === 'hitter'}
            />
          </div>
        </div>
      </div>

      <div className="arena-foot">
        <div className="foot-field">
          <FieldDiamond bases={inningState.bases} outs={inningState.outs} runners={runners} />
          <div className="due-up">
            <span className="due-up-label">On deck</span>
            {[1, 2].map(k => {
              const h = battingRoster.lineup[(displayBatterIndex + k) % 9];
              return <span key={h.id} className="due-up-name">{lastName(h.name)} <em>{h.onBase}</em></span>;
            })}
          </div>
        </div>
        <GameLog rows={logRows} title="Play-by-play" />
      </div>
    </div>
  );
}
