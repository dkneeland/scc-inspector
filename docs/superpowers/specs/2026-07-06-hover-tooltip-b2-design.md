# Hover Tooltip Redesign — "B2: Buffer first, inline highlight"

**Date:** 2026-07-06
**Status:** Approved direction (mockup option B2), pending spec review
**Mockups:** https://claude.ai/code/artifact/e124621d-6759-433d-8b4d-9ac17dc9c33c

## Goal

Make the hover tooltip's buffer buildup — its most valuable content — the visual
headline, eliminate the font-size jumble of the current markdown layout, and
replace the NPP-era caret markers with an inline, theme-colored highlight of the
characters the hovered packet added.

## Non-goals

- Fixing the "tooltip moves with the mouse" complaint. That requires a pinned
  webview panel (mockup option C) and is deferred to a future project.
- Changing hover trigger behavior, hover range, or the header/timestamp hovers
  (`formatHeaderHover`, `formatTimestampHover`) beyond consistency tweaks if trivial.
- Guaranteeing exact colors. Colors come from the user's theme via TextMate
  scopes; themes that don't style a scope degrade to plain foreground text.

## Design

### 1. New hover layout (flat, buffer first)

Rendered markdown, top to bottom:

1. **Buffer fence** — a fenced code block tagged `scc-buffer` (not `text`),
   containing the buffer snapshot with the added span marked via sentinels
   (see §3). Empty buffer renders `*Buffer empty*` as an italic line instead
   of a fence.
2. **Identity line** — one line, no heading:
   `**<Title>  <summary>**  ·  ` `` `CODE` `` ` · <label>`
   e.g. `**Text  "."**  ·  ` `` `AE80` `` ` · CC2`
3. **Time line** — `` `00:00:43:18` `` ` · offset +9 packets`, omitting the
   offset when it is 0, appending ` · *frame rate not detected*` when applicable.
4. **Notes** — existing notes (duplicate-of-pair, null/padding) and the
   overflow warning stay as `>` blockquotes, at the bottom.

No `###` headings and no `**Section**` labels anywhere in the card. The
`TooltipCard` interface is restructured to make this composable:

```ts
interface TooltipCard {
    title: string;      // "Text", "Preamble Address Code", "End of Caption", …
    summary?: string;   // '"."', "Row 14 · Col 12 · White", "3 spaces", …
    code: string;       // "AE80"
    label?: string;     // "CC2"
    notes?: string[];
}
```

`formatTooltip()` owns all layout; the `switch` in `server.ts` only fills the
card fields (it stops pre-baking markdown like backticked code spans).

### 2. `scc-buffer` TextMate grammar

New contribution in `client/package.json`, following the existing `scc`
grammar pattern:

- `contributes.languages`: id `scc-buffer`, no file extensions, no aliases —
  it exists only so hover fences can reference it.
- `contributes.grammars`: language `scc-buffer`, scope `source.scc-buffer`,
  path `./scc-buffer.tmLanguage.json`.

Token scopes (chosen for near-universal theme coverage):

| Buffer piece | Pattern | Scope | Typical theme rendering |
|---|---|---|---|
| State annotations `{R14 C12 White}` | `\{[^}]*\}` | `comment.line.state.scc-buffer` | dim / italic |
| Added span | text between a ZWSP pair | `markup.inserted.scc-buffer` | green/accent |
| Sentinels themselves | `U+200B` (zero-width space) | `punctuation.definition.inserted.scc-buffer` | (zero-width, invisible) |
| Insertion-point glyph | `▏` (U+258F, left one-eighth block) | `markup.inserted.scc-buffer` | green/accent |
| Everything else | — | unscoped | default foreground |

If the spike (§5) shows `markup.inserted` is weakly supported across themes,
fall back to `keyword.control` for the added span; the grammar file is the
only place that changes.

### 3. Server: sentinels replace carets

- `formatBufferWithMarkers()` (two-string text+caret output) is **replaced** by
  a single-string formatter that wraps the added character span
  `[highlightStart, highlightEnd)` in U+200B zero-width-space sentinels.
- Control codes (`CONTROL`, `NULL`) that add no text get a `▏` glyph appended
  at the buffer end — same role as today's end-of-buffer caret.
- The caret-weaving half of `wrapTooltipLines()` (marker-line interleaving,
  caret right-alignment onto following segments) is **deleted**. Wrapping at
  `TOOLTIP_WIDTH` with the 6-space continuation indent is kept, since hover
  code fences do not soft-wrap. When a highlight spans a wrap boundary, each
  wrapped segment gets its own sentinel pair so coloring survives the wrap.
- Sentinel insertion happens **after** wrapping positions are computed, so
  zero-width characters never distort column math.

### 4. Behavior preserved

- Buffer snapshot semantics (`getBufferSnapshot`), overflow detection, and
  duplicate-pair notes are unchanged.
- All decoded-type cards (TEXT, PAC, MIDROW, CONTROL, INDENT, NULL, ERROR,
  unknown) map onto the new card fields with the same information content.
- Hover range (highlighting the hovered hex word in the editor) unchanged.

### 5. Rendering spike (do first, ~30 min)

Before implementation, hardcode one hover in a dev build to confirm in the
extension host:

1. A ```` ```scc-buffer ```` fence in a hover is colorized by the contributed grammar.
2. U+200B renders at zero width inside hover code blocks (no tofu box, no gap).
3. `markup.inserted` and `comment` are visibly distinct in Dark Modern and
   Light Modern.

**Fallback if (2) fails:** keep the caret marker line (mockup B1) but colorize
it via the same grammar (`\^+` → `markup.inserted.scc-buffer`); the caret-weaving
wrap logic is then retained. Everything else in this design still applies.

### 6. Testing

- Rewrite `sccTooltip` unit tests: sentinel placement for text spans, control
  glyph for control codes, highlight spanning a wrap boundary (sentinel pair
  per segment), empty buffer, overflow blockquote, zero-offset time line, and
  no-frame-rate variants.
- Snapshot-style assertions on full `formatTooltip()` output for one example
  of each decoded type.
- Existing decoder/analyzer tests unaffected.

## Risks

- **ZWSP rendering** — mitigated by the spike and the B1 fallback.
- **ZWSP copied out of hovers** if a user selects hover text — accepted; the
  characters are invisible and inert.
- **`scc-buffer` appears in the language picker** — accepted; it is harmless
  and matches how other extensions ship hover-only grammars.
