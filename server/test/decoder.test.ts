/**
 * Decoder Tests
 *
 * Tests for SCC code parsing using shared test cases from scc-core.
 */

import * as assert from 'assert';
import * as path from 'path';
import { parseSccCode, iterHexWords, checkParityFast, decodeSingleCode } from '../src/decoder';

// Load test cases
const testCasesPath = path.join(__dirname, '../../scc-core/test-cases/decoder_cases.json');
const testCases = require(testCasesPath);

suite('Decoder Tests', () => {
    
    suite('Character Tests', () => {
        testCases.characterTests.forEach((tc: any) => {
            test(`should decode ${tc.input} as ${tc.expectedType}`, () => {
                const result = parseSccCode(tc.input);
                assert.strictEqual(result.type, tc.expectedType);
                
                if (tc.expectedText) {
                    assert.strictEqual(result.text, tc.expectedText);
                }
                if (tc.expectedCommand) {
                    assert.ok(result.name?.includes(tc.expectedCommand));
                }
            });
        });
    });
    
    suite('Tab Offset Tests', () => {
        testCases.tabOffsetTests.forEach((tc: any) => {
            test(`should decode ${tc.input} as INDENT with ${tc.expectedSpaces} spaces`, () => {
                const result = parseSccCode(tc.input);
                assert.strictEqual(result.type, 'INDENT');
                assert.strictEqual(result.spaces, tc.expectedSpaces);
            });
        });
    });
    
    suite('Pairing Tests', () => {
        testCases.pairingTests.forEach((tc: any) => {
            test(tc.description, () => {
                const words = [...iterHexWords(tc.line)];
                const pairs = words.map(w => w.isPaired);
                assert.deepStrictEqual(pairs, tc.expectedPairs);
            });
        });
    });
    
    suite('Line Decoding Tests', () => {
        testCases.lineDecodingTests.forEach((tc: any) => {
            test(tc.description || `decode line to "${tc.expectedText}"`, () => {
                let text = '';
                for (const word of iterHexWords(tc.line)) {
                    if (word.isPaired && word.start > word.pairStart) continue;
                    const evt = parseSccCode(word.text, word.isPaired);
                    if (evt.type === 'TEXT') {
                        text += evt.text || '';
                    }
                }
                assert.ok(text.includes(tc.expectedText) || text === tc.expectedText,
                    `Expected "${tc.expectedText}" in "${text}"`);
            });
        });
    });
    
    suite('PAC Tests', () => {
        testCases.pactests.forEach((tc: any) => {
            test(`should decode ${tc.input} as ${tc.expectedType}`, () => {
                const result = parseSccCode(tc.input);
                assert.strictEqual(result.type, tc.expectedType);
                
                if (tc.expectedRow !== undefined) {
                    assert.strictEqual(result.row, tc.expectedRow);
                }
                if (tc.expectedCol !== undefined) {
                    assert.strictEqual(result.col, tc.expectedCol);
                }
                if (tc.expectedColor !== undefined) {
                    assert.strictEqual(result.color, tc.expectedColor);
                }
            });
        });
    });
    
    suite('Midrow Tests', () => {
        testCases.midrowTests.forEach((tc: any) => {
            test(`should decode ${tc.input} as MIDROW with ${tc.expectedColor}`, () => {
                const result = parseSccCode(tc.input);
                assert.strictEqual(result.type, 'MIDROW');
                assert.strictEqual(result.color, tc.expectedColor);
            });
        });
    });
    
    suite('Parity Error Tests', () => {
        testCases.parityErrorTests.forEach((tc: any) => {
            test(`${tc.input} should have parity error`, () => {
                const hasValidParity = checkParityFast(tc.input);
                assert.strictEqual(hasValidParity, false, tc.description);
            });
        });
    });
    
    suite('decodeSingleCode', () => {
        test('should decode 8080 as Null', () => {
            const result = decodeSingleCode('8080');
            assert.ok(result.includes('Null'));
        });
        
        test('should decode c1c2 as text AB', () => {
            const result = decodeSingleCode('c1c2');
            assert.ok(result.includes('AB'));
        });
    });
});