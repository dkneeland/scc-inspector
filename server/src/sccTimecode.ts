/**
 * SCC Timecode Module
 *
 * Timecode parsing, arithmetic, and validation for SCC files.
 * Uses frame rate configuration from scc-core/data/frame_rates.json.
 */

import * as path from 'path';
import { TIMESTAMP_PATTERN } from './sccDecoder';

// Load shared frame rate config – runtime JSON require is intentional
// eslint-disable-next-line @typescript-eslint/no-require-imports
const frameRatesData = require(path.join(__dirname, '../data/frame_rates.json'));

export interface CadenceConfig {
    packets: number;
    frames: number;
}

export interface FrameRateConfig {
    name: string;
    videoFps: number;
    isDropFrame: boolean;
    cadence: CadenceConfig | null;
    maxFrame: number;
    description: string;
}

export interface DropFrameRules {
    skipFramesAtMinute: number[];
    skipEveryMinuteExcept: number[];
}

export interface DetectionRules {
    dropFrameSeparator: string;
    sampleLimit: number;
    invalidFrameThreshold: number;
}

export const FRAME_RATES: Record<string, FrameRateConfig> = frameRatesData.frameRates;
export const DROP_FRAME_RULES: DropFrameRules = frameRatesData.dropFrameRules;
export const DETECTION_RULES: DetectionRules = frameRatesData.detectionRules;

export function getFrameRateConfig(frameRateStr: string): FrameRateConfig {
    if (!(frameRateStr in FRAME_RATES)) {
        throw new Error(`Invalid frame rate: ${frameRateStr}`);
    }
    return FRAME_RATES[frameRateStr];
}

export interface Timestamp {
    hours: number;
    minutes: number;
    seconds: number;
    frames: number;
}

export function parseTimestampStr(tsStr: string): Timestamp {
    const parts = tsStr.replace(';', ':').split(':');
    return {
        hours: parseInt(parts[0], 10),
        minutes: parseInt(parts[1], 10),
        seconds: parseInt(parts[2], 10),
        frames: parseInt(parts[3], 10)
    };
}

/**
 * Convert a packet offset to a frame offset, accounting for frame rate cadence.
 *
 * For fractional frame rates at 30 Hz sampling (e.g. 23.98 at 5/4, 25 at 6/5),
 * not every packet represents a new frame — some repeat the previous frame count.
 * The cadence configuration defines how many packets complete a cycle and how
 * many frames that cycle advances.  Non-fractional rates (null cadence) use 1:1.
 */
export function packetsToFrames(packetOffset: number, cadence: CadenceConfig | null): number {
    if (cadence) {
        const p = cadence.packets;
        const f = cadence.frames;
        return Math.floor(packetOffset / p) * f + Math.min(packetOffset % p, f - 1);
    }
    return packetOffset;
}

/**
 * Convert H:M:S:F to a continuous total frame count.
 *
 * Non-drop-frame: plain arithmetic.
 * Drop-frame:     apply SMPTE 12M-1999 drop-frame compensation — subtract 2
 *                 frames (or 4 for 59.94) for every minute of elapsed time
 *                 that is NOT divisible by 10.
 */
export function timecodeToFrames(
    hours: number,
    minutes: number,
    seconds: number,
    frames: number,
    frameRateStr: string
): number {
    const config = getFrameRateConfig(frameRateStr);
    const fps = config.videoFps;

    let total = (hours * 3600 + minutes * 60 + seconds) * fps + frames;

    if (config.isDropFrame) {
        const dropPerMin = fps === 30 ? 2 : 4;
        const totalMinutes = hours * 60 + minutes;
        const numDrop = totalMinutes - Math.floor(totalMinutes / 10);
        total -= numDrop * dropPerMin;
    }

    return total;
}

/**
 * Convert a continuous total frame count back to an H:M:S:F timecode string.
 *
 * Non-drop-frame: simple division by fps.
 * Drop-frame:     SMPTE 12M-1999 reverse — add back the dropped frames via
 *                 the canonical ten-minute-cycle algorithm, then divide.
 *
 * The result is zero-padded with the correct separator (';' for DF, ':' for NDF).
 */
export function framesToTimecode(totalFrames: number, frameRateStr: string): string {
    const config = getFrameRateConfig(frameRateStr);
    const fps = config.videoFps;
    const isDf = config.isDropFrame;

    let hh: number, mm: number, ss: number, ff: number;

    if (!isDf) {
        const totalSecs = Math.floor(totalFrames / fps);
        ff = totalFrames % fps;
        hh = Math.floor(totalSecs / 3600);
        mm = Math.floor((totalSecs % 3600) / 60);
        ss = totalSecs % 60;
    } else {
        // SMPTE 12M-1999 drop-frame algorithm
        const framesPerMinNominal = fps * 60;
        const dropPerMin = fps === 30 ? 2 : 4;
        const tenMinCycleFrames = framesPerMinNominal * 10 - dropPerMin * 9;

        const num10MinCycles = Math.floor(totalFrames / tenMinCycleFrames);
        const remaining = totalFrames % tenMinCycleFrames;

        const framesPerMinDrop = framesPerMinNominal - dropPerMin;

        let dropAdj = 0;
        if (remaining >= framesPerMinNominal) {
            const numMinPastFirst = Math.floor((remaining - framesPerMinNominal) / framesPerMinDrop) + 1;
            dropAdj = numMinPastFirst * dropPerMin;
        }

        const totalDropAdj = num10MinCycles * 9 * dropPerMin + dropAdj;
        const nominalTotal = totalFrames + totalDropAdj;

        ff = nominalTotal % fps;
        const totalSecs = Math.floor(nominalTotal / fps);
        hh = Math.floor(totalSecs / 3600);
        mm = Math.floor((totalSecs % 3600) / 60);
        ss = totalSecs % 60;
    }

    const sep = isDf ? ';' : ':';
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}${sep}${String(ff).padStart(2, '0')}`;
}

export function addFrames(
    hours: number,
    minutes: number,
    seconds: number,
    frames: number,
    packetOffset: number,
    frameRateStr: string
): [string, number] {
    const config = getFrameRateConfig(frameRateStr);
    const fo = packetsToFrames(packetOffset, config.cadence);
    const total = timecodeToFrames(hours, minutes, seconds, frames, frameRateStr) + fo;
    return [framesToTimecode(total, frameRateStr), fo];
}

export function detectFrameRate(fileText: string): [string, number] {
    const sampleLimit = DETECTION_RULES.sampleLimit;
    const dropFrameSep = DETECTION_RULES.dropFrameSeparator;
    const invalidThreshold = DETECTION_RULES.invalidFrameThreshold;
    
    let maxFrame = 0;
    let hasDropFrame = false;
    let count = 0;
    
    const matches = fileText.match(new RegExp(TIMESTAMP_PATTERN.source, 'g')) || [];
    
    for (const ts of matches) {
        if (count >= sampleLimit) break;
        count++;
        
        if (ts.includes(dropFrameSep)) {
            hasDropFrame = true;
        }
        
        const parts = ts.replace(';', ':').split(':');
        const h = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        const s = parseInt(parts[2], 10);
        const frame = parseInt(parts[3], 10);
        // ponytail: skip fully-corrupt timestamps (already SCC002) — they aren't a frame-rate signal
        if (h > 23 || m > 59 || s > 59) {
            continue;
        }
        if (frame > invalidThreshold) {
            return ['INVALID', count];
        }
        if (frame > maxFrame) {
            maxFrame = frame;
        }
    }
    
    let rate: string;
    if (hasDropFrame) {
        rate = '29.97 DF';
    } else {
        if (maxFrame <= 23) {
            rate = '23.98';
        } else if (maxFrame === 24) {
            rate = '25';
        } else {
            rate = '29.97 NDF';
        }
    }
    
    return [rate, count];
}

export function validateTimestamp(tsStr: string): boolean {
    try {
        const ts = parseTimestampStr(tsStr);
        if (isNaN(ts.hours) || isNaN(ts.minutes) || isNaN(ts.seconds) || isNaN(ts.frames)) return false;
        if (ts.hours > 23 || ts.minutes > 59 || ts.seconds > 59) return false;
        if (ts.frames > 29) return false;

        // DF-specific: frames 0 and 1 are dropped at minute starts
        // not divisible by 10 (except minute 0 itself).
        if (tsStr.includes(';') && ts.seconds === 0 && ts.minutes % 10 !== 0 && ts.frames < 2) {
            return false;
        }

        return true;
    } catch {
        return false;
    }
}

export function compareTimestamps(ts1Str: string, ts2Str: string): number {
    try {
        const ts1 = parseTimestampStr(ts1Str);
        const ts2 = parseTimestampStr(ts2Str);
        
        if (ts1.hours !== ts2.hours) return ts1.hours < ts2.hours ? -1 : 1;
        if (ts1.minutes !== ts2.minutes) return ts1.minutes < ts2.minutes ? -1 : 1;
        if (ts1.seconds !== ts2.seconds) return ts1.seconds < ts2.seconds ? -1 : 1;
        if (ts1.frames !== ts2.frames) return ts1.frames < ts2.frames ? -1 : 1;
        return 0;
    } catch {
        return 0;
    }
}

export function packetDifference(ts1Str: string, ts2Str: string, frameRateStr: string): number {
    try {
        if (compareTimestamps(ts1Str, ts2Str) < 0) {
            return 0;
        }
        
        const ts2 = parseTimestampStr(ts2Str);
        
        let low = 0;
        let high = 10000;
        
        while (low < high) {
            const mid = Math.floor((low + high + 1) / 2);
            const [resultTs] = addFrames(ts2.hours, ts2.minutes, ts2.seconds, ts2.frames, mid, frameRateStr);
            if (compareTimestamps(resultTs, ts1Str) >= 0) {
                high = mid - 1;
            } else {
                low = mid;
            }
        }
        
        return low + 1;
    } catch {
        return 0;
    }
}