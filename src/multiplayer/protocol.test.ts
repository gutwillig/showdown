/**
 * Tests for multiplayer protocol helpers
 * Walk-off, extra innings, lineup wrap, score calculation
 */

import { describe, it, expect } from 'vitest';
import {
  generateRoomCode,
  ROOM_CODE_CHARS,
  getTotalScore,
  isWalkOff,
  shouldSkipBottomHalf,
  createInningHalfState,
  type FullGameState,
  type LineScore
} from './protocol';

describe('Room Code Generation', () => {
  it('should generate 4-character codes', () => {
    const code = generateRoomCode();
    expect(code).toHaveLength(4);
  });

  it('should only use unambiguous characters', () => {
    for (let i = 0; i < 100; i++) {
      const code = generateRoomCode();
      for (const char of code) {
        expect(ROOM_CODE_CHARS).toContain(char);
      }
      expect(code).not.toContain('O');
      expect(code).not.toContain('I');
    }
  });
});

describe('Score Calculation', () => {
  it('should sum line score correctly', () => {
    const lineScore: LineScore = {
      away: [0, 1, 2],
      home: [3, 0, 1]
    };
    const scores = getTotalScore(lineScore);
    expect(scores.away).toBe(3);
    expect(scores.home).toBe(4);
  });

  it('should handle empty line score', () => {
    const lineScore: LineScore = { away: [], home: [] };
    const scores = getTotalScore(lineScore);
    expect(scores.away).toBe(0);
    expect(scores.home).toBe(0);
  });
});

describe('Walk-Off Detection', () => {
  const createGameState = (overrides: Partial<FullGameState>): FullGameState => ({
    roomCode: 'TEST',
    seed: 12345,
    seq: 1,
    hostId: 'host',
    guestId: 'guest',
    hostName: 'Host',
    guestName: 'Guest',
    homePlayerId: 'host',
    awayPlayerId: 'guest',
    homeRoster: { pitcher: {} as any, lineup: [] },
    awayRoster: { pitcher: {} as any, lineup: [] },
    inning: 3,
    isTopHalf: false,
    inningState: createInningHalfState(),
    lineScore: { away: [0, 0, 0], home: [0, 0] },
    homeBatterIndex: 0,
    awayBatterIndex: 0,
    phase: 'pitching',
    waitingForPlayerId: 'host',
    lastAtBat: null,
    winner: null,
    ...overrides
  });

  it('should detect walk-off in bottom of 3rd when home takes lead', () => {
    const state = createGameState({
      inning: 3,
      isTopHalf: false,
      lineScore: { away: [0, 0, 1], home: [0, 0] }, // Away leads 1-0
      inningState: { ...createInningHalfState(), runs: 2 } // Home scores 2 this inning
    });
    expect(isWalkOff(state)).toBe(true);
  });

  it('should not detect walk-off in top half', () => {
    const state = createGameState({
      inning: 3,
      isTopHalf: true,
      lineScore: { away: [0, 0], home: [0, 0, 0] },
      inningState: { ...createInningHalfState(), runs: 1 }
    });
    expect(isWalkOff(state)).toBe(false);
  });

  it('should not detect walk-off before 3rd inning', () => {
    const state = createGameState({
      inning: 2,
      isTopHalf: false,
      lineScore: { away: [0, 1], home: [0] },
      inningState: { ...createInningHalfState(), runs: 2 }
    });
    expect(isWalkOff(state)).toBe(false);
  });

  it('should not detect walk-off when home is still behind', () => {
    const state = createGameState({
      inning: 3,
      isTopHalf: false,
      lineScore: { away: [0, 0, 3], home: [0, 0] },
      inningState: { ...createInningHalfState(), runs: 2 } // 2 < 3
    });
    expect(isWalkOff(state)).toBe(false);
  });

  it('should detect walk-off in extra innings', () => {
    const state = createGameState({
      inning: 4,
      isTopHalf: false,
      lineScore: { away: [0, 0, 1, 0], home: [1, 0, 0] },
      inningState: { ...createInningHalfState(), runs: 1 }
    });
    expect(isWalkOff(state)).toBe(true);
  });
});

describe('Skip Bottom Half', () => {
  const createGameState = (overrides: Partial<FullGameState>): FullGameState => ({
    roomCode: 'TEST',
    seed: 12345,
    seq: 1,
    hostId: 'host',
    guestId: 'guest',
    hostName: 'Host',
    guestName: 'Guest',
    homePlayerId: 'host',
    awayPlayerId: 'guest',
    homeRoster: { pitcher: {} as any, lineup: [] },
    awayRoster: { pitcher: {} as any, lineup: [] },
    inning: 3,
    isTopHalf: false,
    inningState: createInningHalfState(),
    lineScore: { away: [0, 0, 0], home: [0, 0, 0] },
    homeBatterIndex: 0,
    awayBatterIndex: 0,
    phase: 'pitching',
    waitingForPlayerId: 'host',
    lastAtBat: null,
    winner: null,
    ...overrides
  });

  it('should skip bottom half when home already leads in 3rd+', () => {
    const state = createGameState({
      inning: 3,
      isTopHalf: false,
      lineScore: { away: [0, 0, 0], home: [1, 0, 0] }
    });
    expect(shouldSkipBottomHalf(state)).toBe(true);
  });

  it('should not skip when game is tied', () => {
    const state = createGameState({
      inning: 3,
      isTopHalf: false,
      lineScore: { away: [0, 0, 0], home: [0, 0, 0] }
    });
    expect(shouldSkipBottomHalf(state)).toBe(false);
  });

  it('should not skip in top half', () => {
    const state = createGameState({
      inning: 3,
      isTopHalf: true,
      lineScore: { away: [0, 0], home: [1, 0, 0] }
    });
    expect(shouldSkipBottomHalf(state)).toBe(false);
  });

  it('should not skip before 3rd inning', () => {
    const state = createGameState({
      inning: 2,
      isTopHalf: false,
      lineScore: { away: [0, 0], home: [5, 0] }
    });
    expect(shouldSkipBottomHalf(state)).toBe(false);
  });
});

describe('Inning Half State', () => {
  it('should create with default batter index 0', () => {
    const state = createInningHalfState();
    expect(state.batterIndex).toBe(0);
    expect(state.outs).toBe(0);
    expect(state.runs).toBe(0);
    expect(state.hits).toBe(0);
    expect(state.bases).toEqual({ first: false, second: false, third: false });
  });

  it('should create with custom batter index', () => {
    const state = createInningHalfState(5);
    expect(state.batterIndex).toBe(5);
  });
});
