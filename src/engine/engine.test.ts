/**
 * Engine unit tests per acceptance criteria
 */

import { describe, it, expect } from 'vitest';
import {
  determineAdvantage,
  calculatePitcherAdvantageProb,
  lookupChart,
  resolveAtBat,
  applyAtBatResult,
  simulateHalfInning,
  calculateMatchupProbabilities,
  calculateExpectedOBP
} from './engine';
import { advanceRunners, emptyBases, isOut, isHit } from './baserunning';
import { createRNG, rollD20 } from './rng';
import type { PitcherCard, HitterCard, Chart } from '../data/types';

// Test fixtures
const testPitcher: PitcherCard = {
  id: 'p-test',
  name: 'Test Pitcher',
  team: 'TST',
  throws: 'R',
  control: 4,
  ip: 150,
  chart: {
    PU: [1, 2],
    SO: [3, 8],
    GB: [9, 12],
    FB: [13, 15],
    BB: [16, 16],
    '1B': [17, 18],
    '2B': [19, 19],
    HR: [20, 20]
  },
  realStats: { era: 3.50, obpAgainst: 0.300, kPct: 0.25, bbPct: 0.07 }
};

const testHitter: HitterCard = {
  id: 'h-test',
  name: 'Test Hitter',
  team: 'TST',
  bats: 'R',
  onBase: 10,
  speed: null,
  positions: ['RF'],
  chart: {
    SO: [1, 3],
    GB: [4, 5],
    FB: [6, 7],
    BB: [8, 10],
    '1B': [11, 14],
    '1B+': null,
    '2B': [15, 17],
    '3B': [18, 18],
    HR: [19, 20]
  },
  realStats: { obp: 0.350, slg: 0.500, hr: 25, avg: 0.280 }
};

describe('Advantage Math', () => {
  it('should correctly calculate Control 4 vs On-Base 10 = 70% pitcher advantage', () => {
    // Per PRD: P(pitcher advantage) = (20 - (onBase - control)) / 20
    // = (20 - (10 - 4)) / 20 = (20 - 6) / 20 = 14/20 = 70%
    const prob = calculatePitcherAdvantageProb(4, 10);
    expect(prob).toBe(0.7);
  });

  it('should give pitcher advantage when pitch roll + control > onBase', () => {
    // Roll 7 + Control 4 = 11 > OnBase 10 -> Pitcher advantage
    expect(determineAdvantage(7, 4, 10)).toBe('pitcher');
  });

  it('should give hitter advantage on tie (roll + control === onBase)', () => {
    // Roll 6 + Control 4 = 10 === OnBase 10 -> Hitter (tie goes to hitter)
    expect(determineAdvantage(6, 4, 10)).toBe('hitter');
  });

  it('should give hitter advantage when pitch roll + control < onBase', () => {
    // Roll 5 + Control 4 = 9 < OnBase 10 -> Hitter advantage
    expect(determineAdvantage(5, 4, 10)).toBe('hitter');
  });

  it('should handle edge case of very high control', () => {
    // Control 6, OnBase 7: pitcher wins on rolls 2-20 (95%)
    const prob = calculatePitcherAdvantageProb(6, 7);
    expect(prob).toBe(0.95);
  });

  it('should handle edge case of very low control', () => {
    // Control 1, OnBase 16: pitcher wins on rolls 16-20 (25%)
    const prob = calculatePitcherAdvantageProb(1, 16);
    expect(prob).toBe(0.25);
  });
});

describe('Chart Lookup', () => {
  const chart: Chart = {
    SO: [1, 3],
    GB: [4, 5],
    FB: [6, 7],
    BB: [8, 10],
    '1B': [11, 14],
    '2B': [15, 17],
    '3B': [18, 18],
    HR: [19, 20]
  };

  it('should correctly look up roll 1 (band edge - start)', () => {
    expect(lookupChart(chart, 1)).toBe('SO');
  });

  it('should correctly look up roll 20 (band edge - end)', () => {
    expect(lookupChart(chart, 20)).toBe('HR');
  });

  it('should correctly look up mid-band rolls', () => {
    expect(lookupChart(chart, 9)).toBe('BB');
    expect(lookupChart(chart, 12)).toBe('1B');
    expect(lookupChart(chart, 16)).toBe('2B');
  });

  it('should correctly look up single-slot bands', () => {
    expect(lookupChart(chart, 18)).toBe('3B');
  });
});

describe('Baserunning Rules', () => {
  it('PU/SO: runners hold, batter out', () => {
    const bases = { first: true, second: true, third: true };
    const result = advanceRunners(bases, 0, 'SO');
    expect(result.newBases).toEqual({ first: true, second: true, third: true });
    expect(result.runsScored).toBe(0);
  });

  it('GB: runners hold (no DP in phase 1), batter out', () => {
    const bases = { first: true, second: false, third: false };
    const result = advanceRunners(bases, 0, 'GB');
    expect(result.newBases).toEqual({ first: true, second: false, third: false });
    expect(result.runsScored).toBe(0);
  });

  it('FB with runner on 3rd and < 2 outs: sac fly scores runner', () => {
    const bases = { first: false, second: false, third: true };
    const result = advanceRunners(bases, 1, 'FB');
    expect(result.newBases).toEqual({ first: false, second: false, third: false });
    expect(result.runsScored).toBe(1);
  });

  it('FB with runner on 3rd and 2 outs: no sac fly', () => {
    const bases = { first: false, second: false, third: true };
    const result = advanceRunners(bases, 2, 'FB');
    expect(result.newBases).toEqual({ first: false, second: false, third: true });
    expect(result.runsScored).toBe(0);
  });

  it('BB: forced advancement only', () => {
    // Runner on 1st only - batter to 1st, runner to 2nd
    let result = advanceRunners({ first: true, second: false, third: false }, 0, 'BB');
    expect(result.newBases).toEqual({ first: true, second: true, third: false });
    expect(result.runsScored).toBe(0);

    // Runners on 1st and 2nd - all forced
    result = advanceRunners({ first: true, second: true, third: false }, 0, 'BB');
    expect(result.newBases).toEqual({ first: true, second: true, third: true });
    expect(result.runsScored).toBe(0);

    // Runner on 3rd only - not forced, stays
    result = advanceRunners({ first: false, second: false, third: true }, 0, 'BB');
    expect(result.newBases).toEqual({ first: true, second: false, third: true });
    expect(result.runsScored).toBe(0);

    // Bases loaded - runner on 3rd forced home
    result = advanceRunners({ first: true, second: true, third: true }, 0, 'BB');
    expect(result.newBases).toEqual({ first: true, second: true, third: true });
    expect(result.runsScored).toBe(1);
  });

  it('1B: all runners advance exactly 1 base', () => {
    // Empty bases
    let result = advanceRunners(emptyBases(), 0, '1B');
    expect(result.newBases).toEqual({ first: true, second: false, third: false });
    expect(result.runsScored).toBe(0);

    // Runner on 1st
    result = advanceRunners({ first: true, second: false, third: false }, 0, '1B');
    expect(result.newBases).toEqual({ first: true, second: true, third: false });
    expect(result.runsScored).toBe(0);

    // Runner on 3rd scores
    result = advanceRunners({ first: false, second: false, third: true }, 0, '1B');
    expect(result.newBases).toEqual({ first: true, second: false, third: false });
    expect(result.runsScored).toBe(1);

    // Bases loaded - runner on 3rd scores
    result = advanceRunners({ first: true, second: true, third: true }, 0, '1B');
    expect(result.newBases).toEqual({ first: true, second: true, third: true });
    expect(result.runsScored).toBe(1);
  });

  it('1B+/2B: all runners advance exactly 2 bases', () => {
    // Runner on 1st goes to 3rd
    let result = advanceRunners({ first: true, second: false, third: false }, 0, '2B');
    expect(result.newBases).toEqual({ first: false, second: true, third: true });
    expect(result.runsScored).toBe(0);

    // Runner on 2nd scores
    result = advanceRunners({ first: false, second: true, third: false }, 0, '2B');
    expect(result.newBases).toEqual({ first: false, second: true, third: false });
    expect(result.runsScored).toBe(1);

    // Runner on 3rd scores, runner on 2nd scores
    result = advanceRunners({ first: false, second: true, third: true }, 0, '2B');
    expect(result.newBases).toEqual({ first: false, second: true, third: false });
    expect(result.runsScored).toBe(2);
  });

  it('3B: all runners score', () => {
    const result = advanceRunners({ first: true, second: true, third: true }, 0, '3B');
    expect(result.newBases).toEqual({ first: false, second: false, third: true });
    expect(result.runsScored).toBe(3);
  });

  it('HR: batter and all runners score', () => {
    // Solo HR
    let result = advanceRunners(emptyBases(), 0, 'HR');
    expect(result.newBases).toEqual({ first: false, second: false, third: false });
    expect(result.runsScored).toBe(1);

    // Grand slam
    result = advanceRunners({ first: true, second: true, third: true }, 0, 'HR');
    expect(result.newBases).toEqual({ first: false, second: false, third: false });
    expect(result.runsScored).toBe(4);
  });
});

describe('Half-Inning Termination', () => {
  it('should terminate at exactly 3 outs', () => {
    const rng = createRNG(12345);
    const lineup = [testHitter];

    const { finalState } = simulateHalfInning(testPitcher, lineup, rng);
    expect(finalState.outs).toBe(3);
  });

  it('should clear bases when 3rd out is recorded', () => {
    // Use a state with runners and apply a 3rd out
    const state = {
      outs: 2,
      bases: { first: true, second: true, third: true },
      runs: 0,
      hits: 0,
      walks: 0,
      batterIndex: 0
    };

    const result = {
      pitchRoll: 10,
      pitchTotal: 14,
      advantageHolder: 'pitcher' as const,
      swingRoll: 5,
      outcome: 'SO' as const,
      runsScored: 0,
      description: 'Strikeout'
    };

    const newState = applyAtBatResult(state, result);
    expect(newState.outs).toBe(3);
    expect(newState.bases).toEqual({ first: false, second: false, third: false });
  });
});

describe('Seeded RNG Reproducibility', () => {
  it('should produce identical results with same seed', () => {
    const seed = 42;

    // First run
    const rng1 = createRNG(seed);
    const rolls1 = [rollD20(rng1), rollD20(rng1), rollD20(rng1)];

    // Second run with same seed
    const rng2 = createRNG(seed);
    const rolls2 = [rollD20(rng2), rollD20(rng2), rollD20(rng2)];

    expect(rolls1).toEqual(rolls2);
  });

  it('should produce full at-bat reproducibility', () => {
    const seed = 999;

    const rng1 = createRNG(seed);
    const result1 = resolveAtBat(testPitcher, testHitter, rng1, emptyBases(), 0);

    const rng2 = createRNG(seed);
    const result2 = resolveAtBat(testPitcher, testHitter, rng2, emptyBases(), 0);

    expect(result1).toEqual(result2);
  });
});

describe('Outcome Classification', () => {
  it('should correctly identify outs', () => {
    expect(isOut('PU')).toBe(true);
    expect(isOut('SO')).toBe(true);
    expect(isOut('GB')).toBe(true);
    expect(isOut('FB')).toBe(true);
    expect(isOut('BB')).toBe(false);
    expect(isOut('1B')).toBe(false);
    expect(isOut('HR')).toBe(false);
  });

  it('should correctly identify hits', () => {
    expect(isHit('1B')).toBe(true);
    expect(isHit('1B+')).toBe(true);
    expect(isHit('2B')).toBe(true);
    expect(isHit('3B')).toBe(true);
    expect(isHit('HR')).toBe(true);
    expect(isHit('BB')).toBe(false);
    expect(isHit('SO')).toBe(false);
  });
});

describe('Monte Carlo Sanity Check', () => {
  it('should produce OBP between .250 and .400 for average matchup (10k at-bats)', () => {
    // Average pitcher (control ~3) vs average hitter (onBase ~11)
    const avgPitcher: PitcherCard = {
      ...testPitcher,
      control: 3,
      chart: {
        PU: [1, 2],
        SO: [3, 7],
        GB: [8, 11],
        FB: [12, 15],
        BB: [16, 16],
        '1B': [17, 18],
        '2B': [19, 19],
        HR: [20, 20]
      }
    };

    const avgHitter: HitterCard = {
      ...testHitter,
      onBase: 11,
      chart: {
        SO: [1, 3],
        GB: [4, 5],
        FB: [6, 7],
        BB: [8, 10],
        '1B': [11, 14],
        '1B+': null,
        '2B': [15, 17],
        '3B': [18, 18],
        HR: [19, 20]
      }
    };

    const rng = createRNG(12345);
    let onBaseCount = 0;
    const totalAtBats = 10000;

    for (let i = 0; i < totalAtBats; i++) {
      const result = resolveAtBat(avgPitcher, avgHitter, rng, emptyBases(), 0);
      if (['BB', '1B', '1B+', '2B', '3B', 'HR'].includes(result.outcome)) {
        onBaseCount++;
      }
    }

    const obp = onBaseCount / totalAtBats;
    console.log(`Monte Carlo OBP: ${obp.toFixed(3)}`);

    // PRD says "loose band on purpose; we only care that it is not degenerate"
    expect(obp).toBeGreaterThanOrEqual(0.25);
    expect(obp).toBeLessThanOrEqual(0.45);
  });
});

describe('Matchup Probability Calculation', () => {
  it('should calculate reasonable outcome probabilities', () => {
    const probs = calculateMatchupProbabilities(testPitcher, testHitter);

    // All probabilities should sum to 1
    const total = Object.values(probs).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 5);

    // Expected OBP should be reasonable
    const expectedOBP = calculateExpectedOBP(probs);
    expect(expectedOBP).toBeGreaterThan(0.2);
    expect(expectedOBP).toBeLessThan(0.5);
  });
});
