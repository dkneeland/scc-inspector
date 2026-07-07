import * as assert from 'assert';
import * as path from 'path';
import { 
    parseTimestampStr, 
    addFrames, 
    detectFrameRate, 
    validateTimestamp,
    compareTimestamps
} from '../out/sccTimecode';

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

        test('25fps cadence is monotonically non-decreasing', () => {
            let prev = '';
            for (let offset = 0; offset < 250; offset++) {
                const [tc] = addFrames(0, 0, 0, 0, offset, '25');
                if (prev && compareTimestamps(tc, prev) < 0) {
                    assert.fail(`offset ${offset} produced ${tc} which goes backwards from ${prev}`);
                }
                prev = tc;
            }
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

        test('29.97 DF multi-packet after minute boundary', () => {
            const [tc1] = addFrames(1, 0, 59, 29, 1, '29.97 DF');
            assert.strictEqual(tc1, '01:01:00;02');
            const [tc2] = addFrames(1, 0, 59, 29, 2, '29.97 DF');
            assert.strictEqual(tc2, '01:01:00;03');
            const [tc3] = addFrames(1, 0, 59, 29, 3, '29.97 DF');
            assert.strictEqual(tc3, '01:01:00;04');
            const [tc4] = addFrames(1, 0, 59, 29, 4, '29.97 DF');
            assert.strictEqual(tc4, '01:01:00;05');
        });

        test('29.97 DF 10-minute boundary skips drop', () => {
            const [tc1] = addFrames(0, 9, 59, 29, 1, '29.97 DF');
            assert.strictEqual(tc1, '00:10:00;00');
            const [tc2] = addFrames(0, 9, 59, 29, 2, '29.97 DF');
            assert.strictEqual(tc2, '00:10:00;01');
            const [tc3] = addFrames(0, 9, 59, 29, 3, '29.97 DF');
            assert.strictEqual(tc3, '00:10:00;02');
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