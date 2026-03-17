/**
 * SCC Analyzer Module
 *
 * Core state machine for SCC file analysis.
 * Builds timing maps and buffer snapshots for diagnostic and tooltip features.
 */

import { iterHexWords, parseSccCode, TIMESTAMP_PATTERN, isEoc, isEdm, isEnm, isRcl, HexWord, DecodeEvent } from './sccDecoder';
import { detectFrameRate, addFrames, parseTimestampStr, compareTimestamps, FrameRateConfig, getFrameRateConfig } from './sccTimecode';
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
        const validFrameRate = frameRate !== 'INVALID' ? frameRate : null;

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
        const sortedKeys = sortedLineNums;
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
                if (word.isPaired) continue;
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

        let bufText = '';
        let initialState: { row: number; col: number; color: string } | null = null;
        let isItalic = false;

        for (const histLine of historicalLines) {
            const hexWords = [...iterHexWords(histLine.text)];

            for (const word of hexWords) {
                const isSecondOfPair = word.isPaired && word.start > word.pairStart;
                if (isSecondOfPair) continue;

                const evt = parseSccCode(word.text, word.isPaired);

                switch (evt.type) {
                    case 'PAC':
                        if (initialState === null) {
                            initialState = {
                                row: evt.row ?? 0,
                                col: evt.col ?? 0,
                                color: evt.color ?? 'White'
                            };
                        } else {
                            bufText += `{R${String(evt.row ?? 0).padStart(2, '0')} C${String(evt.col ?? 0).padStart(2, '0')} ${evt.color ?? 'White'}}`;
                        }
                        isItalic = evt.isItalic ?? false;
                        break;
                    case 'TEXT':
                        bufText += evt.text ?? '';
                        break;
                    case 'MIDROW':
                        bufText += '<i>';
                        isItalic = evt.isItalic ?? false;
                        break;
                    case 'INDENT':
                        bufText += ' '.repeat(evt.spaces ?? 0);
                        break;
                    case 'CONTROL':
                        if (evt.isBackspace && bufText.length > 0) {
                            bufText = bufText.slice(0, -1);
                        }
                        if (isEnm(word.text) || isRcl(word.text)) {
                            bufText = '';
                            initialState = null;
                        }
                        break;
                }
            }
        }

        const currentLineText = lines[lineNum];
        if (!currentLineText) {
            return { bufferText: this._formatBuffer(bufText, initialState), highlightStart: -1, highlightEnd: -1 };
        }

        const hexWords = [...iterHexWords(currentLineText)];
        let logicalIdx = 0;
        let wordLogicalIdx = 0;
        let highlightStart = -1;
        let highlightEnd = -1;

        for (const word of hexWords) {
            const isSecondOfPair = word.isPaired && word.start > word.pairStart;

            // Assign logical index for this word (second of pair shares same index as first)
            if (!isSecondOfPair) {
                wordLogicalIdx = logicalIdx;
            }

            const evt = parseSccCode(word.text, word.isPaired);

            if (wordLogicalIdx === targetWordIdx) {
                switch (evt.type) {
                    case 'TEXT':
                        highlightStart = bufText.length;
                        bufText += evt.text ?? '';
                        highlightEnd = bufText.length;
                        break;
                    case 'PAC':
                        const pacStr = `{R${String(evt.row ?? 0).padStart(2, '0')} C${String(evt.col ?? 0).padStart(2, '0')} ${evt.color ?? 'White'}}`;
                        highlightStart = bufText.length;
                        bufText += pacStr;
                        highlightEnd = bufText.length;
                        break;
                    case 'MIDROW':
                        const midStr = isItalic ? '</i>' : '<i>';
                        highlightStart = bufText.length;
                        bufText += midStr;
                        highlightEnd = bufText.length;
                        isItalic = !isItalic;
                        break;
                    case 'INDENT':
                        const indentStr = ' '.repeat(evt.spaces ?? 0);
                        highlightStart = bufText.length;
                        bufText += indentStr;
                        highlightEnd = bufText.length;
                        break;
                    case 'CONTROL':
                        if (evt.isBackspace) {
                            highlightStart = Math.max(0, bufText.length - 1);
                            bufText = bufText.slice(0, -1);
                            highlightEnd = bufText.length;
                        } else if (isEnm(word.text) || isRcl(word.text)) {
                            highlightStart = 0;
                            bufText = '';
                            highlightEnd = 0;
                            initialState = null;
                        }
                        break;
                    case 'NULL':
                        highlightStart = -1;
                        highlightEnd = -1;
                        break;
                    default:
                        highlightStart = bufText.length;
                        highlightEnd = bufText.length;
                }
                break;
            }

            // Process for buffer state (only for first of pair or non-paired words)
            if (!isSecondOfPair) {
                switch (evt.type) {
                    case 'PAC':
                        if (initialState === null) {
                            initialState = {
                                row: evt.row ?? 0,
                                col: evt.col ?? 0,
                                color: evt.color ?? 'White'
                            };
                        } else {
                            bufText += `{R${String(evt.row ?? 0).padStart(2, '0')} C${String(evt.col ?? 0).padStart(2, '0')} ${evt.color ?? 'White'}}`;
                        }
                        isItalic = evt.isItalic ?? false;
                        break;
                    case 'TEXT':
                        bufText += evt.text ?? '';
                        break;
                    case 'MIDROW':
                        bufText += '<i>';
                        isItalic = evt.isItalic ?? false;
                        break;
                    case 'INDENT':
                        bufText += ' '.repeat(evt.spaces ?? 0);
                        break;
                    case 'CONTROL':
                        if (evt.isBackspace && bufText.length > 0) {
                            bufText = bufText.slice(0, -1);
                        }
                        if (isEnm(word.text) || isRcl(word.text)) {
                            bufText = '';
                            initialState = null;
                        }
                        break;
                }
            }

            // Only increment logical index for first of pair or non-paired words
            if (!isSecondOfPair) {
                logicalIdx++;
            }
        }

        const formatted = this._formatBuffer(bufText, initialState);
        const prefixLen = formatted.length - bufText.length;
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
        const currentIdx = sortedKeys.indexOf(lineNum);
        
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
                    const testIdx = Math.max(0, i);
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

        // SCC004: Never-displayed captions (from neverDisplayedLines)
        for (const lineNum of this.analysis.neverDisplayedLines) {
            diagnostics.push({
                lineNum,
                startChar: 0,
                endChar: 0,
                code: 'SCC004',
                message: 'Caption never displayed - has text but no EOC (End of Caption)',
                severity: 'warning'
            });
        }

        // SCC005: Never-erased captions (from neverErasedLines)
        for (const lineNum of this.analysis.neverErasedLines) {
            diagnostics.push({
                lineNum,
                startChar: 0,
                endChar: 0,
                code: 'SCC005',
                message: 'Caption never erased - has EOC but no EDM (Erase Displayed Memory)',
                severity: 'warning'
            });
        }

        // SCC006: Non-monotonic timestamps (from nonMonotonicLines)
        for (const lineNum of this.analysis.nonMonotonicLines) {
            diagnostics.push({
                lineNum,
                startChar: 0,
                endChar: 0,
                code: 'SCC006',
                message: 'Non-monotonic timestamp - timestamp goes backwards from previous line',
                severity: 'error'
            });
        }

        return diagnostics;
    }
}

export function createSccDocument(): SccDocument {
    return new SccDocument();
}