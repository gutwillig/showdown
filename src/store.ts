/**
 * Game state management using Zustand
 */

import { create } from 'zustand';
import type {
  CardsData,
  PitcherCard,
  HitterCard,
  AtBatResult,
  HalfInningState,
  MatchupStats
} from './data/types';
import { createRNG, createRandomSeed } from './engine/rng';
import {
  resolveAtBat,
  applyAtBatResult,
  createHalfInningState
} from './engine/engine';
import { emptyBases } from './engine/baserunning';

type GameMode = 'sandbox' | 'halfInning';
type GamePhase = 'select' | 'pitch' | 'swing' | 'result' | 'inningComplete';

interface GameState {
  // Data
  cards: CardsData | null;
  setCards: (cards: CardsData) => void;

  // Mode
  mode: GameMode;
  setMode: (mode: GameMode) => void;

  // Sandbox mode
  selectedPitcher: PitcherCard | null;
  selectedHitter: HitterCard | null;
  setSelectedPitcher: (pitcher: PitcherCard | null) => void;
  setSelectedHitter: (hitter: HitterCard | null) => void;

  // Half-inning mode
  lineup: HitterCard[];
  setLineup: (lineup: HitterCard[]) => void;
  inningState: HalfInningState;
  setInningState: (state: HalfInningState) => void;

  // Game flow
  phase: GamePhase;
  setPhase: (phase: GamePhase) => void;
  currentResult: AtBatResult | null;
  setCurrentResult: (result: AtBatResult | null) => void;

  // Event log
  eventLog: AtBatResult[];
  addToEventLog: (result: AtBatResult) => void;
  clearEventLog: () => void;

  // Stats
  matchupStats: MatchupStats;
  updateMatchupStats: (result: AtBatResult) => void;
  resetMatchupStats: () => void;

  // RNG
  seed: number;
  rng: () => number;
  resetSeed: (seed?: number) => void;

  // Actions
  rollPitch: () => void;
  rollSwing: () => void;
  startNewAtBat: () => void;
  runQuickBatch: (count: number) => void;
  startHalfInning: () => void;
  advanceHalfInning: () => void;
  fastForwardInning: () => void;
}

export const useGameStore = create<GameState>((set, get) => {
  const initialSeed = createRandomSeed();
  const initialRng = createRNG(initialSeed);

  return {
    // Data
    cards: null,
    setCards: (cards) => set({ cards }),

    // Mode
    mode: 'sandbox',
    setMode: (mode) => set({ mode, phase: 'select', eventLog: [], currentResult: null }),

    // Sandbox mode
    selectedPitcher: null,
    selectedHitter: null,
    setSelectedPitcher: (pitcher) => set({ selectedPitcher: pitcher, phase: 'select', currentResult: null }),
    setSelectedHitter: (hitter) => set({ selectedHitter: hitter, phase: 'select', currentResult: null }),

    // Half-inning mode
    lineup: [],
    setLineup: (lineup) => set({ lineup }),
    inningState: createHalfInningState(),
    setInningState: (state) => set({ inningState: state }),

    // Game flow
    phase: 'select',
    setPhase: (phase) => set({ phase }),
    currentResult: null,
    setCurrentResult: (result) => set({ currentResult: result }),

    // Event log
    eventLog: [],
    addToEventLog: (result) => set((state) => ({
      eventLog: [result, ...state.eventLog].slice(0, 50)
    })),
    clearEventLog: () => set({ eventLog: [] }),

    // Stats
    matchupStats: { pa: 0, hits: 0, hr: 0, bb: 0, so: 0 },
    updateMatchupStats: (result) => set((state) => ({
      matchupStats: {
        pa: state.matchupStats.pa + 1,
        hits: state.matchupStats.hits + (['1B', '1B+', '2B', '3B', 'HR'].includes(result.outcome) ? 1 : 0),
        hr: state.matchupStats.hr + (result.outcome === 'HR' ? 1 : 0),
        bb: state.matchupStats.bb + (result.outcome === 'BB' ? 1 : 0),
        so: state.matchupStats.so + (result.outcome === 'SO' ? 1 : 0)
      }
    })),
    resetMatchupStats: () => set({ matchupStats: { pa: 0, hits: 0, hr: 0, bb: 0, so: 0 } }),

    // RNG
    seed: initialSeed,
    rng: initialRng,
    resetSeed: (seed) => {
      const newSeed = seed ?? createRandomSeed();
      set({ seed: newSeed, rng: createRNG(newSeed) });
    },

    // Actions
    rollPitch: () => {
      const { selectedPitcher, selectedHitter, rng, mode, lineup, inningState } = get();
      const pitcher = selectedPitcher;
      const hitter = mode === 'sandbox' ? selectedHitter : lineup[inningState.batterIndex];

      if (!pitcher || !hitter) return;

      const bases = mode === 'sandbox' ? emptyBases() : inningState.bases;
      const outs = mode === 'sandbox' ? 0 : inningState.outs;

      const result = resolveAtBat(pitcher, hitter, rng, bases, outs);

      set({
        currentResult: result,
        phase: 'pitch'
      });

      // Auto-advance to swing phase after animation
      setTimeout(() => {
        set({ phase: 'swing' });
      }, 800);
    },

    rollSwing: () => {
      const { currentResult, mode, inningState, lineup } = get();
      if (!currentResult) return;

      set({ phase: 'result' });

      // Update stats and log
      get().updateMatchupStats(currentResult);
      get().addToEventLog(currentResult);

      // Update inning state if in half-inning mode
      if (mode === 'halfInning') {
        const newState = applyAtBatResult(inningState, currentResult, lineup.length);
        set({ inningState: newState });

        if (newState.outs >= 3) {
          set({ phase: 'inningComplete' });
        }
      }
    },

    startNewAtBat: () => {
      set({ phase: 'select', currentResult: null });
    },

    runQuickBatch: (count) => {
      const { selectedPitcher, selectedHitter, rng } = get();
      if (!selectedPitcher || !selectedHitter) return;

      const results: AtBatResult[] = [];
      for (let i = 0; i < count; i++) {
        const result = resolveAtBat(selectedPitcher, selectedHitter, rng, emptyBases(), 0);
        results.push(result);
        get().updateMatchupStats(result);
      }

      set((state) => ({
        eventLog: [...results, ...state.eventLog].slice(0, 50)
      }));
    },

    startHalfInning: () => {
      set({
        inningState: createHalfInningState(),
        eventLog: [],
        phase: 'select',
        currentResult: null
      });
      get().resetMatchupStats();
    },

    advanceHalfInning: () => {
      const { inningState } = get();
      if (inningState.outs >= 3) {
        get().startHalfInning();
      } else {
        set({ phase: 'select', currentResult: null });
      }
    },

    fastForwardInning: () => {
      const { selectedPitcher, lineup, rng, inningState } = get();
      if (!selectedPitcher || lineup.length === 0) return;

      let state = { ...inningState };
      const results: AtBatResult[] = [];

      while (state.outs < 3) {
        const hitter = lineup[state.batterIndex];
        const result = resolveAtBat(selectedPitcher, hitter, rng, state.bases, state.outs);
        results.push(result);
        state = applyAtBatResult(state, result, lineup.length);
      }

      set({
        inningState: state,
        eventLog: [...results, ...get().eventLog].slice(0, 50),
        phase: 'inningComplete'
      });

      // Update stats for all results
      results.forEach(r => get().updateMatchupStats(r));
    }
  };
});
