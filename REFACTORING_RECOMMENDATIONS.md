# SCC Inspector Refactoring Recommendations

## Executive Summary

The refactoring successfully extracted hardcoded data (CHAR_MAP, COLOR_LIST, ROW_MAP, COMMAND_NAMES, VALID_BYTES) into JSON files under `scc-core/data/`, enabling both Python (Notepad++) and TypeScript (VS Code) implementations to share the same source of truth. This is a solid foundation.

**Current State Score: 8/10** - Phase 1 complete: Frame rate config now centralized in JSON.

---

## What Was Done Well

### 1. Data Centralization
- Hardcoded Python constants moved to JSON files
- `scc_data.py` module created for loading shared data
- VS Code extension loads the same JSON files
- Ensures consistency across platforms

### 2. Module Separation
Clean separation of concerns:
- `scc_decoder.py` - Core EIA-608 decoding logic
- `scc_timecode.py` - Timecode parsing and calculations
- `scc_tooltip.py` - Tooltip formatting
- `scc_buffer_format.py` - Annotation rendering
- `scc_data.py` - Shared data loader

### 3. Cross-Platform Support
- Full TypeScript implementation mirroring Python
- HoverProvider and DecorationProvider for VS Code

---

## Current Architecture

```
scc_inspector/
├── scc_inspector.py              # Notepad++ plugin entry (772 lines)
├── src/
│   ├── scc_decoder.py           # EIA-608 decoding (255 lines)
│   ├── scc_timecode.py          # Timecode arithmetic (135 lines)
│   ├── scc_tooltip.py           # Tooltip formatting (119 lines)
│   ├── scc_buffer_format.py     # Annotation rendering (61 lines)
│   └── scc_data.py              # JSON data loader (42 lines)
├── scc-core/data/               # Shared JSON data
│   ├── char_map.json            # EIA-608 character mappings
│   ├── colors.json              # Color names
│   ├── row_map.json             # PAC row mappings
│   ├── control_commands.json    # Command descriptions
│   └── parity_table.json        # Valid parity bytes
├── scc-inspector-vscode/        # VS Code extension
│   └── src/
│       ├── decoder.ts           # TypeScript decoder (334 lines)
│       ├── timecode.ts          # TypeScript timecode (172 lines)
│       ├── tooltip.ts           # TypeScript tooltip (116 lines)
│       ├── bufferFormat.ts      # TypeScript annotations (73 lines)
│       └── providers/
│           ├── hoverProvider.ts
│           └── decorationProvider.ts
└── tests/                        # Python test suite
```

---

## Identified Issues

### 1. Code Duplication Between Platforms

The VS Code extension reimplements the same logic in TypeScript rather than calling Python:

| Python File | Lines | TypeScript File | Lines | Logic Duplication |
|------------|-------|----------------|-------|-------------------|
| `scc_decoder.py` | 255 | `decoder.ts` | 334 | Complete |
| `scc_timecode.py` | 135 | `timecode.ts` | 172 | Complete |
| `scc_tooltip.py` | 119 | `tooltip.ts` | 116 | Complete |
| `scc_buffer_format.py` | 61 | `bufferFormat.ts` | 73 | Complete |

**Impact:** Bug fixes require updates in two places. Logic divergence risk.

### 2. Frame Rate Logic Hardcoded

Frame rate configuration is scattered in both implementations:

**Python (`scc_timecode.py:23`):**
```python
if frame_rate_str not in ("23.98", "25", "29.97 DF", "29.97 NDF"):
    raise ValueError("Invalid frame rate: {0}".format(frame_rate_str))
video_fps = 24 if frame_rate_str == "23.98" else 25 if frame_rate_str == "25" else 30
```

**TypeScript (`timecode.ts:35-40`):**
```typescript
const validRates = ['23.98', '25', '29.97 DF', '29.97 NDF'];
if (!validRates.includes(frameRateStr)) {
    throw new Error(`Invalid frame rate: ${frameRateStr}`);
}
const videoFps = frameRateStr === '23.98' ? 24 : frameRateStr === '25' ? 25 : 30;
```

**Impact:** Cadence calculations (5:4 for 23.98, 6:5 for 25) must match exactly. Currently synchronized manually.

### 3. Tooltip Constants Hardcoded

**Python (`scc_tooltip.py:9`):**
```python
TOOLTIP_WIDTH = 60
```

**TypeScript (`tooltip.ts:7`):**
```typescript
const TOOLTIP_WIDTH = 60;
```

**Impact:** Minor, but affects UI consistency.

### 4. Test Data Not Shared

Test cases are hardcoded in Python (`tests/test_all.py`, `tests/test_buffer.py`) but not shared with TypeScript.

**Impact:** No guarantee that VS Code extension passes the same test vectors.

### 5. Data Loading Fragility

`scc_data.py` uses relative path `../scc-core/data/` which could break depending on import context.

---

## Recommended Next Steps (Prioritized)

### Phase 1: Frame Rate Configuration ⭐ COMPLETED

**Status:** ✓ Complete (March 2026)

**What was done:**
- Created `scc-core/data/frame_rates.json` with frame rate definitions
- Added `get_frame_rate_config()` function to `scc_data.py`
- Created `scc_timecode_v2.py` using JSON config
- Created `timecodeV2.ts` using JSON config
- Created comprehensive parity tests comparing V1 vs V2 implementations
- All 8 parity tests pass (Python), all 39 original tests pass

**Benefits realized:**
- Single source of truth for timecode calculations
- Cadence rules (5:4 for 23.98, 6:5 for 25) are now self-documenting in JSON
- Both Python and TypeScript use identical frame rate data

---

### Phase 1: Frame Rate Configuration ⭐ HIGHEST PRIORITY (ORIGINAL PLAN)

**Why:** Critical for correctness. Ensures both platforms calculate identical timecodes.

**Create:** `scc-core/data/frame_rates.json`

```json
{
  "description": "Frame rate definitions and cadence calculations for SCC timecode",
  "frameRates": {
    "23.98": {
      "name": "23.98",
      "videoFps": 24,
      "isDropFrame": false,
      "cadence": {
        "packets": 5,
        "frames": 4
      },
      "description": "23.98 fps (film rate)"
    },
    "25": {
      "name": "25",
      "videoFps": 25,
      "isDropFrame": false,
      "cadence": {
        "packets": 6,
        "frames": 5
      },
      "description": "25 fps (PAL)"
    },
    "29.97 DF": {
      "name": "29.97 DF",
      "videoFps": 30,
      "isDropFrame": true,
      "cadence": null,
      "description": "29.97 fps Drop Frame"
    },
    "29.97 NDF": {
      "name": "29.97 NDF",
      "videoFps": 30,
      "isDropFrame": false,
      "cadence": null,
      "description": "29.97 fps Non-Drop Frame"
    }
  },
  "dropFrameRules": {
    "skipFramesAtMinute": [0, 1],
    "skipEveryMinuteExcept": [0, 10, 20, 30, 40, 50]
  }
}
```

**Update:**
- `scc_timecode.py` - Load frame rate config from JSON
- `timecode.ts` - Load frame rate config from JSON
- Both implementations iterate over `frameRates` object instead of hardcoded conditionals

**Benefits:**
- Single source of truth for timecode calculations
- Easy to add new frame rates in the future
- Guaranteed consistency between platforms
- Self-documenting cadence rules

---

### Phase 2: UI Configuration

**Why:** Easy win, improves consistency.

**Create:** `scc-core/data/ui_config.json`

```json
{
  "description": "Shared UI formatting constants",
  "tooltip": {
    "width": 60,
    "prefix": "BUF : ",
    "indent": "      "
  },
  "annotation": {
    "maxLines": 1000
  },
  "decoration": {
    "pairIndicatorColor": [100, 200, 100],
    "errorIndicatorColor": [255, 0, 0]
  }
}
```

**Update:**
- `scc_tooltip.py` - Load tooltip constants
- `tooltip.ts` - Load tooltip constants
- `scc_inspector.py` - Load decoration colors

---

### Phase 3: Test Case Data

**Why:** High value for ensuring both implementations work identically.

**Create:** `scc-core/test_cases/`

```
scc-core/test_cases/
├── decoder_tests.json
├── timecode_tests.json
└── buffer_tests.json
```

**Example (`decoder_tests.json`):**
```json
{
  "description": "Test cases for SCC decoder",
  "tests": [
    {
      "name": "Decode basic text",
      "input": "4865",
      "expected": {
        "type": "TEXT",
        "text": "He"
      }
    },
    {
      "name": "Decode PAC command",
      "input": "94f4",
      "expected": {
        "type": "PAC",
        "row": 14,
        "col": 0,
        "color": "White"
      }
    }
  ]
}
```

**Update:**
- Python tests: Load from JSON
- TypeScript tests: Create test suite loading from same JSON

**Benefits:**
- Both implementations tested against identical inputs
- Regression testing across platforms
- Single place to add new test cases

---

### Phase 4: State Machine Configuration (Optional)

**Why:** Documents the buffer state transitions, reduces magic numbers.

**Create:** `scc-core/data/state_machine.json`

```json
{
  "description": "Caption buffer state machine definitions",
  "commands": {
    "0x20": {
      "name": "RCL",
      "fullName": "Resume Caption Loading",
      "category": "memory",
      "action": "switchToNonDisplayed",
      "clearsBuffer": false
    },
    "0x2c": {
      "name": "EDM",
      "fullName": "Erase Displayed Memory",
      "category": "display",
      "action": "clearDisplayed",
      "clearsBuffer": true
    },
    "0x2e": {
      "name": "ENM",
      "fullName": "Erase Non-Displayed Memory",
      "category": "memory",
      "action": "clearNonDisplayed",
      "clearsBuffer": true
    },
    "0x2f": {
      "name": "EOC",
      "fullName": "End of Caption",
      "category": "display",
      "action": "swapBuffers",
      "clearsBuffer": false
    }
  },
  "stateTransitions": [
    {
      "from": "idle",
      "on": "RCL",
      "to": "loading"
    },
    {
      "from": "loading",
      "on": "EOC",
      "to": "displayed"
    }
  ]
}
```

---

## What to Keep Platform-Specific

These should remain separate due to fundamentally different APIs:

| Component | Python (Notepad++) | TypeScript (VS Code) | Reason |
|-----------|-------------------|---------------------|---------|
| **File Access** | `editor.getText()` | `vscode.workspace.openTextDocument()` | Different APIs |
| **Hover UI** | `editor.callTipShow()` | `HoverProvider` | Different patterns |
| **Decorations** | `editor.indicSetStyle()` | `DecorationProvider` | Different systems |
| **Callbacks** | `notepad.callback()` | Event emitters | Different models |
| **Buffer Management** | `editor.getLine()` | `TextDocument.lineAt()` | Different abstractions |
| **Error Display** | Inline annotations | DiagnosticCollection | Different approaches |

---

## Implementation Plan

### Immediate (This Week)
1. Create `scc-core/data/frame_rates.json`
2. Refactor `scc_timecode.py` to use JSON
3. Refactor `timecode.ts` to use JSON
4. Add validation tests

### Short Term (Next 2 Weeks)
1. Create `scc-core/data/ui_config.json`
2. Update tooltip modules
3. Create `scc-core/test_cases/` structure
4. Migrate existing Python tests to JSON

### Medium Term (Next Month)
1. Create TypeScript test suite using shared JSON
2. Add cross-platform validation CI/CD
3. Consider state machine configuration
4. Document data schema

---

## Success Metrics

- ✅ Frame rate calculations produce identical results in Python and TypeScript
- ✅ Adding a new frame rate requires editing only one JSON file
- ✅ Test cases run against both implementations
- ✅ No hardcoded constants duplicated between platforms
- ✅ Both implementations pass identical test vectors

---

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| JSON loading performance | Low | Low | Cache loaded data at module level |
| Schema changes break consumers | Medium | Medium | Version JSON files, add validation |
| Path resolution issues | Medium | High | Use absolute paths or package resources |
| TypeScript/JSON type mismatch | Medium | Medium | Add runtime validation, TypeScript interfaces |

---

## Conclusion

The current refactoring provides a solid foundation with shared data files. The next logical step is to extract **frame rate configuration** as it:

1. Has the highest impact on correctness
2. Contains complex logic that must be synchronized
3. Is relatively self-contained
4. Provides immediate value

This will serve as a template for extracting other shared configurations (UI constants, test cases) while keeping platform-specific code (UI handling, file I/O) appropriately separated.

**Next Action:** Create `scc-core/data/frame_rates.json` and refactor timecode modules to use it.
