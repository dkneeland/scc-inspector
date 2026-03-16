/**
 * SCC Timecode Module
 *
 * Timecode parsing, arithmetic, and validation for SCC files.
 * Uses frame rate configuration from scc-core/data/frame_rates.json.
 */

import * as path from 'path';
import { TIMESTAMP_PATTERN } from './sccDecoder';

// Load shared frame rate config
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

export function addFrames(
    hours: number,
    minutes: number,
    seconds: number,
    frames: number,
    packetOffset: number,
    frameRateStr: string
): [string, number] {
    const config = getFrameRateConfig(frameRateStr);
    const videoFps = config.videoFps;
    const isDf = config.isDropFrame;
    const cadence = config.cadence;
    
    let frameOffset: number;
    if (cadence) {
        const packetsPerCycle = cadence.packets;
        const framesPerCycle = cadence.frames;
        frameOffset = Math.floor(packetOffset / packetsPerCycle) * framesPerCycle + 
                      Math.min(packetOffset % packetsPerCycle, framesPerCycle - 1);
    } else {
        frameOffset = packetOffset;
    }
    
    let ff = frames + frameOffset;
    let ss = seconds;
    let mm = minutes;
    let hh = hours;
    
    while (ff >= videoFps) {
        ff -= videoFps;
        ss += 1;
    }
    
    while (ss >= 60) {
        ss -= 60;
        mm += 1;
        if (isDf && mm % 10 !== 0 && ff < 2) {
            ff = 2;
        }
    }
    
    while (mm >= 60) {
        mm -= 60;
        hh += 1;
    }
    
    const sep = isDf ? ';' : ':';
    const result = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}${sep}${String(ff).padStart(2, '0')}`;
    
    return [result, frameOffset];
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
        
        const frame = parseInt(ts.slice(-2), 10);
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
    
    return [rate!, count];
}

export function validateTimestamp(tsStr: string): boolean {
    try {
        const ts = parseTimestampStr(tsStr);
        return ts.hours <= 23 && ts.minutes <= 59 && ts.seconds <= 59 && ts.frames <= 29;
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