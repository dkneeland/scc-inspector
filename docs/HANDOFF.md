# Phase 1 Hardening: Handoff for Phase 2 Readiness

Phase 1 (Buffer State Machine) is functionally complete — all 246 tests pass, the analyzer is wired into the server, and hover tooltips work end-to-end. However, several gaps remain that will cause friction in Phase 2 (Diagnostics) and beyond. This document describes each gap, why it matters, and exactly how to fix it.

**Rule: Do not start Phase 2 until every item here is done and all tests still pass.**

---

## 1. Analyzer needs `collectDiagnostics()` support data

### Problem

Phase 2's `collectDiagnostics()` needs to iterate all lines and produce diagnostic objects for six error types (SCC001–SCC006). The current `AnalysisResult` provides `timeMap`, `timestampMap`, `neverDisplayedLines`, and `lineTexts` — but it's missing data needed for three of the six diagnostics:

| Diagnostic | What's needed | Currently available? |
|---|---|---|
| SCC001 Parity errors | Per-word parity check results | No — must call `checkParityFast()` per word during diagnostic collection |
| SCC002 Invalid timestamps | Timestamp validation per line | No — must call `validateTimestamp()` per line during diagnostic collection |
| SCC003 Buffer overflow | Overflow detection per line | Yes — `checkOverflow(lineNum)` exists |
| SCC004 Never-displayed captions | Lines with no startTime | Yes — `neverDisplayedLines` array |
| SCC005 Caption never erased | Lines with startTime but no endTime | Partially — `timeMap` has the data but there's no `neverErasedLines` convenience property |
| SCC006 Non-monotonic timestamps | Timestamps that go backwards | No — must compare consecutive timestamps |

### What to do

**Step 1a:** Add a `neverErasedLines` array to `AnalysisResult`. In `_performAnalysis()`, after building the time map, add:

```typescript
const neverErasedLines: number[] = [];
for (const [lineNum, tr] of timeMap) {
    if (tr.startTime !== null && tr.endTime === null) {
        neverErasedLines.push(lineNum);
    }
}
```

Add `neverErasedLines` to the `AnalysisResult` interface and return value.

**Step 1b:** Add a `nonMonotonicLines` array to `AnalysisResult`. In `_performAnalysis()`, after building `timestampMap`, compare consecutive timestamps:

```typescript
const nonMonotonicLines: number[] = [];
const sortedKeys = [...timestampMap.keys()].sort((a, b) => a - b);
for (let i = 1; i < sortedKeys.length; i++) {
    const prevEntry = timestampMap.get(sortedKeys[i - 1])!;
    const currEntry = timestampMap.get(sortedKeys[i])!;
    try {
        if (compareTimestamps(currEntry.timestampStr, prevEntry.timestampStr) < 0) {
            nonMonotonicLines.push(sortedKeys[i]);
        }
    } catch {
        // Skip comparison if timestamp parsing fails
    }
}
```

Add `nonMonotonicLines` to `AnalysisResult`.

**Step 1c:** Add tests:
- `neverErasedLines`: caption with startTime (EOC fired) but no EDM in file → line appears in `neverErasedLines`
- `neverErasedLines`: caption with both EOC and EDM → not in `neverErasedLines`
- `nonMonotonicLines`: file with decreasing timestamp → that line is in `nonMonotonicLines`
- `nonMonotonicLines`: file with normal ascending timestamps → array is empty

**Files to modify:**
- `server/src/sccAnalyzer.ts` — `AnalysisResult` interface, `_performAnalysis()` method
- `server/test/analyzer.test.ts` — new test suite

---

## 2. Overflow detection recalculates `sortedKeys` every call

### Problem

`checkOverflow()` (line 423) does `[...timestampMap.keys()].sort()` on every invocation. Phase 2 will call `checkOverflow()` for **every line in the file** when collecting diagnostics. For a 5,000-line SCC file with ~2,500 data lines, that's 2,500 sorts of a 2,500-element array.

### What to do

Cache `sortedKeys` as part of `AnalysisResult`:

```typescript
export interface AnalysisResult {
    // ... existing fields ...
    sortedLineNums: number[];  // timestampMap keys, sorted ascending
}
```

In `_performAnalysis()`, compute once:

```typescript
const sortedLineNums = [...timestampMap.keys()].sort((a, b) => a - b);
```

In `checkOverflow()`, replace:

```typescript
// Before:
const sortedKeys = [...timestampMap.keys()].sort((a, b) => a - b);
const currentIdx = sortedKeys.indexOf(lineNum);

// After:
const sortedKeys = this.analysis.sortedLineNums;
const currentIdx = sortedKeys.indexOf(lineNum);
```

Further optimization (optional): replace `indexOf` with binary search since the array is sorted. But the sort caching alone is sufficient for now.

**Files to modify:**
- `server/src/sccAnalyzer.ts` — `AnalysisResult` interface, `_performAnalysis()`, `checkOverflow()`

---

## 3. `checkOverflow()` re-splits `rawText` on every call

### Problem

Line 447 of `sccAnalyzer.ts`:

```typescript
const lines = this.rawText.split(/\r?\n/);
```

This splits the entire file text every time `checkOverflow()` is called. Same concern as item 2 — Phase 2 calls this for every line.

### What to do

Cache the split lines array. Add a private field:

```typescript
private lines: string[] = [];
```

Set it in `analyze()`:

```typescript
analyze(text: string): AnalysisResult {
    const newHash = createHash('md5').update(text).digest('hex');
    if (this.analysis && this.contentHash === newHash) {
        return this.analysis;
    }
    this.rawText = text;
    this.lines = text.split(/\r?\n/);  // Cache once
    this.contentHash = newHash;
    this.analysis = this._performAnalysis(text);
    return this.analysis;
}
```

Then replace all `this.rawText.split(/\r?\n/)` calls in `getBufferSnapshot()` (line 201) and `checkOverflow()` (line 447) with `this.lines`.

**Files to modify:**
- `server/src/sccAnalyzer.ts` — new private field, `analyze()`, `getBufferSnapshot()`, `checkOverflow()`

---

## 4. Missing `collectDiagnostics()` method on `SccDocument`

### Problem

Phase 2's execution guide (Step 2.2) says to create a `collectDiagnostics()` function. Right now, `SccDocument` has no method that returns diagnostic-ready data. The Phase 2 agent will need to either:
- (A) Add `collectDiagnostics()` to `SccDocument` (cleaner), or
- (B) Build diagnostics in `server.ts` by querying `getAnalysis()` and doing its own iteration

Option A is cleaner because the analyzer already has all the data. Add a method that returns raw diagnostic info (not LSP `Diagnostic` objects — keep LSP concerns in `server.ts`).

### What to do

Add a method to `SccDocument`:

```typescript
export interface DiagnosticInfo {
    lineNum: number;
    startChar: number;
    endChar: number;
    code: string;       // "SCC001" through "SCC006"
    message: string;
    severity: 'error' | 'warning' | 'info';
}

collectDiagnostics(): DiagnosticInfo[] {
    if (!this.analysis) return [];
    const diagnostics: DiagnosticInfo[] = [];

    for (const [lineNum, lineText] of this.analysis.lineTexts) {
        // SCC001: Parity errors
        // SCC002: Invalid timestamps
        // SCC003: Buffer overflow
    }

    // SCC004: Never-displayed captions (from neverDisplayedLines)
    // SCC005: Never-erased captions (from neverErasedLines — item 1 above)
    // SCC006: Non-monotonic timestamps (from nonMonotonicLines — item 1 above)

    return diagnostics;
}
```

This is a **stub** — Phase 2 will fill in the logic. But having the interface and empty method defined now means Phase 2 can focus on the diagnostic rules without restructuring the analyzer.

**Files to modify:**
- `server/src/sccAnalyzer.ts` — new interface `DiagnosticInfo`, new method `collectDiagnostics()`

---

## 5. `analyzer_cases.json` is underutilized

### Problem

The execution guide (Step 1.3) calls for test data in `server/test/test-cases/analyzer_cases.json`. The file exists with 5 scenarios, but the 44 actual tests in `analyzer.test.ts` all use inline SCC text strings instead of loading from the JSON. This isn't a bug, but it diverges from the project's data-driven testing pattern (the decoder and timecode modules use shared JSON test cases).

### What to do

This is lower priority than items 1–4, but worth aligning for consistency:

**Step 5a:** Add new test scenarios to `analyzer_cases.json` for the items added in Step 1 (neverErased, nonMonotonic). Example:

```json
{
    "neverErased": [
        {
            "name": "caption with EOC but no EDM",
            "input": "Scenarist_SCC V1.0\n\n00:00:01:00\t9420 9420 c865 ecec ef\n\n00:00:02:00\t942f 942f",
            "expectedNeverErasedLines": [2]
        }
    ],
    "nonMonotonic": [
        {
            "name": "timestamp goes backwards",
            "input": "Scenarist_SCC V1.0\n\n00:00:05:00\t9420 9420\n\n00:00:01:00\t942f 942f",
            "expectedNonMonotonicLines": [4]
        }
    ]
}
```

**Step 5b:** Write the corresponding tests that load from the JSON and assert against the expected values.

**Files to modify:**
- `server/test/test-cases/analyzer_cases.json`
- `server/test/analyzer.test.ts`

---

## 6. Paired word packet counting diverges from Python

### Problem

The Python `build_time_map()` counts `packet_count` for **every** hex word (line 185: `packet_count += 1` before the `continue` for paired duplicates). The TypeScript version does the same (line 97-98: `packetCount++` inside the paired-skip block, and line 174 for non-skipped words).

However, in the Python `check_overflow_from_map()` (line 63), it uses `packet_count - 1` as the frame offset for the last packet. The TypeScript `checkOverflow()` does the same (line 441).

The concern: in the TypeScript analyzer, `seenPaired` (line 91-104) uses a Set keyed by `word.text` to skip the second occurrence of a paired word. But if the same hex code appears as a **different** pair later on the same line (e.g., `9420 9420 ... 9420 9420`), the second pair's first word would be incorrectly skipped because `9420` is already in `seenPaired`.

### What to do

**Step 6a:** Verify by checking the Python behavior. In Python (line 186), paired detection uses positional comparison (`word.start > word.pair_start`), not a set. The Python skips the second word of each pair based on position, not text deduplication.

**Step 6b:** Replace the `seenPaired` Set approach with positional detection matching the Python:

```typescript
// Before (current):
const seenPaired = new Set<string>();
for (const word of hexWords) {
    if (word.isPaired && seenPaired.has(word.text)) {
        packetCount++;
        wordIdx++;
        continue;
    }
    if (word.isPaired) {
        seenPaired.add(word.text);
    }
    // ... process word ...
}

// After (matching Python):
for (const word of hexWords) {
    const isSecondOfPair = word.isPaired && word.start > word.pairStart;
    if (isSecondOfPair) {
        packetCount++;
        wordIdx++;
        continue;
    }
    // ... process word ...
}
```

This is the same pattern already used correctly in `getBufferSnapshot()` (line 240, 293) and `server.ts` (line 149). The `analyze()` method is the only place using the `seenPaired` Set approach.

**Step 6c:** Add a test with repeated paired codes on one line to verify:

```typescript
test('repeated paired code on same line counted correctly', () => {
    const doc = new SccDocument();
    const input = `Scenarist_SCC V1.0\n\n00:00:01:00\t9420 9420 94ad 94ad 942f 942f`;
    const result = doc.analyze(input);
    // 6 hex words total
    assert.strictEqual(result.timestampMap.get(2)!.packetCount, 6);
});
```

**Files to modify:**
- `server/src/sccAnalyzer.ts` — `_performAnalysis()`, remove `seenPaired` Set, use positional detection
- `server/test/analyzer.test.ts` — add test for repeated pairs

---

## 7. `server.ts` hover handler has inconsistent indentation

### Problem

Line 143 of `server.ts`:

```typescript
connection.onHover(
    (textDocumentPosition: TextDocumentPositionParams): Hover | undefined => {
        const document = documents.get(textDocumentPosition.textDocument.uri);
        ...

const hexWords = [...iterHexWords(line)];  // <-- no indentation
        let targetWord: HexWord | null = null;
```

The `const hexWords` line at line 143 has no indentation — it breaks from the surrounding block's 8-space indent. This is cosmetic but will cause confusion during Phase 2 when adding diagnostics code nearby.

### What to do

Fix the indentation of line 143 to match the surrounding code (8 spaces):

```typescript
        const hexWords = [...iterHexWords(line)];
```

**Files to modify:**
- `server/src/server.ts` — line 143

---

## Verification

After completing all items:

1. `cd server && npm test` — all tests pass (should be ~250+ with new tests)
2. `npm run compile` — no TypeScript errors
3. Open Extension Development Host (F5), open `samples/big-buck-bunny.scc`, verify hover tooltips still work
4. Review the `AnalysisResult` interface — it should now have: `frameRate`, `timestampMap`, `timeMap`, `lineTexts`, `neverDisplayedLines`, `neverErasedLines`, `nonMonotonicLines`, `sortedLineNums`

---

## Summary of all file changes

| File | Changes |
|---|---|
| `server/src/sccAnalyzer.ts` | Add `neverErasedLines`, `nonMonotonicLines`, `sortedLineNums` to `AnalysisResult`. Cache `lines` array. Add `DiagnosticInfo` interface and `collectDiagnostics()` stub. Replace `seenPaired` Set with positional detection. |
| `server/src/server.ts` | Fix indentation on line 143. |
| `server/test/analyzer.test.ts` | Add tests for `neverErasedLines`, `nonMonotonicLines`, repeated paired codes. |
| `server/test/test-cases/analyzer_cases.json` | Add `neverErased` and `nonMonotonic` test scenarios. |
