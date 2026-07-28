/**
 * Core game engine for Showdown Digital
 * Pure functions, no React dependencies
 */

import type {
  PitcherCard,
  HitterCard,
  Chart,
  OutcomeType,
  AtBatResult,
  HalfInningState
} from '../data/types';
import { rollD20 } from './rng';
import {
  advanceRunners,
  isOut,
  isHit,
  createHalfInningState
} from './baserunning';

/**
 * Determine which side has the advantage
 * Pitcher wins if pitchRoll + control > onBase
 * Tie goes to hitter
 */
export function determineAdvantage(
  pitchRoll: number,
  control: number,
  onBase: number
): 'pitcher' | 'hitter' {
  const pitchTotal = pitchRoll + control;
  return pitchTotal > onBase ? 'pitcher' : 'hitter';
}

/**
 * Calculate probability of pitcher advantage
 * P(pitcher advantage) = (20 - (onBase - control)) / 20, clamped to [0, 1]
 */
export function calculatePitcherAdvantageProb(control: number, onBase: number): number {
  const threshold = onBase - control;
  const successRolls = 20 - threshold;
  return Math.max(0, Math.min(1, successRolls / 20));
}

/**
 * Look up outcome on a chart given a d20 roll
 */
export function lookupChart(chart: Chart, roll: number): OutcomeType {
  // Check each band in order
  const categories: OutcomeType[] = [
    'PU', 'SO', 'GB', 'FB', 'BB', '1B', '1B+', '2B', '3B', 'HR'
  ];

  for (const cat of categories) {
    const band = chart[cat];
    if (band && roll >= band[0] && roll <= band[1]) {
      return cat;
    }
  }

  // Should never happen if chart is valid
  console.error('Chart lookup failed for roll', roll, chart);
  return 'SO';
}

/**
 * Get human-readable description of an outcome
 */
export function getOutcomeDescription(outcome: OutcomeType, runsScored: number): string {
  const descriptions: Record<OutcomeType, string> = {
    'PU': 'Popup',
    'SO': 'Strikeout',
    'GB': 'Groundout',
    'FB': 'Flyout',
    'BB': 'Walk',
    '1B': 'Single',
    '1B+': 'Single (runner advances)',
    '2B': 'Double',
    '3B': 'Triple',
    'HR': 'Home Run'
  };

  let desc = descriptions[outcome];
  if (runsScored > 0 && outcome !== 'HR') {
    desc += ` (${runsScored} run${runsScored > 1 ? 's' : ''} score${runsScored === 1 ? 's' : ''})`;
  } else if (outcome === 'HR' && runsScored > 1) {
    desc = `${runsScored}-Run Homer!`;
  }
  return desc;
}

/**
 * Resolve a complete at-bat
 */
export function resolveAtBat(
  pitcher: PitcherCard,
  hitter: HitterCard,
  rng: () => number,
  currentBases: { first: boolean; second: boolean; third: boolean },
  currentOuts: number
): AtBatResult {
  // Roll pitch
  const pitchRoll = rollD20(rng);
  const pitchTotal = pitchRoll + pitcher.control;

  // Determine advantage
  const advantageHolder = determineAdvantage(pitchRoll, pitcher.control, hitter.onBase);

  // Roll swing on advantaged chart
  const swingRoll = rollD20(rng);
  const chart = advantageHolder === 'pitcher' ? pitcher.chart : hitter.chart;
  const outcome = lookupChart(chart, swingRoll);

  // Calculate runs scored
  const { runsScored } = advanceRunners(currentBases, currentOuts, outcome);

  return {
    pitchRoll,
    pitchTotal,
    advantageHolder,
    swingRoll,
    outcome,
    runsScored,
    description: getOutcomeDescription(outcome, runsScored)
  };
}

/**
 * Apply an at-bat result to half-inning state
 */
export function applyAtBatResult(
  state: HalfInningState,
  result: AtBatResult,
  lineupSize: number = 9
): HalfInningState {
  const { newBases, runsScored } = advanceRunners(
    state.bases,
    state.outs,
    result.outcome
  );

  const newOuts = state.outs + (isOut(result.outcome) ? 1 : 0);

  return {
    outs: newOuts,
    bases: newOuts >= 3 ? { first: false, second: false, third: false } : newBases,
    runs: state.runs + runsScored,
    hits: state.hits + (isHit(result.outcome) ? 1 : 0),
    walks: state.walks + (result.outcome === 'BB' ? 1 : 0),
    batterIndex: (state.batterIndex + 1) % lineupSize
  };
}

/**
 * Simulate a complete half-inning
 */
export function simulateHalfInning(
  pitcher: PitcherCard,
  lineup: HitterCard[],
  rng: () => number,
  startingBatterIndex: number = 0
): { finalState: HalfInningState; results: AtBatResult[] } {
  let state = createHalfInningState();
  state.batterIndex = startingBatterIndex;
  const results: AtBatResult[] = [];

  while (state.outs < 3) {
    const hitter = lineup[state.batterIndex];
    const result = resolveAtBat(pitcher, hitter, rng, state.bases, state.outs);
    results.push(result);
    state = applyAtBatResult(state, result, lineup.length);
  }

  return { finalState: state, results };
}

/**
 * Calculate expected outcome probabilities for a matchup
 */
export function calculateMatchupProbabilities(
  pitcher: PitcherCard,
  hitter: HitterCard
): Record<OutcomeType, number> {
  const pitcherAdvProb = calculatePitcherAdvantageProb(pitcher.control, hitter.onBase);
  const hitterAdvProb = 1 - pitcherAdvProb;

  const probs: Record<OutcomeType, number> = {
    'PU': 0, 'SO': 0, 'GB': 0, 'FB': 0,
    'BB': 0, '1B': 0, '1B+': 0, '2B': 0, '3B': 0, 'HR': 0
  };

  // Add probabilities from each chart weighted by advantage probability
  const addChartProbs = (chart: Chart, weight: number) => {
    const categories: OutcomeType[] = [
      'PU', 'SO', 'GB', 'FB', 'BB', '1B', '1B+', '2B', '3B', 'HR'
    ];
    for (const cat of categories) {
      const band = chart[cat];
      if (band) {
        const slots = band[1] - band[0] + 1;
        probs[cat] += (slots / 20) * weight;
      }
    }
  };

  addChartProbs(pitcher.chart, pitcherAdvProb);
  addChartProbs(hitter.chart, hitterAdvProb);

  return probs;
}

/**
 * Calculate expected OBP from matchup probabilities
 */
export function calculateExpectedOBP(probs: Record<OutcomeType, number>): number {
  return probs['BB'] + probs['1B'] + probs['1B+'] + probs['2B'] + probs['3B'] + probs['HR'];
}

export { createHalfInningState, isOut, isHit };
