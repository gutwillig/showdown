# Showdown Digital

A digital resurrection of the MLB Showdown card game (2000-2005). Phase 1 delivers a card generation pipeline and a playable at-bat simulator. **Phase 2 adds real-time head-to-head multiplayer.**

## Quick Start

```bash
# Install dependencies
npm install

# Run the app (cards.json is pre-generated)
npm run dev

# Run tests
npm test
```

## Multiplayer Setup (Phase 2)

Multiplayer requires a free Supabase project for real-time communication.

### 1. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a free account
2. Create a new project (any region)
3. Wait for the project to initialize (~2 minutes)

### 2. Get Your API Keys

1. In your Supabase dashboard, go to **Settings > API**
2. Copy the **Project URL** and **anon/public** key

### 3. Configure Environment Variables

Create a `.env` file in the project root:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### 4. Enable Realtime

Supabase Realtime is enabled by default on new projects. No additional setup needed.

### How It Works

- **Host-Authoritative**: The game creator's browser owns the RNG and validates all moves
- **Relay-Only**: Supabase acts purely as a message relay (no database tables needed)
- **Reconnection**: Refresh mid-game? You'll rejoin automatically via localStorage

### Fairness Note

In the current implementation, the host controls the RNG. This is accepted for trusted-friends multiplayer. A future phase could add commit-reveal verification: host commits to a hashed seed at game start, reveals at game end, and the guest can replay-verify all rolls.

## Project Structure

```
showdown-digital/
├── cardgen/                 # Python card generation pipeline
│   ├── generate.py          # Main generator script
│   ├── formula.py           # Card formula module (SWAPPABLE)
│   └── requirements.txt     # Python dependencies
├── src/
│   ├── engine/              # Pure game engine (no React)
│   │   ├── engine.ts        # Core at-bat logic
│   │   ├── baserunning.ts   # Runner advancement rules
│   │   ├── rng.ts           # Seedable RNG (mulberry32)
│   │   └── engine.test.ts   # Unit tests
│   ├── multiplayer/         # Phase 2: Head-to-head multiplayer
│   │   ├── protocol.ts      # Message types and game state
│   │   ├── supabase.ts      # Supabase client setup
│   │   ├── connection.ts    # Channel and presence management
│   │   ├── gameState.ts     # Multiplayer state (Zustand store)
│   │   └── router.ts        # Hash-based routing
│   ├── data/                # Types and data loading
│   ├── components/          # React UI components
│   │   ├── Home.tsx         # Mode selection screen
│   │   ├── Lobby.tsx        # Draft and ready-up
│   │   ├── MultiplayerGame.tsx  # Live game screen
│   │   └── ...              # Solo mode components
│   └── store.ts             # Solo mode state management
├── public/
│   └── cards.json           # Generated card data
└── showdown-prd.md          # Product requirements
```

## Regenerating Cards

```bash
cd cardgen
pip install -r requirements.txt
python generate.py --season 2024
```

## Phase 2: Swapping the Card Formula

The card generation formula is isolated in `cardgen/formula.py`. To swap in a more rigorous approach:

### Current Interface

```python
def generate_hitter_card(player_stats: dict, league_constants: dict) -> dict:
    """
    player_stats: {
        'on_base': int,      # 7-16
        'obp': float,        # Real OBP
        'bb_rate': float,    # BB/PA
        'single_rate': float,
        'double_rate': float,
        'triple_rate': float,
        'hr_rate': float,
        'k_rate': float,
        'sb': int
    }

    Returns: {
        'chart': {...},      # d20 outcome bands
        'ob_slots': int,     # Total on-base slots
        'clamped': bool      # Whether clamps were applied
    }
    """

def generate_pitcher_card(player_stats: dict, league_constants: dict) -> dict:
    """Similar interface for pitchers."""
```

### Phase 2 Replacement

1. Create `cardgen/formula_v2.py` implementing the same interface
2. Replace the import in `generate.py`:
   ```python
   # from formula import generate_hitter_card, generate_pitcher_card
   from formula_v2 import generate_hitter_card, generate_pitcher_card
   ```
3. Update `formulaVersion` in the output metadata

The recommended Phase 2 approach (per the Showdown Bot):
- Generate candidate charts for each command value (7-16 for hitters, 1-6 for pitchers)
- Simulate each candidate against a baseline opponent
- Select the chart that minimizes error vs real OBP/SLG/OPS

## Game Rules (2002-2005 Ruleset)

### At-Bat Sequence

1. **Pitch Roll**: Roll d20, add pitcher's Control
2. **Advantage**: If pitch total > hitter's On-Base, pitcher has advantage (tie goes to hitter)
3. **Swing Roll**: Roll d20 on the advantaged player's chart
4. **Resolve**: Apply outcome per baserunning rules

### Chart Categories

**Pitcher**: PU, SO, GB, FB, BB, 1B, 2B, HR
**Hitter**: SO, GB, FB, BB, 1B, 1B+, 2B, 3B, HR

### Baserunning (Simplified)

| Result | Effect |
|--------|--------|
| PU/SO/GB | Batter out, runners hold |
| FB | Batter out, sac fly if runner on 3rd with < 2 outs |
| BB | Batter to 1st, forced runners advance |
| 1B | All runners advance 1 base |
| 1B+/2B | All runners advance 2 bases |
| 3B | All runners score |
| HR | Everyone scores |

## Tech Stack

- **Frontend**: Vite + React + TypeScript + Zustand
- **Testing**: Vitest
- **Card Gen**: Python 3 + requests

## Acceptance Criteria Status

- [x] Card generator produces valid cards.json (129 hitters, 58 pitchers)
- [x] All charts sum to exactly 20 slots
- [x] Top pitchers have Control >= 5 and >= 13 out slots
- [x] Top hitters have On-Base >= 14 and >= 10 hit+BB slots
- [x] League average hitter has On-Base 11-12
- [x] Engine tests cover all rules (27 tests passing)
- [x] Monte Carlo produces reasonable OBP (0.25-0.45 range)
- [x] Mode A (At-Bat Sandbox) fully playable
- [x] Mode B (Half-Inning) fully playable
- [x] App runs with `npm install && npm run dev`
