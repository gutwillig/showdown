"""
Showdown Bot Integration Module

This module provides an isolated interface to the open-source Showdown Bot library
(https://github.com/mgula57/mlb_showdown_card_bot). All library interactions are
contained here - nothing outside this module imports or depends on the library.

The library is installed from GitHub at a pinned commit (not PyPI, which is stale).

Key gotchas handled here (all verified empirically):
- datasource must be lowercase "manual"
- stats must be passed as a JSON string (the library parses it internally)
- Hitter stats use bref-style keys
- positions must be a dict of position code to nested dict with at least "g" key
- years_played is required (list of year strings)
- Fractional chart slots must be rounded to exactly 20 integers using largest-remainder
"""

import json
import math
from typing import Dict, List, Optional, Tuple, Any

# Pinned commit SHA for reproducibility
SHOWDOWN_BOT_COMMIT = "8d6bf763d9d8ceedd0e6037a354353cb32606ea3"

# Try to import the library - if it fails, we'll fall back to the formula
try:
    from mlb_showdown_bot.core.card.card_generation import generate_card
    SHOWDOWN_BOT_AVAILABLE = True
except ImportError:
    SHOWDOWN_BOT_AVAILABLE = False
    generate_card = None


def largest_remainder_round(values: List[float], target_sum: int) -> List[int]:
    """
    Round a list of floats to integers that sum exactly to target_sum.
    Uses the largest remainder method for fair proportional distribution.
    """
    if not values or target_sum <= 0:
        return [0] * len(values)

    total = sum(values)
    if total == 0:
        # Distribute evenly if all values are 0
        base = target_sum // len(values)
        result = [base] * len(values)
        for i in range(target_sum - sum(result)):
            result[i] += 1
        return result

    # Scale values to sum to target
    scaled = [(v / total) * target_sum for v in values]

    # Get integer parts and remainders
    floors = [int(math.floor(s)) for s in scaled]
    remainders = [(i, s - math.floor(s)) for i, s in enumerate(scaled)]

    # Sort by remainder descending
    remainders.sort(key=lambda x: x[1], reverse=True)

    # Distribute remaining slots to highest remainders
    current_sum = sum(floors)
    remaining = target_sum - current_sum

    for i in range(remaining):
        idx = remainders[i][0]
        floors[idx] += 1

    return floors


def build_hitter_stats_dict(
    name: str,
    team: str,
    year: str,
    pa: int,
    ab: int,
    h: int,
    doubles: int,
    triples: int,
    hr: int,
    bb: int,
    so: int,
    hbp: int = 0,
    ibb: int = 0,
    sf: int = 0,
    sb: int = 0,
    cs: int = 0,
    bats: str = "R",
    positions: Optional[Dict[str, int]] = None,
    games: int = 100
) -> Dict[str, Any]:
    """
    Build a Baseball-Reference-style stats dict for the Showdown Bot hitter path.

    Handles all the gotchas:
    - Uses bref-style keys (PA, AB, H, 2B, 3B, etc.)
    - Includes years_played as required list
    - Positions dict has nested structure with "g" key
    """
    singles = h - doubles - triples - hr
    tb = singles + (2 * doubles) + (3 * triples) + (4 * hr)

    # Calculate rates
    obp = (h + bb + hbp) / pa if pa > 0 else 0.320
    slg = tb / ab if ab > 0 else 0.400
    avg = h / ab if ab > 0 else 0.250
    ops = obp + slg

    # Build positions dict with nested structure (CRITICAL: must have "g" key)
    pos_dict = {}
    if positions:
        for pos, games_at_pos in positions.items():
            pos_dict[pos] = {"g": games_at_pos, "drs": 0}
    else:
        # Default to DH if no positions provided
        pos_dict["DH"] = {"g": games, "drs": 0}

    return {
        "name": name,
        "type": "Hitter",
        "team_ID": team,
        "hand": bats,
        "G": games,
        "years_played": [year],  # CRITICAL: required field, must be list of strings
        "PA": pa,
        "AB": ab,
        "H": h,
        "2B": doubles,
        "3B": triples,
        "HR": hr,
        "BB": bb,
        "IBB": ibb,
        "SO": so,
        "HBP": hbp,
        "SF": sf,
        "SB": sb,
        "CS": cs,
        "batting_avg": round(avg, 3),
        "onbase_perc": round(obp, 3),
        "slugging_perc": round(slg, 3),
        "onbase_plus_slugging": round(ops, 3),
        "positions": pos_dict
    }


def build_pitcher_stats_dict(
    name: str,
    team: str,
    year: str,
    ip: float,
    tbf: int,
    h: int,
    hr: int,
    bb: int,
    so: int,
    er: int = 0,
    hbp: int = 0,
    throws: str = "R",
    games: int = 30,
    games_started: int = 25,
    gb_rate: float = 0.45  # Ground ball rate if available
) -> Dict[str, Any]:
    """
    Build a Baseball-Reference-style stats dict for the Showdown Bot pitcher path.

    The library expects PA (same as TBF for pitchers), singles (1B), and rates.
    """
    # Estimate hit types if not provided
    hits_not_hr = h - hr
    doubles_approx = int(hits_not_hr * 0.25)
    triples_approx = int(hits_not_hr * 0.05)
    singles_approx = hits_not_hr - doubles_approx - triples_approx

    # Calculate ERA
    era = (er * 9) / ip if ip > 0 else 4.00

    # Calculate opponent batting average and OBP for the library
    ab_approx = tbf - bb - hbp  # Approximate at-bats
    batting_avg = h / ab_approx if ab_approx > 0 else 0.250
    obp = (h + bb + hbp) / tbf if tbf > 0 else 0.320

    # Calculate total bases for SLG
    tb = singles_approx + (2 * doubles_approx) + (3 * triples_approx) + (4 * hr)
    slg = tb / ab_approx if ab_approx > 0 else 0.400

    # GO/AO ratio (ground out to air out) - derived from GB rate
    # If GB rate is 0.45, then GO/AO is about 0.82 (45/55)
    go_ao = gb_rate / (1 - gb_rate) if gb_rate < 1 else 1.0

    # IF/FB ratio (infield fly to fly ball) - assume 10% of fly balls are popups
    if_fb = 0.10

    # Determine if starter or reliever based on games started ratio
    # If GS >= 50% of G, treat as starter
    is_starter = games_started >= (games * 0.5) if games > 0 else True

    # Build positions dict - CRITICAL: library expects "P" (not "SP" or "RP")
    # The library validates at line 793: is_valid_position = self.is_pitcher == ('P' == position_name)
    # Position must be exactly "P" for pitchers to be recognized
    positions = {"P": {"g": games, "drs": 0}}

    # Calculate IP/GS for starters to help with stamina calculation
    ip_per_start = ip / games_started if games_started > 0 else 0

    return {
        "name": name,
        "type": "Pitcher",
        "team_ID": team,
        "hand": throws,
        "G": games,
        "GS": games_started,
        "years_played": [year],  # CRITICAL: required field
        "PA": tbf,  # CRITICAL: library uses PA for pitchers too
        "AB": ab_approx,
        "IP": ip,
        "IP/GS": round(ip_per_start, 2),  # IP per start - helps with stamina
        "batters_faced": tbf,
        "H": h,
        "1B": singles_approx,  # Singles - library needs this
        "2B": doubles_approx,
        "3B": triples_approx,
        "HR": hr,
        "BB": bb,
        "IBB": 0,
        "SO": so,
        "HBP": hbp,
        "SF": 0,
        "SH": 0,
        "earned_run_avg": round(era, 2),
        "ERA": round(era, 2),
        "batting_avg": round(batting_avg, 3),
        "onbase_perc": round(obp, 3),
        "slugging_perc": round(slg, 3),
        "onbase_plus_slugging": round(obp + slg, 3),
        "GO/AO": round(go_ao, 2),
        "IF/FB": round(if_fb, 2),
        "positions": positions  # CRITICAL: must use "P" for pitchers
    }


def convert_chart_to_bands(
    chart_values: Dict[str, float],
    is_pitcher: bool
) -> Dict[str, Optional[List[int]]]:
    """
    Convert Showdown Bot fractional chart values to integer bands using largest-remainder.

    The library emits fractional slots (e.g. HR: 2.45). We round to exactly 20 integer
    slots, then convert to [start, end] band format.
    """
    # Define category order per the rules
    if is_pitcher:
        # Pitcher categories in order: PU, SO, GB, FB, BB, 1B, 2B, HR
        # Note: Pitchers don't have 3B or 1B+
        categories = ['PU', 'SO', 'GB', 'FB', 'BB', '1B', '2B', 'HR']
    else:
        # Hitter categories in order: SO, GB, FB, BB, 1B, 1B+, 2B, 3B, HR
        categories = ['SO', 'GB', 'FB', 'BB', '1B', '1B+', '2B', '3B', 'HR']

    # Extract fractional values in order, mapping library keys to our keys
    # The library uses slightly different naming conventions
    key_mapping = {
        'PU': ['PU', 'pu'],
        'SO': ['SO', 'so', 'K'],
        'GB': ['GB', 'gb'],
        'FB': ['FB', 'fb'],
        'BB': ['BB', 'bb', 'WALK'],
        '1B': ['1B', '1b', 'SINGLE'],
        '1B+': ['1B+', '1b+', 'SINGLE+'],
        '2B': ['2B', '2b', 'DOUBLE'],
        '3B': ['3B', '3b', 'TRIPLE'],
        'HR': ['HR', 'hr', 'HOME RUN']
    }

    fractional_values = []
    for cat in categories:
        value = 0.0
        for key in key_mapping.get(cat, [cat]):
            if key in chart_values:
                value = float(chart_values[key])
                break
        fractional_values.append(value)

    # Use largest-remainder to get exactly 20 integer slots
    integer_slots = largest_remainder_round(fractional_values, 20)

    # Convert to band format
    chart = {}
    current_roll = 1

    for i, cat in enumerate(categories):
        count = integer_slots[i]
        if count > 0:
            chart[cat] = [current_roll, current_roll + count - 1]
            current_roll += count
        else:
            chart[cat] = None

    return chart


def generate_hitter_card_via_bot(
    stats: Dict[str, Any],
    year: str = "2025",
    set_version: str = "2004"
) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    """
    Generate a hitter card using the Showdown Bot library.

    Returns: (card_dict, error_message)
    - On success: (card_dict, None)
    - On failure: (None, error_message)
    """
    if not SHOWDOWN_BOT_AVAILABLE:
        return None, "Showdown Bot library not available"

    try:
        result = generate_card(
            name=stats["name"],
            year=year,
            set=set_version,
            datasource="manual",  # CRITICAL: must be lowercase
            stats=json.dumps(stats),  # CRITICAL: must be JSON string
            print_to_cli=False,
            show_image=False,
        )

        # Check for errors
        if result.get("error"):
            return None, str(result["error"])

        card = result.get("card")
        if not card:
            return None, "No card returned from library"

        # Extract chart values - the library returns them in a nested structure
        # The exact path depends on the library version
        chart_data = None
        command_value = None

        # Try different possible paths for chart data
        if hasattr(card, 'chart'):
            chart_obj = card.chart
            if hasattr(chart_obj, 'values'):
                chart_data = chart_obj.values
            elif hasattr(chart_obj, 'chart'):
                chart_data = chart_obj.chart
            if hasattr(chart_obj, 'command'):
                command_value = chart_obj.command
        elif isinstance(card, dict):
            if 'chart' in card:
                chart_section = card['chart']
                if isinstance(chart_section, dict):
                    chart_data = chart_section.get('values', chart_section)
                    command_value = chart_section.get('command')

        if chart_data is None:
            # Try to extract from the card object directly
            if hasattr(card, 'dict'):
                card_dict = card.dict()
            elif hasattr(card, 'model_dump'):
                card_dict = card.model_dump()
            else:
                card_dict = dict(card) if isinstance(card, dict) else {}

            if 'chart' in card_dict:
                chart_section = card_dict['chart']
                if isinstance(chart_section, dict):
                    chart_data = chart_section.get('values', chart_section)
                    command_value = chart_section.get('command', command_value)

        if chart_data is None:
            return None, "Could not extract chart data from library response"

        # Convert fractional chart to integer bands
        chart_bands = convert_chart_to_bands(chart_data, is_pitcher=False)

        # Extract additional fields
        speed = None
        points = None
        positions = []

        if hasattr(card, 'speed'):
            raw_speed = card.speed
        elif isinstance(card, dict) and 'speed' in card:
            raw_speed = card['speed']
        else:
            raw_speed = None

        # Extract numeric speed value (library may return object like {speed: 17, letter: "B"})
        if raw_speed is not None:
            if isinstance(raw_speed, (int, float)):
                speed = int(raw_speed)
            elif hasattr(raw_speed, 'speed'):
                speed = int(raw_speed.speed) if raw_speed.speed else None
            elif isinstance(raw_speed, dict) and 'speed' in raw_speed:
                speed = int(raw_speed['speed']) if raw_speed['speed'] else None
            else:
                speed = None

        if hasattr(card, 'points'):
            points = card.points
        elif isinstance(card, dict) and 'points' in card:
            points = card['points']

        if hasattr(card, 'positions'):
            positions = list(card.positions) if card.positions else []
        elif isinstance(card, dict) and 'positions' in card:
            positions = list(card['positions']) if card['positions'] else []

        return {
            'chart': chart_bands,
            'onBase': command_value,
            'speed': speed,
            'points': points,
            'positions': positions,
            'source': 'showdownbot'
        }, None

    except Exception as e:
        return None, f"Exception generating card: {str(e)}"


def generate_pitcher_card_via_bot(
    stats: Dict[str, Any],
    year: str = "2025",
    set_version: str = "2004"
) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    """
    Generate a pitcher card using the Showdown Bot library.

    Returns: (card_dict, error_message)
    - On success: (card_dict, None)
    - On failure: (None, error_message)
    """
    if not SHOWDOWN_BOT_AVAILABLE:
        return None, "Showdown Bot library not available"

    try:
        result = generate_card(
            name=stats["name"],
            year=year,
            set=set_version,
            datasource="manual",  # CRITICAL: must be lowercase
            stats=json.dumps(stats),  # CRITICAL: must be JSON string
            print_to_cli=False,
            show_image=False,
        )

        # Check for errors
        if result.get("error"):
            return None, str(result["error"])

        card = result.get("card")
        if not card:
            return None, "No card returned from library"

        # Extract chart values
        chart_data = None
        command_value = None

        if hasattr(card, 'chart'):
            chart_obj = card.chart
            if hasattr(chart_obj, 'values'):
                chart_data = chart_obj.values
            elif hasattr(chart_obj, 'chart'):
                chart_data = chart_obj.chart
            if hasattr(chart_obj, 'command'):
                command_value = chart_obj.command
        elif isinstance(card, dict):
            if 'chart' in card:
                chart_section = card['chart']
                if isinstance(chart_section, dict):
                    chart_data = chart_section.get('values', chart_section)
                    command_value = chart_section.get('command')

        if chart_data is None:
            if hasattr(card, 'dict'):
                card_dict = card.dict()
            elif hasattr(card, 'model_dump'):
                card_dict = card.model_dump()
            else:
                card_dict = dict(card) if isinstance(card, dict) else {}

            if 'chart' in card_dict:
                chart_section = card_dict['chart']
                if isinstance(chart_section, dict):
                    chart_data = chart_section.get('values', chart_section)
                    command_value = chart_section.get('command', command_value)

        if chart_data is None:
            return None, "Could not extract chart data from library response"

        # Convert fractional chart to integer bands
        chart_bands = convert_chart_to_bands(chart_data, is_pitcher=True)

        # Extract additional fields
        ip = None
        points = None

        if hasattr(card, 'ip'):
            ip = card.ip
        elif isinstance(card, dict) and 'ip' in card:
            ip = card['ip']

        if hasattr(card, 'points'):
            points = card.points
        elif isinstance(card, dict) and 'points' in card:
            points = card['points']

        return {
            'chart': chart_bands,
            'control': command_value,
            'ip': ip,
            'points': points,
            'source': 'showdownbot'
        }, None

    except Exception as e:
        return None, f"Exception generating card: {str(e)}"


def is_available() -> bool:
    """Check if the Showdown Bot library is available."""
    return SHOWDOWN_BOT_AVAILABLE


def get_commit_sha() -> str:
    """Get the pinned commit SHA for the Showdown Bot library."""
    return SHOWDOWN_BOT_COMMIT
