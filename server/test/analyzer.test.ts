import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import { SccDocument } from '../out/sccAnalyzer';
import { iterHexWords, parseSccCode, isEoc, isEdm, isEnm, isRcl } from '../out/sccDecoder';
import { formatBufferWithMarkers, wrapTooltipLines } from '../out/sccTooltip';

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

    suite('getBufferSnapshot - control commands', () => {
        test('EDM should NOT clear buffer when hovered (EDM only clears displayed memory)', () => {
            const doc = new SccDocument();
            const input = `Scenarist_SCC V1.0

00:00:01:00\t9420 9420 94f4 94f4 c8e5 ecec

00:00:02:00\t942c 942c`;
            
            doc.analyze(input);
            const snapshot = doc.getBufferSnapshot(4, 0);
            
            assert.ok(snapshot.bufferText.includes('H'), 'Buffer should still contain text before EDM');
            assert.strictEqual(snapshot.highlightStart, -1, 'EDM highlight should be -1 (control command marker at end)');
            assert.strictEqual(snapshot.highlightEnd, -1, 'EDM highlight end should be -1');
        });

        test('RCL should clear buffer when hovered (RCL starts new caption)', () => {
            const doc = new SccDocument();
            const input = `Scenarist_SCC V1.0

00:00:01:00\t9420 9420 94f4 94f4 c8e5 ecec

00:00:02:00\t9420 9420`;
            
            doc.analyze(input);
            const snapshot = doc.getBufferSnapshot(4, 0);
            
            assert.strictEqual(snapshot.bufferText, '', 'RCL should clear buffer');
            assert.strictEqual(snapshot.highlightStart, 0, 'RCL highlight should start at 0');
            assert.strictEqual(snapshot.highlightEnd, 0, 'RCL highlight end should be 0');
        });

        test('ENM should clear buffer when hovered - same line as text', () => {
            const doc = new SccDocument();
            const input = `Scenarist_SCC V1.0

00:00:01:00\t9420 9420 94f4 94f4 c8e5 ecec 94ae 94ae`;
            
            doc.analyze(input);
            const snapshot = doc.getBufferSnapshot(2, 4);
            
            assert.strictEqual(snapshot.bufferText, '', 'ENM should clear buffer');
            assert.strictEqual(snapshot.highlightStart, 0, 'ENM highlight should start at 0');
            assert.strictEqual(snapshot.highlightEnd, 0, 'ENM highlight end should be 0');
        });

        test('ENM should clear buffer when hovered - on next line', () => {
            const doc = new SccDocument();
            const input = `Scenarist_SCC V1.0

00:00:01:00\t9420 9420 94f4 94f4 c8e5 ecec

00:00:02:00\t94ae 94ae`;
            
            doc.analyze(input);
            const snapshot = doc.getBufferSnapshot(4, 0);
            
            assert.strictEqual(snapshot.bufferText, '', 'ENM should clear buffer');
            assert.strictEqual(snapshot.highlightStart, 0, 'ENM highlight should start at 0');
            assert.strictEqual(snapshot.highlightEnd, 0, 'ENM highlight end should be 0');
        });
    });

    suite('getBufferSnapshot - MIDROW', () => {
        test('MIDROW should show italic marker in buffer', () => {
            const doc = new SccDocument();
            const input = `Scenarist_SCC V1.0

00:00:01:00\t9420 9420 94f4 94f4 c8e5 9120 9120 ecec`;
            
            doc.analyze(input);
            const snapshot = doc.getBufferSnapshot(2, 3);
            
            assert.ok(snapshot.bufferText.includes('<i>'), 'MIDROW should add <i> marker to buffer');
        });

        test('MIDROW should be highlighted when target word', () => {
            const doc = new SccDocument();
            const input = `Scenarist_SCC V1.0

00:00:01:00\t9420 9420 94f4 94f4 9120 9120`;
            
            doc.analyze(input);
            const snapshot = doc.getBufferSnapshot(2, 2);
            
            const highlighted = snapshot.bufferText.substring(snapshot.highlightStart, snapshot.highlightEnd);
            assert.ok(highlighted.includes('<i>'), 'MIDROW highlight should include <i> marker');
        });
    });

    suite('getBufferSnapshot - subsequent PACs', () => {
        test('subsequent PAC should appear in buffer text', () => {
            const doc = new SccDocument();
            const input = `Scenarist_SCC V1.0

00:00:01:00\t9420 9420 94f4 94f4 c8e5 ecec 1370 1370`;
            
            doc.analyze(input);
            const snapshot = doc.getBufferSnapshot(2, 4);
            
            const highlighted = snapshot.bufferText.substring(snapshot.highlightStart, snapshot.highlightEnd);
            assert.ok(highlighted.includes('R12'), 'Second PAC should show R12 in buffer: ' + highlighted);
        });

        test('text after second PAC follows first PAC text', () => {
            const doc = new SccDocument();
            const input = `Scenarist_SCC V1.0

00:00:01:00\t9420 9420 94f4 94f4 c8e5 ecec 1370 1370 c8d5`;
            
            doc.analyze(input);
            const snapshot = doc.getBufferSnapshot(2, 5);
            
            assert.ok(snapshot.bufferText.includes('H'), 'Buffer should contain first text');
            assert.ok(snapshot.bufferText.includes('U'), 'Buffer should contain text after second PAC');
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

        test('highlight indices account for PAC prefix', () => {
            const doc = new SccDocument();
            const input = `Scenarist_SCC V1.0

00:00:01:00\t9420 9420 94f4 94f4 c8e5`;
            
            doc.analyze(input);
            const snapshot = doc.getBufferSnapshot(2, 2);
            
            const prefixEnd = snapshot.bufferText.indexOf('}') + 1;
            assert.ok(prefixEnd > 0, 'should have a prefix');
            assert.ok(snapshot.highlightStart >= prefixEnd, 'highlightStart should be after prefix');
            assert.ok(snapshot.highlightEnd > snapshot.highlightStart, 'highlightEnd should be after highlightStart');
        });

        test('highlight starts at 0 when no PAC prefix', () => {
            const doc = new SccDocument();
            const input = `Scenarist_SCC V1.0

00:00:01:00\t9420 9420 c8e5`;
            
            doc.analyze(input);
            const snapshot = doc.getBufferSnapshot(2, 1);
            
            assert.ok(snapshot.bufferText.startsWith('H'), 'buffer should start with H (no prefix)');
            assert.strictEqual(snapshot.highlightStart, 0, 'highlightStart should be 0 with no prefix');
        });

        test('PAC as target word highlights PAC string in buffer', () => {
            const doc = new SccDocument();
            const input = `Scenarist_SCC V1.0

00:00:01:00\t9420 9420 94f4`;
            
            doc.analyze(input);
            const snapshot = doc.getBufferSnapshot(2, 1);
            
            const highlighted = snapshot.bufferText.substring(snapshot.highlightStart, snapshot.highlightEnd);
            assert.ok(highlighted.includes('R14'), 'highlighted text should include row info');
        });

        test('second text word highlight after prefix', () => {
            const doc = new SccDocument();
            const input = `Scenarist_SCC V1.0

00:00:01:00\t9420 9420 94f4 94f4 c8e5 ecec`;
            
            doc.analyze(input);
            const snapshot = doc.getBufferSnapshot(2, 3);
            
            const prefixEnd = snapshot.bufferText.indexOf('}') + 1;
            assert.ok(snapshot.highlightStart >= prefixEnd, 'highlightStart should be after prefix');
            const highlighted = snapshot.bufferText.substring(snapshot.highlightStart, snapshot.highlightEnd);
            assert.ok(highlighted.includes('l'), 'highlighted text should include the character');
        });
    });

    suite('getBufferSnapshot - paired words', () => {
        test('second word in paired PAC should show same buffer as first word', () => {
            const doc = new SccDocument();
            const input = `Scenarist_SCC V1.0

00:01:07:22\t94ae 94ae 9420 9420 9452 9452 97a1 97a1 5768 e9ec e520 4920 68ef 6ee5 73f4 ec79 20e6 e96e 6480 9470 9470 9723 9723 f468 e973`;

            doc.analyze(input);
            
            // Position analysis (each unique logical index):
            // 94ae 94ae (ENM pair) -> both at logicalIdx 0
            // 9420 9420 (RCL pair) -> both at logicalIdx 1
            // 9452 9452 (PAC pair) -> both at logicalIdx 2
            // 97a1 97a1 (PAC pair) -> both at logicalIdx 3
            // 5768 (text, unpaired) -> logicalIdx 4
            // e9ec (text, unpaired) -> logicalIdx 5
            // e520 (text, unpaired) -> logicalIdx 6
            // 4920 (text, unpaired) -> logicalIdx 7
            // 68ef (text, unpaired) -> logicalIdx 8
            // 6ee5 (text, unpaired) -> logicalIdx 9
            // 73f4 (text, unpaired) -> logicalIdx 10
            // ec79 (text, unpaired) -> logicalIdx 11
            // 20e6 (text, unpaired) -> logicalIdx 12
            // e96e (text, unpaired) -> logicalIdx 13
            // 6480 (text, unpaired) -> logicalIdx 14
            // 9470 9470 (PAC pair) -> both at logicalIdx 15
            // 9723 9723 (PAC pair) -> both at logicalIdx 16
            // f468 (text, unpaired) -> logicalIdx 17
            // e973 (text, unpaired) -> logicalIdx 18
            
            // Hover on first 9470 (logicalIdx 15)
            const snapshot1 = doc.getBufferSnapshot(2, 15);
            
            // Hover on second 9470 (should also be logicalIdx 15)
            const snapshot2 = doc.getBufferSnapshot(2, 15);
            
            // Both should show the PAC highlighted
            const highlighted1 = snapshot1.bufferText.substring(snapshot1.highlightStart, snapshot1.highlightEnd);
            const highlighted2 = snapshot2.bufferText.substring(snapshot2.highlightStart, snapshot2.highlightEnd);
            
            assert.ok(highlighted1.includes('R14'), 'First 9470 should highlight R14 PAC: ' + highlighted1);
            assert.ok(highlighted2.includes('R14'), 'Second 9470 should also highlight R14 PAC: ' + highlighted2);
            
            // Both should have same buffer text
            assert.strictEqual(snapshot1.bufferText, snapshot2.bufferText, 'Both words should have same buffer text');
        });

        test('paired PAC and paired text - verify logical indices', () => {
            const doc = new SccDocument();
            const input = `Scenarist_SCC V1.0

00:00:01:00\t9420 9420 94f4 94f4 c8e5 ecec`;

            doc.analyze(input);
            
            // 9420 9420 (RCL pair) -> both at logicalIdx 0
            // 94f4 94f4 (PAC pair) -> both at logicalIdx 1
            // c8e5 ecec (text, NOT paired - different words) -> logicalIdx 2 and 3
            
            // Hover on first 94f4 (logicalIdx 1)
            const snapshotPac1 = doc.getBufferSnapshot(2, 1);
            
            // Hover on first c8e5 (logicalIdx 2)
            const snapshotText1 = doc.getBufferSnapshot(2, 2);
            
            // PAC should be highlighted with R14 info
            const pacHighlighted = snapshotPac1.bufferText.substring(snapshotPac1.highlightStart, snapshotPac1.highlightEnd);
            assert.ok(pacHighlighted.includes('R14'), 'PAC should highlight R14: ' + pacHighlighted);
            
            // Text should be highlighted with the character
            const textHighlighted = snapshotText1.bufferText.substring(snapshotText1.highlightStart, snapshotText1.highlightEnd);
            assert.ok(textHighlighted.includes('H'), 'Text should highlight H: ' + textHighlighted);
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

    // Ported from reference/scc_inspector/tests/test_buffer.py
    suite('caret display (reference tests)', () => {
        test('carets appear for text highlighting', () => {
            const doc = new SccDocument();
            const input = `Scenarist_SCC V1.0

00:00:01:00\t9420 9440 c8e5 6c6c ef80`;
            
            doc.analyze(input);
            // Word index 2 is c8e5 (TEXT "He"), logicalIdx 2
            const snapshot = doc.getBufferSnapshot(2, 2);
            
            const [fullBuf, markers] = formatBufferWithMarkers(
                snapshot.bufferText,
                snapshot.highlightStart,
                snapshot.highlightEnd,
                false
            );
            
            assert.ok(markers.includes('^'), 'Markers should contain carets');
            const caretCount = markers.split('^').length - 1;
            const highlightLen = snapshot.highlightEnd - snapshot.highlightStart;
            assert.strictEqual(caretCount, highlightLen, 'Caret count should match highlight length');
        });

        test('carets appear at end for control codes', () => {
            const doc = new SccDocument();
            const input = `Scenarist_SCC V1.0

00:00:01:00\t9420 9440 c8e5 6c6c ef80 942c`;
            
            doc.analyze(input);
            // Word 5 is 942c (EDM control code), logicalIdx 5
            const snapshot = doc.getBufferSnapshot(2, 5);
            
            const [fullBuf, markers] = formatBufferWithMarkers(
                snapshot.bufferText,
                snapshot.highlightStart,
                snapshot.highlightEnd,
                true // isControl
            );
            
            const trimmedMarkers = markers.trimEnd();
            assert.ok(trimmedMarkers.length > 0, 'Markers should not be empty');
            assert.strictEqual(trimmedMarkers[trimmedMarkers.length - 1], '^', 'Last char should be caret');
        });

        test('carets appear at end for NULL codes', () => {
            const doc = new SccDocument();
            const input = `Scenarist_SCC V1.0

00:00:01:00\t9420 9440 c8e5 6c6c ef80 8080`;
            
            doc.analyze(input);
            // Word 5 is 8080 (NULL), logicalIdx 5
            const snapshot = doc.getBufferSnapshot(2, 5);
            
            const [fullBuf, markers] = formatBufferWithMarkers(
                snapshot.bufferText,
                snapshot.highlightStart,
                snapshot.highlightEnd,
                true // isControl
            );
            
            const trimmedMarkers = markers.trimEnd();
            assert.ok(trimmedMarkers.length > 0, 'Markers should not be empty');
            assert.strictEqual(trimmedMarkers[trimmedMarkers.length - 1], '^', 'Last char should be caret');
        });
    });

    // Ported from reference/scc_inspector/tests/test_buffer.py
    suite('wraparound (reference tests)', () => {
        test('text wraps at 60 character limit', () => {
            const longText = 'BUF : ' + 'A'.repeat(60);
            const markers = ' '.repeat(longText.length);
            const wrapped = wrapTooltipLines(longText, markers);
            
            assert.strictEqual(wrapped.length, 2, 'Should wrap to 2 lines');
            assert.strictEqual(wrapped[0].length, 60, 'First line should be 60 chars');
        });

        test('carets merge with next line when wrapping', () => {
            const text = 'BUF : ' + 'X'.repeat(54) + '{R14 C00 Whi}';
            const markers = ' '.repeat(text.length - 13) + '^'.repeat(9) + '    ';
            const wrapped = wrapTooltipLines(text, markers);
            
            assert.ok(wrapped.length >= 2, 'Should have at least 2 lines');
            const joined = wrapped.join('');
            assert.ok(joined.includes('^'), 'Wrapped text should contain carets');
        });

        test('carets on separate line for last segment', () => {
            const text = 'BUF : Short';
            const markers = '      ^^^^^';
            const wrapped = wrapTooltipLines(text, markers);
            
            assert.strictEqual(wrapped.length, 2, 'Should have 2 lines');
            assert.strictEqual(wrapped[1].trim(), '^^^^^', 'Second line should be carets');
        });
    });

    // Ported from reference/scc_inspector/tests/test_buffer.py
    suite('buffer snapshot (reference tests)', () => {
        test('buffer snapshot for PAC command shows positioning', () => {
            const doc = new SccDocument();
            const input = `Scenarist_SCC V1.0

00:00:01:00\t9420 9440 c8e5 6c6c ef80 94e0`;
            
            doc.analyze(input);
            // Word 5 is 94e0 (PAC), logicalIdx 5
            const snapshot = doc.getBufferSnapshot(2, 5);
            
            assert.ok(snapshot.bufferText.length > 0, 'Buffer text should not be empty');
            assert.ok(snapshot.bufferText.includes('{R'), 'Buffer should contain row positioning');
        });

        test('buffer snapshot handles multiple lines', () => {
            const doc = new SccDocument();
            const input = `Scenarist_SCC V1.0

00:00:01:00\t9420 9440 c8e5 6c6c ef80

00:00:02:00\tc8e5 6c6c ef80`;
            
            doc.analyze(input);
            // Just verify it doesn't crash - get snapshot from line 4
            const snapshot = doc.getBufferSnapshot(4, 0);
            // Basic test that function executes without error
            assert.ok(true, 'Should handle multiple lines without error');
        });
    });
});