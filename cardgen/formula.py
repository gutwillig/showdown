"""
Card formula module (placeholder-v1)

This module contains the logic for generating Showdown card charts from player stats.
Phase 2 will swap this module with a best-fit search approach.

Interface:
- generate_hitter_card(player_stats: dict, league_constants: dict) -> dict
- generate_pitcher_card(player_stats: dict, league_constants: dict) -> dict
"""

from typing import Dict, List, Tuple, Optional
import math


def clamp(value: float, min_val: float, max_val: float) -> float:
    """Clamp a value between min and max."""
    return max(min_val, min(max_val, value))


def largest_remainder_round(values: List[float], target_sum: int) -> List[int]:
    """
    Round a list of floats to integers that sum to target_sum.
    Uses the largest remainder method for fairness.
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


def build_chart_bands(slot_counts: Dict[str, int], categories: List[str]) -> Dict[str, Optional[List[int]]]:
    """
    Build chart bands from slot counts.
    Categories should be in the fixed order per the rules.
    Returns mapping of category -> [start_roll, end_roll] or None.
    """
    chart = {}
    current_roll = 1

    for cat in categories:
        count = slot_counts.get(cat, 0)
        if count > 0:
            chart[cat] = [current_roll, current_roll + count - 1]
            current_roll += count
        else:
            chart[cat] = None

    return chart


def generate_hitter_card(player_stats: dict, league_constants: dict) -> dict:
    """
    Generate a hitter card from player stats.

    player_stats should contain:
    - on_base: int (7-16, already computed from OBP percentile)
    - obp: float (real OBP)
    - bb_rate: float (BB/PA)
    - single_rate: float (1B/PA)
    - double_rate: float (2B/PA)
    - triple_rate: float (3B/PA)
    - hr_rate: float (HR/PA)
    - k_rate: float (SO/PA)
    - sb: int (stolen bases)

    league_constants should contain:
    - C_avg: float (average pitcher control)
    - P_ob: float (average pitcher on-base slots / 20)
    """
    on_base = player_stats['on_base']
    obp = player_stats['obp']
    C_avg = league_constants['C_avg']
    P_ob = league_constants['P_ob']

    # Calculate advantage probability against average pitcher
    p_hitter_adv = clamp((on_base - C_avg) / 20, 0.05, 0.95)
    p_pitcher_adv = 1 - p_hitter_adv

    # Solve for on-base slots
    ob_slots = round(20 * (obp - p_pitcher_adv * P_ob) / p_hitter_adv)
    ob_slots = int(clamp(ob_slots, 4, 18))

    # Distribute on-base slots across categories
    bb_rate = player_stats.get('bb_rate', 0.08)
    single_rate = player_stats.get('single_rate', 0.15)
    double_rate = player_stats.get('double_rate', 0.04)
    triple_rate = player_stats.get('triple_rate', 0.005)
    hr_rate = player_stats.get('hr_rate', 0.03)

    total_ob_rate = bb_rate + single_rate + double_rate + triple_rate + hr_rate
    if total_ob_rate == 0:
        total_ob_rate = 0.3  # fallback

    # Determine if player gets 1B+ (15+ steals)
    has_1b_plus = player_stats.get('sb', 0) >= 15

    # Calculate raw slot proportions
    if has_1b_plus:
        # Reserve 1 slot for 1B+, reduce single_rate proportionally
        adjusted_single_rate = max(0, single_rate - (single_rate / ob_slots))
        ob_rates = [bb_rate, adjusted_single_rate, double_rate, triple_rate, hr_rate]
    else:
        ob_rates = [bb_rate, single_rate, double_rate, triple_rate, hr_rate]

    # Use largest remainder for fair distribution
    if has_1b_plus:
        distributed = largest_remainder_round(ob_rates, ob_slots - 1)
        bb_slots, single_slots, double_slots, triple_slots, hr_slots = distributed
        single_plus_slots = 1
    else:
        distributed = largest_remainder_round(ob_rates, ob_slots)
        bb_slots, single_slots, double_slots, triple_slots, hr_slots = distributed
        single_plus_slots = 0

    # Ensure HR always has at least 1 slot for power hitters
    if hr_rate > 0.04 and hr_slots == 0:
        # Steal from largest category
        slots = [bb_slots, single_slots, double_slots, triple_slots]
        max_idx = slots.index(max(slots))
        if slots[max_idx] > 1:
            slots[max_idx] -= 1
            hr_slots = 1
            bb_slots, single_slots, double_slots, triple_slots = slots

    # Calculate out slots
    out_slots = 20 - ob_slots

    k_rate = player_stats.get('k_rate', 0.20)
    non_k_out_rate = 1 - obp - k_rate
    if non_k_out_rate < 0:
        non_k_out_rate = 0.3

    total_out_rate = k_rate + non_k_out_rate
    if total_out_rate > 0:
        so_slots = round(out_slots * (k_rate / total_out_rate))
    else:
        so_slots = out_slots // 3

    batted_out_slots = out_slots - so_slots
    # Split GB/FB 50/50
    gb_slots = batted_out_slots // 2
    fb_slots = batted_out_slots - gb_slots

    # Build slot counts
    slot_counts = {
        'SO': so_slots,
        'GB': gb_slots,
        'FB': fb_slots,
        'BB': bb_slots,
        '1B': single_slots,
        '1B+': single_plus_slots,
        '2B': double_slots,
        '3B': triple_slots,
        'HR': hr_slots
    }

    # Hitter chart order: SO, GB, FB, BB, 1B, 1B+, 2B, 3B, HR
    categories = ['SO', 'GB', 'FB', 'BB', '1B', '1B+', '2B', '3B', 'HR']
    chart = build_chart_bands(slot_counts, categories)

    return {
        'chart': chart,
        'ob_slots': ob_slots,
        'clamped': ob_slots == 4 or ob_slots == 18
    }


def generate_pitcher_card(player_stats: dict, league_constants: dict) -> dict:
    """
    Generate a pitcher card from player stats.

    player_stats should contain:
    - control: int (1-6, already computed from OBP against percentile)
    - obp_against: float (opponent OBP)
    - bb_rate: float (BB/TBF)
    - single_rate: float (1B/TBF)
    - double_rate: float (2B/TBF)
    - hr_rate: float (HR/TBF)
    - k_rate: float (K%)
    - gb_rate: float (ground ball rate, optional)

    league_constants should contain:
    - OB_avg: float (average hitter on-base)
    - H_ob: float (average hitter on-base slots / 20)
    """
    control = player_stats['control']
    obp_against = player_stats['obp_against']
    OB_avg = league_constants['OB_avg']
    H_ob = league_constants['H_ob']

    # Calculate advantage probability against average hitter
    p_pitcher_adv = clamp((20 - (OB_avg - control)) / 20, 0.05, 0.95)
    p_hitter_adv = 1 - p_pitcher_adv

    # Solve for on-base slots allowed
    ob_slots = round(20 * (obp_against - p_hitter_adv * H_ob) / p_pitcher_adv)
    ob_slots = int(clamp(ob_slots, 0, 12))

    # Distribute on-base slots
    bb_rate = player_stats.get('bb_rate', 0.08)
    single_rate = player_stats.get('single_rate', 0.15)
    double_rate = player_stats.get('double_rate', 0.04)
    hr_rate = player_stats.get('hr_rate', 0.02)

    # Fold triples into doubles for pitchers
    ob_rates = [bb_rate, single_rate, double_rate + player_stats.get('triple_rate', 0), hr_rate]

    if ob_slots > 0:
        distributed = largest_remainder_round(ob_rates, ob_slots)
        bb_slots, single_slots, double_slots, hr_slots = distributed
    else:
        bb_slots = single_slots = double_slots = hr_slots = 0

    # Calculate out slots
    out_slots = 20 - ob_slots

    k_rate = player_stats.get('k_rate', 0.20)

    # SO proportional to K%
    so_slots = round(out_slots * min(k_rate * 2, 0.6))  # Scale up K% for drama
    so_slots = max(1, min(so_slots, out_slots - 2))  # At least 1, leave room for others

    remaining_outs = out_slots - so_slots

    # Split remaining: PU 15%, GB 45%, FB 40% (or use GB% if available)
    gb_rate = player_stats.get('gb_rate', 0.45)
    fb_rate = 1 - gb_rate - 0.15  # Assume 15% popups
    pu_rate = 0.15

    out_rates = [pu_rate, gb_rate, fb_rate]
    distributed_outs = largest_remainder_round(out_rates, remaining_outs)
    pu_slots, gb_slots, fb_slots = distributed_outs

    # Build slot counts
    slot_counts = {
        'PU': pu_slots,
        'SO': so_slots,
        'GB': gb_slots,
        'FB': fb_slots,
        'BB': bb_slots,
        '1B': single_slots,
        '2B': double_slots,
        'HR': hr_slots
    }

    # Pitcher chart order: PU, SO, GB, FB, BB, 1B, 2B, HR
    categories = ['PU', 'SO', 'GB', 'FB', 'BB', '1B', '2B', 'HR']
    chart = build_chart_bands(slot_counts, categories)

    return {
        'chart': chart,
        'ob_slots': ob_slots,
        'out_slots': out_slots,
        'clamped': ob_slots == 0 or ob_slots == 12
    }


def compute_league_constants_pass1() -> dict:
    """Initial league constants for pass 1."""
    return {
        'C_avg': 3.0,
        'OB_avg': 11.0,
        'H_ob': 13 / 20,  # Average hitter on-base slots
        'P_ob': 5 / 20    # Average pitcher on-base slots
    }


def compute_league_constants_pass2(hitter_cards: list, pitcher_cards: list) -> dict:
    """Recompute league constants from generated cards for pass 2."""
    if not hitter_cards or not pitcher_cards:
        return compute_league_constants_pass1()

    # Average control
    C_avg = sum(p['control'] for p in pitcher_cards) / len(pitcher_cards)

    # Average on-base
    OB_avg = sum(h['on_base'] for h in hitter_cards) / len(hitter_cards)

    # Average hitter on-base slots
    H_ob_slots = sum(h.get('ob_slots', 13) for h in hitter_cards) / len(hitter_cards)
    H_ob = H_ob_slots / 20

    # Average pitcher on-base slots
    P_ob_slots = sum(p.get('ob_slots', 5) for p in pitcher_cards) / len(pitcher_cards)
    P_ob = P_ob_slots / 20

    return {
        'C_avg': C_avg,
        'OB_avg': OB_avg,
        'H_ob': H_ob,
        'P_ob': P_ob
    }
