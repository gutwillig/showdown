/**
 * Card data loading and utilities
 */

import type { CardsData, PitcherCard, HitterCard } from './types';

let cardsData: CardsData | null = null;

export async function loadCards(): Promise<CardsData> {
  if (cardsData) return cardsData;

  const response = await fetch('/cards.json');
  if (!response.ok) {
    throw new Error('Failed to load cards.json');
  }

  cardsData = await response.json();
  return cardsData!;
}

export function getCardsSync(): CardsData | null {
  return cardsData;
}

export function searchPitchers(cards: CardsData, query: string): PitcherCard[] {
  const q = query.toLowerCase();
  return cards.pitchers.filter(p =>
    p.name.toLowerCase().includes(q) ||
    p.team.toLowerCase().includes(q)
  );
}

export function searchHitters(cards: CardsData, query: string): HitterCard[] {
  const q = query.toLowerCase();
  return cards.hitters.filter(h =>
    h.name.toLowerCase().includes(q) ||
    h.team.toLowerCase().includes(q)
  );
}

export function getPitchersByTeam(cards: CardsData, team: string): PitcherCard[] {
  return cards.pitchers.filter(p => p.team === team);
}

export function getHittersByTeam(cards: CardsData, team: string): HitterCard[] {
  return cards.hitters.filter(h => h.team === team);
}

export function getTeams(cards: CardsData): string[] {
  const teams = new Set<string>();
  cards.pitchers.forEach(p => teams.add(p.team));
  cards.hitters.forEach(h => teams.add(h.team));
  return Array.from(teams).sort();
}

export function autoLineup(cards: CardsData, team: string): HitterCard[] {
  const teamHitters = getHittersByTeam(cards, team);
  // Sort by OBP descending, take top 9
  return teamHitters
    .sort((a, b) => b.realStats.obp - a.realStats.obp)
    .slice(0, 9);
}
