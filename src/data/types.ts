// Card and game types for Showdown Digital

export type OutcomeType =
  | 'PU' | 'SO' | 'GB' | 'FB'  // Outs
  | 'BB' | '1B' | '1B+' | '2B' | '3B' | 'HR';  // On-base

export type ChartBand = [number, number] | null;

export interface Chart {
  PU?: ChartBand;
  SO?: ChartBand;
  GB?: ChartBand;
  FB?: ChartBand;
  BB?: ChartBand;
  '1B'?: ChartBand;
  '1B+'?: ChartBand;
  '2B'?: ChartBand;
  '3B'?: ChartBand;
  HR?: ChartBand;
}

export interface PitcherCard {
  id: string;
  name: string;
  team: string;
  throws: 'L' | 'R';
  control: number;  // 1-6
  ip: number;
  chart: Chart;
  realStats: {
    era: number;
    obpAgainst: number;
    kPct: number;
    bbPct: number;
  };
}

export interface HitterCard {
  id: string;
  name: string;
  team: string;
  bats: 'L' | 'R' | 'S';
  onBase: number;  // 7-16
  speed: number | null;
  positions: string[];
  chart: Chart;
  realStats: {
    obp: number;
    slg: number;
    hr: number;
    avg: number;
  };
}

export interface CardsData {
  meta: {
    season: number;
    generatedAt: string;
    formulaVersion: string;
  };
  pitchers: PitcherCard[];
  hitters: HitterCard[];
}

// Game state types
export interface BaseState {
  first: boolean;
  second: boolean;
  third: boolean;
}

export interface HalfInningState {
  outs: number;
  bases: BaseState;
  runs: number;
  hits: number;
  walks: number;
  batterIndex: number;
}

export interface AtBatResult {
  pitchRoll: number;
  pitchTotal: number;
  advantageHolder: 'pitcher' | 'hitter';
  swingRoll: number;
  outcome: OutcomeType;
  runsScored: number;
  description: string;
}

export interface MatchupStats {
  pa: number;
  hits: number;
  hr: number;
  bb: number;
  so: number;
}
