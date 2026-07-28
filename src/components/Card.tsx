/**
 * Card component - MLB Showdown-style player card
 * Designed to match the classic 2000-2005 card aesthetic
 */

import type { PitcherCard, HitterCard, Chart, OutcomeType } from '../data/types';

interface CardProps {
  card: PitcherCard | HitterCard;
  type: 'pitcher' | 'hitter';
  size?: 'normal' | 'small';
  dimmed?: boolean;
  glowing?: boolean;
  highlighted?: boolean;
  highlightedRoll?: number;
  showHighlightedBand?: boolean;
}

// Team colors for card accents
const TEAM_COLORS: Record<string, { primary: string; secondary: string }> = {
  'ARI': { primary: '#A71930', secondary: '#E3D4AD' },
  'ATL': { primary: '#CE1141', secondary: '#13274F' },
  'BAL': { primary: '#DF4601', secondary: '#000000' },
  'BOS': { primary: '#BD3039', secondary: '#0C2340' },
  'CHC': { primary: '#0E3386', secondary: '#CC3433' },
  'CHW': { primary: '#27251F', secondary: '#C4CED4' },
  'CIN': { primary: '#C6011F', secondary: '#000000' },
  'CLE': { primary: '#00385D', secondary: '#E50022' },
  'COL': { primary: '#333366', secondary: '#C4CED4' },
  'DET': { primary: '#0C2340', secondary: '#FA4616' },
  'HOU': { primary: '#002D62', secondary: '#EB6E1F' },
  'KC': { primary: '#004687', secondary: '#BD9B60' },
  'LAA': { primary: '#BA0021', secondary: '#003263' },
  'LAD': { primary: '#005A9C', secondary: '#EF3E42' },
  'MIA': { primary: '#00A3E0', secondary: '#EF3340' },
  'MIL': { primary: '#12284B', secondary: '#B6922E' },
  'MIN': { primary: '#002B5C', secondary: '#D31145' },
  'NYM': { primary: '#002D72', secondary: '#FF5910' },
  'NYY': { primary: '#003087', secondary: '#C4CED4' },
  'OAK': { primary: '#003831', secondary: '#EFB21E' },
  'PHI': { primary: '#E81828', secondary: '#002D72' },
  'PIT': { primary: '#27251F', secondary: '#FDB827' },
  'SD': { primary: '#2F241D', secondary: '#FFC425' },
  'SF': { primary: '#FD5A1E', secondary: '#27251F' },
  'SEA': { primary: '#0C2C56', secondary: '#005C5C' },
  'STL': { primary: '#C41E3A', secondary: '#0C2340' },
  'TB': { primary: '#092C5C', secondary: '#8FBCE6' },
  'TEX': { primary: '#003278', secondary: '#C0111F' },
  'TOR': { primary: '#134A8E', secondary: '#1D2D5C' },
  'WSH': { primary: '#AB0003', secondary: '#14225A' },
};

const DEFAULT_COLORS = { primary: '#1a365d', secondary: '#c53030' };

function getTeamColors(team: string) {
  return TEAM_COLORS[team] || DEFAULT_COLORS;
}

function buildChartBands(chart: Chart): { range: string; outcome: OutcomeType; slots: number }[] {
  const bands: { range: string; outcome: OutcomeType; slots: number }[] = [];
  const categories: OutcomeType[] = ['PU', 'SO', 'GB', 'FB', 'BB', '1B', '1B+', '2B', '3B', 'HR'];

  for (const cat of categories) {
    const band = chart[cat];
    if (band) {
      const slots = band[1] - band[0] + 1;
      const range = band[0] === band[1] ? `${band[0]}` : `${band[0]}-${band[1]}`;
      bands.push({ range, outcome: cat, slots });
    }
  }

  return bands;
}

function getOutcomeColor(outcome: OutcomeType): string {
  const colors: Record<OutcomeType, string> = {
    'PU': '#4a5568',
    'SO': '#4a5568',
    'GB': '#4a5568',
    'FB': '#4a5568',
    'BB': '#3182ce',
    '1B': '#38a169',
    '1B+': '#38a169',
    '2B': '#d69e2e',
    '3B': '#dd6b20',
    'HR': '#e53e3e'
  };
  return colors[outcome];
}

function isOutcome(outcome: OutcomeType): boolean {
  return ['PU', 'SO', 'GB', 'FB'].includes(outcome);
}

export function Card({
  card,
  type,
  size = 'normal',
  dimmed,
  glowing,
  highlighted,
  highlightedRoll,
  showHighlightedBand
}: CardProps) {
  const isPitcher = type === 'pitcher';
  const pitcherCard = card as PitcherCard;
  const hitterCard = card as HitterCard;

  const commandValue = isPitcher ? pitcherCard.control : hitterCard.onBase;
  const commandLabel = isPitcher ? 'CONTROL' : 'ON-BASE';
  const teamColors = getTeamColors(card.team);

  const chartBands = buildChartBands(card.chart);

  // Calculate which outcome is highlighted
  let highlightedOutcome: OutcomeType | null = null;
  if (showHighlightedBand && highlightedRoll) {
    for (const band of chartBands) {
      const [start, end] = band.range.includes('-')
        ? band.range.split('-').map(Number)
        : [Number(band.range), Number(band.range)];
      if (highlightedRoll >= start && highlightedRoll <= end) {
        highlightedOutcome = band.outcome;
        break;
      }
    }
  }

  const cardClasses = [
    'showdown-card',
    size === 'small' && 'showdown-card-small',
    dimmed && 'dimmed',
    glowing && 'glowing',
    highlighted && 'highlighted'
  ].filter(Boolean).join(' ');

  // Get positions for hitters
  const positions = !isPitcher && hitterCard.positions ? hitterCard.positions.join('/') : null;
  const speed = !isPitcher && hitterCard.speed ? hitterCard.speed : null;

  return (
    <div
      className={cardClasses}
      style={{ '--team-primary': teamColors.primary, '--team-secondary': teamColors.secondary } as React.CSSProperties}
    >
      {/* Card Frame */}
      <div className="card-frame">
        {/* Top Bar with Command */}
        <div className="card-top-bar">
          <div className="card-command-box">
            <span className="card-command-value">{commandValue}</span>
            <span className="card-command-label">{commandLabel}</span>
          </div>
          <div className="card-player-type">
            {isPitcher ? (pitcherCard.throws === 'L' ? 'LHP' : 'RHP') :
              (hitterCard.bats === 'L' ? 'LHB' : hitterCard.bats === 'S' ? 'SW' : 'RHB')}
          </div>
        </div>

        {/* Player Image Area */}
        <div className="card-image-area">
          <div className="card-player-silhouette">
            {isPitcher ? (
              <svg viewBox="0 0 100 120" fill="currentColor">
                <circle cx="50" cy="25" r="18" />
                <path d="M50 45 L30 90 L35 95 L50 70 L65 95 L70 90 Z" />
                <path d="M35 55 L15 75 L20 80 L40 65" />
                <path d="M65 55 L85 45 L82 52 L60 65" />
              </svg>
            ) : (
              <svg viewBox="0 0 100 120" fill="currentColor">
                <circle cx="50" cy="25" r="18" />
                <path d="M50 45 L30 95 L35 100 L50 70 L65 100 L70 95 Z" />
                <path d="M35 55 L10 50 L12 58 L38 65" />
                <path d="M65 55 L90 35 L85 42 L62 60" />
              </svg>
            )}
          </div>
        </div>

        {/* Name Bar */}
        <div className="card-name-bar">
          <div className="card-name">{card.name}</div>
          <div className="card-team-name">{card.team}</div>
        </div>

        {/* Stats Row (for hitters) */}
        {!isPitcher && (positions || speed) && (
          <div className="card-stats-row">
            {positions && <span className="card-position">POS: {positions}</span>}
            {speed && <span className="card-speed">SPD: {speed}</span>}
          </div>
        )}

        {/* Chart */}
        <div className="card-chart">
          {chartBands.map((band, i) => {
            const isHighlighted = highlightedOutcome === band.outcome;
            return (
              <div
                key={i}
                className={`chart-band ${isHighlighted ? 'chart-band-highlighted' : ''}`}
                style={{
                  backgroundColor: isHighlighted ? getOutcomeColor(band.outcome) : undefined,
                  borderLeftColor: getOutcomeColor(band.outcome)
                }}
              >
                <span className="chart-band-range">{band.range}</span>
                <span
                  className="chart-band-outcome"
                  style={{
                    backgroundColor: isOutcome(band.outcome) ? '#4a5568' : getOutcomeColor(band.outcome),
                    color: 'white'
                  }}
                >
                  {band.outcome}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Compact card for lineup display
export function CardMini({ card, type, isActive }: { card: PitcherCard | HitterCard; type: 'pitcher' | 'hitter'; isActive?: boolean }) {
  const isPitcher = type === 'pitcher';
  const commandValue = isPitcher ? (card as PitcherCard).control : (card as HitterCard).onBase;
  const teamColors = getTeamColors(card.team);

  return (
    <div
      className={`card-mini ${isActive ? 'card-mini-active' : ''}`}
      style={{ '--team-primary': teamColors.primary } as React.CSSProperties}
    >
      <div className="card-mini-command">{commandValue}</div>
      <div className="card-mini-info">
        <div className="card-mini-name">{card.name.split(' ').pop()}</div>
        <div className="card-mini-team">{card.team}</div>
      </div>
    </div>
  );
}
