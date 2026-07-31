/**
 * Exhibition mode store
 * Solo 3-inning game where user controls both teams
 * Two-step at-bat: PITCH (roll d20) -> show advantage -> SWING (roll d20) -> result
 */

import { create } from 'zustand';
import type { AtBatResult } from '../data/types';
import type { Roster, LineScore, InningHalfState } from '../multiplayer/protocol';
import { createInningHalfState, getTotalScore } from '../multiplayer/protocol';
import { createRNG, createRandomSeed, rollD20 } from '../engine/rng';
import { determineAdvantage, lookupChart, getOutcomeDescription, applyAtBatResult } from '../engine/engine';
import { advanceRunners } from '../engine/baserunning';

type GamePhase = 'setup' | 'playing' | 'gameOver';
type SetupStep = 'awayRoster' | 'homeRoster' | 'ready';
type PlayPhase = 'pitching' | 'pitchRolling' | 'pitched' | 'swingRolling' | 'result' | 'halfInningEnd';

interface PartialAtBat {
  pitchRoll: number;
  pitchTotal: number;
  advantageHolder: 'pitcher' | 'hitter';
}

interface ExhibitionState {
  // Setup state
  gamePhase: GamePhase;
  setupStep: SetupStep;
  awayRoster: Roster | null;
  homeRoster: Roster | null;
  awayTeamName: string;
  homeTeamName: string;

  // Game state
  inning: number;
  isTopHalf: boolean;
  inningState: InningHalfState;
  lineScore: LineScore;
  homeBatterIndex: number;
  awayBatterIndex: number;
  playPhase: PlayPhase;

  // At-bat state (two-step flow)
  partialAtBat: PartialAtBat | null;
  lastAtBat: AtBatResult | null;
  animatingDice: number | null; // Current animating dice value

  winner: 'home' | 'away' | null;

  // RNG
  rng: (() => number) | null;
  seed: number;

  // Actions
  setAwayRoster: (roster: Roster, teamName?: string) => void;
  setHomeRoster: (roster: Roster, teamName?: string) => void;
  startGame: () => void;
  performPitch: () => void;
  performSwing: () => void;
  advanceGame: () => void;
  resetGame: () => void;
  goToSetup: () => void;
}

// Dice animation helper - creates anticipation with tumbling numbers
function animateDice(
  finalValue: number,
  onFrame: (value: number) => void,
  onComplete: () => void
) {
  const totalFrames = 15; // More frames for longer anticipation
  let frame = 0;

  const animate = () => {
    if (frame < totalFrames) {
      // Show random numbers during animation
      const randomValue = Math.floor(Math.random() * 20) + 1;
      onFrame(randomValue);
      frame++;
      // Slow down towards the end for dramatic effect
      const delay = frame < 10 ? 50 : (frame < 13 ? 100 : 150);
      setTimeout(animate, delay);
    } else {
      // Show final value
      onFrame(finalValue);
      setTimeout(onComplete, 400); // Longer pause to see the result
    }
  };

  animate();
}

export const useExhibitionStore = create<ExhibitionState>((set, get) => ({
  // Initial state - setup
  gamePhase: 'setup',
  setupStep: 'awayRoster',
  awayRoster: null,
  homeRoster: null,
  awayTeamName: 'Away',
  homeTeamName: 'Home',

  // Initial game state
  inning: 1,
  isTopHalf: true,
  inningState: createInningHalfState(0),
  lineScore: { away: [], home: [] },
  homeBatterIndex: 0,
  awayBatterIndex: 0,
  playPhase: 'pitching',
  partialAtBat: null,
  lastAtBat: null,
  animatingDice: null,
  winner: null,

  // RNG
  rng: null,
  seed: 0,

  setAwayRoster: (roster: Roster, teamName?: string) => {
    set({
      awayRoster: roster,
      awayTeamName: teamName || roster.pitcher.team,
      setupStep: 'homeRoster'
    });
  },

  setHomeRoster: (roster: Roster, teamName?: string) => {
    set({
      homeRoster: roster,
      homeTeamName: teamName || roster.pitcher.team,
      setupStep: 'ready'
    });
  },

  startGame: () => {
    const { awayRoster, homeRoster } = get();
    if (!awayRoster || !homeRoster) return;

    const seed = createRandomSeed();
    const rng = createRNG(seed);

    set({
      gamePhase: 'playing',
      inning: 1,
      isTopHalf: true,
      inningState: createInningHalfState(0),
      lineScore: { away: [], home: [] },
      homeBatterIndex: 0,
      awayBatterIndex: 0,
      playPhase: 'pitching',
      partialAtBat: null,
      lastAtBat: null,
      animatingDice: null,
      winner: null,
      rng,
      seed
    });
  },

  performPitch: () => {
    const {
      rng,
      awayRoster,
      homeRoster,
      isTopHalf,
      awayBatterIndex,
      homeBatterIndex
    } = get();

    if (!rng || !awayRoster || !homeRoster) return;

    // Get current matchup
    const battingRoster = isTopHalf ? awayRoster : homeRoster;
    const pitchingRoster = isTopHalf ? homeRoster : awayRoster;
    const batterIndex = isTopHalf ? awayBatterIndex : homeBatterIndex;
    const batter = battingRoster.lineup[batterIndex];
    const pitcher = pitchingRoster.pitcher;

    // Roll the pitch
    const pitchRoll = rollD20(rng);
    const pitchTotal = pitchRoll + pitcher.control;
    const advantageHolder = determineAdvantage(pitchRoll, pitcher.control, batter.onBase);

    // Start animation
    set({ playPhase: 'pitchRolling', animatingDice: 1 });

    // Animate the dice
    animateDice(
      pitchRoll,
      (value) => set({ animatingDice: value }),
      () => {
        // Animation complete - show advantage
        const partial: PartialAtBat = {
          pitchRoll,
          pitchTotal,
          advantageHolder
        };
        set({
          playPhase: 'pitched',
          partialAtBat: partial,
          animatingDice: null
        });
      }
    );
  },

  performSwing: () => {
    const {
      rng,
      awayRoster,
      homeRoster,
      isTopHalf,
      inningState,
      homeBatterIndex,
      awayBatterIndex,
      lineScore,
      inning,
      partialAtBat
    } = get();

    if (!rng || !awayRoster || !homeRoster || !partialAtBat) return;

    // Get current matchup
    const battingRoster = isTopHalf ? awayRoster : homeRoster;
    const pitchingRoster = isTopHalf ? homeRoster : awayRoster;
    const batterIndex = isTopHalf ? awayBatterIndex : homeBatterIndex;
    const batter = battingRoster.lineup[batterIndex];
    const pitcher = pitchingRoster.pitcher;

    // Roll the swing
    const swingRoll = rollD20(rng);

    // Start animation
    set({ playPhase: 'swingRolling', animatingDice: 1 });

    // Animate the dice
    animateDice(
      swingRoll,
      (value) => set({ animatingDice: value }),
      () => {
        // Animation complete - resolve outcome
        const chart = partialAtBat.advantageHolder === 'pitcher' ? pitcher.chart : batter.chart;
        const outcome = lookupChart(chart, swingRoll);
        const { runsScored } = advanceRunners(inningState.bases, inningState.outs, outcome);

        const result: AtBatResult = {
          pitchRoll: partialAtBat.pitchRoll,
          pitchTotal: partialAtBat.pitchTotal,
          advantageHolder: partialAtBat.advantageHolder,
          swingRoll,
          outcome,
          runsScored,
          description: getOutcomeDescription(outcome, runsScored)
        };

        // Apply result to inning state
        const newInningState = applyAtBatResult(
          { ...inningState, walks: 0 } as import('../data/types').HalfInningState,
          result,
          9
        );

        // Update batter index
        const newBatterIndex = (batterIndex + 1) % 9;

        // Check for walk-off (home team takes lead in bottom of 3rd or later)
        let isWalkOff = false;
        if (!isTopHalf && inning >= 3) {
          const currentAwayTotal = lineScore.away.reduce((a, b) => a + b, 0);
          const currentHomeTotal = lineScore.home.reduce((a, b) => a + b, 0) + newInningState.runs;
          if (currentHomeTotal > currentAwayTotal) {
            isWalkOff = true;
          }
        }

        set({
          inningState: {
            outs: newInningState.outs,
            bases: newInningState.bases,
            runs: newInningState.runs,
            hits: newInningState.hits,
            batterIndex: newBatterIndex
          },
          lastAtBat: result,
          partialAtBat: null,
          playPhase: 'result',
          animatingDice: null,
          homeBatterIndex: !isTopHalf ? newBatterIndex : homeBatterIndex,
          awayBatterIndex: isTopHalf ? newBatterIndex : awayBatterIndex
        });

        // Handle walk-off immediately
        if (isWalkOff) {
          const newLineScore = {
            away: lineScore.away,
            home: [...lineScore.home, newInningState.runs]
          };
          set({
            lineScore: newLineScore,
            winner: 'home',
            gamePhase: 'gameOver'
          });
        }
      }
    );
  },

  advanceGame: () => {
    const {
      inningState,
      isTopHalf,
      inning,
      lineScore,
      homeBatterIndex,
      awayBatterIndex,
      winner
    } = get();

    // If game is already over, do nothing
    if (winner) return;

    // Check if half-inning is over (3 outs)
    if (inningState.outs >= 3) {
      // Record runs for this half-inning
      let newLineScore: LineScore;
      if (isTopHalf) {
        newLineScore = {
          away: [...lineScore.away, inningState.runs],
          home: lineScore.home
        };
      } else {
        newLineScore = {
          away: lineScore.away,
          home: [...lineScore.home, inningState.runs]
        };
      }

      const scores = getTotalScore(newLineScore);

      // Check if game is over (end of bottom half, inning 3+)
      if (!isTopHalf && inning >= 3) {
        if (scores.home !== scores.away) {
          // Game over
          set({
            lineScore: newLineScore,
            winner: scores.home > scores.away ? 'home' : 'away',
            gamePhase: 'gameOver'
          });
          return;
        }
      }

      // Check if we should skip bottom half (home already winning in top of 3rd+)
      const nextIsTop = !isTopHalf;
      const nextInning = nextIsTop ? inning + 1 : inning;

      if (!nextIsTop && nextInning >= 3 && scores.home > scores.away) {
        // Skip bottom half, home wins
        set({
          lineScore: newLineScore,
          winner: 'home',
          gamePhase: 'gameOver'
        });
        return;
      }

      // Transition to next half-inning
      const nextBatterIndex = nextIsTop ? awayBatterIndex : homeBatterIndex;

      set({
        lineScore: newLineScore,
        inning: nextInning,
        isTopHalf: nextIsTop,
        inningState: createInningHalfState(nextBatterIndex),
        playPhase: 'halfInningEnd',
        lastAtBat: null,
        partialAtBat: null
      });

      // Brief pause then continue to pitching phase
      setTimeout(() => {
        const current = get();
        if (current.playPhase === 'halfInningEnd') {
          set({ playPhase: 'pitching' });
        }
      }, 2000);

    } else {
      // Continue at-bat, back to pitching phase
      set({ playPhase: 'pitching', partialAtBat: null, lastAtBat: null });
    }
  },

  resetGame: () => {
    const { awayRoster, homeRoster } = get();

    // Keep rosters, restart game
    if (awayRoster && homeRoster) {
      const seed = createRandomSeed();
      const rng = createRNG(seed);

      set({
        gamePhase: 'playing',
        inning: 1,
        isTopHalf: true,
        inningState: createInningHalfState(0),
        lineScore: { away: [], home: [] },
        homeBatterIndex: 0,
        awayBatterIndex: 0,
        playPhase: 'pitching',
        partialAtBat: null,
        lastAtBat: null,
        animatingDice: null,
        winner: null,
        rng,
        seed
      });
    }
  },

  goToSetup: () => {
    set({
      gamePhase: 'setup',
      setupStep: 'awayRoster',
      awayRoster: null,
      homeRoster: null,
      awayTeamName: 'Away',
      homeTeamName: 'Home',
      inning: 1,
      isTopHalf: true,
      inningState: createInningHalfState(0),
      lineScore: { away: [], home: [] },
      homeBatterIndex: 0,
      awayBatterIndex: 0,
      playPhase: 'pitching',
      partialAtBat: null,
      lastAtBat: null,
      animatingDice: null,
      winner: null,
      rng: null,
      seed: 0
    });
  }
}));
