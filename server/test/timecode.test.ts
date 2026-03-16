import * as assert from 'assert';
import * as path from 'path';
import { 
    parseTimestampStr, 
    addFrames, 
    detectFrameRate, 
    validateTimestamp,
    compareTimestamps
} from '../src/sccTimecode';

const testCasesPath = path.join(__dirname, './test-cases/timecode_cases.json');
const testCases = require(testCasesPath);

suite('Timecode Tests', () => {
    
    suite('Parse Timestamp', () => {
        testCases.parse_timestamp.forEach((tc: any) => {
            test(`parse ${tc.input}`, () => {
                const result = parseTimestampStr(tc.input);
                assert.strictEqual(result.hours, tc.expected[0]);
                assert.strictEqual(result.minutes, tc.expected[1]);
                assert.strictEqual(result.seconds, tc.expected[2]);
                assert.strictEqual(result.frames, tc.expected[3]);
            });
        });
    });
    
    suite('Validate Timestamp', () => {
        testCases.validate_timestamp.valid.forEach((ts: string) => {
            test(`${ts} should be valid`, () => {
                assert.strictEqual(validateTimestamp(ts), true);
            });
        });
        
        testCases.validate_timestamp.invalid.forEach((ts: string) => {
            test(`${ts} should be invalid`, () => {
                assert.strictEqual(validateTimestamp(ts), false);
            });
        });
    });
    
    suite('Add Frames - 23.98', () => {
        testCases.add_frames['23.98'].forEach((tc: any) => {
            test(`offset ${tc.offset} from ${tc.hh}:${tc.mm}:${tc.ss}:${tc.ff} = ${tc.expectedTc}`, () => {
                const [resultTc, resultOffset] = addFrames(
                    tc.hh, tc.mm, tc.ss, tc.ff,
                    tc.offset,
                    '23.98'
                );
                assert.strictEqual(resultTc, tc.expectedTc);
                assert.strictEqual(resultOffset, tc.expectedOffset);
            });
        });
    });
    
    suite('Add Frames - 25', () => {
        testCases.add_frames['25'].forEach((tc: any) => {
            test(`offset ${tc.offset} from ${tc.hh}:${tc.mm}:${tc.ss}:${tc.ff} = ${tc.expectedTc}`, () => {
                const [resultTc, resultOffset] = addFrames(
                    tc.hh, tc.mm, tc.ss, tc.ff,
                    tc.offset,
                    '25'
                );
                assert.strictEqual(resultTc, tc.expectedTc);
                assert.strictEqual(resultOffset, tc.expectedOffset);
            });
        });
    });
    
    suite('Add Frames - 29.97 NDF', () => {
        testCases.add_frames['29.97 NDF'].forEach((tc: any) => {
            test(`offset ${tc.offset} from ${tc.hh}:${tc.mm}:${tc.ss}:${tc.ff} = ${tc.expectedTc}`, () => {
                const [resultTc, resultOffset] = addFrames(
                    tc.hh, tc.mm, tc.ss, tc.ff,
                    tc.offset,
                    '29.97 NDF'
                );
                assert.strictEqual(resultTc, tc.expectedTc);
                assert.strictEqual(resultOffset, tc.expectedOffset);
            });
        });
    });
    
    suite('Add Frames - 29.97 DF', () => {
        testCases.add_frames['29.97 DF'].forEach((tc: any) => {
            test(`offset ${tc.offset} from ${tc.hh}:${tc.mm}:${tc.ss}:${tc.ff} = ${tc.expectedTc}`, () => {
                const [resultTc, resultOffset] = addFrames(
                    tc.hh, tc.mm, tc.ss, tc.ff,
                    tc.offset,
                    '29.97 DF'
                );
                assert.strictEqual(resultTc, tc.expectedTc);
                assert.strictEqual(resultOffset, tc.expectedOffset);
            });
        });
    });
    
    suite('Frame Rate Detection', () => {
        testCases.frame_rate_detection.forEach((tc: any) => {
            test(tc.name || `detect ${tc.expectedRate}`, () => {
                const [rate] = detectFrameRate(tc.content);
                assert.strictEqual(rate, tc.expectedRate);
            });
        });
    });
});