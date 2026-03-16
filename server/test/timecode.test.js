"use strict";
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
const assert = __importStar(require("assert"));
const path = __importStar(require("path"));
const sccTimecode_1 = require("../src/sccTimecode");
const testCasesPath = path.join(__dirname, './test-cases/timecode_cases.json');
const testCases = require(testCasesPath);
suite('Timecode Tests', () => {
    suite('Parse Timestamp', () => {
        testCases.parse_timestamp.forEach((tc) => {
            test(`parse ${tc.input}`, () => {
                const result = (0, sccTimecode_1.parseTimestampStr)(tc.input);
                assert.strictEqual(result.hours, tc.expected[0]);
                assert.strictEqual(result.minutes, tc.expected[1]);
                assert.strictEqual(result.seconds, tc.expected[2]);
                assert.strictEqual(result.frames, tc.expected[3]);
            });
        });
    });
    suite('Validate Timestamp', () => {
        testCases.validate_timestamp.valid.forEach((ts) => {
            test(`${ts} should be valid`, () => {
                assert.strictEqual((0, sccTimecode_1.validateTimestamp)(ts), true);
            });
        });
        testCases.validate_timestamp.invalid.forEach((ts) => {
            test(`${ts} should be invalid`, () => {
                assert.strictEqual((0, sccTimecode_1.validateTimestamp)(ts), false);
            });
        });
    });
    suite('Add Frames - 23.98', () => {
        testCases.add_frames['23.98'].forEach((tc) => {
            test(`offset ${tc.offset} from ${tc.hh}:${tc.mm}:${tc.ss}:${tc.ff} = ${tc.expectedTc}`, () => {
                const [resultTc, resultOffset] = (0, sccTimecode_1.addFrames)(tc.hh, tc.mm, tc.ss, tc.ff, tc.offset, '23.98');
                assert.strictEqual(resultTc, tc.expectedTc);
                assert.strictEqual(resultOffset, tc.expectedOffset);
            });
        });
    });
    suite('Add Frames - 25', () => {
        testCases.add_frames['25'].forEach((tc) => {
            test(`offset ${tc.offset} from ${tc.hh}:${tc.mm}:${tc.ss}:${tc.ff} = ${tc.expectedTc}`, () => {
                const [resultTc, resultOffset] = (0, sccTimecode_1.addFrames)(tc.hh, tc.mm, tc.ss, tc.ff, tc.offset, '25');
                assert.strictEqual(resultTc, tc.expectedTc);
                assert.strictEqual(resultOffset, tc.expectedOffset);
            });
        });
    });
    suite('Add Frames - 29.97 NDF', () => {
        testCases.add_frames['29.97 NDF'].forEach((tc) => {
            test(`offset ${tc.offset} from ${tc.hh}:${tc.mm}:${tc.ss}:${tc.ff} = ${tc.expectedTc}`, () => {
                const [resultTc, resultOffset] = (0, sccTimecode_1.addFrames)(tc.hh, tc.mm, tc.ss, tc.ff, tc.offset, '29.97 NDF');
                assert.strictEqual(resultTc, tc.expectedTc);
                assert.strictEqual(resultOffset, tc.expectedOffset);
            });
        });
    });
    suite('Add Frames - 29.97 DF', () => {
        testCases.add_frames['29.97 DF'].forEach((tc) => {
            test(`offset ${tc.offset} from ${tc.hh}:${tc.mm}:${tc.ss}:${tc.ff} = ${tc.expectedTc}`, () => {
                const [resultTc, resultOffset] = (0, sccTimecode_1.addFrames)(tc.hh, tc.mm, tc.ss, tc.ff, tc.offset, '29.97 DF');
                assert.strictEqual(resultTc, tc.expectedTc);
                assert.strictEqual(resultOffset, tc.expectedOffset);
            });
        });
    });
    suite('Frame Rate Detection', () => {
        testCases.frame_rate_detection.forEach((tc) => {
            test(tc.name || `detect ${tc.expectedRate}`, () => {
                const [rate] = (0, sccTimecode_1.detectFrameRate)(tc.content);
                assert.strictEqual(rate, tc.expectedRate);
            });
        });
    });
});
//# sourceMappingURL=timecode.test.js.map