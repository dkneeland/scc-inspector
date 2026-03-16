"use strict";
/**
 * SCC Decoder Module
 *
 * Low-level EIA-608 closed caption decoding logic.
 * Translated from Python scc_decoder.py, loads shared data from scc-core.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.TIMESTAMP_PATTERN = exports.HEX_PATTERN = void 0;
exports.isPairingCommand = isPairingCommand;
exports.iterHexWords = iterHexWords;
exports.parseSccCode = parseSccCode;
exports.decodeSingleCode = decodeSingleCode;
exports.getCommandByte = getCommandByte;
exports.isEoc = isEoc;
exports.isRcl = isRcl;
exports.isEnm = isEnm;
exports.isEdm = isEdm;
exports.checkParityFast = checkParityFast;
const path = __importStar(require("path"));
// Load shared data
const charMapData = require(path.join(__dirname, '../data/char_map.json'));
const controlCommandsData = require(path.join(__dirname, '../data/control_commands.json'));
const parityTableData = require(path.join(__dirname, '../data/parity_table.json'));
const colorsData = require(path.join(__dirname, '../data/colors.json'));
const rowMapData = require(path.join(__dirname, '../data/row_map.json'));
// Constants from JSON data
const CHAR_MAP = charMapData.charString;
const VALID_BYTES = new Set(parityTableData.validBytes);
const COLOR_LIST = colorsData.colors;
const ROW_MAP = rowMapData.map;
// Build command names map from JSON
const COMMAND_NAMES = new Map();
for (const [hexKey, value] of Object.entries(controlCommandsData.commands)) {
    const byteVal = parseInt(hexKey, 16);
    COMMAND_NAMES.set(byteVal, value.description);
}
// Regex patterns
exports.HEX_PATTERN = /\b[0-9a-fA-F]{4}\b/g;
exports.TIMESTAMP_PATTERN = /\d\d:\d\d:\d\d[:;]\d\d/;
// Bit-masking functions for EIA-608 command detection
function isPreamble(ccData) {
    return 0x1040 === (0x7040 & ccData);
}
function isMidrowChange(ccData) {
    return 0x1120 === (0x7770 & ccData);
}
function isControl(ccData) {
    if (0x0200 & ccData) {
        return false;
    }
    return (0x1400 === (0x7600 & ccData)) || (0x1700 === (0x7700 & ccData));
}
function isTabOffset(ccData) {
    return 0x1720 === (0x777C & ccData);
}
function isPairingCommand(val) {
    const masked = val & 0x7F7F;
    return isControl(masked) || isPreamble(masked) || isMidrowChange(masked) || isTabOffset(masked);
}
function hasOddParity(byte) {
    return VALID_BYTES.has(byte);
}
function* iterHexWords(lineText) {
    const matches = [...lineText.matchAll(exports.HEX_PATTERN)];
    let i = 0;
    while (i < matches.length) {
        const curr = matches[i];
        const currText = curr[0].toLowerCase();
        const currStart = curr.index;
        const currEnd = currStart + curr[0].length;
        const currVal = parseInt(currText, 16);
        if (isPairingCommand(currVal) && i + 1 < matches.length) {
            const nextMatch = matches[i + 1];
            if (nextMatch[0].toLowerCase() === currText) {
                const nextStart = nextMatch.index;
                const nextEnd = nextStart + nextMatch[0].length;
                // First of pair
                yield {
                    text: currText,
                    start: currStart,
                    end: currEnd,
                    isPaired: true,
                    pairStart: Math.min(currStart, nextStart),
                    pairEnd: Math.max(currEnd, nextEnd)
                };
                // Second of pair
                yield {
                    text: currText,
                    start: nextStart,
                    end: nextEnd,
                    isPaired: true,
                    pairStart: Math.min(currStart, nextStart),
                    pairEnd: Math.max(currEnd, nextEnd)
                };
                i += 2;
                continue;
            }
        }
        yield {
            text: currText,
            start: currStart,
            end: currEnd,
            isPaired: false,
            pairStart: currStart,
            pairEnd: currEnd
        };
        i++;
    }
}
function parseSccCode(wordText, isPair = false) {
    const word = wordText.toLowerCase();
    if (word === '8080' || word === '0000') {
        return { type: 'NULL' };
    }
    const rawVal = parseInt(word, 16);
    const b1 = (rawVal >> 8) & 0xFF;
    const b2 = rawVal & 0xFF;
    // Parity check
    if (!hasOddParity(b1) || !hasOddParity(b2)) {
        return { type: 'ERROR', desc: 'Parity Error' };
    }
    const ccData = rawVal & 0x7F7F;
    const chan = (rawVal & 0x0800) ? 1 : 0;
    const field = (rawVal & 0x0100) ? 1 : 0;
    const channel = field * 2 + chan + 1;
    const label = channel === 1 ? '' : `CC${channel}`;
    // Tab offset
    if (isTabOffset(ccData)) {
        return { type: 'INDENT', label, spaces: (ccData & 0xFF) - 0x20 };
    }
    // Control command
    if (isControl(ccData)) {
        const cmdByte = ccData & 0xFF;
        const name = COMMAND_NAMES.get(cmdByte);
        if (name) {
            return {
                type: 'CONTROL',
                label,
                name,
                isNewline: cmdByte === 0x2D,
                isBackspace: cmdByte === 0x21
            };
        }
    }
    // Preamble Address Code (PAC)
    if (isPreamble(ccData)) {
        const rowIdx = ((0x0700 & ccData) >> 7) | ((0x0020 & ccData) >> 5);
        const row = rowIdx < ROW_MAP.length ? ROW_MAP[rowIdx] : 14;
        const underline = Boolean(ccData & 1);
        let col;
        let color;
        if (ccData & 0x10) {
            col = 4 * ((0x000E & ccData) >> 1);
            color = 'White';
        }
        else {
            col = 0;
            const colorIdx = (0x000E & ccData) >> 1;
            color = colorIdx < COLOR_LIST.length ? COLOR_LIST[colorIdx] : 'White';
        }
        return {
            type: 'PAC',
            label,
            row,
            col,
            color,
            underline,
            isItalic: color === 'Italics'
        };
    }
    // Mid-row change
    if (isMidrowChange(ccData)) {
        const colorIdx = (0x000E & ccData) >> 1;
        const color = colorIdx < COLOR_LIST.length ? COLOR_LIST[colorIdx] : 'White';
        return {
            type: 'MIDROW',
            label,
            color,
            underline: Boolean(ccData & 1),
            isItalic: color === 'Italics'
        };
    }
    // Special North American character
    if (0x1130 === (ccData & 0x7770)) {
        const idx = (ccData & 0xFFFF) - 0x1130 + 0x60;
        if (idx >= 0 && idx < CHAR_MAP.length) {
            return {
                type: 'TEXT',
                label,
                text: CHAR_MAP[idx],
                isExtended: false
            };
        }
    }
    // Extended character (West European)
    if (0x1220 === (ccData & 0x7660)) {
        let idx = -1;
        if (0x1220 <= ccData && ccData < 0x1240) {
            idx = ccData - 0x1220 + 0x70;
        }
        else if (0x1320 <= ccData && ccData < 0x1340) {
            idx = ccData - 0x1320 + 0x90;
        }
        if (idx >= 0 && idx < CHAR_MAP.length) {
            return {
                type: 'TEXT',
                label,
                text: CHAR_MAP[idx],
                isExtended: true
            };
        }
    }
    // Standard character pair
    if (0 !== ((ccData & 0x7F00) >> 8)) {
        const c1 = (ccData >> 8) - 0x20;
        let c2 = -1;
        if (0x0020 <= (ccData & 0xFF) && (ccData & 0xFF) < 0x0080) {
            c2 = (ccData & 0xFF) - 0x20;
        }
        let chars = '';
        if (c1 >= 0 && c1 < CHAR_MAP.length) {
            chars += CHAR_MAP[c1];
        }
        if (c2 >= 0 && c2 < CHAR_MAP.length) {
            chars += CHAR_MAP[c2];
        }
        return { type: 'TEXT', label, text: chars };
    }
    return { type: 'UNKNOWN', label, raw: word };
}
function decodeSingleCode(wordText, isPair = false) {
    const evt = parseSccCode(wordText, isPair);
    const prefix = isPair ? '[Pair] ' : '';
    const lbl = evt.label || '';
    switch (evt.type) {
        case 'PAC':
            const ul = evt.underline ? ' Underlined' : '';
            return `${prefix}${lbl}Row ${String(evt.row).padStart(2, '0')}, Col ${String(evt.col).padStart(2, '0')}, ${evt.color}${ul}`;
        case 'MIDROW':
            const ul2 = evt.underline ? ' Underlined' : '';
            return `${prefix}${lbl}Mid-row: ${evt.color}${ul2}`;
        case 'CONTROL':
            return evt.desc || `${prefix}${lbl}${evt.name}`;
        case 'INDENT':
            const n = evt.spaces;
            return `${prefix}${lbl}Indent ${n} ${n === 1 ? 'space' : 'spaces'}`;
        case 'TEXT':
            return `${prefix}${lbl}Text: "${evt.text}"`;
        case 'NULL':
            return 'Null / Padding';
        case 'ERROR':
            return `Error: ${evt.desc}`;
        default:
            return 'Unknown Code';
    }
}
// Helper functions for buffer state
function getCommandByte(wordText) {
    return parseInt(wordText, 16) & 0xFF;
}
function isEoc(wordText) {
    return getCommandByte(wordText) === 0x2F;
}
function isRcl(wordText) {
    return getCommandByte(wordText) === 0x20;
}
function isEnm(wordText) {
    return getCommandByte(wordText) === 0x2E;
}
function isEdm(wordText) {
    return getCommandByte(wordText) === 0x2C;
}
function checkParityFast(hexStr) {
    try {
        const val = parseInt(hexStr, 16);
        return hasOddParity((val >> 8) & 0xFF) && hasOddParity(val & 0xFF);
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=sccDecoder.js.map