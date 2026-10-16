# Penny brand 1.7.1 (publisher: Akrot)

## Research basis (2026 sources)
- Simplicity with one distinctive choice: "restraint plus one defining choice" (ManyPixels, Logo Design Trends 2026).
- Logos as systems: must work in app icon, UI and tiny sizes; test before finalising.
- Fewer colours, used deliberately; high contrast in light and dark (ManyPixels; icon trends: 3:1 minimum, dark variants).
- Finance palettes: blue is the most common (about 40% of 42 audited finance design systems), green is the "money" colour (about 21%). Penny leaves the blue crowd for green.
Sources: manypixels.co/blog/brand-design/logo-design-trends, lazyweb.com/research/what-brand-colors-do-finance-apps-use, iconly.ai/blog/icon-trends-2026

## Identity
- Mark: a "P" whose bowl is a coin, with a solid dot (the penny) inside. Strokes only, round caps, no gradient.
- Penny green `#0A7F66` (white text 4.95:1). Dark-surface text variant: accent mixed 45% with white. Copper `#D98A4E` is the secondary (only in the "Penny" background).
- Ink `#0B1210`. Type: Inter / system UI. Tagline: "Every cent, in focus."
- Single source: `brand/build_brand.py` (`MARK_PATHS`). Run `python3 brand/build_brand.py` to rebuild icons, tray, installer bitmaps, SVG kit and `renderer/logo-mark.js`.

## Migration
Users still on the old default blue are moved to Penny green once (`settings.brand2`). Custom accent choices are kept.
