# PRD: Showdown Digital — Phase 1 At-Bat Simulator

**Version:** 1.0
**Status:** Ready for implementation
**Intended executor:** Claude Code (autonomous build)

---

## 1. Overview

We are digitally resurrecting the core gameplay loop of MLB Showdown, the 2000-2005 Wizards of the Coast dice-and-cards baseball game. Phase 1 has two deliverables in one repo:

1. **Card generation pipeline**: a script that pulls one full MLB season of real stats for all qualified players and converts each player into a Showdown-style card (2002-2005 format) with a Control or On-Base number and a d20 outcome chart.
2. **Playable at-bat simulator**: a polished web app where the user picks a pitcher and a hitter (or a lineup), rolls the two-stage dice sequence, and watches at-bats resolve using the generated cards. Supports single at-bat mode and half-inning mode.

**Phase 1 priorities, in order:** (1) the at-bat loop is correct per the ruleset below, (2) the app is genuinely fun and polished to interact with, (3) the card numbers are directionally sensible (good pitchers get out-heavy charts, good hitters get hit-heavy charts). Statistical accuracy of the card formula is explicitly NOT a phase 1 goal. The formula must be cleanly isolated and swappable so we can replace it with a rigorous joint-optimization approach in phase 2 without touching the game engine or UI.

**Out of scope for phase 1:** strategy cards, fielding/arm/speed ratings, stolen bases, pitcher fatigue and IP tracking, double plays, pinch hitting, full 9-inning games with pitching changes, multiplayer. Do not build these. Where the data model can cheaply leave room for them (extra optional fields), do so.

---

## 2. Game Rules Specification (2002-2005 ruleset, at-bat only)

This is the authoritative rules spec for the engine. Implement exactly this.

### 2.1 Card anatomy

**Pitcher card:**
- `control`: integer, range 0-6 (typical starters 2-6)
- `chart`: a mapping of d20 rolls 1-20 to outcomes. Allowed outcome categories for pitchers, in this fixed low-to-high roll order: `PU` (popup), `SO` (strikeout), `GB` (groundball out), `FB` (flyball out), `BB` (walk), `1B` (single), `2B` (double), `HR` (home run). Pitchers do not have `3B` or `1B+` bands. Any category may have zero slots.

**Hitter card:**
- `onBase`: integer, range 7-16
- `chart`: mapping of d20 rolls 1-20 to outcomes. Allowed categories for hitters, in this fixed low-to-high roll order: `SO`, `GB`, `FB`, `BB`, `1B`, `1B+` (single, batter takes second), `2B`, `3B`, `HR`. `HR` is always the top band. Any category may have zero slots.

Charts are contiguous bands. Example hitter chart: SO 1-2, GB 3-4, FB 5-6, BB 7-10, 1B 11-15, 1B+ 16, 2B 17-18, 3B 19, HR 20.

### 2.2 The at-bat sequence

1. **Pitch roll (advantage roll).** Roll a d20. Compute `pitch = roll + pitcher.control`.
2. **Determine advantage.** If `pitch > hitter.onBase`, the PITCHER has the advantage. If `pitch <= hitter.onBase` (tie or lower), the HITTER has the advantage.
3. **Swing roll.** Roll a second d20. Look up the result on the chart of whichever card has the advantage.
4. **Resolve the outcome** per section 2.3 and advance game state.

Math sanity check the engine tests must encode: the pitcher wins advantage on any pitch roll strictly greater than `onBase - control`. So P(pitcher advantage) = `(20 - (onBase - control)) / 20`, clamped to [0, 1]. Example: Control 4 vs On-Base 10 means pitcher advantage on rolls 7-20, i.e. 70%.

### 2.3 Outcome resolution and baserunning (simplified, deterministic)

State per half-inning: `outs` (0-2), `bases` (three booleans or runner refs), `runs`, `batterIndex`.

| Result | Effect |
|---|---|
| PU, SO | Batter out. Runners hold. |
| GB | Batter out. Runners hold. (No double plays in phase 1.) |
| FB | Batter out. If a runner is on 3rd and there are fewer than 2 outs before the play, that runner scores (sac fly). Other runners hold. |
| BB | Batter to 1st. Runners advance only if forced. |
| 1B | Batter to 1st. All runners advance exactly 1 base. |
| 1B+ | Batter to 2nd. All runners advance exactly 2 bases. |
| 2B | Batter to 2nd. All runners advance exactly 2 bases. |
| 3B | Batter to 3rd. All runners score. |
| HR | Batter and all runners score. |

Runners reaching home via these rules score. Three outs ends the half-inning. Keep baserunning logic in its own pure module; phase 2 will add speed-based advancement, steals, and double plays.

### 2.4 Determinism and fairness

- Use a seedable RNG (e.g. a small PRNG like mulberry32) so at-bats can be replayed and unit tests are deterministic. UI uses a random seed by default; a debug panel can pin the seed.
- Dice are fair d20s. No house adjustments.

---

## 3. Card Generation Pipeline

### 3.1 Data source and player pool

- **Season:** 2025 MLB regular season (the most recent completed season). Make the season a config value.
- **Source:** the free MLB Stats API (`statsapi.mlb.com`), no API key required. Acceptable alternative if simpler: `pybaseball` (FanGraphs/Baseball-Reference). Prefer whichever gets the needed fields with the least friction. Cache raw responses to disk so re-runs do not re-fetch.
- **Pool:**
  - Hitters: all players with >= 400 plate appearances.
  - Pitchers: all pitchers with >= 100 innings pitched (starters only for phase 1; skip relievers).
- **Fields needed per hitter:** PA, AB, H, 2B, 3B, HR, BB, HBP, SO, OBP, SLG. Derive 1B = H - 2B - 3B - HR. Per-PA rates for each event.
- **Fields needed per pitcher:** IP, TBF (batters faced), H, HR, BB, SO, opponent OBP (or derive from H+BB+HBP over TBF), K%, BB%. Groundball/flyball ratio if easily available; otherwise assume 50/50 for out distribution.

The pipeline is a standalone Python script (`/cardgen`) that outputs a single static `cards.json` consumed by the app. The app never calls external APIs at runtime.

### 3.2 Assigning the command number (Control / On-Base)

Percentile-based, computed within the pool:

- **Hitter On-Base:** rank hitters by real OBP. Map percentile linearly onto 7-16: `onBase = 7 + round(percentile * 9)`. The league's best OBP gets 16, worst gets 7.
- **Pitcher Control:** rank pitchers by opponent OBP, inverted (lower is better). Map onto 1-6: `control = 1 + round(percentile * 5)`. Best run-prevention gets 6.

### 3.3 Building the chart (placeholder formula, phase 1)

Accuracy is secondary, but use this principled lightweight approach because it is barely more work than hand-waving and produces sensible cards. The key idea: a card's chart only matters in the fraction of at-bats where that card wins the advantage, so back out the chart from the player's real rates given an average opponent.

**League constants (compute from the pool, two-pass):**
- Pass 1 assumptions: average pitcher `C_avg = 3`, average hitter `OB_avg = 11`, average hitter chart has 13 on-base slots (`H_ob = 13/20`), average pitcher chart has 5 on-base slots (`P_ob = 5/20`).
- Pass 2: after generating all cards with pass 1 constants, recompute the four averages from the actual generated cards and regenerate once. Stop there.

**Hitter chart:**
1. Against the average pitcher: `pHitterAdv = clamp((onBase - C_avg) / 20, 0.05, 0.95)`, `pPitcherAdv = 1 - pHitterAdv`.
2. Solve for total on-base slots on the hitter's chart so expected OBP matches reality:
   `obSlots = round(20 * (OBP_real - pPitcherAdv * P_ob) / pHitterAdv)`, clamped to [4, 18].
3. Distribute `obSlots` across BB, 1B, 1B+, 2B, 3B, HR proportionally to the player's real per-PA event rates (largest-remainder rounding so slots sum exactly). Give 1B+ 1 slot (stolen from 1B) if the player had 15+ steals, else 0.
4. Remaining `20 - obSlots` are outs. Split SO vs (GB+FB) proportional to the player's K% vs non-K out rate; split GB/FB 50/50 unless batted-ball data is cheap to get.
5. Order the bands per section 2.1.

**Pitcher chart (mirror image):**
1. `pPitcherAdv = clamp((20 - (OB_avg - control)) / 20, 0.05, 0.95)`, `pHitterAdv = 1 - pPitcherAdv`.
2. `obSlotsAllowed = round(20 * (OBPagainst_real - pHitterAdv * H_ob) / pPitcherAdv)`, clamped to [0, 12].
3. Distribute allowed on-base slots across BB, 1B, 2B, HR proportional to the pitcher's real allowed-event rates (fold triples into doubles).
4. Remaining slots are outs: SO proportional to K%, remainder split PU/GB/FB (roughly 15/45/40 or use GB% if available).
5. Order bands per section 2.1.

**Guardrails:** every chart sums to exactly 20 slots. No negative slots. Log a validation report listing any player whose clamps fired.

**Swappability requirement:** the formula lives behind a single interface, e.g. `generate_card(player_stats, league_constants) -> Card`. Phase 2 replaces this module with a best-fit search (generate candidate charts for every command value, simulate vs baseline opponent, pick the chart minimizing error vs real OBP/SLG/OPS, in the spirit of the open-source Showdown Bot). Nothing outside this module may depend on formula internals.

### 3.4 cards.json schema

```json
{
  "meta": { "season": 2025, "generatedAt": "ISO-8601", "formulaVersion": "placeholder-v1" },
  "pitchers": [
    {
      "id": "mlbam-id",
      "name": "Full Name",
      "team": "LAD",
      "throws": "R",
      "control": 5,
      "ip": 7,
      "chart": { "PU": [1, 2], "SO": [3, 9], "GB": [10, 13], "FB": [14, 16], "BB": [17, 17], "1B": [18, 19], "2B": [20, 20], "HR": null },
      "realStats": { "era": 2.51, "obpAgainst": 0.262, "kPct": 0.31, "bbPct": 0.06 }
    }
  ],
  "hitters": [
    {
      "id": "mlbam-id",
      "name": "Full Name",
      "team": "NYY",
      "bats": "L",
      "onBase": 14,
      "speed": null,
      "positions": ["RF"],
      "chart": { "SO": [1, 2], "GB": [3, 4], "FB": [5, 5], "BB": [6, 9], "1B": [10, 14], "1B+": null, "2B": [15, 17], "3B": [18, 18], "HR": [19, 20] },
      "realStats": { "obp": 0.41, "slg": 0.58, "hr": 42, "avg": 0.288 }
    }
  ]
}
```

Bands are `[startRoll, endRoll]` inclusive, or `null` if the category has zero slots. `ip`, `speed`, `positions` are carried for phase 2 but unused by the phase 1 engine.

---

## 4. The Simulator App

### 4.1 Stack

- Vite + React + TypeScript. No backend; `cards.json` is a static asset.
- State: plain React state or Zustand, keep it simple.
- Testing: Vitest for the engine and baserunning modules.
- Strict separation: `engine/` (pure functions, zero React imports), `data/` (card loading, types), `ui/`.

### 4.2 Modes

**Mode A: At-Bat Sandbox (core).**
- Pick any pitcher and any hitter via searchable selects (search by name, filter by team).
- Both cards are displayed side by side as visual trading cards: name, team, command number prominent, and the full d20 chart rendered as a vertical 1-20 ladder with color-coded bands (outs muted, BB one color, hits warm colors, HR standout).
- Big "PITCH" button starts the sequence:
  1. d20 rolls with a brief animation (500-800ms), lands on the pitch roll. Show `roll + control = pitch` vs `onBase` and a clear ADVANTAGE banner sliding to the winning side. The advantaged card gets a glow; the other dims.
  2. "SWING" button (or auto-continue after a beat) rolls the second d20. The corresponding band on the advantaged card's chart ladder highlights and pulses, then the outcome banner drops (e.g. "HOME RUN", "STRIKEOUT").
- A running event log lists each at-bat result. A stats strip shows cumulative results of the current matchup session (PA, H, HR, BB, K) so users can feel the probabilities, e.g. run Pedro-type vs Bonds-type 50 times.
- "Roll x10" fast mode that resolves 10 at-bats instantly and appends to the log, for feeling out distributions.

**Mode B: Half-Inning (core).**
- Pick a pitcher and a 9-man lineup (or "auto-lineup" button that picks 9 hitters from a chosen team, ordered by OBP descending is fine).
- Standard half-inning loop with the section 2.3 state machine: diamond graphic showing baserunners, outs indicator, run counter, batter due up. Plays continue until 3 outs. Final line: runs, hits, walks.
- Same two-stage roll presentation as Mode A, plus a "fast-forward inning" toggle.

**Stretch (only if everything above is done and tested): Mode C, full 9-inning exhibition between two auto-lineups with a simple line score.** Do not let this compromise polish on A and B.

### 4.3 Look and feel

- Aesthetic direction: modern homage to early-2000s trading cards. Dark felt-green or charcoal table surface, cards with clean white faces, bold condensed numerals for the command number, subtle holofoil/gradient treatment on cards whose command is elite (control >= 5 or onBase >= 14). Have fun with it but keep the chart ladder highly legible; the chart IS the product.
- The dice deserve love: a chunky d20 with satisfying roll animation and a distinct sound-free "thunk" feel via motion. Respect `prefers-reduced-motion`.
- Mobile-friendly single-column layout; desktop shows cards side by side.

### 4.4 Nice-to-haves (cheap, include if trivial)

- Deep link to a matchup (`?p=pitcherId&h=hitterId`).
- A "card browser" page listing all generated cards sortable by command number.
- Probability readout on the matchup screen: computed P(pitcher advantage) and the resulting per-outcome probabilities for the matchup (this is pure math from the two charts; it doubles as a sanity check on the engine).

---

## 5. Acceptance Criteria

1. `cardgen` runs end to end and produces a valid `cards.json` covering all 2025 qualified hitters (>= 400 PA) and starters (>= 100 IP), every chart summing to exactly 20 slots.
2. Directional sanity spot-checks pass and are printed by the generator: the top 5 pitchers by opponent OBP all have control >= 5 and >= 13 out slots; the top 5 hitters by OPS all have onBase >= 14 and >= 10 hit+BB slots; a league-average hitter lands near onBase 11-12.
3. Engine unit tests cover: advantage math (including the Control 4 vs On-Base 10 = 70% example), tie-goes-to-hitter, chart lookup at band edges (rolls 1 and 20), every baserunning rule in the section 2.3 table, sac fly only with < 2 outs, forced vs unforced advancement on BB, half-inning termination at 3 outs, and seeded-RNG reproducibility.
4. A 10,000 at-bat Monte Carlo of an average pitcher vs average hitter yields an OBP between .250 and .400 (loose band on purpose; we only care that it is not degenerate).
5. Modes A and B are fully playable, the two-stage roll sequence reads clearly, and the app runs with `npm install && npm run dev` with cards pre-generated and committed.
6. The card formula is fully contained in one module with a documented interface, and the README explains how phase 2 swaps it.

---

## 6. Phase 2 Preview (context only, do not build)

- Rigorous card formula: candidate-chart search against a baseline opponent, best-fit on OBP/SLG/OPS, era normalization (the original game was tuned to the steroid-era run environment).
- Speed, fielding, positions, stolen bases, double plays, pitcher IP/fatigue.
- Strategy cards, deck building with the 5,000-point roster system.
- Full games, season sims, and possibly head-to-head multiplayer.
