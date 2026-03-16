import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import { SccDocument } from '../out/sccAnalyzer';
import { iterHexWords, parseSccCode, isEoc, isEdm, isEnm } from '../out/sccDecoder';

const testCasesPath = path.join(__dirname, './test-cases/analyzer_cases.json');
let testCases: any = {};
try {
    testCases = require(testCasesPath);
} catch {
    // Will create test cases below
}

suite('SCC Analyzer Tests', () => {
    
    suite('analyze - time map', () => {
        test('basic pop-on caption: RCL + text + EOC sets startTime', () => {
            const doc = new SccDocument();
            const input = `Scenarist_SCC V1.0

00:00:01:00\t9420 9420 94ad 94ad c865 ecec ef

00:00:02:00\t942f 942f

00:00:05:00\t942c 942c`;
            
            const result = doc.analyze(input);
            
            assert.ok(result.timeMap.has(2), 'Line 2 should be in timeMap');
            const tr = result.timeMap.get(2);
            assert.ok(tr !== undefined);
            assert.strictEqual(tr!.startTime, '00:00:02:00');
            assert.strictEqual(tr!.endTime, '00:00:05:00');
        });

        test('EDM after EOC sets endTime', () => {
            const doc = new SccDocument();
            const input = `Scenarist_SCC V1.0

00:00:01:00\t9420 9420 94ad 94ad c865 ecec ef

00:00:02:00\t942f 942f

00:00:05:00\t942c 942c`;
            
            const result = doc.analyze(input);
            const tr = result.timeMap.get(2);
            assert.ok(tr !== undefined);
            assert.strictEqual(tr!.endTime, '00:00:05:00');
        });

        test('multiple caption blocks get independent timing', () => {
            const doc = new SccDocument();
            const input = `Scenarist_SCC V1.0

00:00:01:00\t9420 9420 c865 ecec ef

00:00:02:00\t942f 942f

00:00:03:00\t942c 942c

00:00:04:00\t9420 9420 c866 ecec ef

00:00:05:00\t942f 942f

00:00:06:00\t942c 942c`;
            
            const result = doc.analyze(input);
            
            const tr1 = result.timeMap.get(2);
            assert.ok(tr1 !== undefined);
            assert.strictEqual(tr1!.startTime, '00:00:02:00');
            assert.strictEqual(tr1!.endTime, '00:00:03:00');
            
            const tr2 = result.timeMap.get(8);
            assert.ok(tr2 !== undefined);
            assert.strictEqual(tr2!.startTime, '00:00:05:00');
            assert.strictEqual(tr2!.endTime, '00:00:06:00');
        });

        test('ENM clears pending lines', () => {
            const doc = new SccDocument();
            const input = `Scenarist_SCC V1.0

00:00:01:00\t9420 9420 c865 ecec ef

00:00:02:00\t942e 942e

00:00:03:00\t942f 942f`;
            
            const result = doc.analyze(input);
            
            assert.ok(result.timeMap.has(2));
            const tr = result.timeMap.get(2);
            assert.ok(tr !== undefined);
            assert.strictEqual(tr!.startTime, null);
        });

        test('control-only line not added to pendingLines', () => {
            const doc = new SccDocument();
            const input = `Scenarist_SCC V1.0

00:00:01:00\t942c 942c`;
            
            const result = doc.analyze(input);
            
            assert.strictEqual(result.timeMap.has(2), false);
        });

        test('line with no timestamp is skipped', () => {
            const doc = new SccDocument();
            const input = `Scenarist_SCC V1.0

Some line without timestamp

00:00:01:00\t942c 942c`;
            
            const result = doc.analyze(input);
            
            assert.strictEqual(result.timestampMap.has(2), false);
            assert.ok(result.timestampMap.has(4));
        });

        test('header line is skipped', () => {
            const doc = new SccDocument();
            const input = `Scenarist_SCC V1.0

00:00:01:00\t942c 942c`;
            
            const result = doc.analyze(input);
            
            assert.strictEqual(result.timestampMap.has(0), false);
        });

        test('empty file returns empty maps', () => {
            const doc = new SccDocument();
            const result = doc.analyze('');
            
            assert.strictEqual(result.timestampMap.size, 0);
            assert.strictEqual(result.timeMap.size, 0);
        });

        test('file with only header returns empty maps', () => {
            const doc = new SccDocument();
            const result = doc.analyze('Scenarist_SCC V1.0');
            
            assert.strictEqual(result.timestampMap.size, 0);
            assert.strictEqual(result.timeMap.size, 0);
        });
    });

    suite('analyze - timestamp map', () => {
        test('packet count matches hex word count on line', () => {
            const doc = new SccDocument();
            const input = `Scenarist_SCC V1.0

00:00:01:00\t9420 9420 94ad 94ad c865 ecec efef`;
            
            const result = doc.analyze(input);
            
            assert.ok(result.timestampMap.has(2));
            const ti = result.timestampMap.get(2);
            assert.ok(ti !== undefined);
            assert.strictEqual(ti!.packetCount, 7);
        });
    });

    suite('analyze - never displayed', () => {
        test('caption with text but no EOC flagged as never displayed', () => {
            const doc = new SccDocument();
            const input = `Scenarist_SCC V1.0

00:00:01:00\t9420 9420 c865 ecec ef`;
            
            const result = doc.analyze(input);
            
            assert.ok(result.neverDisplayedLines.includes(2));
        });

        test('ENM after text but before EOC clears pending', () => {
            const doc = new SccDocument();
            const input = `Scenarist_SCC V1.0

00:00:01:00\t9420 9420 c865 ecec ef

00:00:02:00\t942e 942e`;
            
            const result = doc.analyze(input);
            
            assert.ok(result.neverDisplayedLines.includes(2));
        });
    });

    suite('getBufferSnapshot', () => {
        test('single line first word buffer has just that character', () => {
            const doc = new SccDocument();
            const input = `Scenarist_SCC V1.0

00:00:01:00\t9420 9420 94f4 97a1 4552 4552`;
            
            doc.analyze(input);
            const snapshot = doc.getBufferSnapshot(2, 4);
            
            assert.ok(snapshot.bufferText.includes('R'));
        });

        test('single line last word buffer has all characters', () => {
            const doc = new SccDocument();
            const input = `Scenarist_SCC V1.0

00:00:01:00\t9420 9420 94f4 97a1 4552 4552`;
            
            doc.analyze(input);
            const snapshot = doc.getBufferSnapshot(2, 5);
            
            assert.ok(snapshot.bufferText.includes('ER'));
        });

        test('PAC shows as formatted row/col/color', () => {
            const doc = new SccDocument();
            const input = `Scenarist_SCC V1.0

00:00:01:00\t9420 9420 94f4 97a1`;
            
            doc.analyze(input);
            const snapshot = doc.getBufferSnapshot(2, 2);
            
            assert.ok(snapshot.bufferText.includes('R14'));
        });

        test('backwards scan finds prior content', () => {
            const doc = new SccDocument();
            const input = `Scenarist_SCC V1.0

00:00:01:00\t9420 9420 94f4 97a1 4552

00:00:02:00\t4552`;
            
            doc.analyze(input);
            const snapshot = doc.getBufferSnapshot(4, 0);
            
            assert.ok(snapshot.bufferText.includes('R'));
        });

        test('ENM in prior line stops backwards scan', () => {
            const doc = new SccDocument();
            const input = `Scenarist_SCC V1.0

00:00:00:00\t942c 942c

00:00:01:00\t94ad 94ad c865 ecec ef

00:00:02:00\t942e 942e

00:00:03:00\tc866 ecec ef`;
            
            doc.analyze(input);
            const snapshot = doc.getBufferSnapshot(6, 0);
            
            assert.ok(!snapshot.bufferText.includes('e'));
        });

        test('empty buffer returns empty string with -1 highlights', () => {
            const doc = new SccDocument();
            const input = `Scenarist_SCC V1.0`;
            
            doc.analyze(input);
            const snapshot = doc.getBufferSnapshot(0, 0);
            
            assert.strictEqual(snapshot.bufferText, '');
            assert.strictEqual(snapshot.highlightStart, -1);
            assert.strictEqual(snapshot.highlightEnd, -1);
        });
    });

    suite('checkOverflow', () => {
        test('no overflow: packets fit within frame budget', () => {
            const doc = new SccDocument();
            const input = `Scenarist_SCC V1.0

00:00:01:00\t9420 9420

00:00:02:00\t942f 942f`;
            
            doc.analyze(input);
            const result = doc.checkOverflow(2);
            
            assert.strictEqual(result.isOverflow, false);
        });

        test('last line in file: no overflow', () => {
            const doc = new SccDocument();
            const input = `Scenarist_SCC V1.0

00:00:01:00\t9420 9420`;
            
            doc.analyze(input);
            const result = doc.checkOverflow(2);
            
            assert.strictEqual(result.isOverflow, false);
        });
    });

    suite('edge cases', () => {
        test('Windows line endings (\\r\\n) handled', () => {
            const doc = new SccDocument();
            const input = "Scenarist_SCC V1.0\r\n\r\n00:00:01:00\t9420 9420\r\n";
            
            const result = doc.analyze(input);
            
            assert.ok(result.timestampMap.has(2));
        });

        test('null-only lines not added to pendingLines', () => {
            const doc = new SccDocument();
            const input = `Scenarist_SCC V1.0

00:00:01:00\t8080 8080 8080`;
            
            const result = doc.analyze(input);
            
            assert.strictEqual(result.timeMap.has(2), false);
        });

        test('semicolon timestamp (drop frame) handled', () => {
            const doc = new SccDocument();
            const input = `Scenarist_SCC V1.0

00:00:01;00\t9420 9420 c865 ecec ef

00:00:02;00\t942f 942f`;
            
            const result = doc.analyze(input);
            
            assert.strictEqual(result.frameRate, '29.97 DF');
        });
    });

    suite('integration test', () => {
        test('big-buck-bunny.scc analysis', () => {
            const samplePath = path.join(__dirname, '../../samples/big-buck-bunny.scc');
            
            let input: string;
            try {
                input = fs.readFileSync(samplePath, 'utf-8');
            } catch {
                // Skip if sample file not found
                return;
            }
            
            const doc = new SccDocument();
            const result = doc.analyze(input);
            
            assert.ok(result.frameRate !== null);
            assert.ok(result.timestampMap.size > 0);
            assert.ok(result.timeMap.size > 0);
        });
    });
});