/**
 * Timecode Tests
 *
 * Tests for timecode parsing and calculations using shared test cases from scc-core.
 */

import * as assert from 'assert';
import * as path from 'path';
import { 
    parseTimestampStr, 
    addFrames, 
    detectFrameRate, 
    validateTimestamp,
    compareTimestamps
} from '../src/timecode';

// Load test cases
const testCasesPath = path.join(__dirname, '../../scc-core/test-cases/timecode_cases.json');
const testCases = require(testCasesPath);

suite('Timecode Tests', () => {
    
    suite('Parse Tests', () => {
        testCases.parseTests.forEach((tc: any) => {
            test(`should parse ${tc.input}`, () => {
                const result = parseTimestampStr(tc.input);
                assert.strictEqual(result.hours, tc.expected.hours);
                assert.strictEqual(result.minutes, tc.expected.minutes);
                assert.strictEqual(result.seconds, tc.expected.seconds);
                assert.strictEqual(result.frames, tc.expected.frames);
            });
        });
    });
    
    suite('Validation Tests', () => {
        testCases.validationTests.forEach((tc: any) => {
            const testName = tc.valid 
                ? `${tc.input} should be valid`
                : `${tc.input} should be invalid (${tc.reason})`;
            test(testName, () => {
                const result = validateTimestamp(tc.input);
                assert.strictEqual(result, tc.valid);
            });
        });
    });
    
    suite('Add Frames Tests - 23.98', () => {
        const tests = testCases.addFramesTests['23.98'].tests;
        tests.forEach((tc: any) => {
            test(`offset ${tc.offset} from ${tc.start} = ${tc.expected}`, () => {
                const ts = parseTimestampStr(tc.start);
                const [result, frameOffset] = addFrames(
                    ts.hours, ts.minutes, ts.seconds, ts.frames,
                    tc.offset,
                    '23.98'
                );
                assert.strictEqual(result, tc.expected, tc.note || '');
                assert.strictEqual(frameOffset, tc.expectedFrameOffset);
            });
        });
    });
    
    suite('Add Frames Tests - 25', () => {
        const tests = testCases.addFramesTests['25'].tests;
        tests.forEach((tc: any) => {
            test(`offset ${tc.offset} from ${tc.start} = ${tc.expected}`, () => {
                const ts = parseTimestampStr(tc.start);
                const [result, frameOffset] = addFrames(
                    ts.hours, ts.minutes, ts.seconds, ts.frames,
                    tc.offset,
                    '25'
                );
                assert.strictEqual(result, tc.expected, tc.note || '');
                assert.strictEqual(frameOffset, tc.expectedFrameOffset);
            });
        });
    });
    
    suite('Add Frames Tests - 29.97 NDF', () => {
        const tests = testCases.addFramesTests['29.97 NDF'].tests;
        tests.forEach((tc: any) => {
            test(`offset ${tc.offset} from ${tc.start} = ${tc.expected}`, () => {
                const ts = parseTimestampStr(tc.start);
                const [result, frameOffset] = addFrames(
                    ts.hours, ts.minutes, ts.seconds, ts.frames,
                    tc.offset,
                    '29.97 NDF'
                );
                assert.strictEqual(result, tc.expected, tc.note || '');
                assert.strictEqual(frameOffset, tc.expectedFrameOffset);
            });
        });
    });
    
    suite('Add Frames Tests - 29.97 DF', () => {
        const tests = testCases.addFramesTests['29.97 DF'].tests;
        tests.forEach((tc: any) => {
            test(`offset ${tc.offset} from ${tc.start} = ${tc.expected}`, () => {
                const ts = parseTimestampStr(tc.start);
                const [result, frameOffset] = addFrames(
                    ts.hours, ts.minutes, ts.seconds, ts.frames,
                    tc.offset,
                    '29.97 DF'
                );
                assert.strictEqual(result, tc.expected, tc.note || '');
                assert.strictEqual(frameOffset, tc.expectedFrameOffset);
            });
        });
    });
    
    suite('Frame Rate Detection Tests', () => {
        testCases.frameRateDetectionTests.forEach((tc: any) => {
            test(tc.description || `detect ${tc.expected}`, () => {
                const [rate] = detectFrameRate(tc.content);
                assert.strictEqual(rate, tc.expected);
            });
        });
    });
    
    suite('Compare Tests', () => {
        testCases.compareTests.forEach((tc: any) => {
            test(`${tc.ts1} vs ${tc.ts2} = ${tc.expected}`, () => {
                const result = compareTimestamps(tc.ts1, tc.ts2);
                assert.strictEqual(result, tc.expected, tc.description);
            });
        });
    });
});