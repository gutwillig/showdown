/**
 * Baserunning module - pure functions for advancing runners
 * Isolated for phase 2 additions (speed-based, steals, double plays)
 */

import type { BaseState, HalfInningState, OutcomeType, RunnersOnBase } from '../data/types';

export interface BaserunningResult {
  newBases: BaseState;
  runsScored: number;
}

export interface RunnerAdvanceResult {
  newRunners: RunnersOnBase;
  scoredRunners: string[];  // names of runners who scored
}

/**
 * Advance runners based on the outcome of an at-bat
 */
export function advanceRunners(
  bases: BaseState,
  outs: number,
  outcome: OutcomeType
): BaserunningResult {
  switch (outcome) {
    case 'PU':
    case 'SO':
      // Batter out, runners hold
      return { newBases: { ...bases }, runsScored: 0 };

    case 'GB':
      // Batter out, runners hold (no double plays in phase 1)
      return { newBases: { ...bases }, runsScored: 0 };

    case 'FB':
      // Batter out. Sac fly: runner on 3rd scores if < 2 outs
      if (bases.third && outs < 2) {
        return {
          newBases: { first: bases.first, second: bases.second, third: false },
          runsScored: 1
        };
      }
      return { newBases: { ...bases }, runsScored: 0 };

    case 'BB':
      // Walk: batter to 1st, runners advance only if forced
      return advanceOnWalk(bases);

    case '1B':
      // Single: batter to 1st, all runners advance 1 base
      return advanceBases(bases, 1, true);

    case '1B+':
    case '2B':
      // Batter to 2nd, all runners advance 2 bases
      return advanceBases(bases, 2, outcome === '1B+' ? true : true);

    case '3B':
      // Batter to 3rd, all runners score
      return {
        newBases: { first: false, second: false, third: true },
        runsScored: countRunners(bases)
      };

    case 'HR':
      // Everyone scores including batter
      return {
        newBases: { first: false, second: false, third: false },
        runsScored: countRunners(bases) + 1
      };

    default:
      return { newBases: { ...bases }, runsScored: 0 };
  }
}

/**
 * Walk logic: advance only forced runners
 */
function advanceOnWalk(bases: BaseState): BaserunningResult {
  let runs = 0;

  // Work backwards from 3rd
  const newThird = bases.second && bases.first;  // Forced from 2nd
  const newSecond = bases.first;  // Forced from 1st
  const newFirst = true;  // Batter always goes to 1st

  // Runner on 3rd scores only if forced (bases loaded)
  if (bases.third && bases.second && bases.first) {
    runs = 1;
  }

  return {
    newBases: {
      first: newFirst,
      second: newSecond,
      third: bases.third || newThird  // Original 3rd stays unless forced to score
    },
    runsScored: runs
  };
}

/**
 * Advance all runners by N bases, batter takes appropriate base
 */
function advanceBases(bases: BaseState, numBases: number, batterToBase: boolean): BaserunningResult {
  let runs = 0;

  if (numBases === 1) {
    // Single: everyone advances 1
    if (bases.third) runs++;
    return {
      newBases: {
        first: batterToBase,
        second: bases.first,
        third: bases.second
      },
      runsScored: runs
    };
  } else if (numBases === 2) {
    // Double/1B+: everyone advances 2
    if (bases.third) runs++;
    if (bases.second) runs++;
    return {
      newBases: {
        first: false,
        second: batterToBase,
        third: bases.first
      },
      runsScored: runs
    };
  }

  return { newBases: bases, runsScored: 0 };
}

/**
 * Count runners on base
 */
export function countRunners(bases: BaseState): number {
  return (bases.first ? 1 : 0) + (bases.second ? 1 : 0) + (bases.third ? 1 : 0);
}

/**
 * Create empty bases
 */
export function emptyBases(): BaseState {
  return { first: false, second: false, third: false };
}

/**
 * Create initial half-inning state
 */
export function createHalfInningState(): HalfInningState {
  return {
    outs: 0,
    bases: emptyBases(),
    runs: 0,
    hits: 0,
    walks: 0,
    batterIndex: 0
  };
}

/**
 * Check if outcome is an out
 */
export function isOut(outcome: OutcomeType): boolean {
  return outcome === 'PU' || outcome === 'SO' || outcome === 'GB' || outcome === 'FB';
}

/**
 * Check if outcome is a hit
 */
export function isHit(outcome: OutcomeType): boolean {
  return outcome === '1B' || outcome === '1B+' || outcome === '2B' || outcome === '3B' || outcome === 'HR';
}

/**
 * Advance runner names based on outcome (mirrors advanceRunners logic)
 * @param runners Current runner names on bases
 * @param batterName Name of the batter
 * @param outs Current outs before the play
 * @param outcome The outcome of the at-bat
 */
export function advanceRunnerNames(
  runners: RunnersOnBase,
  batterName: string,
  outs: number,
  outcome: OutcomeType
): RunnerAdvanceResult {
  const scored: string[] = [];

  switch (outcome) {
    case 'PU':
    case 'SO':
    case 'GB':
      // Batter out, runners hold
      return { newRunners: { ...runners }, scoredRunners: [] };

    case 'FB':
      // Sac fly: runner on 3rd scores if < 2 outs
      if (runners.third && outs < 2) {
        scored.push(runners.third);
        return {
          newRunners: { first: runners.first, second: runners.second, third: null },
          scoredRunners: scored
        };
      }
      return { newRunners: { ...runners }, scoredRunners: [] };

    case 'BB':
      // Walk: batter to 1st, runners advance only if forced
      if (runners.first && runners.second && runners.third) {
        scored.push(runners.third);
      }
      return {
        newRunners: {
          first: batterName,
          second: runners.first,
          third: (runners.first && runners.second) ? runners.second : runners.third
        },
        scoredRunners: scored
      };

    case '1B':
      // Single: everyone advances 1
      if (runners.third) scored.push(runners.third);
      return {
        newRunners: {
          first: batterName,
          second: runners.first,
          third: runners.second
        },
        scoredRunners: scored
      };

    case '1B+':
    case '2B':
      // Double/1B+: everyone advances 2
      if (runners.third) scored.push(runners.third);
      if (runners.second) scored.push(runners.second);
      return {
        newRunners: {
          first: null,
          second: batterName,
          third: runners.first
        },
        scoredRunners: scored
      };

    case '3B':
      // Triple: all runners score, batter to 3rd
      if (runners.first) scored.push(runners.first);
      if (runners.second) scored.push(runners.second);
      if (runners.third) scored.push(runners.third);
      return {
        newRunners: { first: null, second: null, third: batterName },
        scoredRunners: scored
      };

    case 'HR':
      // HR: everyone scores including batter
      if (runners.first) scored.push(runners.first);
      if (runners.second) scored.push(runners.second);
      if (runners.third) scored.push(runners.third);
      scored.push(batterName);
      return {
        newRunners: { first: null, second: null, third: null },
        scoredRunners: scored
      };

    default:
      return { newRunners: { ...runners }, scoredRunners: [] };
  }
}
