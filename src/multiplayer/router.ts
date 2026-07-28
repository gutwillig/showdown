/**
 * Simple hash-based router for multiplayer
 * Routes:
 *   #/ - home (mode selection)
 *   #/join/{code} - join a game by code
 *   #/lobby/{code} - lobby/draft screen
 *   #/game/{code} - active game
 */

export type Route =
  | { page: 'home' }
  | { page: 'join'; code?: string }
  | { page: 'lobby'; code: string }
  | { page: 'game'; code: string };

export function parseHash(hash: string): Route {
  // Remove leading # if present
  const path = hash.replace(/^#\/?/, '');

  if (!path || path === '/') {
    return { page: 'home' };
  }

  // #/join or #/join/{code}
  if (path.startsWith('join')) {
    const match = path.match(/^join\/([A-Z]{4})$/i);
    if (match) {
      return { page: 'join', code: match[1].toUpperCase() };
    }
    return { page: 'join' };
  }

  // #/lobby/{code}
  const lobbyMatch = path.match(/^lobby\/([A-Z]{4})$/i);
  if (lobbyMatch) {
    return { page: 'lobby', code: lobbyMatch[1].toUpperCase() };
  }

  // #/game/{code}
  const gameMatch = path.match(/^game\/([A-Z]{4})$/i);
  if (gameMatch) {
    return { page: 'game', code: gameMatch[1].toUpperCase() };
  }

  return { page: 'home' };
}

export function navigate(route: Route): void {
  switch (route.page) {
    case 'home':
      window.location.hash = '#/';
      break;
    case 'join':
      window.location.hash = route.code ? `#/join/${route.code}` : '#/join';
      break;
    case 'lobby':
      window.location.hash = `#/lobby/${route.code}`;
      break;
    case 'game':
      window.location.hash = `#/game/${route.code}`;
      break;
  }
}

export function getShareableLink(roomCode: string): string {
  const base = window.location.origin + window.location.pathname;
  return `${base}#/join/${roomCode}`;
}
