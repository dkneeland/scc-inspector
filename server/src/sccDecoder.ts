/**
 * SCC Decoder Module
 *
 * Low-level EIA-608 closed caption decoding logic.
 * Translated from Python scc_decoder.py, loads shared data from scc-core.
 */

import * as path from 'path';

// Load shared data – runtime JSON requires are intentional (data files outside TS compilation)
/* eslint-disable @typescript-eslint/no-require-imports */
const charMapData = require(path.join(__dirname, '../data/char_map.json'));
const controlCommandsData = require(path.join(__dirname, '../data/control_commands.json'));
const parityTableData = require(path.join(__dirname, '../data/parity_table.json'));
const colorsData = require(path.join(__dirname, '../data/colors.json'));
const rowMapData = require(path.join(__dirname, '../data/row_map.json'));
/* eslint-enable @typescript-eslint/no-require-imports */

// Constants from JSON data
const CHAR_MAP: string = charMapData.charString;
const VALID_BYTES: Set<number> = new Set(parityTableData.validBytes);
const COLOR_LIST: string[] = colorsData.colors;
const ROW_MAP: number[] = rowMapData.map;

// Build command names map from JSON
const COMMAND_NAMES: Map<number, string> = new Map();
for (const [hexKey, value] of Object.entries(controlCommandsData.commands)) {
    const byteVal = parseInt(hexKey, 16);
    COMMAND_NAMES.set(byteVal, (value as { description: string }).description);
}

// Regex patterns
export const HEX_PATTERN = /\b[0-9a-fA-F]{4}\b/g;
export const TIMESTAMP_PATTERN = /\d\d:\d\d:\d\d[:;]\d\d/;

// Bit-masking functions for EIA-608 command detection
function isPreamble(ccData: number): boolean {
    return 0x1040 === (0x7040 & ccData);
}

function isMidrowChange(ccData: number): boolean {
    return 0x1120 === (0x7770 & ccData);
}

function isControl(ccData: number): boolean {
    if (0x0200 & ccData) {
        return false;
    }
    return (0x1400 === (0x7600 & ccData)) || (0x1700 === (0x7700 & ccData));
}

function isTabOffset(ccData: number): boolean {
    return 0x1720 === (0x777C & ccData);
}

export function isPairingCommand(val: number): boolean {
    const masked = val & 0x7F7F;
    return isControl(masked) || isPreamble(masked) || isMidrowChange(masked) || isTabOffset(masked);
}

function hasOddParity(byte: number): boolean {
    return VALID_BYTES.has(byte);
}

export interface HexWord {
    text: string;
    start: number;
    end: number;
    isPaired: boolean;
    pairStart: number;
    pairEnd: number;
}

export interface DecodeEvent {
    type: 'TEXT' | 'CONTROL' | 'PAC' | 'MIDROW' | 'INDENT' | 'NULL' | 'ERROR' | 'UNKNOWN';
    label?: string;
    text?: string;
    name?: string;
    row?: number;
    col?: number;
    color?: string;
    underline?: boolean;
    isItalic?: boolean;
    isExtended?: boolean;
    isNewline?: boolean;
    isBackspace?: boolean;
    desc?: string;
    raw?: string;
    spaces?: number;
}

export function* iterHexWords(lineText: string): Generator<HexWord> {
    const matches = [...lineText.matchAll(HEX_PATTERN)];
    let i = 0;
    
    while (i < matches.length) {
        const curr = matches[i];
        const currText = curr[0].toLowerCase();
        const currStart = curr.index!;
        const currEnd = currStart + curr[0].length;
        const currVal = parseInt(currText, 16);
        
        if (isPairingCommand(currVal) && i + 1 < matches.length) {
            const nextMatch = matches[i + 1];
            if (nextMatch[0].toLowerCase() === currText) {
                const nextStart = nextMatch.index!;
                const nextEnd = nextStart + nextMatch[0].length;
                
                yield {
                    text: currText,
                    start: currStart,
                    end: currEnd,
                    isPaired: true,
                    pairStart: Math.min(currStart, nextStart),
                    pairEnd: Math.max(currEnd, nextEnd)
                };
                
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

export function parseSccCode(wordText: string, _isPair: boolean = false): DecodeEvent {
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
        
        let col: number;
        let color: string;
        
        if (ccData & 0x10) {
            col = 4 * ((0x000E & ccData) >> 1);
            color = 'White';
        } else {
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
        } else if (0x1320 <= ccData && ccData < 0x1340) {
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

export function decodeSingleCode(wordText: string, isPair: boolean = false): string {
    const evt = parseSccCode(wordText, isPair);
    const prefix = isPair ? '[Pair] ' : '';
    const lbl = evt.label || '';
    
    switch (evt.type) {
        case 'PAC': {
            const ul = evt.underline ? ' Underlined' : '';
            return `${prefix}${lbl}Row ${String(evt.row).padStart(2, '0')}, Col ${String(evt.col).padStart(2, '0')}, ${evt.color}${ul}`;
        }
        case 'MIDROW': {
            const ul2 = evt.underline ? ' Underlined' : '';
            return `${prefix}${lbl}Mid-row: ${evt.color}${ul2}`;
        }
        case 'CONTROL':
            return evt.desc || `${prefix}${lbl}${evt.name}`;
        case 'INDENT': {
            const n = evt.spaces!;
            return `${prefix}${lbl}Indent ${n} ${n === 1 ? 'space' : 'spaces'}`;
        }
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
export function getCommandByte(wordText: string): number {
    return parseInt(wordText, 16) & 0x7F;
}

export function isEoc(wordText: string): boolean {
    return getCommandByte(wordText) === 0x2F;
}

export function isRcl(wordText: string): boolean {
    return getCommandByte(wordText) === 0x20;
}

export function isEnm(wordText: string): boolean {
    return getCommandByte(wordText) === 0x2E;
}

export function isEdm(wordText: string): boolean {
    return getCommandByte(wordText) === 0x2C;
}

export function checkParityFast(hexStr: string): boolean {
    const val = parseInt(hexStr, 16);
    if (isNaN(val)) return false;
    return hasOddParity((val >> 8) & 0xFF) && hasOddParity(val & 0xFF);
}