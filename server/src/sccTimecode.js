"use strict";
/**
 * SCC Timecode Module
 *
 * Timecode parsing, arithmetic, and validation for SCC files.
 * Uses frame rate configuration from scc-core/data/frame_rates.json.
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
exports.DETECTION_RULES = exports.DROP_FRAME_RULES = exports.FRAME_RATES = void 0;
exports.getFrameRateConfig = getFrameRateConfig;
exports.parseTimestampStr = parseTimestampStr;
exports.addFrames = addFrames;
exports.detectFrameRate = detectFrameRate;
exports.validateTimestamp = validateTimestamp;
exports.compareTimestamps = compareTimestamps;
exports.packetDifference = packetDifference;
const path = __importStar(require("path"));
const sccDecoder_1 = require("./sccDecoder");
// Load shared frame rate config
const frameRatesData = require(path.join(__dirname, '../data/frame_rates.json'));
exports.FRAME_RATES = frameRatesData.frameRates;
exports.DROP_FRAME_RULES = frameRatesData.dropFrameRules;
exports.DETECTION_RULES = frameRatesData.detectionRules;
function getFrameRateConfig(frameRateStr) {
    if (!(frameRateStr in exports.FRAME_RATES)) {
        throw new Error(`Invalid frame rate: ${frameRateStr}`);
    }
    return exports.FRAME_RATES[frameRateStr];
}
function parseTimestampStr(tsStr) {
    const parts = tsStr.replace(';', ':').split(':');
    return {
        hours: parseInt(parts[0], 10),
        minutes: parseInt(parts[1], 10),
        seconds: parseInt(parts[2], 10),
        frames: parseInt(parts[3], 10)
    };
}
function addFrames(hours, minutes, seconds, frames, packetOffset, frameRateStr) {
    const config = getFrameRateConfig(frameRateStr);
    const videoFps = config.videoFps;
    const isDf = config.isDropFrame;
    const cadence = config.cadence;
    let frameOffset;
    if (cadence) {
        const packetsPerCycle = cadence.packets;
        const framesPerCycle = cadence.frames;
        frameOffset = Math.floor(packetOffset / packetsPerCycle) * framesPerCycle +
            Math.min(packetOffset % packetsPerCycle, framesPerCycle - 1);
    }
    else {
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
function detectFrameRate(fileText) {
    const sampleLimit = exports.DETECTION_RULES.sampleLimit;
    const dropFrameSep = exports.DETECTION_RULES.dropFrameSeparator;
    const invalidThreshold = exports.DETECTION_RULES.invalidFrameThreshold;
    let maxFrame = 0;
    let hasDropFrame = false;
    let count = 0;
    const matches = fileText.match(new RegExp(sccDecoder_1.TIMESTAMP_PATTERN.source, 'g')) || [];
    for (const ts of matches) {
        if (count >= sampleLimit)
            break;
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
    let rate;
    if (hasDropFrame) {
        rate = '29.97 DF';
    }
    else {
        if (maxFrame <= 23) {
            rate = '23.98';
        }
        else if (maxFrame === 24) {
            rate = '25';
        }
        else {
            rate = '29.97 NDF';
        }
    }
    return [rate, count];
}
function validateTimestamp(tsStr) {
    try {
        const ts = parseTimestampStr(tsStr);
        return ts.hours <= 23 && ts.minutes <= 59 && ts.seconds <= 59 && ts.frames <= 29;
    }
    catch {
        return false;
    }
}
function compareTimestamps(ts1Str, ts2Str) {
    try {
        const ts1 = parseTimestampStr(ts1Str);
        const ts2 = parseTimestampStr(ts2Str);
        if (ts1.hours !== ts2.hours)
            return ts1.hours < ts2.hours ? -1 : 1;
        if (ts1.minutes !== ts2.minutes)
            return ts1.minutes < ts2.minutes ? -1 : 1;
        if (ts1.seconds !== ts2.seconds)
            return ts1.seconds < ts2.seconds ? -1 : 1;
        if (ts1.frames !== ts2.frames)
            return ts1.frames < ts2.frames ? -1 : 1;
        return 0;
    }
    catch {
        return 0;
    }
}
function packetDifference(ts1Str, ts2Str, frameRateStr) {
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
            }
            else {
                low = mid;
            }
        }
        return low + 1;
    }
    catch {
        return 0;
    }
}
//# sourceMappingURL=sccTimecode.js.map