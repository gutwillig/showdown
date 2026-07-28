/**
 * Multiplayer game state management
 * Host-authoritative game loop with full state management
 */

import { create } from 'zustand';
import type {
  LobbyState,
  FullGameState,
  Roster,
  ProtocolMessage
} from './protocol';
import {
  generateRoomCode,
  getOrCreatePlayerId,
  getPlayerName,
  createInningHalfState,
  getTotalScore,
  isWalkOff
} from './protocol';
import { broadcast, joinRoom, leaveRoom, PresenceState } from './connection';
import { createRNG, rollD20 } from '../engine/rng';
import { resolveAtBat, applyAtBatResult } from '../engine/engine';
import { navigate } from './router';

// Storage keys for reconnection
const STORAGE_KEY_ROOM = 'showdown_room_code';
const STORAGE_KEY_IS_HOST = 'showdown_is_host';
const STORAGE_KEY_GAME_STATE = 'showdown_game_state';
const STORAGE_KEY_LOBBY_STATE = 'showdown_lobby_state';

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';
type GamePhase = 'home' | 'lobby' | 'playing' | 'gameOver';

interface MultiplayerState {
  // Connection
  connectionStatus: ConnectionStatus;
  errorMessage: string | null;

  // Identity
  playerId: string;
  playerName: string;
  isHost: boolean;

  // Room
  roomCode: string | null;

  // Lobby state
  lobbyState: LobbyState | null;
  myRoster: Roster | null;
  opponentConnected: boolean;
  opponentDisconnected: boolean; // for showing "reconnecting" banner

  // Game state (authoritative if host, mirror if guest)
  gameState: FullGameState | null;
  gamePhase: GamePhase;

  // Host-only: RNG
  rng: (() => number) | null;

  // Actions
  setPlayerName: (name: string) => void;
  createGame: () => Promise<void>;
  joinGame: (code: string) => Promise<void>;
  submitRoster: (roster: Roster) => void;
  setReady: () => void;
  performAction: (action: 'pitch' | 'swing') => void;
  requestRematch: () => void;
  leaveGame: () => void;

  // Internal handlers
  handleMessage: (msg: ProtocolMessage) => void;
  handlePresenceSync: (presences: Record<string, PresenceState[]>) => void;
  handlePresenceJoin: (key: string, presence: PresenceState) => void;
  handlePresenceLeave: (key: string, presence: PresenceState) => void;

  // Host-only actions
  broadcastLobbyState: () => void;
  startGame: () => void;
  processAction: (playerId: string, action: 'pitch' | 'swing') => void;
  advanceGame: () => void;
}

export const useMultiplayerStore = create<MultiplayerState>((set, get) => ({
  // Initial state
  connectionStatus: 'disconnected',
  errorMessage: null,
  playerId: getOrCreatePlayerId(),
  playerName: getPlayerName(),
  isHost: false,
  roomCode: null,
  lobbyState: null,
  myRoster: null,
  opponentConnected: false,
  opponentDisconnected: false,
  gameState: null,
  gamePhase: 'home',
  rng: null,

  setPlayerName: (name: string) => {
    localStorage.setItem('showdown_player_name', name);
    set({ playerName: name });
  },

  createGame: async () => {
    const { playerId, playerName, handleMessage, handlePresenceSync, handlePresenceJoin, handlePresenceLeave } = get();
    const roomCode = generateRoomCode();

    set({ connectionStatus: 'connecting', isHost: true, roomCode });

    try {
      await joinRoom(roomCode, playerId, playerName, {
        onMessage: handleMessage,
        onPresenceSync: handlePresenceSync,
        onPresenceJoin: handlePresenceJoin,
        onPresenceLeave: handlePresenceLeave
      });

      const lobbyState: LobbyState = {
        roomCode,
        hostId: playerId,
        hostName: playerName,
        guestId: null,
        guestName: null,
        hostPickCount: 0,
        guestPickCount: 0,
        hostReady: false,
        guestReady: false,
        rollOff: null
      };

      // Save for reconnection
      localStorage.setItem(STORAGE_KEY_ROOM, roomCode);
      localStorage.setItem(STORAGE_KEY_IS_HOST, 'true');
      localStorage.setItem(STORAGE_KEY_LOBBY_STATE, JSON.stringify(lobbyState));

      set({
        connectionStatus: 'connected',
        lobbyState,
        gamePhase: 'lobby'
      });

      navigate({ page: 'lobby', code: roomCode });

      // Broadcast initial lobby state
      broadcast({ type: 'lobbyState', state: lobbyState });

    } catch (err) {
      set({
        connectionStatus: 'error',
        errorMessage: err instanceof Error ? err.message : 'Failed to create game'
      });
    }
  },

  joinGame: async (code: string) => {
    const { playerId, playerName, handleMessage, handlePresenceSync, handlePresenceJoin, handlePresenceLeave } = get();

    set({ connectionStatus: 'connecting', isHost: false, roomCode: code });

    try {
      await joinRoom(code, playerId, playerName, {
        onMessage: handleMessage,
        onPresenceSync: handlePresenceSync,
        onPresenceJoin: handlePresenceJoin,
        onPresenceLeave: handlePresenceLeave
      });

      // Save for reconnection
      localStorage.setItem(STORAGE_KEY_ROOM, code);
      localStorage.setItem(STORAGE_KEY_IS_HOST, 'false');

      set({
        connectionStatus: 'connected',
        gamePhase: 'lobby'
      });

      navigate({ page: 'lobby', code });

      // Announce ourselves
      broadcast({
        type: 'hello',
        playerId,
        name: playerName
      });

    } catch (err) {
      set({
        connectionStatus: 'error',
        errorMessage: err instanceof Error ? err.message : 'Failed to join game'
      });
    }
  },

  submitRoster: (roster: Roster) => {
    const { playerId, isHost, lobbyState } = get();

    set({ myRoster: roster });

    // Broadcast roster submission
    broadcast({
      type: 'rosterSubmit',
      playerId,
      roster
    });

    // Host updates lobby state
    if (isHost && lobbyState) {
      const newState = {
        ...lobbyState,
        hostPickCount: 10
      };
      set({ lobbyState: newState });
      localStorage.setItem(STORAGE_KEY_LOBBY_STATE, JSON.stringify(newState));
      broadcast({ type: 'lobbyState', state: newState });
    }
  },

  setReady: () => {
    const { playerId } = get();
    broadcast({ type: 'ready', playerId });
  },

  performAction: (action: 'pitch' | 'swing') => {
    const { playerId, isHost, gameState } = get();

    if (!gameState) return;

    // Validate it's our turn
    if (gameState.waitingForPlayerId !== playerId) {
      console.warn('Not your turn');
      return;
    }

    if (isHost) {
      // Host processes directly
      get().processAction(playerId, action);
    } else {
      // Guest sends request
      broadcast({
        type: 'actionRequest',
        playerId,
        action,
        requestId: crypto.randomUUID()
      });
    }
  },

  requestRematch: () => {
    // For now, just reset to lobby with same code
    const { roomCode, isHost } = get();
    if (roomCode) {
      set({
        gameState: null,
        myRoster: null,
        gamePhase: 'lobby'
      });
      if (isHost) {
        get().broadcastLobbyState();
      }
      navigate({ page: 'lobby', code: roomCode });
    }
  },

  leaveGame: async () => {
    await leaveRoom();
    localStorage.removeItem(STORAGE_KEY_ROOM);
    localStorage.removeItem(STORAGE_KEY_IS_HOST);
    localStorage.removeItem(STORAGE_KEY_GAME_STATE);
    localStorage.removeItem(STORAGE_KEY_LOBBY_STATE);

    set({
      connectionStatus: 'disconnected',
      roomCode: null,
      lobbyState: null,
      gameState: null,
      myRoster: null,
      isHost: false,
      gamePhase: 'home',
      opponentConnected: false,
      opponentDisconnected: false
    });

    navigate({ page: 'home' });
  },

  handleMessage: (msg: ProtocolMessage) => {
    const { isHost, playerId, lobbyState, gameState } = get();

    switch (msg.type) {
      case 'hello': {
        // Someone joined - if host, update lobby state
        if (isHost && lobbyState && msg.playerId !== playerId) {
          // Check room capacity
          if (lobbyState.guestId && lobbyState.guestId !== msg.playerId) {
            // Room is full - ignore (could broadcast an error)
            return;
          }

          const newState: LobbyState = {
            ...lobbyState,
            guestId: msg.playerId,
            guestName: msg.name
          };
          set({ lobbyState: newState, opponentConnected: true });
          localStorage.setItem(STORAGE_KEY_LOBBY_STATE, JSON.stringify(newState));
          broadcast({ type: 'lobbyState', state: newState });
        }
        break;
      }

      case 'lobbyState': {
        // Guest receives lobby state from host
        if (!isHost) {
          set({
            lobbyState: msg.state,
            opponentConnected: true
          });
        }
        break;
      }

      case 'rosterSubmit': {
        // Host receives roster submission
        if (isHost && lobbyState && msg.playerId !== playerId) {
          const newState: LobbyState = {
            ...lobbyState,
            guestPickCount: 10
          };
          set({ lobbyState: newState });
          localStorage.setItem(STORAGE_KEY_LOBBY_STATE, JSON.stringify(newState));
          broadcast({ type: 'lobbyState', state: newState });

          // Store guest roster for game start
          // We need to store this somewhere for when game starts
          localStorage.setItem('showdown_guest_roster', JSON.stringify(msg.roster));
        }
        break;
      }

      case 'ready': {
        if (isHost && lobbyState) {
          const isHostReady = msg.playerId === lobbyState.hostId;
          const newState: LobbyState = {
            ...lobbyState,
            hostReady: isHostReady ? true : lobbyState.hostReady,
            guestReady: !isHostReady ? true : lobbyState.guestReady
          };

          // If both ready and both have rosters, do roll-off and start game
          if (newState.hostReady && newState.guestReady &&
              newState.hostPickCount === 10 && newState.guestPickCount === 10) {
            get().startGame();
          } else {
            set({ lobbyState: newState });
            localStorage.setItem(STORAGE_KEY_LOBBY_STATE, JSON.stringify(newState));
            broadcast({ type: 'lobbyState', state: newState });
          }
        }
        break;
      }

      case 'gameStart': {
        // Guest receives game start
        if (!isHost) {
          set({
            gameState: msg.state,
            gamePhase: 'playing'
          });
          navigate({ page: 'game', code: msg.state.roomCode });
        }
        break;
      }

      case 'actionRequest': {
        // Host receives action request from guest
        if (isHost && gameState) {
          // Validate it's their turn
          if (msg.playerId !== gameState.waitingForPlayerId) {
            console.warn('Action from wrong player');
            return;
          }
          get().processAction(msg.playerId, msg.action);
        }
        break;
      }

      case 'stateSnapshot': {
        // Guest receives state update
        if (!isHost) {
          // Only accept if seq is newer
          if (!gameState || msg.state.seq > gameState.seq) {
            set({ gameState: msg.state });

            // Check for game over
            if (msg.state.winner) {
              set({ gamePhase: 'gameOver' });
            }
          }
        }
        break;
      }

      case 'snapshotRequest': {
        // Host responds to rejoin request
        if (isHost && gameState) {
          broadcast({
            type: 'stateSnapshot',
            state: gameState,
            lastEvent: gameState.lastAtBat
          });
        }
        break;
      }

      case 'gameOver': {
        set({
          gameState: msg.state,
          gamePhase: 'gameOver'
        });
        break;
      }
    }
  },

  handlePresenceSync: (presences: Record<string, PresenceState[]>) => {
    const { playerId } = get();
    const playerIds = Object.keys(presences);
    const otherPlayerPresent = playerIds.some(id => id !== playerId);
    set({ opponentConnected: otherPlayerPresent, opponentDisconnected: false });
  },

  handlePresenceJoin: (_key: string, _presence: PresenceState) => {
    set({ opponentConnected: true, opponentDisconnected: false });
  },

  handlePresenceLeave: (_key: string, _presence: PresenceState) => {
    set({ opponentDisconnected: true });
  },

  broadcastLobbyState: () => {
    const { lobbyState } = get();
    if (lobbyState) {
      broadcast({ type: 'lobbyState', state: lobbyState });
    }
  },

  startGame: () => {
    const { playerId, playerName, lobbyState, myRoster, roomCode } = get();

    if (!lobbyState || !myRoster || !roomCode) return;

    // Get guest roster from storage
    const guestRosterJson = localStorage.getItem('showdown_guest_roster');
    if (!guestRosterJson) {
      console.error('Missing guest roster');
      return;
    }
    const guestRoster: Roster = JSON.parse(guestRosterJson);

    // Roll-off for home/away
    const seed = Math.floor(Math.random() * 2147483647);
    const rng = createRNG(seed);
    const hostRoll = rollD20(rng);
    const guestRoll = rollD20(rng);

    // Higher roll is home (bats last). Re-roll ties.
    let homePlayerId: string;
    let awayPlayerId: string;
    let homeRoster: Roster;
    let awayRoster: Roster;

    if (hostRoll >= guestRoll) {
      homePlayerId = playerId;
      awayPlayerId = lobbyState.guestId!;
      homeRoster = myRoster;
      awayRoster = guestRoster;
    } else {
      homePlayerId = lobbyState.guestId!;
      awayPlayerId = playerId;
      homeRoster = guestRoster;
      awayRoster = myRoster;
    }

    // Create initial game state
    const gameRng = createRNG(seed);
    // Consume the two roll-off rolls
    rollD20(gameRng);
    rollD20(gameRng);

    const initialState: FullGameState = {
      roomCode,
      seed,
      seq: 1,
      hostId: playerId,
      guestId: lobbyState.guestId!,
      hostName: playerName,
      guestName: lobbyState.guestName!,
      homePlayerId,
      awayPlayerId,
      homeRoster,
      awayRoster,
      inning: 1,
      isTopHalf: true, // Away bats first
      inningState: createInningHalfState(0),
      lineScore: { away: [], home: [] },
      homeBatterIndex: 0,
      awayBatterIndex: 0,
      phase: 'pitching',
      waitingForPlayerId: homePlayerId, // Home team pitches first (fielding)
      lastAtBat: null,
      winner: null
    };

    // Update lobby state with roll-off
    const finalLobbyState: LobbyState = {
      ...lobbyState,
      rollOff: {
        hostRoll,
        guestRoll,
        homePlayerId
      }
    };

    set({
      lobbyState: finalLobbyState,
      gameState: initialState,
      rng: gameRng,
      gamePhase: 'playing'
    });

    // Persist game state
    localStorage.setItem(STORAGE_KEY_GAME_STATE, JSON.stringify(initialState));

    // Compute seed hash for future verification
    const seedHash = btoa(String(seed)); // Simple encoding for now

    // Broadcast lobby update then game start
    broadcast({ type: 'lobbyState', state: finalLobbyState });

    setTimeout(() => {
      broadcast({
        type: 'gameStart',
        state: initialState,
        seedHash
      });
      navigate({ page: 'game', code: roomCode });
    }, 2000); // Show roll-off for 2 seconds
  },

  processAction: (actionPlayerId: string, action: 'pitch' | 'swing') => {
    const { gameState, rng } = get();

    if (!gameState || !rng) return;

    // Validate turn
    if (actionPlayerId !== gameState.waitingForPlayerId) {
      console.warn('Wrong player action');
      return;
    }

    // Get current matchup
    const battingTeamIsHome = !gameState.isTopHalf;
    const battingRoster = battingTeamIsHome ? gameState.homeRoster : gameState.awayRoster;
    const pitchingRoster = battingTeamIsHome ? gameState.awayRoster : gameState.homeRoster;
    const batterIndex = battingTeamIsHome ? gameState.homeBatterIndex : gameState.awayBatterIndex;
    const batter = battingRoster.lineup[batterIndex];
    const pitcher = pitchingRoster.pitcher;

    const battingPlayerId = battingTeamIsHome ? gameState.homePlayerId : gameState.awayPlayerId;

    let newState = { ...gameState };

    if (action === 'pitch' && gameState.phase === 'pitching') {
      // Pitch roll - now waiting for batter to swing
      newState = {
        ...newState,
        seq: gameState.seq + 1,
        phase: 'swinging',
        waitingForPlayerId: battingPlayerId
      };

    } else if (action === 'swing' && gameState.phase === 'swinging') {
      // Resolve the full at-bat
      const result = resolveAtBat(pitcher, batter, rng, gameState.inningState.bases, gameState.inningState.outs);

      // Apply result to inning state
      const newInningState = applyAtBatResult(
        gameState.inningState as unknown as import('../data/types').HalfInningState,
        result,
        9
      );

      // Update batter index for batting team
      const newBatterIndex = (batterIndex + 1) % 9;

      newState = {
        ...newState,
        seq: gameState.seq + 1,
        phase: 'result',
        inningState: {
          outs: newInningState.outs,
          bases: newInningState.bases,
          runs: newInningState.runs,
          hits: newInningState.hits,
          batterIndex: newBatterIndex
        },
        lastAtBat: result,
        homeBatterIndex: battingTeamIsHome ? newBatterIndex : gameState.homeBatterIndex,
        awayBatterIndex: !battingTeamIsHome ? newBatterIndex : gameState.awayBatterIndex
      };

      // Check for walk-off
      if (isWalkOff(newState)) {
        newState = {
          ...newState,
          phase: 'gameOver',
          winner: gameState.homePlayerId
        };

        // Add final inning runs to line score
        if (battingTeamIsHome) {
          newState.lineScore.home = [...newState.lineScore.home, newState.inningState.runs];
        } else {
          newState.lineScore.away = [...newState.lineScore.away, newState.inningState.runs];
        }
      }
    }

    set({ gameState: newState });
    localStorage.setItem(STORAGE_KEY_GAME_STATE, JSON.stringify(newState));

    broadcast({
      type: 'stateSnapshot',
      state: newState,
      lastEvent: newState.lastAtBat
    });

    // Auto-advance after result display
    if (newState.phase === 'result' && !newState.winner) {
      setTimeout(() => get().advanceGame(), 1500);
    }

    if (newState.winner) {
      broadcast({
        type: 'gameOver',
        state: newState,
        winner: newState.winner
      });
    }
  },

  advanceGame: () => {
    const { gameState } = get();
    if (!gameState || gameState.phase !== 'result') return;

    let newState = { ...gameState };

    // Check if half-inning is over (3 outs)
    if (gameState.inningState.outs >= 3) {
      // Record runs for this half-inning
      if (gameState.isTopHalf) {
        newState.lineScore.away = [...newState.lineScore.away, gameState.inningState.runs];
      } else {
        newState.lineScore.home = [...newState.lineScore.home, gameState.inningState.runs];
      }

      // Check if game is over
      const scores = getTotalScore(newState.lineScore);

      if (!gameState.isTopHalf && gameState.inning >= 3) {
        // End of regulation or extra inning - check for winner
        if (scores.home !== scores.away) {
          newState = {
            ...newState,
            phase: 'gameOver',
            winner: scores.home > scores.away ? gameState.homePlayerId : gameState.awayPlayerId
          };

          set({ gameState: newState, gamePhase: 'gameOver' });
          localStorage.setItem(STORAGE_KEY_GAME_STATE, JSON.stringify(newState));
          broadcast({ type: 'gameOver', state: newState, winner: newState.winner! });
          return;
        }
      }

      // Advance to next half-inning
      const nextIsTop = !gameState.isTopHalf;
      const nextInning = nextIsTop ? gameState.inning + 1 : gameState.inning;

      // Check if we should skip bottom half (home already winning in 3rd+)
      if (!nextIsTop && nextInning >= 3) {
        const scoresNow = getTotalScore(newState.lineScore);
        if (scoresNow.home > scoresNow.away) {
          // Game over, home wins
          newState = {
            ...newState,
            phase: 'gameOver',
            winner: gameState.homePlayerId
          };

          set({ gameState: newState, gamePhase: 'gameOver' });
          localStorage.setItem(STORAGE_KEY_GAME_STATE, JSON.stringify(newState));
          broadcast({ type: 'gameOver', state: newState, winner: newState.winner! });
          return;
        }
      }

      // Reset for next half-inning
      const nextBatterIndex = nextIsTop ? gameState.awayBatterIndex : gameState.homeBatterIndex;

      newState = {
        ...newState,
        seq: gameState.seq + 1,
        inning: nextInning,
        isTopHalf: nextIsTop,
        inningState: createInningHalfState(nextBatterIndex),
        phase: 'pitching',
        // Fielding team (opposite of batting) pitches
        waitingForPlayerId: nextIsTop ? gameState.homePlayerId : gameState.awayPlayerId,
        lastAtBat: null
      };

      newState.phase = 'halfInningEnd';

      set({ gameState: newState });
      localStorage.setItem(STORAGE_KEY_GAME_STATE, JSON.stringify(newState));
      broadcast({ type: 'stateSnapshot', state: newState, lastEvent: null });

      // Brief pause then continue
      setTimeout(() => {
        const current = get().gameState;
        if (current && current.phase === 'halfInningEnd') {
          const pitchingState = {
            ...current,
            seq: current.seq + 1,
            phase: 'pitching' as const
          };
          set({ gameState: pitchingState });
          localStorage.setItem(STORAGE_KEY_GAME_STATE, JSON.stringify(pitchingState));
          broadcast({ type: 'stateSnapshot', state: pitchingState, lastEvent: null });
        }
      }, 2000);

    } else {
      // Continue at-bat, back to pitching phase
      // Fielding team pitches
      const pitchingPlayerId = gameState.isTopHalf ? gameState.homePlayerId : gameState.awayPlayerId;

      newState = {
        ...newState,
        seq: gameState.seq + 1,
        phase: 'pitching',
        waitingForPlayerId: pitchingPlayerId
      };

      set({ gameState: newState });
      localStorage.setItem(STORAGE_KEY_GAME_STATE, JSON.stringify(newState));
      broadcast({ type: 'stateSnapshot', state: newState, lastEvent: gameState.lastAtBat });
    }
  }
}));

// Reconnection helper - call on app load
export async function attemptReconnect(): Promise<boolean> {
  const roomCode = localStorage.getItem(STORAGE_KEY_ROOM);
  const isHost = localStorage.getItem(STORAGE_KEY_IS_HOST) === 'true';

  if (!roomCode) return false;

  const store = useMultiplayerStore.getState();

  if (isHost) {
    // Host reconnecting - restore state and rejoin
    await store.createGame();
    // Actually we need to restore the existing room, not create new
    // For now, simplified reconnection
    return false;
  } else {
    // Guest reconnecting
    await store.joinGame(roomCode);
    // Request snapshot
    broadcast({ type: 'snapshotRequest', playerId: store.playerId });
    return true;
  }
}
