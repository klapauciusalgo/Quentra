# Design.md — Pixel Trading Floor (Crypto Signal Platform)

## 1. Concept

A crypto signal platform presented as a pixel-art isometric trading floor. Instead of raw charts and tables, the user watches a small "office" of pixel-art AI agents at work — each one responsible for a stage of signal generation. The visual metaphor: signals aren't just numbers, they're the output of a visible, staffed process.

This establishes the visual language of the **Quentra** concept (pixel-art isometric office, AI agent roster) repurposed for signal generation, backtested quantitative strategies, and real-time delivery.

## 2. Visual Style

- **Art style:** 16-bit / SNES-era pixel art, isometric ("2.5D") perspective, similar to classic tycoon/sim games (Theme Hospital, Stardew Valley interiors, Habbo Hotel).
- **Canvas feel:** a single open-plan office room seen from a fixed isometric angle, populated with agent desks.
- **Resolution logic:** base sprites at 32x32px, scaled 2x–3x for display crispness. No anti-aliasing on sprite edges — keep hard pixels.
- **Animation:** minimal idle-loop animations (typing, screen glow flicker, head turns) rather than full walk cycles, to keep it a "living dashboard" instead of a game.
- **Lighting:** flat ambient light with 1–2 accent light sources (e.g., glow from monitors) to keep the scene readable without complex shading.

## 3. Color Palette

Dark-room trading floor with neon monitor glow as the primary accent system.

| Role | Color | Hex |
|---|---|---|
| Background / floor | Deep slate | `#1A1D26` |
| Walls / structure | Muted navy | `#232838` |
| Desks / furniture | Warm wood brown | `#4B3B31` |
| Bullish accent | Neon green | `#39FF88` |
| Bearish accent | Neon red | `#FF4B5C` |
| Neutral / info accent | Amber | `#FFC145` |
| Primary UI text | Off-white | `#EDEDF2` |
| Secondary UI text | Cool gray | `#8A8FA3` |
| Highlight / active agent glow | Cyan | `#4FE0FF` |

Rule of thumb: the room itself stays desaturated and dark; color is reserved for signal states (bullish/bearish/neutral) and active-agent highlighting.

## 4. Agent Roster

Each agent is a pixel-art character at a desk, representing one stage of the signal pipeline. Defined in the Quentra roster, mapped to signal-generation roles:

| Agent | Desk visual | Function |
|---|---|---|
| **Researcher** | Desk with stacked papers, a magnifying glass icon | Scans news, on-chain data, and macro context for relevant coins |
| **Quant** | Desk with multiple small monitors showing candlesticks | Runs technical indicators (RSI, MA, volume, multi-timeframe checks) |
| **Trader** | Standing desk, headset, ticker tape scrolling | Converts Quant + Researcher output into a directional call (long/short/wait) |
| **Informan** | Desk near a window, "outlook board" behind them | Summarizes overall market regime/sentiment shown platform-wide |

Optional future addition: a **Risk Officer** desk that flags position sizing / confidence level per signal, if the platform later shows suggested risk tiers.

## 5. Room Layout

- **Fixed isometric room**, roughly 4 desk-zones arranged around a central walkway.
- **Informan's desk** sits nearest the "window" (back wall) — visually elevated slightly, since its output (market regime) is the ambient context for everything else.
- **Researcher and Quant** flank each other mid-room — their outputs feed directly into the Trader's desk.
- **Trader's desk** is front-and-center, closest to the "viewer," since it produces the final signal card.
- A **central floor screen/board** (like a shared whiteboard) displays the latest published signal in large pixel-art ticker style — this is the focal point of the room.
- Idle state: agents animate subtly (typing, glancing at screens). When a new signal is generated, the relevant agent's desk lights up (cyan glow) and a small pixel-art speech/notification bubble appears above their head before the signal posts to the central board.

## 6. Signal Card UI

Each generated signal is shown as a retro "terminal ticket," styled like a pixel-art printout or arcade high-score card:

- Coin ticker in large pixel font (e.g., `BTC/USDT`)
- Direction badge: green "LONG" / red "SHORT" / amber "WATCH", pixel-bordered
- Confidence meter as a small pixel health-bar (segmented blocks, not a smooth gradient)
- Key levels (entry, SL, TP) in monospace-style pixel font
- Timestamp in retro digital-clock style (7-segment display look)
- Small agent avatar icon indicating which agent(s) contributed (e.g., Quant + Trader icons stacked)

## 7. Typography

- **Display/headers:** pixel font (e.g., "Press Start 2P" style) — used sparingly for room labels and signal card headers only.
- **Body/data:** a clean monospace font for numeric data (prices, percentages, timestamps) to keep readability high — pure pixel fonts at small sizes hurt legibility for dense numbers.
- Avoid pixel font for long text blocks (news summaries, disclaimers) — reserve it for short, high-impact labels.

## 8. Interaction Model

- Clicking an agent's desk opens a side panel showing that agent's "reasoning log" in plain text (Researcher's sources, Quant's indicator readings, etc.) — pixel art stays ambient, detail lives in a clean overlay panel.
- Clicking the central board / a signal card opens the full signal detail (entry, SL/TP, rationale, historical accuracy for that setup type).
- A day/night cycle on the room (subtle) can reflect market session (Asia/EU/US) as a low-key ambient detail, not a functional control.

## 9. Open Questions / Next Steps

- Platform name finalized as **Quentra** (Algorithmic Crypto Trade Platform & Pixel Trading Floor).
- Decide whether this is web-only or also a compact widget/embed view (room may need a simplified "1 desk visible" mode for small screens).
- Define signal delivery channels (in-app board only, or also Telegram/Discord push using the same pixel-art card style).