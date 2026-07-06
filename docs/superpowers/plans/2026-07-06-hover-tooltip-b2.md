# Hover Tooltip B2 Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the SCC hover tooltip as a buffer-first flat card whose buffer buildup is syntax-colored via a contributed `scc-buffer` TextMate grammar, with the hovered packet's added characters marked by an inline zero-width-sentinel highlight instead of a caret marker line.

**Architecture:** The LSP server (`server/src/sccTooltip.ts`) emits markdown with a ```` ```scc-buffer ```` fence; the VS Code client contributes a tiny TextMate grammar that colorizes that fence in hovers. The added-character span is wrapped in U+200B zero-width-space sentinels the grammar keys on; control codes that add no text get a `▏` (U+258F) insertion-point glyph. The NPP-era caret-marker plumbing (`formatBufferWithMarkers`, the caret-weaving half of `wrapTooltipLines`) is deleted.

**Tech Stack:** TypeScript 5, vscode-languageserver 9, mocha (tdd UI), TextMate grammar JSON. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-06-hover-tooltip-b2-design.md`

## Global Constraints

- No new npm dependencies.
- Tests use mocha **tdd UI** (`suite`/`test`), compiled via the server workspace's `compile-tests` script, which lists test files **explicitly** — new test files must be added to that script.
- Tests import from `../out/sccTooltip` (compiled output), so run `npm run compile -w server` before `npm test -w server`.
- Commit messages: conventional-commit style, ending with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Sentinel char: U+200B (zero-width space), always written as the escape `\u200B` in source. Insertion glyph: `▏` (U+258F), which is visible and may stay literal in source. Tooltip wrap width stays 60 with a 6-space continuation indent.
- Task 3 is a **stop gate**: if the rendering spike fails, halt and consult the user about the B1 fallback (spec §5) before proceeding to Task 4.

---

### Task 1: Commit the in-flight baseline

The working tree already contains uncommitted tooltip/decoder changes (the pre-B2 "elegance pass" this design builds on). Commit them as the baseline so later tasks have clean diffs and the Task 3 spike hack can be reverted safely.

**Files:**
- Modify: none (commit only): `server/src/sccDecoder.ts`, `server/src/sccTooltip.ts`, `server/src/server.ts`, `server/test/analyzer.test.ts`, `server/test/decoder.test.ts`

- [ ] **Step 1: Verify the pending diff is only the expected five files**

Run: `git status --porcelain`
Expected: exactly the five `M` entries above (plus untracked noise like compiled `test/*.js`, which stays untracked). If other source files are modified, stop and ask the user.

- [ ] **Step 2: Verify tests pass on the baseline**

Run: `npm run compile -w server && npm test -w server`
Expected: all mocha tests PASS.

- [ ] **Step 3: Commit**

```bash
git add server/src/sccDecoder.ts server/src/sccTooltip.ts server/src/server.ts server/test/analyzer.test.ts server/test/decoder.test.ts
git commit -m "refactor: tooltip elegance pass for VS Code hovers

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Contribute the `scc-buffer` grammar

**Files:**
- Create: `client/scc-buffer.tmLanguage.json`
- Modify: `client/package.json` (the `contributes.languages` and `contributes.grammars` arrays, currently at lines 17–31)

**Interfaces:**
- Produces: a registered language id `scc-buffer` with scope `source.scc-buffer`. Later tasks rely on: fenced blocks tagged `scc-buffer` get colorized; `\u200B`-wrapped spans scope to `markup.inserted.scc-buffer`; `{…}` scopes to `comment.line.state.scc-buffer`; `▏` scopes to `markup.inserted.glyph.scc-buffer`.

- [ ] **Step 1: Create the grammar file**

Create `client/scc-buffer.tmLanguage.json` (note: the `\u200B` sequences below are standard JSON escapes — keep them as escape text so the file contains no invisible characters; the ▏ glyph is visible and stays literal):

```json
{
  "$schema": "https://raw.githubusercontent.com/martinring/tmlanguage/master/tmlanguage.json",
  "name": "SCC Buffer (hover)",
  "scopeName": "source.scc-buffer",
  "patterns": [
    {
      "comment": "Characters added by the hovered packet, wrapped in zero-width-space sentinels",
      "match": "(\u200B)([^\u200B]*)(\u200B)",
      "captures": {
        "1": { "name": "punctuation.definition.inserted.begin.scc-buffer" },
        "2": { "name": "markup.inserted.scc-buffer" },
        "3": { "name": "punctuation.definition.inserted.end.scc-buffer" }
      }
    },
    {
      "comment": "Decoder state annotations like {R14 C12 White}",
      "name": "comment.line.state.scc-buffer",
      "match": "\\{[^}]*\\}"
    },
    {
      "comment": "Insertion point marker for control codes that add no text",
      "name": "markup.inserted.glyph.scc-buffer",
      "match": "▏"
    }
  ]
}
```

- [ ] **Step 2: Register the language and grammar in the client manifest**

In `client/package.json`, extend `contributes.languages` and `contributes.grammars`:

```json
"languages": [
  {
    "id": "scc",
    "aliases": ["SCC", "Scenarist Closed Caption"],
    "extensions": [".scc"],
    "configuration": "./language-configuration.json"
  },
  {
    "id": "scc-buffer",
    "aliases": []
  }
],
"grammars": [
  {
    "language": "scc",
    "scopeName": "source.scc",
    "path": "./scc.tmLanguage.json"
  },
  {
    "language": "scc-buffer",
    "scopeName": "source.scc-buffer",
    "path": "./scc-buffer.tmLanguage.json"
  }
]
```

- [ ] **Step 3: Validate both JSON files parse and the escapes decoded correctly**

Run:
```bash
node -e "const g=require('./client/scc-buffer.tmLanguage.json'); const m=g.patterns[0].match; console.log(m.charCodeAt(1).toString(16), g.patterns[2].match.charCodeAt(0).toString(16)); require('./client/package.json'); console.log('OK')"
```
Expected output: `200b 258f` then `OK`.

- [ ] **Step 4: Commit**

```bash
git add client/scc-buffer.tmLanguage.json client/package.json
git commit -m "feat: contribute scc-buffer grammar for hover buffer colorization

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Rendering spike (manual gate — do not skip)

Confirms the three unknowns from spec §5 in a real extension host before any formatter code is written. Uses a throwaway hack that is reverted at the end; only a spike-result note in the spec is committed.

**Files:**
- Modify (throwaway, reverted): `server/src/sccTooltip.ts`
- Modify (kept): `docs/superpowers/specs/2026-07-06-hover-tooltip-b2-design.md` (append spike result)

- [ ] **Step 1: Apply the throwaway patch**

In `server/src/sccTooltip.ts`, `formatTooltip()`, replace the fence block:

```ts
    sections.push('');
    sections.push('**Buffer**');
    sections.push('```text');
    sections.push(...wrapped);
    sections.push('```');
    return sections.join('\n');
```

with:

```ts
    sections.push('');
    sections.push('**Buffer**');
    sections.push('```scc-buffer');
    sections.push('{R14 C12 White}  Oh\u200B.\u200B more text ▏');
    sections.push('```');
    return sections.join('\n');
```

- [ ] **Step 2: Build and launch the extension host**

Run: `npm run compile`
Then press F5 in VS Code (Launch Extension), open any file from `samples/`, and hover a hex word on a data line.

- [ ] **Step 3: Verify the three spike criteria**

1. The fence is colorized at all (i.e. `{R14 C12 White}` renders in a different color/style than `more text`) — proves hover fences use the contributed grammar.
2. No visible gap, box, or tofu around the `.` — proves U+200B renders at zero width in hover code blocks.
3. With the **Dark Modern** theme and then the **Light Modern** theme (Ctrl+K Ctrl+T): the `.` and `▏` render visibly distinct from both the `{…}` annotation and the plain text.

- [ ] **Step 4: Record the result and revert the hack**

Append to the spec under a new `## Spike result (2026-07-06)` heading: one line per criterion, pass/fail, plus the observed colors. Then:

```bash
git checkout -- server/src/sccTooltip.ts
git add docs/superpowers/specs/2026-07-06-hover-tooltip-b2-design.md
git commit -m "docs: record scc-buffer hover rendering spike result

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Gate**

If criterion 2 failed (ZWSP visible): STOP. Report to the user and propose the B1 fallback (spec §5: keep caret lines, colorize `\^+` via the grammar). Do not proceed to Task 4.
If criterion 3 failed (scopes indistinct): swap `markup.inserted` for `keyword.control` in the grammar, re-run Step 3, and note the change in the spec.

---

### Task 4: `formatBufferHighlight()` — sentinel-based buffer formatter (TDD)

Adds the new formatter alongside the old caret helpers (which Task 5 deletes), plus a dedicated tooltip test file.

**Files:**
- Modify: `server/src/sccTooltip.ts`
- Create: `server/test/tooltip.test.ts`
- Modify: `server/package.json` (the `compile-tests` script)

**Interfaces:**
- Produces (exported from `server/src/sccTooltip.ts`; Task 5's `formatTooltip` and the tests consume these):
  - `export const HIGHLIGHT_SENTINEL = '\u200B'`
  - `export const INSERTION_GLYPH = '258F'`
  - `export function formatBufferHighlight(bufferText: string, highlightStart: number, highlightEnd: number, isControl: boolean, maxWidth?: number): string[]` — returns wrapped fence lines with sentinels inserted; `[]` for empty `bufferText`.

- [ ] **Step 1: Register the new test file in the compile script**

In `server/package.json`, change:

```json
"compile-tests": "tsc test/analyzer.test.ts test/decoder.test.ts test/timecode.test.ts --outDir test --esModuleInterop --module commonjs --target ES2020 --resolveJsonModule",
```

to:

```json
"compile-tests": "tsc test/analyzer.test.ts test/decoder.test.ts test/timecode.test.ts test/tooltip.test.ts --outDir test --esModuleInterop --module commonjs --target ES2020 --resolveJsonModule",
```

- [ ] **Step 2: Write the failing tests**

Create `server/test/tooltip.test.ts`:

```ts
import * as assert from 'assert';
import {
    formatBufferHighlight,
    HIGHLIGHT_SENTINEL,
    INSERTION_GLYPH
} from '../out/sccTooltip';

const ZW = HIGHLIGHT_SENTINEL;
const stripZW = (s: string) => s.split(ZW).join('');

suite('formatBufferHighlight', () => {
    test('wraps the highlight span in a sentinel pair', () => {
        const lines = formatBufferHighlight('{R14 C12 White}  Oh.', 19, 20, false);
        assert.strictEqual(lines.length, 1);
        assert.strictEqual(lines[0], `{R14 C12 White}  Oh${ZW}.${ZW}`);
    });

    test('appends insertion glyph for control codes without a span', () => {
        const lines = formatBufferHighlight('{R14 C12 White}  Oh.', -1, -1, true);
        assert.strictEqual(lines.length, 1);
        assert.strictEqual(lines[0], `{R14 C12 White}  Oh.${INSERTION_GLYPH}`);
        assert.ok(!lines[0].includes(ZW), 'no sentinels when there is no span');
    });

    test('a valid span wins over the control glyph', () => {
        const lines = formatBufferHighlight('{R14 C12 White}  Oh.', 19, 20, true);
        assert.strictEqual(lines[0], `{R14 C12 White}  Oh${ZW}.${ZW}`);
        assert.ok(!lines[0].includes(INSERTION_GLYPH));
    });

    test('empty buffer produces no lines', () => {
        assert.deepStrictEqual(formatBufferHighlight('', -1, -1, true), []);
    });

    test('wraps at 60 chars with 6-space continuation indent', () => {
        const lines = formatBufferHighlight('A'.repeat(80), -1, -1, false);
        assert.deepStrictEqual(lines, ['A'.repeat(60), '      ' + 'A'.repeat(20)]);
    });

    test('sentinels never distort wrap geometry', () => {
        const lines = formatBufferHighlight('A'.repeat(80), 10, 20, false);
        assert.strictEqual(stripZW(lines[0]), 'A'.repeat(60));
        assert.strictEqual(stripZW(lines[1]), '      ' + 'A'.repeat(20));
    });

    test('highlight spanning a wrap boundary gets a sentinel pair per segment', () => {
        const lines = formatBufferHighlight('B'.repeat(80), 55, 65, false);
        assert.strictEqual(lines.length, 2);
        assert.strictEqual(lines[0], 'B'.repeat(55) + ZW + 'B'.repeat(5) + ZW);
        assert.strictEqual(lines[1], '      ' + ZW + 'B'.repeat(5) + ZW + 'B'.repeat(15));
    });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm run compile -w server && npm test -w server`
Expected: compile of `tooltip.test.ts` FAILS with "has no exported member 'formatBufferHighlight'" (TS2305). That is the expected red state.

- [ ] **Step 4: Implement the formatter**

In `server/src/sccTooltip.ts`, add below the `TOOLTIP_WIDTH` constant (leave the existing exports untouched for now):

```ts
export const HIGHLIGHT_SENTINEL = '\u200B';
export const INSERTION_GLYPH = '▏';

export function formatBufferHighlight(
    bufferText: string,
    highlightStart: number,
    highlightEnd: number,
    isControl: boolean,
    maxWidth: number = TOOLTIP_WIDTH
): string[] {
    const indent = '      ';
    let text = bufferText;

    if (!text) {
        return [];
    }

    const hasRange = highlightStart >= 0 && highlightEnd > highlightStart;
    if (!hasRange && isControl) {
        text += INSERTION_GLYPH;
    }

    const lines: string[] = [];
    let offset = 0;
    let isFirst = true;
    while (offset < text.length) {
        const limit = isFirst ? maxWidth : maxWidth - indent.length;
        const seg = text.slice(offset, offset + limit);
        const segStart = offset;
        const segEnd = offset + seg.length;
        let rendered = seg;
        if (hasRange) {
            const s = Math.max(highlightStart, segStart);
            const e = Math.min(highlightEnd, segEnd);
            if (e > s) {
                const localS = s - segStart;
                const localE = e - segStart;
                rendered = seg.slice(0, localS) + HIGHLIGHT_SENTINEL
                    + seg.slice(localS, localE) + HIGHLIGHT_SENTINEL
                    + seg.slice(localE);
            }
        }
        lines.push(isFirst ? rendered : indent + rendered);
        offset = segEnd;
        isFirst = false;
    }
    return lines;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run compile -w server && npm test -w server`
Expected: all tests PASS (new suite plus all pre-existing suites).

- [ ] **Step 6: Commit**

```bash
git add server/src/sccTooltip.ts server/test/tooltip.test.ts server/package.json
git commit -m "feat: sentinel-based buffer highlight formatter

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: B2 layout — rewrite `formatTooltip`, `TooltipCard`, and the server card mapping (TDD)

Switches the hover to the buffer-first flat layout, restructures `TooltipCard`, rewires the `server.ts` switch and timestamp line, and deletes the caret-era helpers and their tests. One task because the interface change makes these inseparable.

**Files:**
- Modify: `server/src/sccTooltip.ts` (replace `TooltipCard`, rewrite `formatTooltip`, delete `formatBufferWithMarkers` and `wrapTooltipLines`)
- Modify: `server/src/server.ts` (card `switch` ~lines 289–364, `timestampDesc` ~lines 368–386)
- Modify: `server/test/tooltip.test.ts` (add `formatTooltip` suite)
- Modify: `server/test/analyzer.test.ts` (delete the `caret display (reference tests)`, `wraparound (reference tests)`, and `tooltip formatting` suites at ~lines 890–1053, and remove the `import { formatBufferWithMarkers, wrapTooltipLines, formatTooltip } from '../out/sccTooltip';` line)

**Interfaces:**
- Consumes: `formatBufferHighlight`, `HIGHLIGHT_SENTINEL`, `INSERTION_GLYPH` from Task 4.
- Produces (consumed by `server.ts` and tests):

```ts
export interface TooltipCard {
    title: string;      // "Text", "Preamble Address Code", "End of Caption", …
    summary?: string;   // '"."', "Row 14 · Col 12 · White", "3 spaces", …
    code: string;       // "AE80" (always uppercased by the caller)
    label?: string;     // "CC2"
    notes?: string[];
}

export function formatTooltip(
    card: TooltipCard,
    timestampDesc: string,
    bufferText: string,
    highlightStart: number,
    highlightEnd: number,
    isControl: boolean,
    overflowInfo?: [boolean, number]
): string;

// Renders the hover's time line, e.g. "`00:00:43:18` · offset +9 packets".
// Offset segment omitted when packetIdx is 0; italic "frame rate not
// detected" note appended when frameRateDetected is false.
export function formatTimestampLine(
    displayTime: string,
    packetIdx: number,
    frameRateDetected: boolean
): string;
```

- [ ] **Step 1: Add the failing `formatTooltip` tests**

Append to `server/test/tooltip.test.ts` (and extend the import to include `formatTooltip` and `TooltipCard`):

```ts
import {
    formatBufferHighlight,
    formatTimestampLine,
    formatTooltip,
    HIGHLIGHT_SENTINEL,
    INSERTION_GLYPH,
    TooltipCard
} from '../out/sccTooltip';
```

```ts
suite('formatTooltip (B2 layout)', () => {
    const textCard: TooltipCard = { title: 'Text', summary: '"."', code: 'AE80', label: 'CC2' };
    const textArgs: [string, number, number, boolean] = ['{R14 C12 White}  Oh.', 19, 20, false];

    test('buffer fence first, then identity and time lines', () => {
        const tooltip = formatTooltip(textCard, '`00:00:43:18` · offset +9 packets', ...textArgs);
        assert.strictEqual(tooltip, [
            '```scc-buffer',
            `{R14 C12 White}  Oh${ZW}.${ZW}`,
            '```',
            '**Text  "."**  ·  `AE80` · CC2',
            '`00:00:43:18` · offset +9 packets'
        ].join('\n'));
    });

    test('no headings or section labels anywhere', () => {
        const tooltip = formatTooltip(textCard, '`00:00:43:18` · offset +9 packets', ...textArgs);
        assert.ok(!tooltip.includes('###'));
        assert.ok(!tooltip.includes('**Time**'));
        assert.ok(!tooltip.includes('**Buffer**'));
    });

    test('card without summary or label renders compact identity line', () => {
        const card: TooltipCard = { title: 'End of Caption', code: '942F' };
        const tooltip = formatTooltip(card, '`00:00:43:18`', '{R14 C12 White}  Oh.', -1, -1, true);
        assert.ok(tooltip.includes('**End of Caption**  ·  `942F`'));
        assert.ok(tooltip.includes(INSERTION_GLYPH));
    });

    test('notes render as blockquotes after the time line', () => {
        const card: TooltipCard = {
            title: 'Preamble Address Code',
            summary: 'Row 14 · Col 4 · White',
            code: '94F2',
            notes: ['Duplicate of a paired command. The decoder ignores this copy.']
        };
        const tooltip = formatTooltip(card, '`00:00:01:19` · offset +4 packets', '{R14 C04 White}Cafe', 0, 15, false);
        const lines = tooltip.split('\n');
        assert.strictEqual(lines[lines.length - 1], '> Duplicate of a paired command. The decoder ignores this copy.');
    });

    test('empty buffer renders italic placeholder, no fence', () => {
        const card: TooltipCard = {
            title: 'Null / Padding',
            code: '8080',
            notes: ['Padding or filler code. No effect on the caption buffer.']
        };
        const tooltip = formatTooltip(card, '`00:00:01:19` · offset +4 packets', '', -1, -1, true);
        assert.ok(tooltip.includes('*Buffer empty*'));
        assert.ok(!tooltip.includes('```'));
        assert.ok(tooltip.includes('> Padding or filler code. No effect on the caption buffer.'));
    });

    test('overflow warning survives an empty buffer', () => {
        const card: TooltipCard = { title: 'Null / Padding', code: '8080' };
        const tooltip = formatTooltip(card, '`00:00:01:19`', '', -1, -1, true, [true, 3]);
        assert.ok(tooltip.includes('> **Overflow:** 3 packet(s) past the next timestamp'));
        assert.ok(tooltip.includes('*Buffer empty*'));
    });
});

suite('formatTimestampLine', () => {
    test('zero offset renders just the timecode', () => {
        assert.strictEqual(formatTimestampLine('00:00:43:18', 0, true), '`00:00:43:18`');
    });

    test('singular packet offset', () => {
        assert.strictEqual(formatTimestampLine('00:00:43:10', 1, true), '`00:00:43:10` · offset +1 packet');
    });

    test('plural packet offset', () => {
        assert.strictEqual(formatTimestampLine('00:00:43:18', 9, true), '`00:00:43:18` · offset +9 packets');
    });

    test('missing frame rate appends italic note', () => {
        assert.strictEqual(
            formatTimestampLine('00:00:43:09', 9, false),
            '`00:00:43:09` · offset +9 packets · *frame rate not detected*'
        );
    });
});
```

- [ ] **Step 2: Run tests to verify the new suite fails**

Run: `npm run compile -w server && npm test -w server`
Expected: compile FAILS on `tooltip.test.ts` — the new `TooltipCard` shape (`summary`/`code`/`label`) doesn't exist yet (TS2353/TS2305 errors). Red state confirmed.

- [ ] **Step 3: Rewrite `server/src/sccTooltip.ts`**

Replace the entire file content with:

```ts
/**
 * SCC Tooltip Module
 *
 * Tooltip formatting logic for hover tooltips.
 *
 * Layout (mockup option "B2"): the buffer buildup renders first inside a
 * ```scc-buffer fence colorized by the client-contributed TextMate grammar.
 * The characters added by the hovered packet are wrapped in zero-width-space
 * sentinels the grammar scopes as markup.inserted; control codes that add no
 * text get a U+258F insertion-point glyph instead.
 */

const TOOLTIP_WIDTH = 60;

export const HIGHLIGHT_SENTINEL = '\u200B';
export const INSERTION_GLYPH = '▏';

export interface TooltipCard {
    title: string;
    summary?: string;
    code: string;
    label?: string;
    notes?: string[];
}

export function formatBufferHighlight(
    bufferText: string,
    highlightStart: number,
    highlightEnd: number,
    isControl: boolean,
    maxWidth: number = TOOLTIP_WIDTH
): string[] {
    const indent = '      ';
    let text = bufferText;

    if (!text) {
        return [];
    }

    const hasRange = highlightStart >= 0 && highlightEnd > highlightStart;
    if (!hasRange && isControl) {
        text += INSERTION_GLYPH;
    }

    const lines: string[] = [];
    let offset = 0;
    let isFirst = true;
    while (offset < text.length) {
        const limit = isFirst ? maxWidth : maxWidth - indent.length;
        const seg = text.slice(offset, offset + limit);
        const segStart = offset;
        const segEnd = offset + seg.length;
        let rendered = seg;
        if (hasRange) {
            const s = Math.max(highlightStart, segStart);
            const e = Math.min(highlightEnd, segEnd);
            if (e > s) {
                const localS = s - segStart;
                const localE = e - segStart;
                rendered = seg.slice(0, localS) + HIGHLIGHT_SENTINEL
                    + seg.slice(localS, localE) + HIGHLIGHT_SENTINEL
                    + seg.slice(localE);
            }
        }
        lines.push(isFirst ? rendered : indent + rendered);
        offset = segEnd;
        isFirst = false;
    }
    return lines;
}

export function formatTimestampLine(
    displayTime: string,
    packetIdx: number,
    frameRateDetected: boolean
): string {
    const pktWord = packetIdx === 1 ? 'packet' : 'packets';
    const offsetPart = packetIdx === 0 ? '' : ` · offset +${packetIdx} ${pktWord}`;
    const ratePart = frameRateDetected ? '' : ' · *frame rate not detected*';
    return `\`${displayTime}\`${offsetPart}${ratePart}`;
}

export function formatTooltip(
    card: TooltipCard,
    timestampDesc: string,
    bufferText: string,
    highlightStart: number,
    highlightEnd: number,
    isControl: boolean,
    overflowInfo?: [boolean, number]
): string {
    const sections: string[] = [];

    if (bufferText) {
        sections.push('```scc-buffer');
        sections.push(...formatBufferHighlight(bufferText, highlightStart, highlightEnd, isControl));
        sections.push('```');
    } else {
        sections.push('*Buffer empty*');
    }

    const summaryPart = card.summary ? `  ${card.summary}` : '';
    const labelPart = card.label ? ` · ${card.label}` : '';
    sections.push(`**${card.title}${summaryPart}**  ·  \`${card.code}\`${labelPart}`);
    sections.push(timestampDesc);

    if (overflowInfo && overflowInfo[0]) {
        sections.push(`> **Overflow:** ${overflowInfo[1]} packet(s) past the next timestamp`);
    }

    if (card.notes) {
        for (const note of card.notes) {
            sections.push(`> ${note}`);
        }
    }

    return sections.join('\n');
}
```

(`formatBufferWithMarkers` and `wrapTooltipLines` are gone.)

- [ ] **Step 4: Rewire `server/src/server.ts`**

4a. In the hover handler's `switch (decoded.type)` (~lines 289–364), replace every card construction. `lbl` (the `const lbl = decoded.label ? … : ''` line above the switch) is no longer used — delete it. New switch:

```ts
        const code = targetWord.text.toUpperCase();
        const dupNote = 'Duplicate of a paired command. The decoder ignores this copy.';

        let card: TooltipCard;
        switch (decoded.type) {
            case 'TEXT':
                card = {
                    title: 'Text',
                    summary: `"${decoded.text}"`,
                    code,
                    label: decoded.label
                };
                break;
            case 'PAC': {
                const ul = decoded.underline ? ' Und' : '';
                card = {
                    title: 'Preamble Address Code',
                    summary: `Row ${decoded.row} · Col ${decoded.col} · ${decoded.color}${ul}`,
                    code,
                    label: decoded.label,
                    notes: isDuplicateOfPair ? [dupNote] : undefined
                };
                break;
            }
            case 'MIDROW': {
                const ul2 = decoded.underline ? ' Und' : '';
                card = {
                    title: 'Mid-Row Command',
                    summary: `${decoded.color}${ul2}`,
                    code,
                    label: decoded.label,
                    notes: isDuplicateOfPair ? [dupNote] : undefined
                };
                break;
            }
            case 'CONTROL':
                card = {
                    title: decoded.name?.split('(')[0].trim() || 'Control Command',
                    code,
                    label: decoded.label,
                    notes: isDuplicateOfPair ? [dupNote] : undefined
                };
                break;
            case 'INDENT': {
                const n = decoded.spaces;
                card = {
                    title: 'Indent',
                    summary: `${n} ${n === 1 ? 'space' : 'spaces'}`,
                    code,
                    label: decoded.label,
                    notes: isDuplicateOfPair ? [dupNote] : undefined
                };
                break;
            }
            case 'NULL':
                card = {
                    title: 'Null / Padding',
                    code,
                    label: decoded.label,
                    notes: ['Padding or filler code. No effect on the caption buffer.']
                };
                break;
            case 'ERROR':
                card = {
                    title: 'Parity Error',
                    summary: decoded.desc || 'Parity error',
                    code
                };
                break;
            default:
                card = {
                    title: 'Unknown Code',
                    code
                };
        }
```

4b. Replace the `timestampDesc` construction (~lines 368–386) with:

```ts
        let displayTime = baseTime;
        if (analysis.frameRate) {
            try {
                const ts = parseTimestampStr(baseTime);
                [displayTime] = addFrames(ts.hours, ts.minutes, ts.seconds, ts.frames, packetIdx, analysis.frameRate);
            } catch {
                // Keep the raw line timestamp when frame math fails.
            }
        }
        const timestampDesc = formatTimestampLine(displayTime, packetIdx, !!analysis.frameRate);
```

4c. Update the import at the top of `server.ts`:

```ts
import { formatTooltip, formatTimestampLine, TooltipCard } from './sccTooltip';
```

- [ ] **Step 5: Delete the caret-era test suites**

In `server/test/analyzer.test.ts`:
- Delete the three suites `caret display (reference tests)` (~lines 891–958), `wraparound (reference tests)` (~lines 961–989), and `tooltip formatting` (~lines 991–1053), including their `// Ported from reference/...` comment lines.
- Delete the import: `import { formatBufferWithMarkers, wrapTooltipLines, formatTooltip } from '../out/sccTooltip';`
- Leave the `buffer snapshot (reference tests)` suite (it tests `getBufferSnapshot`, which is unchanged).

- [ ] **Step 6: Run all tests to verify green**

Run: `npm run compile -w server && npm test -w server`
Expected: all suites PASS, including the new `formatTooltip (B2 layout)` suite. Then run `npm run lint` and expect no errors.

- [ ] **Step 7: Commit**

```bash
git add server/src/sccTooltip.ts server/src/server.ts server/test/tooltip.test.ts server/test/analyzer.test.ts
git commit -m "feat: buffer-first flat hover layout with inline highlight (B2)

Replaces the NPP-era caret marker lines with zero-width-sentinel
highlights colorized by the scc-buffer grammar.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: End-to-end verification and packaging check

**Files:**
- Modify: possibly `README.md` (only if it documents the old tooltip layout/carets)

- [ ] **Step 1: Full build**

Run: `npm run compile`
Expected: tsc + esbuild bundle succeed; `client/dist/server.js` regenerated.

- [ ] **Step 2: Manual hover checklist in the extension host**

Press F5, open a file from `samples/`, and verify with the Dark Modern theme:

1. **Text packet** — hover a text hex word: buffer fence renders first; `{…}` annotations dim; the added characters colorized with no visible gap where the sentinels sit; identity line reads like `**Text  "."**  ·  AE80 · CC2`; time line beneath it; no large heading anywhere.
2. **PAC** — hover a PAC word: summary shows `Row … · Col … · Color`; duplicate-of-pair note appears as a blockquote when hovering the second copy of a doubled command.
3. **Control code** (e.g. `942c`/`942f`) — buffer shows the `▏` glyph at the end, colorized.
4. **Empty buffer** (hover `9420` right after a clear): `*Buffer empty*` italic line, no fence.
5. **Long buffer** — find/craft a line whose buffer exceeds 60 chars: wrapping indents continuations 6 spaces and highlight coloring survives the wrap.
6. Switch to **Light Modern** and spot-check case 1 again.

- [ ] **Step 3: Packaging check**

Run: `cd client && npx vsce ls --no-dependencies | grep scc-buffer`
Expected: `scc-buffer.tmLanguage.json` is listed in the package contents.

- [ ] **Step 4: README check**

Run: `grep -in "caret\|tooltip\|hover" README.md`
If the README shows the old caret-line tooltip format, update the affected lines to describe/show the new layout; otherwise no change.

- [ ] **Step 5: Commit (only if Step 4 changed anything)**

```bash
git add README.md
git commit -m "docs: update README for buffer-first hover layout

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```
