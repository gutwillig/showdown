/**
 * Supabase Realtime channel management
 * Handles connection, presence, and message broadcasting
 */

import { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabase } from './supabase';
import type { ProtocolMessage } from './protocol';

export interface PresenceState {
  playerId: string;
  name: string;
  online_at: string;
}

export interface ConnectionCallbacks {
  onMessage: (msg: ProtocolMessage) => void;
  onPresenceSync: (presences: Record<string, PresenceState[]>) => void;
  onPresenceJoin: (key: string, presence: PresenceState) => void;
  onPresenceLeave: (key: string, presence: PresenceState) => void;
}

let currentChannel: RealtimeChannel | null = null;
let currentRoomCode: string | null = null;

export function getChannelName(roomCode: string): string {
  return `game:${roomCode}`;
}

export async function joinRoom(
  roomCode: string,
  playerId: string,
  playerName: string,
  callbacks: ConnectionCallbacks
): Promise<RealtimeChannel> {
  // Leave existing channel if any
  if (currentChannel) {
    await leaveRoom();
  }

  const supabase = getSupabase();
  const channelName = getChannelName(roomCode);

  const channel = supabase.channel(channelName, {
    config: {
      broadcast: { self: true }, // Host receives own broadcasts
      presence: { key: playerId }
    }
  });

  // Set up message handler
  channel.on('broadcast', { event: 'message' }, (payload) => {
    if (payload.payload) {
      callbacks.onMessage(payload.payload as ProtocolMessage);
    }
  });

  // Set up presence handlers
  channel.on('presence', { event: 'sync' }, () => {
    const state = channel.presenceState<PresenceState>();
    callbacks.onPresenceSync(state);
  });

  channel.on('presence', { event: 'join' }, ({ key, newPresences }) => {
    if (newPresences && newPresences.length > 0) {
      callbacks.onPresenceJoin(key, newPresences[0] as unknown as PresenceState);
    }
  });

  channel.on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
    if (leftPresences && leftPresences.length > 0) {
      callbacks.onPresenceLeave(key, leftPresences[0] as unknown as PresenceState);
    }
  });

  // Subscribe and track presence
  await channel.subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      await channel.track({
        playerId,
        name: playerName,
        online_at: new Date().toISOString()
      });
    }
  });

  currentChannel = channel;
  currentRoomCode = roomCode;

  return channel;
}

export async function leaveRoom(): Promise<void> {
  if (currentChannel) {
    await currentChannel.untrack();
    await currentChannel.unsubscribe();
    currentChannel = null;
    currentRoomCode = null;
  }
}

export function broadcast(msg: ProtocolMessage): void {
  if (!currentChannel) {
    console.warn('No active channel to broadcast on');
    return;
  }

  currentChannel.send({
    type: 'broadcast',
    event: 'message',
    payload: msg
  });
}

export function getCurrentRoomCode(): string | null {
  return currentRoomCode;
}

export function isConnected(): boolean {
  return currentChannel !== null;
}

// Get presence count (for room capacity check)
export function getPresenceCount(): number {
  if (!currentChannel) return 0;
  const state = currentChannel.presenceState<PresenceState>();
  return Object.keys(state).length;
}
