/**
 * SCC Timecode Module
 *
 * Timecode parsing, arithmetic, and validation for SCC files.
 * Uses frame rate configuration from scc-core/data/frame_rates.json.
 */
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
export declare const FRAME_RATES: Record<string, FrameRateConfig>;
export declare const DROP_FRAME_RULES: DropFrameRules;
export declare const DETECTION_RULES: DetectionRules;
export declare function getFrameRateConfig(frameRateStr: string): FrameRateConfig;
export interface Timestamp {
    hours: number;
    minutes: number;
    seconds: number;
    frames: number;
}
export declare function parseTimestampStr(tsStr: string): Timestamp;
export declare function addFrames(hours: number, minutes: number, seconds: number, frames: number, packetOffset: number, frameRateStr: string): [string, number];
export declare function detectFrameRate(fileText: string): [string, number];
export declare function validateTimestamp(tsStr: string): boolean;
export declare function compareTimestamps(ts1Str: string, ts2Str: string): number;
export declare function packetDifference(ts1Str: string, ts2Str: string, frameRateStr: string): number;
