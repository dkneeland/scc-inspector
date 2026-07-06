/**
 * SCC Analyzer Module
 *
 * Core state machine for SCC file analysis.
 * Builds timing maps and buffer snapshots for diagnostic and tooltip features.
 */

import { iterHexWords, parseSccCode, TIMESTAMP_PATTERN, isEoc, isEdm, isEnm, isRcl, DecodeEvent, checkParityFast, HexWord } from './sccDecoder';
import { detectFrameRate, addFrames, parseTimestampStr, compareTimestamps, validateTimestamp } from './sccTimecode';
import { createHash } from 'crypto';

export interface TimestampInfo {
    timestampStr: string;
    packetCount: number;
}

export interface TimeRange {
    startTime: string | null;
    endTime: string | null;
}

export interface BufferSnapshot {
    bufferText: string;
    highlightStart: number;
    highlightEnd: number;
}

export interface OverflowResult {
    isOverflow: boolean;
    overflowCount: number;
}

export interface DiagnosticInfo {
    lineNum: number;
    startChar: number;
    endChar: number;
    code: string;
    message: string;
    severity: 'error' | 'warning' | 'info';
}

export interface AnalysisResult {
    frameRate: string | null;
    timestampMap: Map<number, TimestampInfo>;
    timeMap: Map<number, TimeRange>;
    lineTexts: Map<number, string>;
    neverDisplayedLines: number[];
    neverErasedLines: number[];
    nonMonotonicLines: number[];
    sortedLineNums: number[];
}

interface BufferState {
    bufText: string;
    initialState: { row: number; col: number; color: string } | null;
    isItalic: boolean;
}

function applyEventToBuffer(state: BufferState, evt: DecodeEvent, wordText: string): void {
    switch (evt.type) {
        case 'PAC':
            if (state.initialState === null) {
                state.initialState = {
                    row: evt.row ?? 0,
                    col: evt.col ?? 0,
                    color: evt.color ?? 'White'
                };
            } else {
                state.bufText += `{R${String(evt.row ?? 0).padStart(2, '0')} C${String(evt.col ?? 0).padStart(2, '0')} ${evt.color ?? 'White'}}`;
            }
            state.isItalic = evt.isItalic ?? false;
            break;
        case 'TEXT':
            state.bufText += evt.text ?? '';
            break;
        case 'MIDROW':
            state.bufText += '<i>';
            state.isItalic = evt.isItalic ?? false;
            break;
        case 'INDENT':
            state.bufText += ' '.repeat(evt.spaces ?? 0);
            break;
        case 'CONTROL':
            if (evt.isBackspace && state.bufText.length > 0) {
                state.bufText = state.bufText.slice(0, -1);
            }
            if (isEnm(wordText) || isRcl(wordText)) {
                state.bufText = '';
                state.initialState = null;
            }
            break;
    }
}

function binarySearchIndex(sortedArr: number[], target: number): number {
    let lo = 0;
    let hi = sortedArr.length - 1;
    while (lo <= hi) {
        const mid = (lo + hi) >>> 1;
        if (sortedArr[mid] === target) return mid;
        if (sortedArr[mid] < target) lo = mid + 1;
        else hi = mid - 1;
    }
    return -1;
}

function getContentRange(hexWords: HexWord[]): { startChar: number; endChar: number } | null {
    let startChar = -1;
    let endChar = -1;

    for (const word of hexWords) {
        if (word.isPaired && word.start > word.pairStart) {
            continue;
        }

        const evt = parseSccCode(word.text, word.isPaired);
        if (!['TEXT', 'PAC', 'MIDROW', 'INDENT'].includes(evt.type)) {
            continue;
        }

        if (startChar === -1) {
            startChar = word.pairStart;
        }
        endChar = word.pairEnd;
    }

    if (startChar === -1 || endChar === -1) {
        return null;
    }

    return { startChar, endChar };
}

export class SccDocument {
    private contentHash: string = '';
    private analysis: AnalysisResult | null = null;
    private rawText: string = '';
    private lines: string[] = [];

    analyze(text: string): AnalysisResult {
        const newHash = createHash('md5').update(text).digest('hex');
        if (this.analysis && this.contentHash === newHash) {
            return this.analysis;
        }
        
        this.rawText = text;
        this.lines = text.split(/\r?\n/);
        this.contentHash = newHash;
        this.analysis = this._performAnalysis(text);
        return this.analysis;
    }

    private _performAnalysis(text: string): AnalysisResult {
        const timestampMap = new Map<number, TimestampInfo>();
        const timeMap = new Map<number, TimeRange>();
        const lineTexts = new Map<number, string>();
        const neverDisplayedLines: number[] = [];
        const neverErasedLines: number[] = [];
        const nonMonotonicLines: number[] = [];

        const [frameRate] = detectFrameRate(text);
        const validFrameRate = frameRate !== 'INVALID' ? frameRate : '29.97 NDF';

        const lines = this.lines;
        const pendingLines: number[] = [];
        const activeLines: number[] = [];

        for (let lineNum = 0; lineNum < lines.length; lineNum++) {
            const lineText = lines[lineNum];
            
            if (!lineText.trim()) {
                continue;
            }

            const tsMatch = lineText.match(TIMESTAMP_PATTERN);
            if (!tsMatch) {
                continue;
            }

            const timestampStr = tsMatch[0];
            lineTexts.set(lineNum, lineText);

            const hexWords = [...iterHexWords(lineText)];
            let packetCount = 0;
            let hasAddedPending = false;
            let wordIdx = 0;

            for (const word of hexWords) {
                const isSecondOfPair = word.isPaired && word.start > word.pairStart;
                
                if (isSecondOfPair) {
                    packetCount++;
                    wordIdx++;
                    continue;
                }

                const evt = parseSccCode(word.text, word.isPaired);

                if ((evt.type === 'TEXT' || evt.type === 'PAC') && !hasAddedPending) {
                    pendingLines.push(lineNum);
                    timeMap.set(lineNum, { startTime: null, endTime: null });
                    hasAddedPending = true;
                }

                if (isEoc(word.text)) {
                    let startTimeStr: string;
                    try {
                        const ts = parseTimestampStr(timestampStr);
                        if (validFrameRate) {
                            [startTimeStr] = addFrames(ts.hours, ts.minutes, ts.seconds, ts.frames, wordIdx, validFrameRate);
                        } else {
                            startTimeStr = timestampStr;
                        }
                    } catch {
                        startTimeStr = timestampStr;
                    }

                    for (const activeLine of activeLines) {
                        const tr = timeMap.get(activeLine);
                        if (tr) {
                            tr.endTime = startTimeStr;
                        }
                    }

                    for (const pendingLine of pendingLines) {
                        const tr = timeMap.get(pendingLine);
                        if (tr) {
                            tr.startTime = startTimeStr;
                        }
                    }

                    activeLines.length = 0;
                    activeLines.push(...pendingLines);
                    pendingLines.length = 0;
                    hasAddedPending = false;
                }

                if (isEdm(word.text)) {
                    let endTimeStr: string;
                    try {
                        const ts = parseTimestampStr(timestampStr);
                        if (validFrameRate) {
                            [endTimeStr] = addFrames(ts.hours, ts.minutes, ts.seconds, ts.frames, wordIdx, validFrameRate);
                        } else {
                            endTimeStr = timestampStr;
                        }
                    } catch {
                        endTimeStr = timestampStr;
                    }

                    for (const activeLine of activeLines) {
                        const tr = timeMap.get(activeLine);
                        if (tr) {
                            tr.endTime = endTimeStr;
                        }
                    }
                    activeLines.length = 0;
                }

                if (isEnm(word.text)) {
                    pendingLines.length = 0;
                    hasAddedPending = false;
                }

                packetCount++;
                wordIdx++;
            }

            timestampMap.set(lineNum, { timestampStr, packetCount });
        }

        for (const [lineNum, tr] of timeMap) {
            if (tr.startTime === null) {
                neverDisplayedLines.push(lineNum);
            }
            if (tr.startTime !== null && tr.endTime === null) {
                neverErasedLines.push(lineNum);
            }
        }

        const sortedLineNums = [...timestampMap.keys()].sort((a, b) => a - b);
        for (let i = 1; i < sortedLineNums.length; i++) {
            const prevEntry = timestampMap.get(sortedLineNums[i - 1])!;
            const currEntry = timestampMap.get(sortedLineNums[i])!;
            try {
                if (compareTimestamps(currEntry.timestampStr, prevEntry.timestampStr) < 0) {
                    nonMonotonicLines.push(sortedLineNums[i]);
                }
            } catch {
                // timestamp parsing failed; skip comparison
            }
        }

        return {
            frameRate: validFrameRate,
            timestampMap,
            timeMap,
            lineTexts,
            neverDisplayedLines,
            neverErasedLines,
            nonMonotonicLines,
            sortedLineNums
        };
    }

    getBufferSnapshot(lineNum: number, targetWordIdx: number): BufferSnapshot {
        if (!this.analysis) {
            return { bufferText: '', highlightStart: -1, highlightEnd: -1 };
        }

        const lines = this.lines;
        const historicalLines: { lineNum: number; text: string }[] = [];

        for (let i = lineNum - 1; i >= 0; i--) {
            const lineText = lines[i];
            if (!lineText || !lineText.trim()) {
                continue;
            }
            
            const tsMatch = lineText.match(TIMESTAMP_PATTERN);
            if (!tsMatch) {
                continue;
            }

            const hexWords = [...iterHexWords(lineText)];
            let hasEnm = false;
            for (const word of hexWords) {
                const isSecondOfPair = word.isPaired && word.start > word.pairStart;
                if (isSecondOfPair) continue;
                if (isEnm(word.text)) {
                    hasEnm = true;
                    break;
                }
            }

            historicalLines.unshift({ lineNum: i, text: lineText });
            
            if (hasEnm) {
                break;
            }
        }

        const buf: BufferState = { bufText: '', initialState: null, isItalic: false };

        for (const histLine of historicalLines) {
            const hexWords = [...iterHexWords(histLine.text)];

            for (const word of hexWords) {
                const isSecondOfPair = word.isPaired && word.start > word.pairStart;
                if (isSecondOfPair) continue;

                const evt = parseSccCode(word.text, word.isPaired);
                applyEventToBuffer(buf, evt, word.text);
            }
        }

        const currentLineText = lines[lineNum];
        if (!currentLineText) {
            return { bufferText: this._formatBuffer(buf.bufText, buf.initialState), highlightStart: -1, highlightEnd: -1 };
        }

        const hexWords = [...iterHexWords(currentLineText)];
        let logicalIdx = 0;
        let wordLogicalIdx = 0;
        let highlightStart = -1;
        let highlightEnd = -1;

        for (const word of hexWords) {
            const isSecondOfPair = word.isPaired && word.start > word.pairStart;

            if (!isSecondOfPair) {
                wordLogicalIdx = logicalIdx;
            }

            const evt = parseSccCode(word.text, word.isPaired);

            if (wordLogicalIdx === targetWordIdx) {
                switch (evt.type) {
                    case 'TEXT':
                        highlightStart = buf.bufText.length;
                        buf.bufText += evt.text ?? '';
                        highlightEnd = buf.bufText.length;
                        break;
                    case 'PAC': {
                        const pacStr = `{R${String(evt.row ?? 0).padStart(2, '0')} C${String(evt.col ?? 0).padStart(2, '0')} ${evt.color ?? 'White'}}`;
                        highlightStart = buf.bufText.length;
                        buf.bufText += pacStr;
                        highlightEnd = buf.bufText.length;
                        break;
                    }
                    case 'MIDROW': {
                        const midStr = buf.isItalic ? '</i>' : '<i>';
                        highlightStart = buf.bufText.length;
                        buf.bufText += midStr;
                        highlightEnd = buf.bufText.length;
                        buf.isItalic = !buf.isItalic;
                        break;
                    }
                    case 'INDENT': {
                        const indentStr = ' '.repeat(evt.spaces ?? 0);
                        highlightStart = buf.bufText.length;
                        buf.bufText += indentStr;
                        highlightEnd = buf.bufText.length;
                        break;
                    }
                    case 'CONTROL':
                        if (evt.isBackspace) {
                            highlightStart = Math.max(0, buf.bufText.length - 1);
                            buf.bufText = buf.bufText.slice(0, -1);
                            highlightEnd = buf.bufText.length;
                        } else if (isEnm(word.text) || isRcl(word.text)) {
                            highlightStart = 0;
                            buf.bufText = '';
                            highlightEnd = 0;
                            buf.initialState = null;
                        }
                        break;
                    case 'NULL':
                        highlightStart = -1;
                        highlightEnd = -1;
                        break;
                    default:
                        highlightStart = buf.bufText.length;
                        highlightEnd = buf.bufText.length;
                }
                break;
            }

            if (!isSecondOfPair) {
                applyEventToBuffer(buf, evt, word.text);
                logicalIdx++;
            }
        }

        const formatted = this._formatBuffer(buf.bufText, buf.initialState);
        const prefixLen = formatted.length - buf.bufText.length;
        return {
            bufferText: formatted,
            highlightStart: highlightStart >= 0 ? highlightStart + prefixLen : -1,
            highlightEnd: highlightEnd >= 0 ? highlightEnd + prefixLen : -1
        };
    }

    private _formatBuffer(text: string, state: { row: number; col: number; color: string } | null): string {
        if (!state) {
            return text;
        }
        const prefix = `{R${String(state.row).padStart(2, '0')} C${String(state.col).padStart(2, '0')} ${state.color}}`;
        return prefix + text;
    }

    checkOverflow(lineNum: number): OverflowResult {
        if (!this.analysis) {
            return { isOverflow: false, overflowCount: 0 };
        }

        const { timestampMap, frameRate, sortedLineNums } = this.analysis;
        
        const currentEntry = timestampMap.get(lineNum);
        if (!currentEntry) {
            return { isOverflow: false, overflowCount: 0 };
        }

        const sortedKeys = sortedLineNums;
        const currentIdx = binarySearchIndex(sortedKeys, lineNum);
        
        if (currentIdx === -1 || currentIdx >= sortedKeys.length - 1) {
            return { isOverflow: false, overflowCount: 0 };
        }

        const nextLineNum = sortedKeys[currentIdx + 1];
        const nextEntry = timestampMap.get(nextLineNum);
        
        if (!nextEntry || !frameRate) {
            return { isOverflow: false, overflowCount: 0 };
        }

        try {
            const currentTs = parseTimestampStr(currentEntry.timestampStr);
            const [lastPacketTime] = addFrames(
                currentTs.hours, currentTs.minutes, currentTs.seconds, currentTs.frames,
                Math.max(0, currentEntry.packetCount - 1),
                frameRate
            );

            if (compareTimestamps(lastPacketTime, nextEntry.timestampStr) >= 0) {
                const totalPackets = currentEntry.packetCount;
                const lineText = this.lines[lineNum];
                if (!lineText) {
                    return { isOverflow: true, overflowCount: totalPackets };
                }
                
                const hexWords = [...iterHexWords(lineText)];
                let overflowCount = 0;
                
                for (let i = 0; i < hexWords.length; i++) {
                    const testIdx = i;
                    const [testTime] = addFrames(
                        currentTs.hours, currentTs.minutes, currentTs.seconds, currentTs.frames,
                        testIdx,
                        frameRate
                    );
                    if (compareTimestamps(testTime, nextEntry.timestampStr) >= 0) {
                        overflowCount = hexWords.length - i;
                        break;
                    }
                }
                
                return { isOverflow: true, overflowCount: Math.max(1, overflowCount) };
            }

            return { isOverflow: false, overflowCount: 0 };
        } catch {
            return { isOverflow: false, overflowCount: 0 };
        }
    }

    getAnalysis(): AnalysisResult | null {
        return this.analysis;
    }

    getContentHash(): string {
        return this.contentHash;
    }

    collectDiagnostics(): DiagnosticInfo[] {
        if (!this.analysis) return [];
        const diagnostics: DiagnosticInfo[] = [];
        const { lineTexts } = this.analysis;

        // Cache hex words per line — reused by SCC001/SCC003/SCC004/SCC005
        const hexWordsCache = new Map<number, HexWord[]>();
        const getHexWords = (lineNum: number, lineText: string): HexWord[] => {
            let cached = hexWordsCache.get(lineNum);
            if (!cached) {
                cached = [...iterHexWords(lineText)];
                hexWordsCache.set(lineNum, cached);
            }
            return cached;
        };

        for (const [lineNum, lineText] of lineTexts) {
            const tsMatch = lineText.match(TIMESTAMP_PATTERN);

            // SCC002: Invalid timestamps
            if (tsMatch) {
                const tsStr = tsMatch[0];
                const tsStart = tsMatch.index ?? 0;
                const tsEnd = tsStart + tsStr.length;

                if (!validateTimestamp(tsStr)) {
                    diagnostics.push({
                        lineNum,
                        startChar: tsStart,
                        endChar: tsEnd,
                        code: 'SCC002',
                        message: `Invalid timestamp: ${tsStr} - values out of range`,
                        severity: 'error'
                    });
                }
            }

            // SCC001: Parity errors
            const hexWords = getHexWords(lineNum, lineText);
            for (const word of hexWords) {
                if (!checkParityFast(word.text)) {
                    diagnostics.push({
                        lineNum,
                        startChar: word.start,
                        endChar: word.end,
                        code: 'SCC001',
                        message: `Parity error: invalid byte in ${word.text.toUpperCase()}`,
                        severity: 'error'
                    });
                }
            }

            // SCC003: Buffer overflow
            const overflow = this.checkOverflow(lineNum);
            if (overflow.isOverflow && overflow.overflowCount > 0) {
                if (hexWords.length > 0 && overflow.overflowCount <= hexWords.length) {
                    const firstOverflowIdx = hexWords.length - overflow.overflowCount;
                    const firstWord = hexWords[firstOverflowIdx];
                    const lastWord = hexWords[hexWords.length - 1];

                    diagnostics.push({
                        lineNum,
                        startChar: firstWord.start,
                        endChar: lastWord.end,
                        code: 'SCC003',
                        message: `Buffer overflow: ${overflow.overflowCount} packet(s) exceed next timestamp`,
                        severity: 'warning'
                    });
                }
            }
        }

        // SCC004: Never-displayed captions (from neverDisplayedLines)
        for (const lineNum of this.analysis.neverDisplayedLines) {
            const lineText = this.lines[lineNum] ?? '';
            const hexWords = getHexWords(lineNum, lineText);
            const range = getContentRange(hexWords);
            if (!range) continue;

            diagnostics.push({
                lineNum,
                startChar: range.startChar,
                endChar: range.endChar,
                code: 'SCC004',
                message: 'Caption never displayed - has text but no EOC (End of Caption)',
                severity: 'warning'
            });
        }

        // SCC005: Never-erased captions (from neverErasedLines)
        for (const lineNum of this.analysis.neverErasedLines) {
            const lineText = this.lines[lineNum] ?? '';
            const hexWords = getHexWords(lineNum, lineText);
            const range = getContentRange(hexWords);
            if (!range) continue;

            diagnostics.push({
                lineNum,
                startChar: range.startChar,
                endChar: range.endChar,
                code: 'SCC005',
                message: 'Caption never erased - has EOC but no EDM (Erase Displayed Memory)',
                severity: 'info'
            });
        }

        // SCC006: Non-monotonic timestamps (from nonMonotonicLines)
        for (const lineNum of this.analysis.nonMonotonicLines) {
            const lineText = this.lines[lineNum] ?? '';
            const tsMatch = lineText.match(TIMESTAMP_PATTERN);
            const tsStart = tsMatch?.index ?? 0;
            const tsEnd = tsMatch ? tsStart + tsMatch[0].length : lineText.length;

            diagnostics.push({
                lineNum,
                startChar: tsStart,
                endChar: tsEnd,
                code: 'SCC006',
                message: 'Non-monotonic timestamp - timestamp goes backwards from previous line',
                severity: 'warning'
            });
        }

        return diagnostics;
    }
}
