import * as assert from 'assert';
import * as path from 'path';
import { SccDocument } from '../out/sccAnalyzer';

const eventCasesPath = path.join(__dirname, './test-cases/event_time_cases.json');
const eventCases = require(eventCasesPath);

suite('Event Time Tests', () => {
    eventCases.event_times.forEach((tc: any) => {
        test(tc.name || 'event time scenario', () => {
            const doc = new SccDocument();
            const input = tc.lines.join('\n');
            const result = doc.analyze(input);
            const tr = result.timeMap.get(tc.startLine);

            if (tc.expectedStart === null && tc.expectedEnd === null) {
                assert.strictEqual(tr, undefined);
                return;
            }

            assert.ok(tr, `timeMap entry for line ${tc.startLine} should exist`);
            assert.strictEqual(tr!.startTime, tc.expectedStart);
            assert.strictEqual(tr!.endTime, tc.expectedEnd);
        });
    });
});
