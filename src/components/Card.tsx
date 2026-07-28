/**
 * Card component - displays a Showdown-style player card
 */

import type { PitcherCard, HitterCard, Chart, OutcomeType } from '../data/types';

interface CardProps {
  card: PitcherCard | HitterCard;
  type: 'pitcher' | 'hitter';
  dimmed?: boolean;
  glowing?: boolean;
  highlighted?: boolean;
  highlightedRoll?: number;
  showHighlightedBand?: boolean;
}

const OUTCOME_LABELS: Record<OutcomeType, string> = {
  'PU': 'PU',
  'SO': 'SO',
  'GB': 'GB',
  'FB': 'FB',
  'BB': 'BB',
  '1B': '1B',
  '1B+': '1B+',
  '2B': '2B',
  '3B': '3B',
  'HR': 'HR'
};

function getOutcomeClass(outcome: OutcomeType): string {
  if (['PU', 'SO', 'GB', 'FB'].includes(outcome)) return outcome;
  if (outcome === 'BB') return 'BB';
  if (outcome === '1B' || outcome === '1B+') return 'single';
  if (outcome === '2B') return 'double';
  if (outcome === '3B') return 'triple';
  if (outcome === 'HR') return 'HR';
  return '';
}

function buildChartRows(chart: Chart): { roll: number; outcome: OutcomeType }[] {
  const rows: { roll: number; outcome: OutcomeType }[] = [];

  const categories: OutcomeType[] = [
    'PU', 'SO', 'GB', 'FB', 'BB', '1B', '1B+', '2B', '3B', 'HR'
  ];

  for (const cat of categories) {
    const band = chart[cat];
    if (band) {
      for (let roll = band[0]; roll <= band[1]; roll++) {
        rows.push({ roll, outcome: cat });
      }
    }
  }

  // Sort by roll number
  rows.sort((a, b) => a.roll - b.roll);
  return rows;
}

export function Card({ card, type, dimmed, glowing, highlighted, highlightedRoll, showHighlightedBand }: CardProps) {
  const isPitcher = type === 'pitcher';
  const pitcherCard = card as PitcherCard;
  const hitterCard = card as HitterCard;

  const commandValue = isPitcher ? pitcherCard.control : hitterCard.onBase;
  const commandLabel = isPitcher ? 'Control' : 'On-Base';
  const isElite = isPitcher ? commandValue >= 5 : commandValue >= 14;

  const chartRows = buildChartRows(card.chart);

  const cardClasses = [
    'card',
    isElite && 'elite',
    dimmed && 'dimmed',
    glowing && 'glowing',
    highlighted && 'highlighted'
  ].filter(Boolean).join(' ');

  return (
    <div className={cardClasses}>
      <div className="card-header">
        <div>
          <div className="card-name">{card.name}</div>
          <div className="card-team">{card.team}</div>
        </div>
        <div>
          <div className={`card-command ${isPitcher ? 'control' : 'onbase'}`}>
            {commandValue}
          </div>
          <div className="card-label">{commandLabel}</div>
        </div>
      </div>

      <div className="chart-ladder">
        {chartRows.map(({ roll, outcome }) => (
          <div
            key={roll}
            className={`chart-row ${showHighlightedBand && highlightedRoll === roll ? 'highlighted' : ''}`}
          >
            <div className="chart-roll">{roll}</div>
            <div className={`chart-outcome ${getOutcomeClass(outcome)}`}>
              {OUTCOME_LABELS[outcome]}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
