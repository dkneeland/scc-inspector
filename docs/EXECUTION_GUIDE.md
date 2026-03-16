# SCC Language Server: Execution Guide

This document defines exactly how to execute each phase of the project. It is written for an agent (or developer) who may not have prior context — every step, edge case, and verification is spelled out.

**Reference documents:**
- `docs/PROJECT_STRATEGY.md` — High-level vision, architecture, and phased rollout
- `docs/HANDOFF.md` — Status snapshot from initial scaffolding
- Original project: `C:\PythonProjects\scc_inspector\` — The Notepad++ Python plugin we're porting from

**Key principle:** Each phase ends with a definition of done. Do not move to the next phase until every item is checked.

---

## Phase 0: Local Setup & First Visual Test

**Goal:** Get the extension running in VS Code's Extension Development Host so you can open an SCC file and see syntax highlighting + basic hover tooltips. This proves the entire LSP pipeline works end-to-end before writing any new logic.

### Step 0.1: Prerequisites

Ensure the following are installed:
- **Node.js** (v18+ recommended) — run `node --version` to check
- **npm** (comes with Node.js) — run `npm --version` to check
- **VS Code** (v1.85.0+) — the Extension Development Host is built into VS Code
- **TypeScript** is a dev dependency, so it installs via npm — no global install needed

### Step 0.2: Install Dependencies

```bash
cd C:\PythonProjects\scc-language-server
npm install
```

**Potential issue:** The `client/package.json` lists `"scc-language-server": "*"` as a dependency. In a workspace setup, npm resolves this to the local `server/` package. If it fails:
1. Check that the root `package.json` has `"workspaces": ["client", "server"]`
2. Check that `server/package.json` has `"name": "scc-language-server"`
3. If still stuck, try `npm install --workspaces` or install each workspace separately:
   ```bash
   cd server && npm install && cd ../client && npm install && cd ..
   ```

**Verify:** `ls node_modules/.package-lock.json` exists, and `ls server/node_modules/vscode-languageserver` exists.

### Step 0.3: Compile TypeScript

```bash
npm run compile
```

This runs `tsc -b` (project build mode), compiling both `client/` and `server/` workspaces.

**Verify:**
- `ls client/out/extension.js` exists
- `ls server/out/server.js` exists
- No errors in the console output

**If compilation fails:**
- Read the error messages — they'll point to specific `.ts` files and line numbers
- Common issues: missing type definitions, path resolution problems for JSON imports
- The `tsconfig.json` files use `resolveJsonModule: true` — ensure this is set in the server's tsconfig

### Step 0.4: Create the Launch Configuration

Create `.vscode/launch.json` in the project root:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Launch Extension",
      "type": "extensionHost",
      "request": "launch",
      "runtimeExecutable": "${execPath}",
      "args": [
        "--extensionDevelopmentPath=${workspaceFolder}/client"
      ],
      "outFiles": [
        "${workspaceFolder}/client/out/**/*.js",
        "${workspaceFolder}/server/out/**/*.js"
      ],
      "preLaunchTask": "npm: compile"
    }
  ]
}
```

Also create `.vscode/tasks.json` so the `preLaunchTask` works:

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "type": "npm",
      "script": "compile",
      "group": "build",
      "label": "npm: compile",
      "problemMatcher": ["$tsc"]
    }
  ]
}
```

### Step 0.5: Launch the Extension Development Host

1. Open `C:\PythonProjects\scc-language-server` in VS Code
2. Press **F5** (or `Run > Start Debugging`)
3. A second VS Code window opens with `[Extension Development Host]` in the title bar
4. In the Extension Development Host window, open `samples/big-buck-bunny.scc`

### Step 0.6: Verify Everything Works

**Syntax highlighting:** The SCC file should have colored text:
- Timestamps in one color (e.g., `00:00:00:01`)
- Hex codes in another color (e.g., `942c`)
- Control codes highlighted differently from text codes
- The header `Scenarist_SCC V1.0` should be styled

If the file is all one color (plain text), the TextMate grammar isn't loading. Check:
- `client/scc.tmLanguage.json` exists and is valid JSON
- The `contributes.grammars` entry in `client/package.json` points to the right path
- The `scopeName` in the grammar matches what's declared in `package.json`

**Hover tooltips:** Hover your mouse over any 4-digit hex code (e.g., `942c`). After ~300ms, a tooltip should appear showing the decoded meaning (e.g., "CONTROL: EDM (Erase Displayed Memory)").

If hover doesn't work:
- Check the Output panel in the **main** VS Code window (not the dev host): `View > Output`, select "SCC Inspector" or "Language Server" from the dropdown
- Check the Debug Console for errors
- Ensure `server.ts` has `hoverProvider: true` in the capabilities

**If nothing happens at all:**
- The extension may not be activating. In the dev host, open the command palette (`Ctrl+Shift+P`), type "Developer: Show Running Extensions", and check if "SCC Inspector" appears
- If it doesn't appear, the activation event (`onLanguage:scc`) isn't firing — ensure the file has a `.scc` extension

### Step 0.7: Set Up Watch Mode (optional but recommended)

In a terminal in your main VS Code window:
```bash
npm run watch
```

This runs `tsc -b -w`, which recompiles on every save. Then you only need to press `Ctrl+Shift+F5` in the dev host to pick up changes, instead of manually running `npm run compile`.

### Step 0.8: Run Existing Tests

```bash
cd C:\PythonProjects\scc-language-server
cd server && npm test
```

**Expected output:** All decoder and timecode tests pass. The test runner is Mocha with TDD interface (`suite`/`test`).

**If tests fail:**
- Ensure tests are running against compiled `.js` files: `mocha --ui tdd test/**/*.test.js`
- If the test command runs against `.ts` files, you need `ts-mocha` or a compile step first
- Check that `server/test/test-cases/*.json` files exist and are valid JSON

### Phase 0: Definition of Done

- [ ] `npm install` completes without errors
- [ ] `npm run compile` produces `client/out/extension.js` and `server/out/server.js`
- [ ] `.vscode/launch.json` and `.vscode/tasks.json` exist
- [ ] F5 opens Extension Development Host
- [ ] Opening `samples/big-buck-bunny.scc` shows syntax highlighting
- [ ] Hovering over hex codes shows decoded tooltips
- [ ] `cd server && npm test` passes all tests
- [ ] `npm run watch` recompiles on save (optional but verify once)

---

## Phase 1: Buffer State Machine (`sccAnalyzer.ts`)

**Goal:** Create the core analysis engine that processes an entire SCC file and builds the timing/state maps that every subsequent feature depends on.

**Source reference:** Port from `C:\PythonProjects\scc_inspector\scc_inspector.py`, functions `build_time_map()` (lines ~150-260) and `build_buffer_snapshot()` (lines ~400-543).

### Step 1.1: Create `server/src/sccAnalyzer.ts`

This module exports an `SccDocument` class that owns the full analysis lifecycle for a single document.

#### Data Structures

```typescript
export interface TimestampInfo {
  timestampStr: string;   // "HH:MM:SS:FF" or "HH:MM:SS;FF"
  packetCount: number;    // Number of hex word pairs on this line
}

export interface TimeRange {
  startTime: string | null;  // When caption appears (set on EOC)
  endTime: string | null;    // When caption is erased (set on EDM)
}

export interface BufferSnapshot {
  bufferText: string;       // Current buffer contents with PAC formatting
  highlightStart: number;   // Start of highlighted region (-1 if none)
  highlightEnd: number;     // End of highlighted region (-1 if none)
}

export interface OverflowResult {
  isOverflow: boolean;
  overflowCount: number;    // How many packets past the next timestamp
}

export interface AnalysisResult {
  frameRate: string | null;
  timestampMap: Map<number, TimestampInfo>;
  timeMap: Map<number, TimeRange>;
  lineTexts: Map<number, string>;
  neverDisplayedLines: number[];
}

export class SccDocument {
  private contentHash: string;
  private analysis: AnalysisResult | null;

  analyze(text: string): AnalysisResult;
  getBufferSnapshot(lineNum: number, targetWordIdx: number): BufferSnapshot;
  checkOverflow(lineNum: number): OverflowResult;
  getAnalysis(): AnalysisResult | null;
  getContentHash(): string;
}
```

#### `analyze(text: string)` — The Main State Machine

Port `build_time_map()` from the original Python. This is a single-pass algorithm over the entire file.

**Algorithm:**

```
Initialize:
  timestampMap = new Map()
  timeMap = new Map()
  lineTexts = new Map()
  pendingLines: number[] = []    // Lines with content waiting for EOC
  activeLines: number[] = []     // Lines between EOC and EDM
  frameRate = detectFrameRate(text)

For each line in the file (split by \n):
  Skip empty/whitespace-only lines
  Extract timestamp using TIMESTAMP_PATTERN
  If no timestamp match: skip line

  Store lineTexts[lineNum] = lineText
  wordIdx = 0
  packetCount = 0
  hasAddedPending = false

  For each hex word (via iterHexWords(lineText)):
    Parse the word: evt = parseSccCode(word.text, word.isPaired)

    If evt.type is TEXT or PAC (first content on this line):
      If not hasAddedPending:
        pendingLines.push(lineNum)
        timeMap[lineNum] = { startTime: null, endTime: null }
        hasAddedPending = true

    If isEoc(word.text):
      startTimeStr = addFrames(timestamp, wordIdx, frameRate)
      // End time for currently active lines
      for each line in activeLines:
        timeMap[line].endTime = startTimeStr
      // Start time for pending lines
      for each line in pendingLines:
        timeMap[line].startTime = startTimeStr
      // Pending become active
      activeLines = [...pendingLines]
      pendingLines = []
      hasAddedPending = false

    If isEdm(word.text):
      endTimeStr = addFrames(timestamp, wordIdx, frameRate)
      for each line in activeLines:
        timeMap[line].endTime = endTimeStr
      activeLines = []

    If isEnm(word.text):
      // Erase non-displayed memory — pending lines will never display
      pendingLines = []
      hasAddedPending = false

    wordIdx++
    packetCount++  // (count only non-paired-duplicate words, or all words depending on how packets are defined)

  timestampMap[lineNum] = { timestampStr, packetCount }
```

**Critical edge cases to handle:**

1. **Paired commands:** `iterHexWords` yields both the original and the duplicate. For the state machine, only process the first of a pair — skip the duplicate. The original Python tracks this via the `is_paired` flag and skips the second occurrence. In the TypeScript version, `iterHexWords` already marks words as paired; only act on the first occurrence (when `word.isPaired` is true and it's the first of the two).

2. **addFrames failure:** The original wraps `addFrames` calls in try/catch. If the frame rate is null/invalid, `addFrames` may fail. In that case, use the raw timestamp string without offset.

3. **Lines with no content (control-only lines):** A line with only control codes (e.g., `942c 942c`) should NOT be added to `pendingLines`. Only add when TEXT or PAC is first encountered.

4. **Multiple EOC on same line:** Rare but possible. Each EOC triggers the pending→active transition. The second EOC would find an empty pendingLines and do nothing, which is correct.

5. **File with no EDM:** Some SCC files never erase. Active lines accumulate and never get an endTime. These should be flagged as "never displayed" if they also never get a startTime, or "never erased" if they have a startTime but no endTime.

6. **ENM before any content:** ENM clears pending lines. If there are no pending lines, it's a no-op. This is correct.

7. **Non-standard line endings:** Split on `\n` but also handle `\r\n` (Windows). Use `.split(/\r?\n/)`.

8. **The header line** (`Scenarist_SCC V1.0`): Has no timestamp, will be skipped. Correct.

9. **Packet counting:** Each hex word is one "packet" for overflow detection purposes. The timestamp_map records how many packets are on each line so overflow detection can calculate if packets extend past the next timestamp.

#### `getBufferSnapshot(lineNum, targetWordIdx)` — Backwards Scan

Port `build_buffer_snapshot()` from the original Python.

**Algorithm:**

```
Phase 1: Collect historical lines by scanning backwards
  historicalLines: string[] = []
  Scan backwards from lineNum - 1:
    For each prior line with content:
      Prepend to historicalLines
      If any word on that line is ENM: stop scanning (buffer was cleared here)
  // No MAX_SCAN_DEPTH limit — scan all the way back

Phase 2: Process historical lines to build buffer state
  bufText = ""
  initialState = null  // { row, col, color }
  isItalic = false

  For each historical line:
    For each word (via iterHexWords):
      Skip paired duplicates
      evt = parseSccCode(word.text)

      PAC: Save as initialState (or append previous state formatted as "{R## C## Col}")
      TEXT: Append evt.text to bufText
      MIDROW: Toggle italic
      CONTROL + backspace: Remove last char from bufText
      CONTROL + ENM/RCL: Clear bufText, reset initialState

Phase 3: Process current line up to targetWordIdx
  logicalIdx = 0  // Counter for non-duplicate words

  For each word on current line (via iterHexWords):
    Skip paired duplicates
    If logicalIdx > targetWordIdx: break

    If logicalIdx === targetWordIdx:
      // This is the target word — record highlight positions
      TEXT: highlightStart = bufText.length, append text, highlightEnd = bufText.length
      PAC: highlight the formatted PAC string
      MIDROW: highlight the "<i>" marker
      INDENT: highlight the appended spaces
      CONTROL: highlight based on what it does (backspace removes, ENM clears)
    Else:
      // Process normally (same as Phase 2)

    logicalIdx++

Return { bufferText: formatWithInitialState(bufText, initialState), highlightStart, highlightEnd }
```

**Edge cases:**
- `targetWordIdx` is 0 (first word): No historical context from current line
- Buffer is empty at target: Return `{ bufferText: "", highlightStart: -1, highlightEnd: -1 }`
- Backspace on empty buffer: No-op (don't go negative)
- Multiple PACs without text between them: Each PAC replaces the positioning state

#### `checkOverflow(lineNum)` — Buffer Overflow Detection

Port `check_overflow_from_map()` from the original Python.

**Algorithm:**
```
Get timestampMap entry for lineNum and lineNum's next non-empty line
If either is missing: return { isOverflow: false, overflowCount: 0 }

Calculate time of last packet on current line:
  lastPacketTime = addFrames(timestamp, packetCount - 1, frameRate)

If lastPacketTime >= nextLineTimestamp:
  overflowCount = number of packets past the boundary
  return { isOverflow: true, overflowCount }
Else:
  return { isOverflow: false, overflowCount: 0 }
```

**Edge case:** The "next line" is not always `lineNum + 1` — SCC files have blank lines between data lines. Walk forward through `timestampMap` keys to find the next entry.

### Step 1.2: Wire `SccDocument` into `server.ts`

- Create a `Map<string, SccDocument>` keyed by document URI
- On `onDidOpenTextDocument` and `onDidChangeTextDocument`: create/update the `SccDocument` and call `analyze()`
- On `onDidCloseTextDocument`: remove the entry
- Update the existing `onHover` handler to use `SccDocument.getBufferSnapshot()` for richer tooltips (this is optional in Phase 1 — the hover enhancement is Phase 3, but the wiring should be in place)

### Step 1.3: Testing

#### Unit Tests for `sccAnalyzer.ts`

Create `server/test/analyzer.test.ts` using the same Mocha TDD pattern as existing tests.

**Test cases to create:**

```
suite('SCC Analyzer')

  suite('build time map')
    test('basic pop-on caption: RCL + text + EOC → startTime set')
    test('EDM after EOC → endTime set')
    test('multiple caption blocks: each gets independent timing')
    test('ENM clears pending lines')
    test('control-only line: not added to pendingLines')
    test('line with no timestamp: skipped')
    test('header line: skipped')
    test('empty file: empty maps')
    test('file with only header: empty maps')

  suite('timestamp map')
    test('packet count matches hex word count on line')
    test('paired commands count as expected')

  suite('buffer snapshot')
    test('single line, first word: buffer has just that character')
    test('single line, last word: buffer has all characters')
    test('PAC shows as formatted {R## C## Color}')
    test('backwards scan finds prior content')
    test('ENM in prior line stops backwards scan')
    test('backspace removes last character')
    test('empty buffer returns empty string with -1 highlights')

  suite('overflow detection')
    test('no overflow: packets fit within frame budget')
    test('overflow: packets exceed next timestamp')
    test('last line in file: no overflow (no next line)')
    test('overflow count is accurate')

  suite('never displayed')
    test('caption with text but no EOC: flagged as never displayed')
    test('ENM after text but before EOC: pending cleared')

  suite('frame rate integration')
    test('23.98 fps cadence: 5 packets = 4 frames')
    test('29.97 DF: drop frame rules applied')
    test('invalid frame rate: graceful fallback')
```

**Test data approach:** Create `server/test/test-cases/analyzer_cases.json` with structured test inputs. Each case should be a mini SCC file (just the relevant lines) with expected outputs.

Example test case structure:
```json
{
  "buildTimeMap": [
    {
      "name": "basic pop-on caption",
      "input": "Scenarist_SCC V1.0\n\n00:00:01:00\t9420 9420 94ad 94ad c865 ecec ef\n\n00:00:02:00\t942f 942f\n\n00:00:05:00\t942c 942c",
      "expectedTimeMap": {
        "2": { "startTime": "00:00:02:00", "endTime": "00:00:05:00" }
      },
      "expectedTimestampMap": {
        "2": { "packetCount": 7 },
        "4": { "packetCount": 2 },
        "6": { "packetCount": 2 }
      }
    }
  ]
}
```

#### Integration Test with Sample File

Add a test that loads `samples/big-buck-bunny.scc` and verifies:
- Frame rate is detected
- `timestampMap` has entries for every data line
- `timeMap` has entries for lines with caption content
- No exceptions thrown during full-file analysis

### Step 1.4: Edge Cases Checklist

Before declaring Phase 1 done, manually verify (or write tests for) these scenarios:

- [ ] File with Windows line endings (`\r\n`) parses correctly
- [ ] File with trailing newline doesn't create phantom entries
- [ ] File with consecutive blank lines between data lines works
- [ ] Line with only null codes (`8080 8080 8080`) is not added to pendingLines
- [ ] Line with mixed null and content (`8080 c845 ecec ef`) IS added to pendingLines
- [ ] Timestamp with semicolon separator (`00:00:01;00`) is handled (drop frame)
- [ ] Very long line (50+ hex codes) doesn't cause issues
- [ ] Single-line SCC file (header + one data line) doesn't crash
- [ ] `getBufferSnapshot` at line 0 (header) returns empty
- [ ] `getBufferSnapshot` on a control-only line returns buffer state from prior content
- [ ] `checkOverflow` on the last data line returns `isOverflow: false`

### Phase 1: Definition of Done

- [ ] `server/src/sccAnalyzer.ts` exists with `SccDocument` class
- [ ] `analyze()` builds `timestampMap`, `timeMap`, `lineTexts` correctly
- [ ] `getBufferSnapshot()` reconstructs buffer state via backwards scan
- [ ] `checkOverflow()` detects buffer overflow between timestamps
- [ ] `SccDocument` is instantiated in `server.ts` on document open/change
- [ ] `server/test/analyzer.test.ts` exists with all test suites listed above
- [ ] `server/test/test-cases/analyzer_cases.json` has structured test data
- [ ] All existing tests still pass (`cd server && npm test`)
- [ ] New analyzer tests pass
- [ ] Loading `big-buck-bunny.scc` in the dev host doesn't crash (check Output panel)

---

## Phase 2: Diagnostics

**Goal:** Publish error/warning squiggles to the editor via `textDocument/publishDiagnostics`. This is the first phase with major visual output.

### Step 2.1: Add Diagnostic Publishing to `server.ts`

The LSP server already has the document text via `TextDocuments` manager. After analyzing a document (Phase 1's `SccDocument.analyze()`), collect diagnostics and publish them.

**Where to trigger:** In the `onDidChangeContent` handler (or create one if it doesn't exist). The pattern is:

```typescript
documents.onDidChangeContent((change) => {
  const doc = change.document;
  const sccDoc = getOrCreateSccDocument(doc.uri);
  sccDoc.analyze(doc.getText());
  const diagnostics = collectDiagnostics(sccDoc, doc);
  connection.sendDiagnostics({ uri: doc.uri, diagnostics });
});
```

**Important:** Also trigger on `onDidOpen` — diagnostics should appear immediately when a file is opened, not only after the first edit.

### Step 2.2: Implement `collectDiagnostics()`

Create a function (either in `server.ts` or a new `sccDiagnostics.ts` module) that walks through the analyzed document and collects `Diagnostic` objects.

#### Diagnostic: Parity Error

**Severity:** `DiagnosticSeverity.Error`
**Source:** `"scc-inspector"`
**Message:** `"Parity error: invalid byte in ${hexCode}"`

**Detection logic:**
```
For each data line:
  For each hex word (via iterHexWords):
    If !checkParityFast(word.text):
      Create diagnostic at word's character range on this line
```

**Range calculation:** The `HexWord` object has `start` and `end` character offsets within the line. Use these to create the `Range`:
```typescript
{
  start: { line: lineNum, character: word.start },
  end: { line: lineNum, character: word.end }
}
```

**Edge case:** Null codes (`8080`, `0000`) pass parity but are not errors. The parity check handles this correctly — `80` has valid odd parity.

#### Diagnostic: Invalid Timestamp

**Severity:** `DiagnosticSeverity.Error`
**Message:** `"Invalid timestamp: ${reason}"`

**Detection logic:**
```
For each data line:
  Extract timestamp via TIMESTAMP_PATTERN
  If no match but line has hex codes: "Missing timestamp"
  If match but !validateTimestamp(tsStr): "Invalid timestamp: values out of range"
```

**Range:** The timestamp occupies characters 0 through 10 (or 11 for drop-frame with semicolon). Use the regex match indices.

**Edge cases:**
- Timestamp with frame number exceeding maxFrame for the detected frame rate (e.g., frame 30 at 29.97fps)
- Timestamp with hours > 23, minutes > 59, seconds > 59

#### Diagnostic: Buffer Overflow

**Severity:** `DiagnosticSeverity.Warning`
**Message:** `"Buffer overflow: ${overflowCount} packet(s) exceed next timestamp"`

**Detection logic:**
```
For each data line in timestampMap:
  result = sccDoc.checkOverflow(lineNum)
  If result.isOverflow:
    // Mark the overflowing packets at the END of the line
    // The last `overflowCount` hex words are the overflow
    Get all hex words on line, take the last overflowCount
    Create diagnostic spanning from first overflow word.start to last overflow word.end
```

**Edge case:** If overflow count exceeds total words on the line (shouldn't happen, but guard against it), clamp to total words.

#### Diagnostic: Never-Displayed Caption

**Severity:** `DiagnosticSeverity.Warning`
**Message:** `"Caption data never displayed (no EOC follows this content)"`

**Detection logic:**
```
For each line in timeMap:
  If timeMap[line].startTime is null:
    This content was in pending_lines but never reached EOC
    Create diagnostic spanning the entire hex code portion of the line
```

**Edge case:** A line that has startTime but no endTime means it was displayed but never erased. This is a separate condition — flag as `DiagnosticSeverity.Information` with message "Caption displayed but never erased".

#### Diagnostic: Non-Monotonic Timestamp

**Severity:** `DiagnosticSeverity.Warning`
**Message:** `"Timestamp goes backwards (previous: ${prevTs}, current: ${currentTs})"`

**Detection logic:**
```
Track previousTimestamp as you walk through lines
For each data line:
  If compareTimestamps(currentTs, previousTs) < 0:
    Create diagnostic on the timestamp
  previousTimestamp = currentTs
```

### Step 2.3: Diagnostic Codes and Data

Assign diagnostic codes for programmatic identification:

| Code | Name | Severity |
|------|------|----------|
| `SCC001` | Parity error | Error |
| `SCC002` | Invalid timestamp | Error |
| `SCC003` | Buffer overflow | Warning |
| `SCC004` | Never-displayed caption | Warning |
| `SCC005` | Caption never erased | Information |
| `SCC006` | Non-monotonic timestamp | Warning |

Include the code in each diagnostic:
```typescript
{
  code: 'SCC001',
  source: 'scc-inspector',
  // ...
}
```

### Step 2.4: Debounce Re-Analysis

SCC files are rarely live-edited, but if someone is editing, don't re-analyze on every keystroke. Use a debounce of ~500ms:

```typescript
const pendingAnalysis = new Map<string, NodeJS.Timeout>();

documents.onDidChangeContent((change) => {
  const uri = change.document.uri;
  clearTimeout(pendingAnalysis.get(uri));
  pendingAnalysis.set(uri, setTimeout(() => {
    analyzeAndPublish(change.document);
    pendingAnalysis.delete(uri);
  }, 500));
});
```

On document open, analyze immediately (no debounce).

### Step 2.5: Clear Diagnostics on Close

```typescript
documents.onDidClose((event) => {
  connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] });
  // Also clean up SccDocument cache
});
```

### Step 2.6: Testing

#### Unit Tests

Create `server/test/diagnostics.test.ts`:

```
suite('Diagnostics')

  suite('parity errors')
    test('valid parity code: no diagnostic')
    test('invalid parity code: Error diagnostic with correct range')
    test('null code (8080): no diagnostic')
    test('multiple parity errors on one line: one diagnostic per error')

  suite('invalid timestamps')
    test('valid timestamp: no diagnostic')
    test('missing timestamp on data line: Error diagnostic')
    test('frame exceeds maxFrame: Error diagnostic')
    test('hours > 23: Error diagnostic')

  suite('buffer overflow')
    test('packets within budget: no diagnostic')
    test('packets exceed next timestamp: Warning with correct overflow count')
    test('last line in file: no diagnostic')

  suite('never displayed')
    test('content followed by EOC: no diagnostic')
    test('content with no EOC: Warning diagnostic')
    test('content with EOC but no EDM: Information diagnostic')

  suite('non-monotonic timestamps')
    test('ascending timestamps: no diagnostic')
    test('timestamp goes backwards: Warning diagnostic')
    test('duplicate timestamps: no diagnostic (equal is OK)')
```

#### Visual Test

After implementing, press F5 and open `big-buck-bunny.scc`:
- Check the Problems panel (`Ctrl+Shift+M`) — it should list all detected issues
- Hover over a squiggly underline — the diagnostic message should appear
- If the sample file has no errors (it's a valid file), create a test file with intentional errors:

Create `samples/test-errors.scc`:
```
Scenarist_SCC V1.0

00:00:01:00	9420 9420 ffff 94ad c865 ecec ef

00:00:01:01	942f 942f

99:99:99:99	942c 942c
```

This file has:
- `ffff` — parity error
- `99:99:99:99` — invalid timestamp
- Lines at `01:00` and `01:01` — potential overflow depending on frame rate

### Phase 2: Definition of Done

- [ ] Diagnostics appear immediately when opening an SCC file
- [ ] Parity errors show as red squiggles on the invalid hex code
- [ ] Invalid timestamps show as red squiggles on the timestamp
- [ ] Buffer overflow shows as yellow squiggles on the overflowing packets
- [ ] Never-displayed captions show as yellow squiggles
- [ ] Non-monotonic timestamps show as yellow squiggles
- [ ] Problems panel lists all diagnostics with codes (SCC001-SCC006)
- [ ] Clicking a diagnostic in the Problems panel jumps to the right line and position
- [ ] Diagnostics update after editing the file (with debounce)
- [ ] Diagnostics clear when the file is closed
- [ ] `server/test/diagnostics.test.ts` passes all tests
- [ ] No false positives on `big-buck-bunny.scc` (or expected count documented)

---

## Phase 3: Enhanced Hover Tooltips

**Goal:** Enrich the existing hover to show buffer state, timing context, and overflow warnings — turning a simple decode into a full debugging tool.

### Step 3.1: Enhance the `onHover` Handler

The current `onHover` in `server.ts` decodes the hex code under the cursor and returns a basic Markdown string. Enhance it to include:

1. **Event description** (already exists): What the hex code means
2. **Timestamp with offset**: The precise time this code executes, accounting for its position on the line
3. **Buffer state**: What the caption buffer looks like at this point
4. **Overflow warning**: If this code is in the overflow zone

#### Updated Hover Logic

```
onHover(params):
  doc = documents.get(params.uri)
  line = doc.getText(lineRange)
  position = params.position

  // 1. Find the hex word under the cursor
  For each word in iterHexWords(line):
    If word.start <= position.character < word.end:
      targetWord = word
      break

  If no targetWord: return null

  // 2. Calculate the logical word index (skip paired duplicates)
  logicalIdx = 0
  For each word in iterHexWords(line):
    If word === targetWord: break
    If not (word.isPaired and this is the duplicate): logicalIdx++

  // 3. Decode the event
  evt = parseSccCode(targetWord.text, targetWord.isPaired)

  // 4. Get timestamp with offset
  Extract timestamp from line
  If timestamp exists:
    [offsetTime, frameOffset] = addFrames(timestamp, logicalIdx, frameRate)
    timestampDesc = `**TIME:** \`${offsetTime}\` (+${frameOffset}f)`

  // 5. Get buffer snapshot
  sccDoc = getOrCreateSccDocument(doc.uri)
  snapshot = sccDoc.getBufferSnapshot(lineNum, logicalIdx)

  // 6. Check overflow
  overflow = sccDoc.checkOverflow(lineNum)

  // 7. Format as Markdown
  Build Markdown string with sections
```

#### Markdown Formatting

The tooltip should render as:

```markdown
**CONTROL:** EDM (Erase Displayed Memory)
---
**TIME:** `00:00:05:00` (+0f)
---
**BUF:**
```Hello world```
              ^^^^
```

Use Markdown code blocks for the buffer display so it renders in monospace. The caret markers (`^^^^`) should align with the highlighted region.

**For paired commands:** Show "(paired — duplicate ignored)" in the description.

**For overflow:** Prepend a warning line:
```markdown
⚠️ **BUFFER OVERFLOW** — this packet exceeds the next timestamp by 3 frames
```

### Step 3.2: Handle Special Hover Targets

**Hovering on a timestamp:** Show frame rate info and total line timing:
```markdown
**Timestamp:** `00:01:23:15`
**Frame rate:** 29.97 DF (auto-detected)
**Packets on line:** 12
**Duration:** 00:00:00:12 (12 frames)
```

**Hovering on the header line:** Show file summary:
```markdown
**SCC File**
**Frame rate:** 29.97 DF
**Lines:** 423 data lines
**Errors:** 2 parity, 1 overflow
```

**Hovering on an empty line or non-hex text:** Return null (no hover).

### Step 3.3: Edge Cases

- [ ] Hover on the second word of a pair: Show "(duplicate of paired command — ignored by decoder)"
- [ ] Hover on a NULL code (`8080`): Show "NULL — padding/filler code, no effect on buffer"
- [ ] Hover on an ERROR (parity failure): Show the parity error details, explain which byte failed
- [ ] Hover when frame rate is unknown: Show timestamp without offset, note "frame rate not detected"
- [ ] Buffer snapshot is empty (hover on first code in file): Show "BUF: (empty)"
- [ ] Very long buffer text: Truncate to first 200 characters with "..." indicator
- [ ] Extended characters: Ensure Unicode renders correctly in Markdown hover

### Step 3.4: Testing

The hover handler is harder to unit test because it depends on LSP infrastructure. Test the building blocks:

Add to `server/test/analyzer.test.ts`:
```
suite('hover support')
  test('getBufferSnapshot returns correct highlight for TEXT')
  test('getBufferSnapshot returns correct highlight for PAC')
  test('getBufferSnapshot returns correct highlight for MIDROW')
  test('getBufferSnapshot with empty buffer returns -1 highlights')
  test('formatHoverMarkdown produces valid Markdown')
```

**Visual test:** Open `big-buck-bunny.scc` in the dev host, hover over various hex codes, and verify:
- Text codes show the decoded character + buffer state
- Control codes (942c, 942f, etc.) show the command name
- PACs show row/column/color positioning
- The buffer display reflects accumulation of prior text

### Phase 3: Definition of Done

- [ ] Hover shows event description, timestamp with offset, buffer state, and overflow warning
- [ ] Buffer state displays in monospace with caret markers
- [ ] Paired command duplicates are labeled as such
- [ ] NULL codes show appropriate message
- [ ] Parity errors show which byte failed
- [ ] Hovering on timestamp shows frame rate and line stats
- [ ] Hovering on empty space returns no tooltip
- [ ] Unicode/extended characters render correctly
- [ ] All analyzer tests pass

---

## Phase 4: Inline Annotations (Decorations)

**Goal:** Show decoded caption text at the end of each SCC line — the signature feature from the original plugin.

### Step 4.1: Understand the Architecture Split

Inline annotations require **both server and client** changes:

- **Server side:** A custom LSP request `scc/lineAnnotations` that returns structured data for all lines
- **Client side:** A VS Code `TextEditorDecorationType` that renders the data as end-of-line decorations

This is the first feature that requires non-trivial client code.

### Step 4.2: Server — Custom Request Handler

Add a custom request handler in `server.ts`:

```typescript
interface LineAnnotation {
  line: number;
  segments: Array<{ text: string; isItalic: boolean }>;
  startTime: string | null;
  endTime: string | null;
  neverDisplayed: boolean;
}

connection.onRequest('scc/lineAnnotations', (params: { uri: string }) => {
  const doc = documents.get(params.uri);
  if (!doc) return [];

  const sccDoc = getOrCreateSccDocument(doc.uri);
  const analysis = sccDoc.getAnalysis();
  if (!analysis) return [];

  const annotations: LineAnnotation[] = [];

  for (const [lineNum, lineText] of analysis.lineTexts) {
    const segments = renderLineAnnotation(lineText);
    if (segments.length === 0) continue;

    const timeRange = analysis.timeMap.get(lineNum);
    annotations.push({
      line: lineNum,
      segments,
      startTime: timeRange?.startTime ?? null,
      endTime: timeRange?.endTime ?? null,
      neverDisplayed: timeRange?.startTime === null && timeRange?.endTime === null
        && analysis.timeMap.has(lineNum),
    });
  }

  return annotations;
});
```

### Step 4.3: Client — Decoration Rendering

Update `client/src/extension.ts` to:

1. **Create decoration types** on activation:
```typescript
const annotationDecoration = vscode.window.createTextEditorDecorationType({
  after: {
    color: new vscode.ThemeColor('editorCodeLens.foreground'),
    fontStyle: 'normal',
    margin: '0 0 0 2em',
  },
  isWholeLine: true,
});

const annotationItalicDecoration = vscode.window.createTextEditorDecorationType({
  after: {
    color: new vscode.ThemeColor('editorCodeLens.foreground'),
    fontStyle: 'italic',
    margin: '0 0 0 0',
  },
});
```

2. **Request annotations** after the server is ready and when the document changes:
```typescript
async function updateAnnotations(editor: vscode.TextEditor) {
  const result = await client.sendRequest('scc/lineAnnotations', {
    uri: editor.document.uri.toString(),
  });

  const decorations: vscode.DecorationOptions[] = [];
  for (const ann of result) {
    const text = ann.segments.map(s => s.text).join('');
    const timing = ann.startTime && ann.endTime
      ? ` [${ann.startTime} → ${ann.endTime}]`
      : ann.neverDisplayed ? ' [never displayed]' : '';

    decorations.push({
      range: new vscode.Range(ann.line, 0, ann.line, 0),
      renderOptions: {
        after: { contentText: `  → ${text}${timing}` },
      },
    });
  }
  editor.setDecorations(annotationDecoration, decorations);
}
```

3. **Trigger updates** on document change and editor switch:
```typescript
vscode.window.onDidChangeActiveTextEditor(editor => {
  if (editor && editor.document.languageId === 'scc') {
    updateAnnotations(editor);
  }
});

vscode.workspace.onDidChangeTextDocument(event => {
  const editor = vscode.window.activeTextEditor;
  if (editor && event.document === editor.document && event.document.languageId === 'scc') {
    // Debounce
    setTimeout(() => updateAnnotations(editor), 500);
  }
});
```

### Step 4.4: Annotation Content

Each annotation line should show:
- **Caption text:** Decoded from hex codes via `renderLineAnnotation()`
- **Italic markers:** Segments with `isItalic: true` should render differently (VS Code can only apply one decoration type per range for `after` content, so we may need to concatenate with markers like `*italic text*`)
- **Timing:** `[HH:MM:SS:FF → HH:MM:SS:FF]` if both start and end times exist
- **Warnings:**
  - `[never displayed]` for captions that never reach EOC
  - `[never erased]` for captions with start but no end time

**Handling italic:** VS Code's `after` pseudo-element can only have one style. For mixed normal/italic segments, use text markers: surround italic text with underscores or asterisks, e.g., `Hello _world_`. This is a known limitation of VS Code decorations — the original Notepad++ plugin could apply per-character styles, but VS Code cannot for `after` content.

**Alternative:** Use a DocumentLink or Inlay Hint provider instead of decorations, but these have their own limitations. Stick with `after` decorations for now — they're the most common pattern for end-of-line annotations (used by GitLens, Error Lens, etc.).

### Step 4.5: Configuration Toggle

The setting `sccInspector.annotationsEnabled` already exists in `client/package.json`. Wire it up:

```typescript
const config = vscode.workspace.getConfiguration('sccInspector');
if (!config.get('annotationsEnabled', true)) {
  editor.setDecorations(annotationDecoration, []);
  return;
}
```

Listen for configuration changes:
```typescript
vscode.workspace.onDidChangeConfiguration(event => {
  if (event.affectsConfiguration('sccInspector.annotationsEnabled')) {
    // Re-apply or clear decorations
  }
});
```

### Step 4.6: Edge Cases

- [ ] Line with only control codes (no TEXT/PAC): No annotation (segments list is empty)
- [ ] Line with newline symbol (⏎) from `renderLineAnnotation`: Display as `⏎` in the annotation text
- [ ] Very long decoded text (>100 chars): Truncate with "..." to prevent horizontal scroll
- [ ] File with 1000+ lines: Annotations should not cause lag. Process in batches or limit visible range.
- [ ] Editor scroll: Decorations persist across scrolls (VS Code handles this natively)
- [ ] Multiple editors for same file: Each editor gets its own decorations
- [ ] Dark vs. light theme: Use `ThemeColor` references, not hardcoded colors

### Step 4.7: Testing

**Unit tests** (server-side):
- Test that `scc/lineAnnotations` returns correct segment data for known inputs
- Test that timing is correctly associated with lines
- Test that control-only lines return no annotation

**Visual tests:**
- Open `big-buck-bunny.scc` — every line with caption data should show decoded text
- Lines with only control codes (like `942c 942c`) should have no annotation
- Timing should appear as `[HH:MM:SS:FF → HH:MM:SS:FF]` for displayed captions
- Toggle `sccInspector.annotationsEnabled` off in Settings — annotations should disappear

### Phase 4: Definition of Done

- [ ] Decoded caption text appears at end of each data line in dimmed color
- [ ] Timing brackets show start and end times
- [ ] Never-displayed captions are marked
- [ ] Control-only lines have no annotation
- [ ] Annotations update when the file is edited
- [ ] Configuration toggle works (`sccInspector.annotationsEnabled`)
- [ ] No performance issues on `big-buck-bunny.scc`
- [ ] Italic segments are visually distinguished (even if just with text markers)

---

## Phase 5: Code Lenses & Advanced Features

**Goal:** Add contextual metadata above caption blocks and navigation features.

### Step 5.1: Code Lens Provider

Add `codeLensProvider: true` to server capabilities and implement `onCodeLens`:

#### Lens: Frame Rate (at file header)

```typescript
{
  range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
  command: { title: "Frame rate: 29.97 DF (auto-detected)", command: "" }
}
```

Show at line 0 (the `Scenarist_SCC V1.0` header). No command action — just informational.

#### Lens: Error Summary (at file header)

```typescript
{
  range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
  command: { title: "3 errors, 1 warning", command: "workbench.actions.view.problems" }
}
```

Clicking this lens opens the Problems panel.

#### Lens: Caption Block Duration (above each EOC line)

For each line that has an EOC command, show the display duration:
```typescript
{
  range: { start: { line: eocLine, character: 0 }, end: { line: eocLine, character: 0 } },
  command: { title: "Display: 3.5s | Gap from previous: 1.2s", command: "" }
}
```

**Calculation:**
- Duration = endTime - startTime (for the associated caption block)
- Gap = current startTime - previous endTime

### Step 5.2: Document Symbols (Outline View)

Add `documentSymbolProvider: true` and implement `onDocumentSymbol`:

```typescript
// Each caption block (group of lines between control commands) becomes a symbol
{
  name: "Hello world",       // Decoded first line of caption text
  kind: SymbolKind.String,
  range: blockRange,         // Full span of the caption block
  selectionRange: firstLineRange,
  detail: "00:01:23:00 → 00:01:26:15"  // Timing
}
```

This populates the Outline panel and the breadcrumb bar with navigable caption blocks.

### Step 5.3: Frame Rate Override Setting

Add to `client/package.json` contributes.configuration:
```json
{
  "sccInspector.frameRateOverride": {
    "type": "string",
    "enum": ["auto", "23.98", "25", "29.97 DF", "29.97 NDF"],
    "default": "auto",
    "description": "Override auto-detected frame rate"
  }
}
```

Wire in server: if setting is not "auto", use the specified frame rate instead of `detectFrameRate()`.

### Step 5.4: Testing

**Code lens tests:**
- Header lens shows detected frame rate
- Error summary lens shows correct counts
- Duration lenses appear on EOC lines with correct timing

**Document symbol tests:**
- Symbols match caption blocks
- Symbol names are decoded text
- Symbol details show timing

**Visual test:** Open `big-buck-bunny.scc`:
- Frame rate and error count appear above the header
- Duration labels appear above caption blocks
- Outline panel (`Ctrl+Shift+O`) shows navigable caption list

### Phase 5: Definition of Done

- [ ] Frame rate code lens appears at file header
- [ ] Error summary code lens links to Problems panel
- [ ] Caption duration lenses show timing above EOC lines
- [ ] Document symbols populate the Outline panel
- [ ] Frame rate override setting works
- [ ] All tests pass

---

## Phase 6: Polish & Publish

**Goal:** Make the extension installable by anyone from the VS Code Marketplace.

### Step 6.1: Bundle with esbuild

VS Code extensions should be bundled into a single file for fast activation. Add esbuild:

```bash
npm install -D esbuild
```

Add build scripts to root `package.json`:
```json
{
  "scripts": {
    "package": "npm run esbuild-server && npm run esbuild-client",
    "esbuild-server": "esbuild server/src/server.ts --bundle --outfile=server/out/server.js --platform=node --format=cjs --external:vscode",
    "esbuild-client": "esbuild client/src/extension.ts --bundle --outfile=client/out/extension.js --platform=node --format=cjs --external:vscode"
  }
}
```

**Important:** The server loads JSON data files at runtime via `require()` or `fs.readFileSync()`. Ensure esbuild bundles these or copies them to the output directory. You may need a loader configuration for `.json` files.

### Step 6.2: Create Extension Metadata

**Icon:** Create or source a 128x128 PNG icon for the extension. Place at `client/icon.png`.

**Update `client/package.json`:**
```json
{
  "icon": "icon.png",
  "repository": { "type": "git", "url": "https://github.com/your-org/scc-language-server" },
  "categories": ["Programming Languages", "Linters", "Formatters"],
  "keywords": ["scc", "closed caption", "eia-608", "subtitle", "caption"],
  "badges": [],
  "preview": true
}
```

### Step 6.3: Write README

Create a comprehensive `README.md` with:
- Feature overview with screenshots
- Installation instructions
- Configuration reference
- Known limitations
- Changelog

Screenshots should show:
1. Syntax highlighting on an SCC file
2. Hover tooltip with buffer state
3. Error squiggles in the editor
4. Inline annotations with timing
5. Code lenses and outline view

### Step 6.4: Package and Publish

```bash
npm install -g @vscode/vsce
cd client
vsce package          # Creates .vsix file
vsce publish          # Publishes to Marketplace (needs PAT)
```

**Pre-publish checklist:**
- [ ] All tests pass
- [ ] `vsce package` produces a .vsix without warnings
- [ ] Install the .vsix locally (`Extensions > ... > Install from VSIX`) and verify all features
- [ ] README renders correctly on the Marketplace preview
- [ ] License file exists

### Step 6.5: CI/CD

Create `.github/workflows/ci.yml`:
```yaml
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm install
      - run: npm run compile
      - run: cd server && npm test
```

### Phase 6: Definition of Done

- [ ] Extension bundles to single files via esbuild
- [ ] .vsix file installs and works correctly
- [ ] README with screenshots exists
- [ ] CI pipeline runs tests on push
- [ ] Published to VS Code Marketplace (or ready to publish)

---

## Phase 7: Multi-Editor Support

**Goal:** Make the language server usable from editors other than VS Code.

### Step 7.1: npm Package

The server is already set up with a `bin` entry in `server/package.json`. Ensure it works as a standalone process:

```bash
npx scc-language-server --stdio
```

The server should start and communicate via stdin/stdout using the LSP protocol. Verify the `--stdio` transport works (the current implementation may use IPC — add stdio support).

### Step 7.2: Neovim Configuration

Create `docs/neovim-setup.md` with lspconfig instructions:

```lua
-- In your neovim config
local lspconfig = require('lspconfig')
local configs = require('lspconfig.configs')

configs.scc = {
  default_config = {
    cmd = { 'scc-language-server', '--stdio' },
    filetypes = { 'scc' },
    root_dir = function(fname)
      return vim.fn.getcwd()
    end,
  },
}

lspconfig.scc.setup{}
```

Also need a filetype detection autocmd:
```lua
vim.filetype.add({ extension = { scc = 'scc' } })
```

### Step 7.3: Sublime Text

Create `docs/sublime-setup.md` with LSP package configuration:

```json
{
  "clients": {
    "scc": {
      "command": ["scc-language-server", "--stdio"],
      "selector": "source.scc",
      "enabled": true
    }
  }
}
```

### Phase 7: Definition of Done

- [ ] `scc-language-server --stdio` works as a standalone process
- [ ] Neovim setup documentation exists and has been tested
- [ ] Sublime Text setup documentation exists
- [ ] Hover and diagnostics work in at least one non-VS Code editor

---

## Appendix A: File Inventory

Files that should exist when all phases are complete:

```
scc-language-server/
├── .vscode/
│   ├── launch.json                    # Phase 0
│   └── tasks.json                     # Phase 0
├── .github/
│   └── workflows/ci.yml              # Phase 6
├── client/
│   ├── src/extension.ts              # Modified in Phase 4 (decorations)
│   ├── package.json                  # Modified in Phase 5 (settings)
│   ├── scc.tmLanguage.json           # Exists (Phase 0)
│   ├── language-configuration.json   # Exists (Phase 0)
│   ├── icon.png                      # Phase 6
│   └── tsconfig.json                 # Exists
├── server/
│   ├── src/
│   │   ├── server.ts                 # Modified in Phases 1-5
│   │   ├── sccAnalyzer.ts            # Phase 1 (NEW)
│   │   ├── sccDiagnostics.ts         # Phase 2 (NEW, optional — can be in server.ts)
│   │   ├── sccDecoder.ts             # Exists (complete)
│   │   ├── sccTimecode.ts            # Exists (complete)
│   │   ├── sccBufferFormat.ts        # Exists (complete)
│   │   └── sccTooltip.ts             # Exists (may be modified in Phase 3)
│   ├── data/                         # Exists (complete)
│   ├── test/
│   │   ├── analyzer.test.ts          # Phase 1 (NEW)
│   │   ├── diagnostics.test.ts       # Phase 2 (NEW)
│   │   ├── decoder.test.ts           # Exists
│   │   ├── timecode.test.ts          # Exists
│   │   └── test-cases/
│   │       ├── analyzer_cases.json   # Phase 1 (NEW)
│   │       ├── decoder_cases.json    # Exists
│   │       └── timecode_cases.json   # Exists
│   ├── package.json                  # Exists
│   └── tsconfig.json                 # Exists
├── samples/
│   ├── big-buck-bunny.scc            # Exists
│   └── test-errors.scc              # Phase 2 (NEW)
├── docs/
│   ├── neovim-setup.md              # Phase 7
│   └── sublime-setup.md            # Phase 7
├── package.json                     # Exists
├── tsconfig.json                    # Exists
├── PROJECT_STRATEGY.md              # Exists
├── EXECUTION_GUIDE.md               # This file
├── HANDOFF.md                       # Exists
└── README.md                        # Phase 6 (rewrite)
```

## Appendix B: Shared Data File Reference

These JSON files in `server/data/` are loaded by the decoder and timecode modules. They are identical to the files in the original project (`scc_inspector/scc-core/data/`). If the originals are updated, these should be synced.

| File | Used By | Contents |
|------|---------|----------|
| `char_map.json` | sccDecoder | 176-char string, index → Unicode character |
| `colors.json` | sccDecoder | 8 color names (White through Italics) |
| `control_commands.json` | sccDecoder | Hex → command name mapping, channel prefixes |
| `frame_rates.json` | sccTimecode | 4 frame rate configs with cadence and drop-frame rules |
| `parity_table.json` | sccDecoder | Set of 128 valid odd-parity bytes |
| `row_map.json` | sccDecoder | 16-entry PAC row index → screen row mapping |

## Appendix C: LSP Feature → VS Code UI Mapping

For reference, here's how each LSP feature manifests in the VS Code UI:

| LSP Feature | VS Code UI | User Interaction |
|-------------|-----------|-----------------|
| `textDocument/hover` | Popup tooltip on mouse hover | Hover over any hex code |
| `textDocument/publishDiagnostics` | Squiggly underlines + Problems panel | Automatic, always visible |
| `textDocument/codeLens` | Small text labels above lines | Click to execute command |
| `textDocument/documentSymbol` | Outline panel + breadcrumbs | Click to navigate |
| `textDocument/completion` | Autocomplete dropdown | Type to trigger |
| Custom `scc/lineAnnotations` | End-of-line dimmed text (via decorations) | Always visible, no interaction |

## Appendix D: Testing Philosophy

**Test pyramid for this project:**

1. **Unit tests** (majority) — Test decoder, timecode, analyzer, and diagnostic functions in isolation with JSON-driven test cases. These run fast (`npm test`) and don't need VS Code.

2. **Integration tests** — Test the full analysis pipeline: file → analyze → diagnostics/annotations. Still runs without VS Code, just verifies the data flow.

3. **Manual visual tests** — Open files in the Extension Development Host and visually verify. Cannot be automated easily for VS Code extensions (VS Code's extension testing framework exists but is complex and brittle). Reserve this for final validation of each phase.

**Test data strategy:**
- Reuse existing `decoder_cases.json` and `timecode_cases.json` — these are shared with the original project
- New test cases go in new JSON files (`analyzer_cases.json`, etc.)
- Each test case is a self-contained mini SCC file with expected outputs
- Include both happy-path and edge-case data
- Real-world SCC files (like `big-buck-bunny.scc`) for integration/smoke tests
