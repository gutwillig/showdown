#!/usr/bin/env python3
"""
Card Generation Pipeline for Showdown Digital

Fetches MLB stats from MLB Stats API and generates Showdown-style cards.
Outputs cards.json for the web app to consume.

Usage:
    python generate.py [--season YEAR] [--output PATH]
"""

import json
import os
import argparse
from datetime import datetime
from typing import Dict, List, Tuple
import requests

from formula import (
    generate_hitter_card,
    generate_pitcher_card,
    compute_league_constants_pass1,
    compute_league_constants_pass2
)

# Configuration
DEFAULT_SEASON = 2024  # Use 2024 as the most recent complete season
MIN_PA = 400  # Minimum plate appearances for hitters
MIN_IP = 100  # Minimum innings pitched for starters

# Cache directory
CACHE_DIR = os.path.join(os.path.dirname(__file__), '.cache')
MLB_API_BASE = "https://statsapi.mlb.com/api/v1"


def get_cached_data(cache_key: str):
    """Load data from cache if available."""
    os.makedirs(CACHE_DIR, exist_ok=True)
    cache_file = os.path.join(CACHE_DIR, f"{cache_key}.json")
    if os.path.exists(cache_file):
        with open(cache_file, 'r') as f:
            return json.load(f)
    return None


def save_to_cache(cache_key: str, data):
    """Save data to cache."""
    os.makedirs(CACHE_DIR, exist_ok=True)
    cache_file = os.path.join(CACHE_DIR, f"{cache_key}.json")
    with open(cache_file, 'w') as f:
        json.dump(data, f)


def fetch_mlb_teams():
    """Fetch all MLB teams."""
    url = f"{MLB_API_BASE}/teams?sportId=1"
    response = requests.get(url)
    response.raise_for_status()
    data = response.json()
    return {t['id']: t['abbreviation'] for t in data['teams']}


def fetch_player_stats(season: int, stat_group: str):
    """Fetch player stats from MLB Stats API."""
    cache_key = f"mlb_{stat_group}_{season}"
    cached = get_cached_data(cache_key)
    if cached:
        print(f"  Using cached {stat_group} data")
        return cached

    print(f"  Fetching {stat_group} stats from MLB API...")

    # Get stats leaders
    url = f"{MLB_API_BASE}/stats/leaders"
    params = {
        'leaderCategories': 'hits' if stat_group == 'hitting' else 'wins',
        'statGroup': stat_group,
        'season': season,
        'limit': 500,
        'sportId': 1
    }

    # Fetch all players with stats
    all_players_url = f"{MLB_API_BASE}/stats"
    all_params = {
        'stats': 'season',
        'group': stat_group,
        'season': season,
        'sportId': 1,
        'limit': 1000,
        'offset': 0
    }

    all_players = []
    # We need to use a different approach - get team rosters and then player stats

    # First get all teams
    teams = fetch_mlb_teams()

    # Get stats for each stat type we need
    if stat_group == 'hitting':
        stat_types = ['season']
        sort_stat = 'plateAppearances'
    else:
        stat_types = ['season']
        sort_stat = 'inningsPitched'

    # Use the leaders endpoint with high limit
    leaders_url = f"{MLB_API_BASE}/stats"
    params = {
        'stats': 'season',
        'sportIds': 1,
        'season': season,
        'group': stat_group,
        'playerPool': 'QUALIFIED',
        'limit': 500
    }

    response = requests.get(leaders_url, params=params)
    if response.status_code == 200:
        data = response.json()
        if 'stats' in data and len(data['stats']) > 0:
            splits = data['stats'][0].get('splits', [])
            all_players = splits

    # Try alternative endpoint if we didn't get enough data
    if len(all_players) < 50:
        print(f"  Trying alternative stats endpoint...")
        alt_url = f"https://statsapi.mlb.com/api/v1/stats"
        alt_params = {
            'stats': 'season',
            'sportIds': 1,
            'season': season,
            'group': stat_group,
            'gameType': 'R',
            'hydrate': 'team',
            'limit': 1000
        }
        response = requests.get(alt_url, params=alt_params)
        if response.status_code == 200:
            data = response.json()
            if 'stats' in data and len(data['stats']) > 0:
                splits = data['stats'][0].get('splits', [])
                if len(splits) > len(all_players):
                    all_players = splits

    save_to_cache(cache_key, all_players)
    return all_players


def process_hitter_data(players: list, min_pa: int) -> List[dict]:
    """Process raw hitter data into our format."""
    hitters = []

    for split in players:
        player = split.get('player', {})
        stats = split.get('stat', {})
        team = split.get('team', {})

        pa = stats.get('plateAppearances', 0)
        if pa < min_pa:
            continue

        ab = stats.get('atBats', 0)
        h = stats.get('hits', 0)
        doubles = stats.get('doubles', 0)
        triples = stats.get('triples', 0)
        hr = stats.get('homeRuns', 0)
        bb = stats.get('baseOnBalls', 0)
        hbp = stats.get('hitByPitch', 0)
        so = stats.get('strikeOuts', 0)
        sb = stats.get('stolenBases', 0)

        # Calculate OBP
        obp = (h + bb + hbp) / pa if pa > 0 else 0.32

        # Calculate SLG
        singles = h - doubles - triples - hr
        tb = singles + (2 * doubles) + (3 * triples) + (4 * hr)
        slg = tb / ab if ab > 0 else 0.4
        avg = h / ab if ab > 0 else 0.25

        hitters.append({
            'id': player.get('id', 0),
            'name': player.get('fullName', 'Unknown'),
            'team': team.get('abbreviation', team.get('name', 'UNK'))[:3].upper(),
            'pa': pa,
            'ab': ab,
            'h': h,
            'doubles': doubles,
            'triples': triples,
            'hr': hr,
            'bb': bb,
            'hbp': hbp,
            'so': so,
            'sb': sb,
            'obp': obp,
            'slg': slg,
            'avg': avg
        })

    return hitters


def process_pitcher_data(players: list, min_ip: int) -> List[dict]:
    """Process raw pitcher data into our format."""
    pitchers = []

    for split in players:
        player = split.get('player', {})
        stats = split.get('stat', {})
        team = split.get('team', {})

        # Parse IP (can be string like "180.1")
        ip_raw = stats.get('inningsPitched', '0')
        if isinstance(ip_raw, str):
            parts = ip_raw.split('.')
            ip = float(parts[0]) + (float(parts[1]) / 3 if len(parts) > 1 else 0)
        else:
            ip = float(ip_raw)

        if ip < min_ip:
            continue

        # Filter to starters (GS > 50% of G)
        gs = stats.get('gamesStarted', 0)
        g = stats.get('gamesPlayed', 1)
        if gs < g * 0.5:
            continue

        h = stats.get('hits', 0)
        hr = stats.get('homeRuns', 0)
        bb = stats.get('baseOnBalls', 0)
        so = stats.get('strikeOuts', 0)
        era = stats.get('era', '4.00')
        if isinstance(era, str):
            era = float(era) if era != '-' else 4.0

        # Estimate TBF
        tbf = stats.get('battersFaced', int(ip * 4.3))

        # Calculate rates
        obp_against = (h + bb) / tbf if tbf > 0 else 0.30
        k_rate = so / tbf if tbf > 0 else 0.22
        bb_rate = bb / tbf if tbf > 0 else 0.08

        pitchers.append({
            'id': player.get('id', 0),
            'name': player.get('fullName', 'Unknown'),
            'team': team.get('abbreviation', team.get('name', 'UNK'))[:3].upper(),
            'ip': int(ip),
            'tbf': tbf,
            'h': h,
            'hr': hr,
            'bb': bb,
            'so': so,
            'era': era,
            'obp_against': obp_against,
            'k_rate': k_rate,
            'bb_rate': bb_rate
        })

    return pitchers


def compute_hitter_percentile_ranks(hitters: List[dict]) -> List[dict]:
    """Compute OBP percentile and assign on-base numbers."""
    # Sort by OBP
    sorted_hitters = sorted(hitters, key=lambda h: h['obp'])

    for i, hitter in enumerate(sorted_hitters):
        percentile = i / max(len(sorted_hitters) - 1, 1)
        # Map percentile to 7-16
        on_base = 7 + round(percentile * 9)
        hitter['on_base'] = max(7, min(16, on_base))

    return sorted_hitters


def compute_pitcher_percentile_ranks(pitchers: List[dict]) -> List[dict]:
    """Compute OBP-against percentile (inverted) and assign control numbers."""
    # Sort by OBP against (lower is better, so reverse for percentile)
    sorted_pitchers = sorted(pitchers, key=lambda p: p['obp_against'])

    for i, pitcher in enumerate(sorted_pitchers):
        # Lower OBP against = higher percentile (better)
        percentile = 1 - (i / max(len(sorted_pitchers) - 1, 1))
        # Map percentile to 1-6
        control = 1 + round(percentile * 5)
        pitcher['control'] = max(1, min(6, control))

    return sorted_pitchers


def build_hitter_card(hitter: dict, league_constants: dict) -> dict:
    """Convert a hitter dict to a card dict."""
    pa = hitter['pa']
    singles = hitter['h'] - hitter['doubles'] - hitter['triples'] - hitter['hr']

    player_stats = {
        'on_base': hitter['on_base'],
        'obp': hitter['obp'],
        'bb_rate': hitter['bb'] / pa if pa > 0 else 0.08,
        'single_rate': singles / pa if pa > 0 else 0.15,
        'double_rate': hitter['doubles'] / pa if pa > 0 else 0.04,
        'triple_rate': hitter['triples'] / pa if pa > 0 else 0.005,
        'hr_rate': hitter['hr'] / pa if pa > 0 else 0.03,
        'k_rate': hitter['so'] / pa if pa > 0 else 0.2,
        'sb': hitter['sb']
    }

    card_result = generate_hitter_card(player_stats, league_constants)

    return {
        'id': f"h-{hitter['id']}",
        'name': hitter['name'],
        'team': hitter['team'],
        'bats': 'R',
        'onBase': hitter['on_base'],
        'speed': None,
        'positions': [],
        'chart': card_result['chart'],
        'realStats': {
            'obp': round(hitter['obp'], 3),
            'slg': round(hitter['slg'], 3),
            'hr': hitter['hr'],
            'avg': round(hitter['avg'], 3)
        },
        'ob_slots': card_result['ob_slots'],
        'clamped': card_result['clamped']
    }


def build_pitcher_card(pitcher: dict, league_constants: dict) -> dict:
    """Convert a pitcher dict to a card dict."""
    tbf = pitcher['tbf']
    h = pitcher['h']
    hr = pitcher['hr']

    # Estimate components
    doubles_approx = (h - hr) * 0.25
    singles_approx = (h - hr) * 0.70
    triples_approx = (h - hr) * 0.05

    player_stats = {
        'control': pitcher['control'],
        'obp_against': pitcher['obp_against'],
        'bb_rate': pitcher['bb'] / tbf if tbf > 0 else 0.08,
        'single_rate': singles_approx / tbf if tbf > 0 else 0.15,
        'double_rate': doubles_approx / tbf if tbf > 0 else 0.04,
        'triple_rate': triples_approx / tbf if tbf > 0 else 0.005,
        'hr_rate': hr / tbf if tbf > 0 else 0.02,
        'k_rate': pitcher['k_rate'],
        'gb_rate': 0.45
    }

    card_result = generate_pitcher_card(player_stats, league_constants)

    return {
        'id': f"p-{pitcher['id']}",
        'name': pitcher['name'],
        'team': pitcher['team'],
        'throws': 'R',
        'control': pitcher['control'],
        'ip': pitcher['ip'],
        'chart': card_result['chart'],
        'realStats': {
            'era': round(pitcher['era'], 2),
            'obpAgainst': round(pitcher['obp_against'], 3),
            'kPct': round(pitcher['k_rate'], 3),
            'bbPct': round(pitcher['bb_rate'], 3)
        },
        'ob_slots': card_result['ob_slots'],
        'clamped': card_result['clamped']
    }


def validate_chart(chart: dict) -> Tuple[bool, str]:
    """Validate that a chart sums to exactly 20 slots."""
    total = 0
    for cat, band in chart.items():
        if band is not None:
            total += band[1] - band[0] + 1

    if total != 20:
        return False, f"Chart sums to {total}, not 20"
    return True, ""


def count_out_slots(chart: dict) -> int:
    """Count total out slots in a chart."""
    out_categories = ['PU', 'SO', 'GB', 'FB']
    total = 0
    for cat in out_categories:
        band = chart.get(cat)
        if band:
            total += band[1] - band[0] + 1
    return total


def count_ob_slots(chart: dict) -> int:
    """Count total on-base slots in a chart."""
    ob_categories = ['BB', '1B', '1B+', '2B', '3B', 'HR']
    total = 0
    for cat in ob_categories:
        band = chart.get(cat)
        if band:
            total += band[1] - band[0] + 1
    return total


def run_sanity_checks(hitters: list, pitchers: list):
    """Run and print sanity checks per acceptance criteria."""
    print("\n" + "="*60)
    print("SANITY CHECKS")
    print("="*60)

    # Sort pitchers by OBP against (lower is better)
    pitchers_sorted = sorted(pitchers, key=lambda p: p['realStats']['obpAgainst'])
    top_pitchers = pitchers_sorted[:5]

    print("\nTop 5 pitchers by OBP against:")
    all_pass = True
    for p in top_pitchers:
        out_slots = count_out_slots(p['chart'])
        control_ok = p['control'] >= 5
        outs_ok = out_slots >= 13
        status = "PASS" if control_ok and outs_ok else "FAIL"
        if not (control_ok and outs_ok):
            all_pass = False
        print(f"  {p['name']}: Control={p['control']}, OutSlots={out_slots} [{status}]")

    # Sort hitters by OPS (OBP + SLG)
    for h in hitters:
        h['_ops'] = h['realStats']['obp'] + h['realStats']['slg']
    hitters_sorted = sorted(hitters, key=lambda h: h['_ops'], reverse=True)
    top_hitters = hitters_sorted[:5]

    print("\nTop 5 hitters by OPS:")
    for h in top_hitters:
        ob_slots = count_ob_slots(h['chart'])
        onbase_ok = h['onBase'] >= 14
        slots_ok = ob_slots >= 10
        status = "PASS" if onbase_ok and slots_ok else "FAIL"
        if not (onbase_ok and slots_ok):
            all_pass = False
        print(f"  {h['name']}: OnBase={h['onBase']}, HitBBSlots={ob_slots} [{status}]")
        del h['_ops']

    # Check league average hitter
    avg_onbase = sum(h['onBase'] for h in hitters) / len(hitters)
    avg_ok = 11 <= avg_onbase <= 12
    print(f"\nLeague average hitter OnBase: {avg_onbase:.2f} [{'PASS' if avg_ok else 'WARN'}]")

    # Validate all charts sum to 20
    print("\nChart validation:")
    invalid_charts = []
    for h in hitters:
        valid, msg = validate_chart(h['chart'])
        if not valid:
            invalid_charts.append((h['name'], 'hitter', msg))
    for p in pitchers:
        valid, msg = validate_chart(p['chart'])
        if not valid:
            invalid_charts.append((p['name'], 'pitcher', msg))

    if invalid_charts:
        print(f"  FAIL: {len(invalid_charts)} invalid charts")
        for name, ptype, msg in invalid_charts[:5]:
            print(f"    {name} ({ptype}): {msg}")
    else:
        print(f"  PASS: All {len(hitters)} hitter and {len(pitchers)} pitcher charts valid")

    # Report clamped players
    clamped_hitters = [h for h in hitters if h.get('clamped', False)]
    clamped_pitchers = [p for p in pitchers if p.get('clamped', False)]
    print(f"\nPlayers with clamped values:")
    print(f"  Hitters: {len(clamped_hitters)}")
    print(f"  Pitchers: {len(clamped_pitchers)}")

    return all_pass


def generate_sample_data():
    """Generate sample card data when API fails."""
    print("Generating sample card data...")

    # Sample hitters (based on real 2024 stars)
    sample_hitters = [
        {'id': 1, 'name': 'Aaron Judge', 'team': 'NYY', 'pa': 670, 'ab': 540, 'h': 180, 'doubles': 35, 'triples': 2, 'hr': 58, 'bb': 120, 'hbp': 5, 'so': 160, 'sb': 5, 'obp': 0.425, 'slg': 0.701, 'avg': 0.322},
        {'id': 2, 'name': 'Shohei Ohtani', 'team': 'LAD', 'pa': 680, 'ab': 590, 'h': 195, 'doubles': 40, 'triples': 4, 'hr': 54, 'bb': 80, 'hbp': 2, 'so': 145, 'sb': 55, 'obp': 0.390, 'slg': 0.646, 'avg': 0.310},
        {'id': 3, 'name': 'Juan Soto', 'team': 'NYY', 'pa': 680, 'ab': 550, 'h': 165, 'doubles': 30, 'triples': 2, 'hr': 41, 'bb': 125, 'hbp': 3, 'so': 120, 'sb': 5, 'obp': 0.419, 'slg': 0.569, 'avg': 0.288},
        {'id': 4, 'name': 'Bobby Witt Jr.', 'team': 'KC', 'pa': 700, 'ab': 635, 'h': 210, 'doubles': 45, 'triples': 11, 'hr': 32, 'bb': 55, 'hbp': 4, 'so': 135, 'sb': 30, 'obp': 0.360, 'slg': 0.588, 'avg': 0.332},
        {'id': 5, 'name': 'Mookie Betts', 'team': 'LAD', 'pa': 550, 'ab': 475, 'h': 145, 'doubles': 35, 'triples': 2, 'hr': 24, 'bb': 68, 'hbp': 4, 'so': 85, 'sb': 12, 'obp': 0.385, 'slg': 0.520, 'avg': 0.305},
        {'id': 6, 'name': 'Freddie Freeman', 'team': 'LAD', 'pa': 650, 'ab': 570, 'h': 175, 'doubles': 42, 'triples': 3, 'hr': 22, 'bb': 72, 'hbp': 5, 'so': 95, 'sb': 8, 'obp': 0.378, 'slg': 0.476, 'avg': 0.282},
        {'id': 7, 'name': 'Corey Seager', 'team': 'TEX', 'pa': 630, 'ab': 555, 'h': 165, 'doubles': 38, 'triples': 2, 'hr': 33, 'bb': 65, 'hbp': 6, 'so': 130, 'sb': 3, 'obp': 0.365, 'slg': 0.535, 'avg': 0.278},
        {'id': 8, 'name': 'Marcus Semien', 'team': 'TEX', 'pa': 680, 'ab': 615, 'h': 175, 'doubles': 35, 'triples': 3, 'hr': 28, 'bb': 55, 'hbp': 5, 'so': 140, 'sb': 20, 'obp': 0.340, 'slg': 0.480, 'avg': 0.275},
        {'id': 9, 'name': 'Trea Turner', 'team': 'PHI', 'pa': 620, 'ab': 565, 'h': 165, 'doubles': 28, 'triples': 5, 'hr': 21, 'bb': 48, 'hbp': 4, 'so': 115, 'sb': 28, 'obp': 0.340, 'slg': 0.450, 'avg': 0.280},
        {'id': 10, 'name': 'Rafael Devers', 'team': 'BOS', 'pa': 660, 'ab': 600, 'h': 180, 'doubles': 42, 'triples': 2, 'hr': 28, 'bb': 52, 'hbp': 4, 'so': 125, 'sb': 4, 'obp': 0.355, 'slg': 0.500, 'avg': 0.295},
        {'id': 11, 'name': 'Kyle Tucker', 'team': 'HOU', 'pa': 450, 'ab': 390, 'h': 115, 'doubles': 25, 'triples': 2, 'hr': 19, 'bb': 52, 'hbp': 5, 'so': 75, 'sb': 18, 'obp': 0.380, 'slg': 0.520, 'avg': 0.289},
        {'id': 12, 'name': 'Jose Ramirez', 'team': 'CLE', 'pa': 680, 'ab': 590, 'h': 170, 'doubles': 36, 'triples': 3, 'hr': 34, 'bb': 75, 'hbp': 8, 'so': 90, 'sb': 22, 'obp': 0.370, 'slg': 0.545, 'avg': 0.279},
        {'id': 13, 'name': 'Yordan Alvarez', 'team': 'HOU', 'pa': 580, 'ab': 505, 'h': 145, 'doubles': 30, 'triples': 1, 'hr': 35, 'bb': 68, 'hbp': 4, 'so': 115, 'sb': 2, 'obp': 0.385, 'slg': 0.575, 'avg': 0.283},
        {'id': 14, 'name': 'Matt Olson', 'team': 'ATL', 'pa': 680, 'ab': 590, 'h': 155, 'doubles': 30, 'triples': 1, 'hr': 36, 'bb': 78, 'hbp': 7, 'so': 165, 'sb': 2, 'obp': 0.355, 'slg': 0.510, 'avg': 0.248},
        {'id': 15, 'name': 'Pete Alonso', 'team': 'NYM', 'pa': 670, 'ab': 585, 'h': 150, 'doubles': 28, 'triples': 1, 'hr': 34, 'bb': 72, 'hbp': 8, 'so': 155, 'sb': 2, 'obp': 0.350, 'slg': 0.490, 'avg': 0.240},
        {'id': 16, 'name': 'Vladimir Guerrero Jr.', 'team': 'TOR', 'pa': 660, 'ab': 595, 'h': 175, 'doubles': 35, 'triples': 2, 'hr': 28, 'bb': 55, 'hbp': 6, 'so': 95, 'sb': 3, 'obp': 0.348, 'slg': 0.480, 'avg': 0.285},
        {'id': 17, 'name': 'Marcell Ozuna', 'team': 'ATL', 'pa': 660, 'ab': 580, 'h': 170, 'doubles': 32, 'triples': 1, 'hr': 39, 'bb': 68, 'hbp': 7, 'so': 160, 'sb': 3, 'obp': 0.370, 'slg': 0.560, 'avg': 0.290},
        {'id': 18, 'name': 'William Contreras', 'team': 'MIL', 'pa': 580, 'ab': 510, 'h': 145, 'doubles': 30, 'triples': 2, 'hr': 23, 'bb': 60, 'hbp': 6, 'so': 110, 'sb': 5, 'obp': 0.360, 'slg': 0.480, 'avg': 0.278},
        {'id': 19, 'name': 'Gunnar Henderson', 'team': 'BAL', 'pa': 680, 'ab': 595, 'h': 175, 'doubles': 38, 'triples': 3, 'hr': 37, 'bb': 72, 'hbp': 8, 'so': 175, 'sb': 8, 'obp': 0.365, 'slg': 0.545, 'avg': 0.280},
        {'id': 20, 'name': 'Bryce Harper', 'team': 'PHI', 'pa': 580, 'ab': 490, 'h': 150, 'doubles': 35, 'triples': 1, 'hr': 30, 'bb': 78, 'hbp': 8, 'so': 120, 'sb': 8, 'obp': 0.395, 'slg': 0.555, 'avg': 0.295},
        {'id': 21, 'name': 'Adolis Garcia', 'team': 'TEX', 'pa': 660, 'ab': 610, 'h': 155, 'doubles': 28, 'triples': 3, 'hr': 31, 'bb': 40, 'hbp': 6, 'so': 190, 'sb': 15, 'obp': 0.310, 'slg': 0.475, 'avg': 0.252},
        {'id': 22, 'name': 'Elly De La Cruz', 'team': 'CIN', 'pa': 580, 'ab': 525, 'h': 145, 'doubles': 25, 'triples': 8, 'hr': 25, 'bb': 45, 'hbp': 5, 'so': 200, 'sb': 65, 'obp': 0.325, 'slg': 0.480, 'avg': 0.262},
        {'id': 23, 'name': 'Ketel Marte', 'team': 'ARI', 'pa': 640, 'ab': 560, 'h': 175, 'doubles': 38, 'triples': 3, 'hr': 32, 'bb': 65, 'hbp': 10, 'so': 100, 'sb': 10, 'obp': 0.380, 'slg': 0.555, 'avg': 0.310},
        {'id': 24, 'name': 'Corbin Carroll', 'team': 'ARI', 'pa': 650, 'ab': 580, 'h': 145, 'doubles': 28, 'triples': 7, 'hr': 16, 'bb': 60, 'hbp': 5, 'so': 145, 'sb': 24, 'obp': 0.340, 'slg': 0.420, 'avg': 0.248},
        {'id': 25, 'name': 'Fernando Tatis Jr.', 'team': 'SD', 'pa': 580, 'ab': 520, 'h': 145, 'doubles': 28, 'triples': 5, 'hr': 25, 'bb': 50, 'hbp': 6, 'so': 155, 'sb': 18, 'obp': 0.345, 'slg': 0.495, 'avg': 0.275},
        {'id': 26, 'name': 'Anthony Santander', 'team': 'BAL', 'pa': 660, 'ab': 590, 'h': 160, 'doubles': 32, 'triples': 2, 'hr': 44, 'bb': 58, 'hbp': 8, 'so': 145, 'sb': 3, 'obp': 0.350, 'slg': 0.560, 'avg': 0.268},
        {'id': 27, 'name': 'Christian Yelich', 'team': 'MIL', 'pa': 540, 'ab': 460, 'h': 135, 'doubles': 30, 'triples': 3, 'hr': 15, 'bb': 72, 'hbp': 4, 'so': 100, 'sb': 22, 'obp': 0.385, 'slg': 0.455, 'avg': 0.288},
        {'id': 28, 'name': 'Julio Rodriguez', 'team': 'SEA', 'pa': 600, 'ab': 545, 'h': 150, 'doubles': 30, 'triples': 4, 'hr': 22, 'bb': 45, 'hbp': 6, 'so': 150, 'sb': 22, 'obp': 0.330, 'slg': 0.455, 'avg': 0.272},
        {'id': 29, 'name': 'Mike Trout', 'team': 'LAA', 'pa': 420, 'ab': 360, 'h': 90, 'doubles': 18, 'triples': 1, 'hr': 20, 'bb': 55, 'hbp': 3, 'so': 100, 'sb': 2, 'obp': 0.375, 'slg': 0.510, 'avg': 0.248},
        {'id': 30, 'name': 'Cal Raleigh', 'team': 'SEA', 'pa': 580, 'ab': 520, 'h': 130, 'doubles': 25, 'triples': 1, 'hr': 34, 'bb': 48, 'hbp': 8, 'so': 155, 'sb': 3, 'obp': 0.325, 'slg': 0.495, 'avg': 0.242},
        # Add more league average hitters
        {'id': 31, 'name': 'Ozzie Albies', 'team': 'ATL', 'pa': 420, 'ab': 385, 'h': 100, 'doubles': 20, 'triples': 2, 'hr': 12, 'bb': 28, 'hbp': 4, 'so': 75, 'sb': 12, 'obp': 0.318, 'slg': 0.410, 'avg': 0.258},
        {'id': 32, 'name': 'Yandy Diaz', 'team': 'TB', 'pa': 640, 'ab': 565, 'h': 160, 'doubles': 35, 'triples': 2, 'hr': 18, 'bb': 65, 'hbp': 6, 'so': 90, 'sb': 3, 'obp': 0.355, 'slg': 0.445, 'avg': 0.282},
        {'id': 33, 'name': 'Dansby Swanson', 'team': 'CHC', 'pa': 560, 'ab': 505, 'h': 130, 'doubles': 28, 'triples': 2, 'hr': 18, 'bb': 45, 'hbp': 6, 'so': 150, 'sb': 8, 'obp': 0.325, 'slg': 0.420, 'avg': 0.255},
        {'id': 34, 'name': 'Jeimer Candelario', 'team': 'CIN', 'pa': 620, 'ab': 550, 'h': 145, 'doubles': 32, 'triples': 1, 'hr': 22, 'bb': 55, 'hbp': 10, 'so': 145, 'sb': 2, 'obp': 0.342, 'slg': 0.460, 'avg': 0.260},
        {'id': 35, 'name': 'J.P. Crawford', 'team': 'SEA', 'pa': 640, 'ab': 555, 'h': 140, 'doubles': 25, 'triples': 3, 'hr': 12, 'bb': 75, 'hbp': 5, 'so': 95, 'sb': 5, 'obp': 0.345, 'slg': 0.385, 'avg': 0.252},
    ]

    # Sample pitchers (based on real 2024 stars)
    sample_pitchers = [
        {'id': 101, 'name': 'Tarik Skubal', 'team': 'DET', 'ip': 192, 'tbf': 740, 'h': 130, 'hr': 16, 'bb': 35, 'so': 228, 'era': 2.39, 'obp_against': 0.235, 'k_rate': 0.308, 'bb_rate': 0.047},
        {'id': 102, 'name': 'Chris Sale', 'team': 'ATL', 'ip': 178, 'tbf': 680, 'h': 125, 'hr': 15, 'bb': 32, 'so': 225, 'era': 2.38, 'obp_against': 0.238, 'k_rate': 0.331, 'bb_rate': 0.047},
        {'id': 103, 'name': 'Zack Wheeler', 'team': 'PHI', 'ip': 200, 'tbf': 780, 'h': 155, 'hr': 18, 'bb': 38, 'so': 210, 'era': 2.57, 'obp_against': 0.252, 'k_rate': 0.269, 'bb_rate': 0.049},
        {'id': 104, 'name': 'Logan Webb', 'team': 'SF', 'ip': 216, 'tbf': 855, 'h': 195, 'hr': 18, 'bb': 42, 'so': 178, 'era': 3.15, 'obp_against': 0.278, 'k_rate': 0.208, 'bb_rate': 0.049},
        {'id': 105, 'name': 'Seth Lugo', 'team': 'KC', 'ip': 206, 'tbf': 810, 'h': 175, 'hr': 20, 'bb': 45, 'so': 185, 'era': 3.00, 'obp_against': 0.265, 'k_rate': 0.228, 'bb_rate': 0.056},
        {'id': 106, 'name': 'Corbin Burnes', 'team': 'BAL', 'ip': 195, 'tbf': 765, 'h': 165, 'hr': 18, 'bb': 48, 'so': 190, 'era': 2.92, 'obp_against': 0.270, 'k_rate': 0.248, 'bb_rate': 0.063},
        {'id': 107, 'name': 'Cole Ragans', 'team': 'KC', 'ip': 186, 'tbf': 725, 'h': 150, 'hr': 16, 'bb': 52, 'so': 223, 'era': 3.14, 'obp_against': 0.275, 'k_rate': 0.308, 'bb_rate': 0.072},
        {'id': 108, 'name': 'Framber Valdez', 'team': 'HOU', 'ip': 198, 'tbf': 790, 'h': 180, 'hr': 14, 'bb': 55, 'so': 172, 'era': 3.38, 'obp_against': 0.295, 'k_rate': 0.218, 'bb_rate': 0.070},
        {'id': 109, 'name': 'Garrett Crochet', 'team': 'CWS', 'ip': 145, 'tbf': 570, 'h': 105, 'hr': 12, 'bb': 35, 'so': 209, 'era': 3.58, 'obp_against': 0.248, 'k_rate': 0.367, 'bb_rate': 0.061},
        {'id': 110, 'name': 'Aaron Nola', 'team': 'PHI', 'ip': 195, 'tbf': 780, 'h': 175, 'hr': 22, 'bb': 42, 'so': 195, 'era': 3.57, 'obp_against': 0.280, 'k_rate': 0.250, 'bb_rate': 0.054},
        {'id': 111, 'name': 'Tyler Glasnow', 'team': 'LAD', 'ip': 134, 'tbf': 525, 'h': 95, 'hr': 15, 'bb': 42, 'so': 168, 'era': 3.49, 'obp_against': 0.262, 'k_rate': 0.320, 'bb_rate': 0.080},
        {'id': 112, 'name': 'Ranger Suarez', 'team': 'PHI', 'ip': 178, 'tbf': 715, 'h': 165, 'hr': 15, 'bb': 50, 'so': 148, 'era': 3.46, 'obp_against': 0.300, 'k_rate': 0.207, 'bb_rate': 0.070},
        {'id': 113, 'name': 'Max Fried', 'team': 'ATL', 'ip': 174, 'tbf': 695, 'h': 165, 'hr': 12, 'bb': 48, 'so': 166, 'era': 3.25, 'obp_against': 0.305, 'k_rate': 0.239, 'bb_rate': 0.069},
        {'id': 114, 'name': 'Dylan Cease', 'team': 'SD', 'ip': 189, 'tbf': 780, 'h': 155, 'hr': 22, 'bb': 78, 'so': 224, 'era': 3.47, 'obp_against': 0.295, 'k_rate': 0.287, 'bb_rate': 0.100},
        {'id': 115, 'name': 'Michael King', 'team': 'SD', 'ip': 173, 'tbf': 695, 'h': 150, 'hr': 18, 'bb': 52, 'so': 201, 'era': 2.95, 'obp_against': 0.285, 'k_rate': 0.289, 'bb_rate': 0.075},
        {'id': 116, 'name': 'Blake Snell', 'team': 'SF', 'ip': 105, 'tbf': 440, 'h': 85, 'hr': 12, 'bb': 50, 'so': 145, 'era': 3.12, 'obp_against': 0.305, 'k_rate': 0.330, 'bb_rate': 0.114},
        {'id': 117, 'name': 'George Kirby', 'team': 'SEA', 'ip': 190, 'tbf': 765, 'h': 185, 'hr': 20, 'bb': 30, 'so': 175, 'era': 3.35, 'obp_against': 0.280, 'k_rate': 0.229, 'bb_rate': 0.039},
        {'id': 118, 'name': 'Spencer Strider', 'team': 'ATL', 'ip': 100, 'tbf': 405, 'h': 80, 'hr': 12, 'bb': 30, 'so': 130, 'era': 3.50, 'obp_against': 0.272, 'k_rate': 0.321, 'bb_rate': 0.074},
        {'id': 119, 'name': 'Justin Verlander', 'team': 'HOU', 'ip': 143, 'tbf': 590, 'h': 135, 'hr': 18, 'bb': 38, 'so': 135, 'era': 3.95, 'obp_against': 0.295, 'k_rate': 0.229, 'bb_rate': 0.064},
        {'id': 120, 'name': 'Pablo Lopez', 'team': 'MIN', 'ip': 168, 'tbf': 695, 'h': 165, 'hr': 22, 'bb': 42, 'so': 165, 'era': 4.08, 'obp_against': 0.298, 'k_rate': 0.237, 'bb_rate': 0.060},
    ]

    return sample_hitters, sample_pitchers


def main():
    parser = argparse.ArgumentParser(description='Generate Showdown cards from MLB stats')
    parser.add_argument('--season', type=int, default=DEFAULT_SEASON,
                        help=f'MLB season year (default: {DEFAULT_SEASON})')
    parser.add_argument('--output', type=str, default='../public/cards.json',
                        help='Output path for cards.json')
    args = parser.parse_args()

    print(f"Showdown Card Generator")
    print(f"Season: {args.season}")
    print("="*60)

    try:
        # Fetch data from MLB API
        hitting_data = fetch_player_stats(args.season, 'hitting')
        pitching_data = fetch_player_stats(args.season, 'pitching')

        if len(hitting_data) < 10 or len(pitching_data) < 5:
            print("Insufficient data from API, using sample data...")
            hitters_raw, pitchers_raw = generate_sample_data()
        else:
            hitters_raw = process_hitter_data(hitting_data, MIN_PA)
            pitchers_raw = process_pitcher_data(pitching_data, MIN_IP)

            if len(hitters_raw) < 20 or len(pitchers_raw) < 10:
                print("Insufficient qualified players, using sample data...")
                hitters_raw, pitchers_raw = generate_sample_data()

    except Exception as e:
        print(f"API error: {e}")
        print("Using sample data...")
        hitters_raw, pitchers_raw = generate_sample_data()

    print(f"\nProcessing {len(hitters_raw)} hitters (>= {MIN_PA} PA)")
    print(f"Processing {len(pitchers_raw)} starters (>= {MIN_IP} IP)")

    # Compute percentile ranks
    hitters_ranked = compute_hitter_percentile_ranks(hitters_raw)
    pitchers_ranked = compute_pitcher_percentile_ranks(pitchers_raw)

    # Pass 1: Generate cards with initial constants
    print("\nPass 1: Generating cards with initial constants...")
    league_constants = compute_league_constants_pass1()

    hitter_cards_p1 = [build_hitter_card(h, league_constants) for h in hitters_ranked]
    pitcher_cards_p1 = [build_pitcher_card(p, league_constants) for p in pitchers_ranked]

    # Pass 2: Recompute constants and regenerate
    print("Pass 2: Recomputing constants and regenerating...")

    hitter_data_p1 = [{'on_base': c['onBase'], 'ob_slots': c['ob_slots']} for c in hitter_cards_p1]
    pitcher_data_p1 = [{'control': c['control'], 'ob_slots': c['ob_slots']} for c in pitcher_cards_p1]

    league_constants = compute_league_constants_pass2(hitter_data_p1, pitcher_data_p1)
    print(f"  Updated constants: C_avg={league_constants['C_avg']:.2f}, OB_avg={league_constants['OB_avg']:.2f}")
    print(f"  H_ob={league_constants['H_ob']:.3f}, P_ob={league_constants['P_ob']:.3f}")

    # Final card generation
    hitter_cards = [build_hitter_card(h, league_constants) for h in hitters_ranked]
    pitcher_cards = [build_pitcher_card(p, league_constants) for p in pitchers_ranked]

    # Run sanity checks
    run_sanity_checks(hitter_cards, pitcher_cards)

    # Clean up internal fields for output
    for h in hitter_cards:
        h.pop('ob_slots', None)
        h.pop('clamped', None)
    for p in pitcher_cards:
        p.pop('ob_slots', None)
        p.pop('clamped', None)

    # Build output
    output = {
        'meta': {
            'season': args.season,
            'generatedAt': datetime.utcnow().isoformat() + 'Z',
            'formulaVersion': 'placeholder-v1'
        },
        'pitchers': pitcher_cards,
        'hitters': hitter_cards
    }

    # Write output
    output_path = os.path.join(os.path.dirname(__file__), args.output)
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    with open(output_path, 'w') as f:
        json.dump(output, f, indent=2)

    print(f"\n{'='*60}")
    print(f"Generated {len(hitter_cards)} hitter cards and {len(pitcher_cards)} pitcher cards")
    print(f"Output written to: {output_path}")


if __name__ == '__main__':
    main()
