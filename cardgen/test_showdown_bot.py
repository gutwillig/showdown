"""
Offline Fixture Tests for Showdown Bot Integration

These tests verify the manual stats injection path works correctly
without any network access. They guard against silent upstream changes
in the pinned Showdown Bot library.

Run with: pytest test_showdown_bot.py -v
"""

import pytest
import json

from showdown_bot import (
    build_hitter_stats_dict,
    build_pitcher_stats_dict,
    generate_hitter_card_via_bot,
    generate_pitcher_card_via_bot,
    is_available,
    get_commit_sha,
    largest_remainder_round,
    SHOWDOWN_BOT_COMMIT
)


# ============================================================================
# Fixture Data - Committed statlines for offline testing
# ============================================================================

# Aaron Judge 2022 MVP season (verified real stats)
JUDGE_2022_FIXTURE = {
    "name": "Aaron Judge",
    "team": "NYY",
    "year": "2022",
    "pa": 696,
    "ab": 570,
    "h": 177,
    "doubles": 28,
    "triples": 0,
    "hr": 62,
    "bb": 111,
    "so": 175,
    "hbp": 9,
    "sb": 16,
    "bats": "R",
    "games": 157
}

# Tarik Skubal 2024 Cy Young season (verified real stats)
SKUBAL_2024_FIXTURE = {
    "name": "Tarik Skubal",
    "team": "DET",
    "year": "2024",
    "ip": 192.0,
    "tbf": 740,
    "h": 131,
    "hr": 16,
    "bb": 35,
    "so": 228,
    "er": 51,
    "hbp": 3,
    "throws": "L",
    "games": 31,
    "games_started": 31,
    "gb_rate": 0.42
}


# ============================================================================
# Unit Tests - Largest Remainder Rounding
# ============================================================================

class TestLargestRemainderRound:
    """Tests for the largest remainder rounding algorithm."""

    def test_basic_rounding(self):
        """Test basic proportional rounding."""
        values = [2.3, 3.4, 4.3]  # Sum = 10.0
        result = largest_remainder_round(values, 10)
        assert sum(result) == 10
        assert result == [2, 3, 5] or result == [2, 4, 4]  # Either is valid

    def test_sum_to_20(self):
        """Test that result always sums to 20 for chart slots."""
        values = [0.5, 2.7, 4.8, 5.2, 3.3, 1.5, 1.0, 0.5, 0.5]
        result = largest_remainder_round(values, 20)
        assert sum(result) == 20

    def test_zero_values(self):
        """Test handling of all-zero values."""
        values = [0, 0, 0, 0]
        result = largest_remainder_round(values, 20)
        assert sum(result) == 20

    def test_empty_list(self):
        """Test handling of empty list."""
        result = largest_remainder_round([], 20)
        assert result == []

    def test_single_value(self):
        """Test single value gets all slots."""
        result = largest_remainder_round([1.0], 20)
        assert result == [20]


# ============================================================================
# Unit Tests - Stats Dict Builders
# ============================================================================

class TestBuildHitterStatsDict:
    """Tests for hitter stats dictionary builder."""

    def test_required_fields_present(self):
        """Test all required fields are in the output."""
        stats = build_hitter_stats_dict(**JUDGE_2022_FIXTURE)

        # Critical fields per PRD gotchas
        assert "years_played" in stats
        assert isinstance(stats["years_played"], list)
        assert stats["years_played"] == ["2022"]

        assert "positions" in stats
        assert isinstance(stats["positions"], dict)

        # Position must have nested dict with "g" key
        for pos, pos_stats in stats["positions"].items():
            assert isinstance(pos_stats, dict)
            assert "g" in pos_stats

        assert stats["type"] == "Hitter"
        assert "hand" in stats

    def test_stat_calculations(self):
        """Test derived stats are calculated correctly."""
        stats = build_hitter_stats_dict(**JUDGE_2022_FIXTURE)

        # OBP = (H + BB + HBP) / PA = (177 + 111 + 9) / 696 = 0.427
        assert abs(stats["onbase_perc"] - 0.427) < 0.01

        # AVG = H / AB = 177 / 570 = 0.311
        assert abs(stats["batting_avg"] - 0.311) < 0.01


class TestBuildPitcherStatsDict:
    """Tests for pitcher stats dictionary builder."""

    def test_required_fields_present(self):
        """Test all required fields are in the output."""
        stats = build_pitcher_stats_dict(**SKUBAL_2024_FIXTURE)

        assert "years_played" in stats
        assert isinstance(stats["years_played"], list)
        assert stats["years_played"] == ["2024"]

        assert stats["type"] == "Pitcher"
        assert "PA" in stats  # Must have PA for library
        assert stats["PA"] == SKUBAL_2024_FIXTURE["tbf"]

    def test_stat_calculations(self):
        """Test derived stats are calculated correctly."""
        stats = build_pitcher_stats_dict(**SKUBAL_2024_FIXTURE)

        # ERA = (ER * 9) / IP = (51 * 9) / 192 = 2.39
        assert abs(stats["ERA"] - 2.39) < 0.1


# ============================================================================
# Integration Tests - Offline Card Generation
# ============================================================================

@pytest.mark.skipif(not is_available(), reason="Showdown Bot not installed")
class TestOfflineCardGeneration:
    """
    Offline integration tests for the Showdown Bot manual stats injection path.

    These tests run with no network access (datasource="manual") and verify
    that committed fixture statlines produce valid cards.
    """

    def test_hitter_card_generation_offline(self):
        """
        Test hitter card generation with manual stats injection.

        Acceptance Criteria 2b: The stats-injection path has an offline unit test
        that produces a valid 20-slot card with no network access.
        """
        stats = build_hitter_stats_dict(**JUDGE_2022_FIXTURE)
        result, error = generate_hitter_card_via_bot(stats, year="2022")

        # Should succeed without error
        assert error is None, f"Card generation failed: {error}"
        assert result is not None

        # Should have valid chart
        chart = result.get("chart")
        assert chart is not None, "No chart in result"

        # Chart must sum to exactly 20 slots
        total_slots = 0
        for cat, band in chart.items():
            if band is not None:
                slots = band[1] - band[0] + 1
                total_slots += slots
                # Bands must be valid ranges
                assert band[0] >= 1, f"Band start < 1: {cat} = {band}"
                assert band[1] <= 20, f"Band end > 20: {cat} = {band}"
                assert band[0] <= band[1], f"Invalid band range: {cat} = {band}"

        assert total_slots == 20, f"Chart has {total_slots} slots, expected 20"

        # Should have valid command value
        on_base = result.get("onBase")
        assert on_base is not None, "No onBase in result"
        assert 7 <= on_base <= 16, f"OnBase {on_base} out of valid range [7,16]"

        # Elite player should have high on-base
        # Judge 2022 was an MVP season, expect OnBase >= 12
        assert on_base >= 12, f"Elite player OnBase too low: {on_base}"

    def test_pitcher_card_generation_offline(self):
        """
        Test pitcher card generation with manual stats injection.
        """
        stats = build_pitcher_stats_dict(**SKUBAL_2024_FIXTURE)
        result, error = generate_pitcher_card_via_bot(stats, year="2024")

        # Should succeed without error
        assert error is None, f"Card generation failed: {error}"
        assert result is not None

        # Should have valid chart
        chart = result.get("chart")
        assert chart is not None, "No chart in result"

        # Chart must sum to exactly 20 slots
        total_slots = 0
        for cat, band in chart.items():
            if band is not None:
                slots = band[1] - band[0] + 1
                total_slots += slots

        assert total_slots == 20, f"Chart has {total_slots} slots, expected 20"

        # Should have valid command value
        control = result.get("control")
        assert control is not None, "No control in result"
        assert 1 <= control <= 6, f"Control {control} out of valid range [1,6]"

        # Elite pitcher should have high control
        # Skubal 2024 was a Cy Young season, expect Control >= 4
        assert control >= 4, f"Elite pitcher Control too low: {control}"

    def test_library_commit_pinned(self):
        """
        Test that the library commit SHA is as expected.

        Guards against silent upstream changes - if someone updates
        the library without updating the pinned commit, this will fail.
        """
        expected_commit = "8d6bf763d9d8ceedd0e6037a354353cb32606ea3"
        actual_commit = get_commit_sha()

        assert actual_commit == expected_commit, (
            f"Library commit mismatch! "
            f"Expected {expected_commit}, got {actual_commit}. "
            "If this is intentional, update SHOWDOWN_BOT_COMMIT in showdown_bot.py"
        )

    def test_source_tracking(self):
        """Test that source is correctly tracked as 'showdownbot'."""
        stats = build_hitter_stats_dict(**JUDGE_2022_FIXTURE)
        result, error = generate_hitter_card_via_bot(stats)

        assert error is None
        assert result.get("source") == "showdownbot"


# ============================================================================
# Run tests
# ============================================================================

if __name__ == "__main__":
    pytest.main([__file__, "-v"])
