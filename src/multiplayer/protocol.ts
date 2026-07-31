/**
 * Multiplayer protocol types
 * Shared message formats and full game state for head-to-head play
 */

import type { PitcherCard, HitterCard, AtBatResult, BaseState } from '../data/types';

// Room code: 4 uppercase letters, no ambiguous characters (O, I)
export const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
export const ROOM_CODE_LENGTH = 4;

export function generateRoomCode(): string {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
  }
  return code;
}

// Player identity (persisted in localStorage)
export interface PlayerIdentity {
  playerId: string;
  name: string;
}

export function getOrCreatePlayerId(): string {
  let id = localStorage.getItem('showdown_player_id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('showdown_player_id', id);
  }
  return id;
}

export function getPlayerName(): string {
  return localStorage.getItem('showdown_player_name') || 'Player';
}

export function setPlayerName(name: string): void {
  localStorage.setItem('showdown_player_name', name);
}

// Roster: 1 pitcher + 9 hitters in batting order
export interface Roster {
  pitcher: PitcherCard;
  lineup: HitterCard[]; // exactly 9, in batting order
}

// Half-inning state within a full game
export interface InningHalfState {
  outs: number;
  bases: BaseState;
  runs: number;
  hits: number;
  batterIndex: number; // index in the batting team's lineup (0-8)
}

// Score by inning
export interface LineScore {
  away: number[];
  home: number[];
}

// Partial at-bat state (after pitch, before swing)
export interface PartialAtBat {
  pitchRoll: number;
  pitchTotal: number;
  advantageHolder: 'pitcher' | 'hitter';
}

// Full game state (owned by host)
export interface FullGameState {
  // Game metadata
  roomCode: string;
  seed: number;
  seq: number; // monotonically increasing state sequence number

  // Players
  hostId: string;
  guestId: string;
  hostName: string;
  guestName: string;

  // Home/away assignment (determined by roll-off)
  homePlayerId: string; // bats last
  awayPlayerId: string;

  // Rosters
  homeRoster: Roster;
  awayRoster: Roster;

  // Current game position
  inning: number; // 1-indexed
  isTopHalf: boolean; // true = away batting, false = home batting
  inningState: InningHalfState;

  // Line score
  lineScore: LineScore;

  // Lineup positions (persist across innings)
  homeBatterIndex: number; // 0-8, wraps around
  awayBatterIndex: number;

  // Turn state
  // pitching: waiting for pitcher to click PITCH
  // pitchRolling: dice animation in progress
  // pitched: pitch resolved, waiting for player with advantage to click SWING
  // swingRolling: swing dice animation in progress
  // result: showing outcome, auto-advance
  phase: 'pitching' | 'pitchRolling' | 'pitched' | 'swingRolling' | 'result' | 'halfInningEnd' | 'gameOver';
  waitingForPlayerId: string; // whose click is next

  // Partial at-bat (after pitch, before swing)
  partialAtBat: PartialAtBat | null;

  // Last at-bat result (for display)
  lastAtBat: AtBatResult | null;

  // Animating dice value (for synchronized animation)
  animatingDice: number | null;

  // Game outcome
  winner: string | null; // playerId of winner, or null if ongoing
}

// Lobby state (before game starts)
export interface LobbyState {
  roomCode: string;
  hostId: string;
  hostName: string;
  guestId: string | null;
  guestName: string | null;

  // Roster progress (public count, not actual picks)
  hostPickCount: number;
  guestPickCount: number;

  // Ready flags
  hostReady: boolean;
  guestReady: boolean;

  // Roll-off result (null until both ready)
  rollOff: {
    hostRoll: number;
    guestRoll: number;
    homePlayerId: string;
  } | null;
}

// Message types
export type MessageType =
  | 'hello'
  | 'lobbyState'
  | 'rosterSubmit'
  | 'ready'
  | 'gameStart'
  | 'actionRequest'
  | 'stateSnapshot'
  | 'snapshotRequest'
  | 'gameOver';

export interface HelloMessage {
  type: 'hello';
  playerId: string;
  name: string;
}

export interface LobbyStateMessage {
  type: 'lobbyState';
  state: LobbyState;
}

export interface RosterSubmitMessage {
  type: 'rosterSubmit';
  playerId: string;
  roster: Roster;
}

export interface ReadyMessage {
  type: 'ready';
  playerId: string;
}

export interface GameStartMessage {
  type: 'gameStart';
  state: FullGameState;
  seedHash: string; // SHA-256 hash of seed for future verification (phase 3)
}

export interface ActionRequestMessage {
  type: 'actionRequest';
  playerId: string;
  action: 'pitch' | 'swing';
  requestId: string;
}

export interface StateSnapshotMessage {
  type: 'stateSnapshot';
  state: FullGameState;
  lastEvent: AtBatResult | null;
}

export interface SnapshotRequestMessage {
  type: 'snapshotRequest';
  playerId: string;
}

export interface GameOverMessage {
  type: 'gameOver';
  state: FullGameState;
  winner: string;
}

export type ProtocolMessage =
  | HelloMessage
  | LobbyStateMessage
  | RosterSubmitMessage
  | ReadyMessage
  | GameStartMessage
  | ActionRequestMessage
  | StateSnapshotMessage
  | SnapshotRequestMessage
  | GameOverMessage;

// Helper to identify message type
export function isMessageType<T extends ProtocolMessage>(
  msg: ProtocolMessage,
  type: T['type']
): msg is T {
  return msg.type === type;
}

// Create initial inning half state
export function createInningHalfState(batterIndex: number = 0): InningHalfState {
  return {
    outs: 0,
    bases: { first: false, second: false, third: false },
    runs: 0,
    hits: 0,
    batterIndex
  };
}

// Get current scores
export function getTotalScore(lineScore: LineScore): { away: number; home: number } {
  return {
    away: lineScore.away.reduce((a, b) => a + b, 0),
    home: lineScore.home.reduce((a, b) => a + b, 0)
  };
}

// Check for walk-off condition
export function isWalkOff(state: FullGameState): boolean {
  if (state.inning < 3) return false;
  if (state.isTopHalf) return false; // walk-off only in bottom half

  const scores = getTotalScore(state.lineScore);
  const homeCurrentInning = state.inningState.runs;
  return (scores.home + homeCurrentInning) > scores.away;
}

// Check if game should end (scheduled or extra innings)
export function shouldSkipBottomHalf(state: FullGameState): boolean {
  if (state.inning < 3) return false;
  if (state.isTopHalf) return false;

  // Home already leading, skip bottom half
  const scores = getTotalScore(state.lineScore);
  return scores.home > scores.away;
}
