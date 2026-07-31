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
let connectionAttemptId = 0;
let activeTimeout: ReturnType<typeof setTimeout> | null = null;

export function getChannelName(roomCode: string): string {
  return `game:${roomCode}`;
}

export async function joinRoom(
  roomCode: string,
  playerId: string,
  playerName: string,
  callbacks: ConnectionCallbacks
): Promise<RealtimeChannel> {
  // Cancel any pending timeout from previous attempts
  if (activeTimeout) {
    clearTimeout(activeTimeout);
    activeTimeout = null;
  }

  // If already connected to this room, return existing channel
  if (currentChannel && currentRoomCode === roomCode) {
    console.log('Already connected to room:', roomCode);
    return currentChannel;
  }

  // Leave existing channel if connecting to a different room
  if (currentChannel && currentRoomCode !== roomCode) {
    await leaveRoom();
  }

  // Increment attempt ID to invalidate previous attempts
  const thisAttemptId = ++connectionAttemptId;
  currentRoomCode = roomCode;

  const supabase = getSupabase();
  const channelName = getChannelName(roomCode);

  // Remove any existing channel with this name (in case of stale state)
  const existingChannels = supabase.getChannels();
  for (const ch of existingChannels) {
    if (ch.topic === `realtime:${channelName}`) {
      await supabase.removeChannel(ch);
    }
  }

  console.log('Creating channel with name:', channelName);
  console.log('Supabase client:', supabase);
  console.log('Realtime endpoint:', (supabase as any).realtimeUrl || 'unknown');

  const channel = supabase.channel(channelName, {
    config: {
      broadcast: { self: true }, // Host receives own broadcasts
      presence: { key: playerId }
    }
  });

  console.log('Channel created:', channel);

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

  // Subscribe and wait for SUBSCRIBED status
  await new Promise<void>((resolve, reject) => {
    activeTimeout = setTimeout(() => {
      // Only error if this is still the current attempt
      if (connectionAttemptId === thisAttemptId) {
        console.error('Channel subscription timed out after 15 seconds');
        console.error('Channel state at timeout:', channel);
        activeTimeout = null;
        reject(new Error('Channel subscription timed out. Check if your Supabase project is active and Realtime is enabled.'));
      }
    }, 15000);

    console.log('Subscribing to channel:', channelName, 'attempt:', thisAttemptId);

    channel.subscribe(async (status, err) => {
      // Ignore callbacks from stale attempts
      if (connectionAttemptId !== thisAttemptId) {
        console.log('Ignoring stale callback from attempt:', thisAttemptId, 'current:', connectionAttemptId);
        return;
      }

      console.log('Channel status:', status, 'Error:', err);
      if (status === 'SUBSCRIBED') {
        if (activeTimeout) {
          clearTimeout(activeTimeout);
          activeTimeout = null;
        }
        console.log('Channel subscribed, tracking presence...');
        await channel.track({
          playerId,
          name: playerName,
          online_at: new Date().toISOString()
        });
        console.log('Presence tracked successfully');
        resolve();
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        if (activeTimeout) {
          clearTimeout(activeTimeout);
          activeTimeout = null;
        }
        console.error('Channel subscription failed:', status, err);
        reject(new Error(`Channel subscription failed: ${status}. ${err ? err.message : ''}`));
      }
      // Ignore CLOSED status - it can happen during StrictMode remounting
    });
  });

  currentChannel = channel;

  return channel;
}

export async function leaveRoom(): Promise<void> {
  // Cancel any pending timeout
  if (activeTimeout) {
    clearTimeout(activeTimeout);
    activeTimeout = null;
  }

  if (currentChannel) {
    const supabase = getSupabase();
    try {
      await currentChannel.untrack();
      await supabase.removeChannel(currentChannel);
    } catch (e) {
      console.warn('Error leaving room:', e);
    }
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
