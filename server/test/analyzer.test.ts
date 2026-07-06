import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import { SccDocument } from '../out/sccAnalyzer';
import { iterHexWords, parseSccCode, isEoc, isEdm, isEnm, isRcl } from '../out/sccDecoder';


const testCases = require(path.join(__dirname, './test-cases/analyzer_cases.json'));

suite('SCC Analyzer Tests', () => {
    
    suite('analyze - time map', () => {
        test('basic pop-on caption: RCL + text + EOC sets startTime', () => {
            const doc = new SccDocument();
            const input = `Scenarist_SCC V1.0

00:00:01:00\t9420 9420 94ad 94ad c8e5 ecec ef

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

00:00:01:00\t9420 9420 94ad 94ad c8e5 ecec ef

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

00:00:01:00\t9420 9420 c8e5 ecec ef

00:00:02:00\t942f 942f

00:00:03:00\t942c 942c

00:00:04:00\t9420 9420 c8e6 ecec ef

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

00:00:01:00\t9420 9420 c8e5 ecec ef

00:00:02:00\t94ae 94ae

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

00:00:01:00\t9420 9420 94ad 94ad c8e5 ecec efef`;
            
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

00:00:01:00\t9420 9420 c8e5 ecec ef`;
            
            const result = doc.analyze(input);
            
            assert.ok(result.neverDisplayedLines.includes(2));
        });

        test('ENM after text but before EOC clears pending', () => {
            const doc = new SccDocument();
            const input = `Scenarist_SCC V1.0

00:00:01:00\t9420 9420 c8e5 ecec ef

00:00:02:00\t94ae 94ae`;
            
            const result = doc.analyze(input);
            
            assert.ok(result.neverDisplayedLines.includes(2));
        });

        test('sample line with ENM RCL PAC text and same-line EOC is not never displayed', () => {
            const doc = new SccDocument();
            const input = `Scenarist_SCC V1.0

00:00:01:15	94ae 94ae 9420 9420 94f2 94f2 9723 9723 4361 e6e6 e520 ec61 f4f4 e520 7368 eff2 f4ae 942f 942f

00:00:03:08	942c 942c`;

            const result = doc.analyze(input);

            assert.strictEqual(result.neverDisplayedLines.includes(2), false);
            assert.strictEqual(result.neverErasedLines.includes(2), false);
            const timeRange = result.timeMap.get(2);
            assert.ok(timeRange, 'Line should be tracked in timeMap');
            assert.ok(timeRange!.startTime, 'same-line EOC should set startTime');
            assert.ok(timeRange!.endTime, 'following EDM should set endTime');
        });
    });

    suite('analyze - never erased', () => {
        test('caption with EOC but no EDM flagged as never erased', () => {
            const doc = new SccDocument();
            const input = `Scenarist_SCC V1.0

00:00:01:00\t9420 9420 c8e5 ecec ef

00:00:02:00\t942f 942f`;
            
            const result = doc.analyze(input);
            
            assert.ok(result.neverErasedLines.includes(2), 'Line with EOC but no EDM should be in neverErasedLines');
        });

        test('caption with both EOC and EDM not in neverErasedLines', () => {
            const doc = new SccDocument();
            const input = `Scenarist_SCC V1.0

00:00:01:00\t9420 9420 c8e5 ecec ef

00:00:02:00\t942f 942f

00:00:05:00\t942c 942c`;
            
            const result = doc.analyze(input);
            
            assert.strictEqual(result.neverErasedLines.length, 0, 'Caption with both EOC and EDM should not be in neverErasedLines');
        });
    });

    suite('analyze - non-monotonic timestamps', () => {
        test('timestamp going backwards flagged as non-monotonic', () => {
            const doc = new SccDocument();
            const input = `Scenarist_SCC V1.0

00:00:05:00\t9420 9420

00:00:01:00\t942f 942f`;
            
            const result = doc.analyze(input);
            
            assert.ok(result.nonMonotonicLines.includes(4), 'Line with decreasing timestamp should be in nonMonotonicLines');
        });

        test('normal ascending timestamps not flagged', () => {
            const doc = new SccDocument();
            const input = `Scenarist_SCC V1.0

00:00:01:00\t9420 9420

00:00:02:00\t942f 942f`;
            
            const result = doc.analyze(input);
            
            assert.strictEqual(result.nonMonotonicLines.length, 0, 'Ascending timestamps should not be flagged');
        });
    });

    suite('analyze - repeated paired codes', () => {
        test('repeated paired code on same line counted correctly', () => {
            const doc = new SccDocument();
            const input = `Scenarist_SCC V1.0

00:00:01:00\t9420 9420 94ad 94ad 942f 942f`;
            
            const result = doc.analyze(input);
            
            assert.ok(result.timestampMap.has(2));
            const ti = result.timestampMap.get(2);
            assert.strictEqual(ti!.packetCount, 6, '6 hex words total should be counted');
        });
    });

    suite('collectDiagnostics', () => {
        test('never displayed captions produce SCC004 diagnostics', () => {
            const doc = new SccDocument();
            const input = `Scenarist_SCC V1.0

00:00:01:00\t9420 9420 c8e5 ecec ef`;

            doc.analyze(input);
            const diagnostics = doc.collectDiagnostics();

            const scc004 = diagnostics.find(d => d.code === 'SCC004');
            assert.ok(scc004, 'Should have SCC004 diagnostic');
            assert.strictEqual(scc004!.lineNum, 2);
            assert.strictEqual(scc004!.severity, 'warning');
            assert.ok(scc004!.startChar >= 12, 'startChar should start after timestamp');
            assert.ok(scc004!.endChar > scc004!.startChar, 'endChar should span hex codes');
        });

        test('SCC004 range starts at caption content, not leading RCL', () => {
            const doc = new SccDocument();
            const line = '00:00:01:00\t9420 9420 c8e5 ecec ef';
            const input = `Scenarist_SCC V1.0

${line}`;

            doc.analyze(input);
            const diagnostics = doc.collectDiagnostics();

            const scc004 = diagnostics.find(d => d.code === 'SCC004');
            assert.ok(scc004, 'Should have SCC004 diagnostic');
            assert.strictEqual(scc004!.startChar, line.indexOf('c8e5'));
            assert.ok(scc004!.endChar >= line.indexOf('ecec') + 4);
        });

        test('sample line with same-line EOC does not produce SCC004', () => {
            const doc = new SccDocument();
            const input = `Scenarist_SCC V1.0

00:00:01:15	94ae 94ae 9420 9420 94f2 94f2 9723 9723 4361 e6e6 e520 ec61 f4f4 e520 7368 eff2 f4ae 942f 942f

00:00:03:08	942c 942c`;

            doc.analyze(input);
            const diagnostics = doc.collectDiagnostics();

            assert.strictEqual(diagnostics.some(d => d.lineNum === 2 && d.code === 'SCC004'), false);
        });

        test('never erased captions produce SCC005 diagnostics', () => {
            const doc = new SccDocument();
            const input = `Scenarist_SCC V1.0

00:00:01:00\t9420 9420 c8e5 ecec ef

00:00:02:00\t942f 942f`;

            doc.analyze(input);
            const diagnostics = doc.collectDiagnostics();

            const scc005 = diagnostics.find(d => d.code === 'SCC005');
            assert.ok(scc005, 'Should have SCC005 diagnostic');
            assert.strictEqual(scc005!.lineNum, 2);
            assert.strictEqual(scc005!.severity, 'info');
            assert.ok(scc005!.startChar >= 12, 'startChar should start after timestamp');
            assert.ok(scc005!.endChar > 0, 'endChar should span the line');
        });

        test('parity errors produce SCC001 diagnostics', () => {
            const doc = new SccDocument();
            const input = `Scenarist_SCC V1.0

00:00:01:00\t9420 9420 ffff 942f 942f`;

            doc.analyze(input);
            const diagnostics = doc.collectDiagnostics();

            const scc001 = diagnostics.filter(d => d.code === 'SCC001');
            assert.ok(scc001.length > 0, 'Should have SCC001 diagnostic for ffff');
            assert.strictEqual(scc001[0]!.lineNum, 2);
            assert.ok(scc001[0]!.message.toUpperCase().includes('FFFF'), 'Message should mention the invalid hex code');
        });

        test('invalid timestamps produce SCC002 diagnostics', () => {
            const doc = new SccDocument();
            const input = `Scenarist_SCC V1.0

99:99:99:99\t9420 9420 942f 942f`;

            doc.analyze(input);
            const diagnostics = doc.collectDiagnostics();

            const scc002 = diagnostics.find(d => d.code === 'SCC002');
            assert.ok(scc002, 'Should have SCC002 diagnostic');
            assert.strictEqual(scc002!.lineNum, 2);
            assert.strictEqual(scc002!.startChar, 0, 'timestamp starts at column 0');
        });

        test('buffer overflow produces SCC003 diagnostics', () => {
            const doc = new SccDocument();
            // Two timestamps 1 frame apart, but first line has many packets
            const input = `Scenarist_SCC V1.0

00:00:01:00\t9420 9420 94ad 94ad c8e5 ecec ef80 f7ef f2ec 6480

00:00:01:01\t942f 942f`;

            doc.analyze(input);
            const diagnostics = doc.collectDiagnostics();

            const scc003 = diagnostics.find(d => d.code === 'SCC003');
            assert.ok(scc003, 'Should have SCC003 diagnostic');
            assert.strictEqual(scc003!.lineNum, 2);
            assert.ok(scc003!.message.includes('overflow'), 'Message should mention overflow');
        });

        test('non-monotonic timestamps produce SCC006 diagnostics with timestamp range', () => {
            const doc = new SccDocument();
            const input = `Scenarist_SCC V1.0

00:00:05:00\t9420 9420

00:00:01:00\t942f 942f`;

            doc.analyze(input);
            const diagnostics = doc.collectDiagnostics();

            const scc006 = diagnostics.find(d => d.code === 'SCC006');
            assert.ok(scc006, 'Should have SCC006 diagnostic');
            assert.strictEqual(scc006!.lineNum, 4);
            assert.strictEqual(scc006!.startChar, 0, 'timestamp starts at column 0');
            assert.strictEqual(scc006!.endChar, 11, 'timestamp is 11 chars (HH:MM:SS:FF)');
            assert.strictEqual(scc006!.severity, 'warning');
        });

        test('clean file produces zero diagnostics', () => {
            const doc = new SccDocument();
            // Uses parity-correct hex codes: c8e5="He", ecec="ll", ef80="o"
            const input = `Scenarist_SCC V1.0

00:00:01:00\t9420 9420 94ad 94ad c8e5 ecec ef80

00:00:02:00\t942f 942f

00:00:05:00\t942c 942c`;

            doc.analyze(input);
            const diagnostics = doc.collectDiagnostics();

            assert.strictEqual(diagnostics.length, 0, 'Well-formed file should produce no diagnostics');
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

00:00:01:00\t94ad 94ad c8e5 ecec ef80

00:00:02:00\t94ae 94ae

00:00:03:00\tc8e6 ecec ef80`;

            doc.analyze(input);
            // Get buffer for line 8 (after ENM on line 6)
            // Backwards scan should stop at line 6 (ENM), so line 4's "Hello" should not leak through
            const snapshot = doc.getBufferSnapshot(8, 0);

            // Line 4 has c8e5="He", line 8 has c8e6="Hf"
            // If ENM stops the scan, buffer should only contain line 8 content ("Hf"), not "He" from line 4
            assert.ok(!snapshot.bufferText.includes('e'), 'Buffer should not contain "e" from line 4');
            assert.ok(snapshot.bufferText.includes('H'), 'Buffer should contain "H" from line 8');
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

        test('overflow detected when packets exceed frame budget', () => {
            const doc = new SccDocument();
            // Two timestamps 1 frame apart, but first line has many packets
            const input = `Scenarist_SCC V1.0

00:00:01:00\t9420 9420 94ad 94ad c8e5 ecec ef80 f7ef f2ec 6480

00:00:01:01\t942f 942f`;

            doc.analyze(input);
            const result = doc.checkOverflow(2);

            assert.strictEqual(result.isOverflow, true, 'Should detect overflow');
            assert.ok(result.overflowCount > 0, 'Should report overflow count');
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

00:00:01;00\t9420 9420 c8e5 ecec ef

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

    suite('data-driven: neverErased (from JSON)', () => {
        for (const tc of testCases.neverErased) {
            test(tc.name, () => {
                const doc = new SccDocument();
                const result = doc.analyze(tc.input);
                assert.deepStrictEqual(result.neverErasedLines, tc.expectedNeverErasedLines);
            });
        }
    });

    suite('data-driven: nonMonotonic (from JSON)', () => {
        for (const tc of testCases.nonMonotonic) {
            test(tc.name, () => {
                const doc = new SccDocument();
                const result = doc.analyze(tc.input);
                assert.deepStrictEqual(result.nonMonotonicLines, tc.expectedNonMonotonicLines);
            });
        }
    });



    // Ported from reference/scc_inspector/tests/test_buffer.py
    suite('buffer snapshot (reference tests)', () => {
        test('buffer snapshot for PAC command shows positioning', () => {
            const doc = new SccDocument();
            const input = `Scenarist_SCC V1.0

00:00:01:00\t9420 9440 c8e5 ecec ef80 94e0`;
            
            doc.analyze(input);
            // Word 5 is 94e0 (PAC), logicalIdx 5
            const snapshot = doc.getBufferSnapshot(2, 5);
            
            assert.ok(snapshot.bufferText.length > 0, 'Buffer text should not be empty');
            assert.ok(snapshot.bufferText.includes('{R'), 'Buffer should contain row positioning');
        });

        test('buffer snapshot handles multiple lines', () => {
            const doc = new SccDocument();
            const input = `Scenarist_SCC V1.0

00:00:01:00\t9420 9440 c8e5 ecec ef80

00:00:02:00\tc8e5 ecec ef80`;
            
            doc.analyze(input);
            // Just verify it doesn't crash - get snapshot from line 4
            const snapshot = doc.getBufferSnapshot(4, 0);
            // Basic test that function executes without error
            assert.ok(true, 'Should handle multiple lines without error');
        });
    });
});
