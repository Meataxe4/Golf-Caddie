# AI Golf Caddie

An AI-powered golf caddie that provides real-time, context-aware shot recommendations. Think of it as a tour-level caddie + data scientist + coach — in your pocket.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    UI Layer (React)                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐  │
│  │ ShotCard │  │ Strategy │  │ Analysis │  │  Hole  │  │
│  │          │  │  Panel   │  │  Panel   │  │  Info  │  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └───┬────┘  │
├───────┼──────────────┼───────────┼──────────────┼───────┤
│       │              │           │              │       │
│  ┌────▼──────────────▼───────────▼──────────────▼────┐  │
│  │              AICaddie (Orchestrator)               │  │
│  └──┬─────┬──────┬──────┬──────┬──────┬─────────────┘  │
│     │     │      │      │      │      │                 │
│  ┌──▼──┐┌─▼───┐┌─▼───┐┌─▼───┐┌─▼───┐┌─▼──────────┐   │
│  │Shot ││Cour-││Post ││Risk ││Voice││  Pattern   │   │
│  │Rec. ││se   ││Round││Heat-││Cadd-││  Detector  │   │
│  │Eng. ││Strat││Anal.││map  ││ie   ││            │   │
│  └──┬──┘└─┬───┘└──┬──┘└──┬──┘└─┬───┘└────┬──────┘   │
├─────┼─────┼───────┼──────┼─────┼─────────┼──────────┤
│  ┌──▼─────▼───────▼──────▼─────▼─────────▼────────┐  │
│  │             Player Model (Adaptive)              │  │
│  │   ┌──────────┐  ┌──────────┐  ┌──────────────┐  │  │
│  │   │  Club    │  │  Shot    │  │  Dispersion   │  │  │
│  │   │  Stats   │  │  History │  │  Ellipse      │  │  │
│  │   └──────────┘  └──────────┘  └──────────────┘  │  │
│  └────────────────────────────────────────────────┘  │
├──────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐   │
│  │ Physics  │  │  Stats   │  │  Weather Service  │   │
│  │ Engine   │  │  Utils   │  │  (API Adapter)    │   │
│  └──────────┘  └──────────┘  └──────────────────┘   │
└──────────────────────────────────────────────────────┘
```

## Core Algorithms

### Shot Recommendation Engine
The engine evaluates every viable club by:
1. Adjusting distances for weather (air density, wind, temperature, altitude)
2. Applying lie condition modifiers (distance loss, dispersion increase)
3. Computing 2D dispersion ellipse intersection with green/hazard zones
4. Calculating expected strokes using probability-weighted outcomes
5. Selecting the option with lowest expected strokes

### Smart Targeting
Instead of always aiming at the pin, the system:
- Accounts for the player's miss pattern (e.g., "you miss right 40% of the time")
- Shifts the aim point away from hazards on the player's miss side
- Compensates for systematic distance/lateral bias
- Adjusts for wind drift

### Player Model
Uses Welford's online algorithm for continuous learning:
- Tracks running mean and standard deviation per club
- Updates miss tendencies with exponential decay (recent shots weighted higher)
- Builds confidence scores based on sample size (sigmoid approaching 1.0 at 30+ shots)

## Features

### Differentiating Features (Beyond Competitors)
1. **Real-Time Risk Heatmaps** — Spatial expected-strokes overlay showing danger zones and optimal landing areas
2. **Voice Caddie** — Natural language recommendations via Web Speech API, designed for hands-free play
3. **Pressure Mode** — Adjusts recommendations based on competition context (match play status, closing holes, tournament pressure)
4. **Pattern Detection** — Identifies hot/cold streaks, hole-type weaknesses, and closing-hole performance degradation
5. **Explainable AI** — Every recommendation includes detailed reasoning, not just "hit 7 iron"

### Core Features
- Shot recommendation with probabilistic EV optimization
- 2D dispersion ellipse-based smart targeting
- Course strategy engine (hole-by-hole pre-round planning)
- Strokes gained analysis (Broadie methodology)
- Adaptive player modeling with continuous learning
- Weather-adjusted distance calculations (air density, wind, altitude)

## Quick Start

```bash
npm install
npm run dev        # Start the UI
npm run simulate   # Run a CLI round simulation
npm run test       # Run tests
```

## Tech Stack
- TypeScript (strict mode)
- React 18 + Vite
- Vitest for testing
- No external AI/ML dependencies — pure algorithmic intelligence

## API Integration Points
- **Weather**: OpenWeatherMap One Call 3.0 (adapter included)
- **Course Data**: GPS coordinates per hole (pluggable data layer)
- **Shot Tracking**: Manual input or GPS-based auto-detection

## Monetization Ideas
1. **Freemium**: Basic recommendations free, advanced analytics (strokes gained, pattern detection) behind subscription
2. **Premium Insights**: AI-generated practice plans based on weakness analysis ($9.99/mo)
3. **Course Partnerships**: Sell course-specific strategy guides
4. **Hardware Integration**: Partner with GPS watch/rangefinder manufacturers
5. **Tournament Mode**: Premium feature for competitive golfers ($4.99/round)
