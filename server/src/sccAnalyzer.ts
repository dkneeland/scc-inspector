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

export interface AnalysisResult {
    frameRate: string | null;
    timestampMap: Map<number, TimestampInfo>;
    timeMap: Map<number, TimeRange>;
    lineTexts: Map<number, string>;
    neverDisplayedLines: number[];
}

export class SccDocument {
    private contentHash: string = '';
    private analysis: AnalysisResult | null = null;
    private rawText: string = '';

    analyze(text: string): AnalysisResult {
        const newHash = createHash('md5').update(text).digest('hex');
        if (this.analysis && this.contentHash === newHash) {
            return this.analysis;
        }
        
        this.rawText = text;
        this.contentHash = newHash;
        this.analysis = this._performAnalysis(text);
        return this.analysis;
    }

    private _performAnalysis(text: string): AnalysisResult {
        const timestampMap = new Map<number, TimestampInfo>();
        const timeMap = new Map<number, TimeRange>();
        const lineTexts = new Map<number, string>();
        const neverDisplayedLines: number[] = [];

        const [frameRate] = detectFrameRate(text);
        const validFrameRate = frameRate !== 'INVALID' ? frameRate : null;

        const lines = text.split(/\r?\n/);
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

            const seenPaired = new Set<string>();

            for (const word of hexWords) {
                const wordKey = `${word.text}:${word.start}`;
                
                if (word.isPaired && seenPaired.has(word.text)) {
                    packetCount++;
                    wordIdx++;
                    continue;
                }
                
                if (word.isPaired) {
                    seenPaired.add(word.text);
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
        }

        return {
            frameRate: validFrameRate,
            timestampMap,
            timeMap,
            lineTexts,
            neverDisplayedLines
        };
    }

    getBufferSnapshot(lineNum: number, targetWordIdx: number): BufferSnapshot {
        if (!this.analysis) {
            return { bufferText: '', highlightStart: -1, highlightEnd: -1 };
        }

        const lines = this.rawText.split(/\r?\n/);
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
            const seenPaired = new Set<string>();

            for (const word of hexWords) {
                if (word.isPaired && seenPaired.has(word.text)) {
                    continue;
                }
                if (word.isPaired) {
                    seenPaired.add(word.text);
                }

                const evt = parseSccCode(word.text, word.isPaired);

                switch (evt.type) {
                    case 'PAC':
                        initialState = {
                            row: evt.row ?? 0,
                            col: evt.col ?? 0,
                            color: evt.color ?? 'White'
                        };
                        isItalic = evt.isItalic ?? false;
                        break;
                    case 'TEXT':
                        bufText += evt.text ?? '';
                        break;
                    case 'MIDROW':
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
        let highlightStart = -1;
        let highlightEnd = -1;
        const seenPaired = new Set<string>();

        for (const word of hexWords) {
            if (word.isPaired && seenPaired.has(word.text)) {
                continue;
            }
            if (word.isPaired) {
                seenPaired.add(word.text);
            }

            const evt = parseSccCode(word.text, word.isPaired);

            if (logicalIdx === targetWordIdx) {
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
                        } else if (isEnm(word.text) || isEdm(word.text)) {
                            highlightStart = 0;
                            bufText = '';
                            highlightEnd = 0;
                        } else {
                            highlightStart = bufText.length;
                            highlightEnd = bufText.length;
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

            switch (evt.type) {
                case 'PAC':
                    initialState = {
                        row: evt.row ?? 0,
                        col: evt.col ?? 0,
                        color: evt.color ?? 'White'
                    };
                    isItalic = evt.isItalic ?? false;
                    break;
                case 'TEXT':
                    bufText += evt.text ?? '';
                    break;
                case 'MIDROW':
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

            logicalIdx++;
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

        const { timestampMap, frameRate } = this.analysis;
        
        const currentEntry = timestampMap.get(lineNum);
        if (!currentEntry) {
            return { isOverflow: false, overflowCount: 0 };
        }

        const sortedKeys = [...timestampMap.keys()].sort((a, b) => a - b);
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
                const lines = this.rawText.split(/\r?\n/);
                const lineText = lines[lineNum];
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
}

export function createSccDocument(): SccDocument {
    return new SccDocument();
}