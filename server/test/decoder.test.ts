import * as assert from 'assert';
import * as path from 'path';
import { parseSccCode, iterHexWords, decodeSingleCode, HEX_PATTERN, isPairingCommand, isRcl, isEnm, isEoc, isEdm } from '../out/sccDecoder';

const testCasesPath = path.join(__dirname, './test-cases/decoder_cases.json');
const testCases = require(testCasesPath);

suite('Decoder Tests', () => {
    
    suite('Standard Characters', () => {
        testCases.standard_characters.forEach((tc: any) => {
            test(tc.description || `decode ${tc.input}`, () => {
                const result = parseSccCode(tc.input);
                assert.strictEqual(result.type, tc.expectedType);
                if (tc.expectedText) {
                    assert.strictEqual(result.text, tc.expectedText);
                }
            });
        });
    });
    
    suite('Extended Characters', () => {
        testCases.extended_characters.forEach((tc: any) => {
            test(tc.description || `decode ${tc.input}`, () => {
                const result = parseSccCode(tc.input);
                assert.strictEqual(result.type, tc.expectedType);
                if (tc.expectedText) {
                    assert.strictEqual(result.text, tc.expectedText);
                }
                if (tc.isExtended !== undefined) {
                    assert.strictEqual(result.isExtended, tc.isExtended);
                }
            });
        });
    });
    
    suite('Special Characters', () => {
        testCases.special_characters.forEach((tc: any) => {
            test(tc.description || `decode ${tc.input}`, () => {
                const result = parseSccCode(tc.input);
                assert.strictEqual(result.type, tc.expectedType);
                if (tc.expectedText) {
                    assert.strictEqual(result.text, tc.expectedText);
                }
                if (tc.isExtended !== undefined) {
                    assert.strictEqual(result.isExtended, tc.isExtended);
                }
            });
        });
    });
    
    suite('PAC Tests', () => {
        testCases.pac_tests.forEach((tc: any) => {
            test(tc.description || `decode ${tc.input}`, () => {
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
        testCases.midrow_tests.forEach((tc: any) => {
            test(tc.description || `decode ${tc.input}`, () => {
                const result = parseSccCode(tc.input);
                assert.strictEqual(result.type, tc.expectedType);
                if (tc.expectedColor !== undefined && tc.expectedColor !== null) {
                    assert.strictEqual(result.color, tc.expectedColor);
                }
            });
        });
    });
    
    suite('Control Codes Not Text', () => {
        testCases.control_codes_not_text.forEach((tc: any) => {
            test(tc.description || `${tc.input} not TEXT`, () => {
                const result = parseSccCode(tc.input);
                assert.notStrictEqual(result.type, 'TEXT');
                assert.strictEqual(result.type, tc.expectedType);
            });
        });
    });
    
    suite('Line Decode Tests', () => {
        testCases.line_decode_tests.forEach((tc: any) => {
            test(tc.description || 'line decode', () => {
                let text = '';
                for (const word of iterHexWords(tc.line)) {
                    if (word.isPaired && word.start > word.pairStart) continue;
                    const evt = parseSccCode(word.text, word.isPaired);
                    if (evt.type === 'TEXT') {
                        text += evt.text || '';
                    }
                }
                if (tc.expectedContains) {
                    assert.ok(text.includes(tc.expectedContains), `Expected "${tc.expectedContains}" in "${text}"`);
                }
            });
        });
    });
    
    suite('Pair Detection', () => {
        testCases.pair_detection.forEach((tc: any) => {
            test(`pair detection: ${tc.line}`, () => {
                const words = [...iterHexWords(tc.line)];
                const pairs = words.map(w => w.isPaired);
                assert.deepStrictEqual(pairs, tc.expectedPaired);
            });
        });
    });
    
    suite('Hex Pattern', () => {
        testCases.hex_pattern.forEach((tc: any) => {
            test(`find ${tc.expectedMatchCount} matches`, () => {
                const matches = tc.input.match(HEX_PATTERN) || [];
                assert.strictEqual(matches.length, tc.expectedMatchCount);
            });
        });
    });
    
    suite('Pairing Command Tests', () => {
        testCases.pairing_command_tests.forEach((tc: any) => {
            test(tc.description || `${tc.input}`, () => {
                const val = parseInt(tc.input, 16);
                const result = isPairingCommand(val);
                assert.strictEqual(result, tc.isPairingCommand);
            });
        });
    });
    
    suite('Decode Single Code', () => {
        testCases.decode_single_code_tests.forEach((tc: any) => {
            test(tc.description || `decode ${tc.input}`, () => {
                const result = decodeSingleCode(tc.input);
                if (tc.expectedContains) {
                    assert.ok(result.includes(tc.expectedContains), `Expected "${tc.expectedContains}" in "${result}"`);
                }
            });
        });
    });

    suite('Control Helper Guards', () => {
        test('text words do not match control helpers by masked low byte', () => {
            assert.strictEqual(isRcl('e520'), false);
            assert.strictEqual(isEnm('f4ae'), false);
            assert.strictEqual(isEoc('942f'), true);
            assert.strictEqual(isEdm('942c'), true);
        });
    });
    
    suite('Iterator Tests', () => {
        testCases.iterator_tests.forEach((tc: any) => {
            test(tc.description || 'iterator test', () => {
                const words = [...iterHexWords(tc.line)];
                assert.strictEqual(words.length, tc.expectedWordCount);
                if (tc.expectedPairing) {
                    const pairs = words.map(w => w.isPaired);
                    assert.deepStrictEqual(pairs, tc.expectedPairing);
                }
            });
        });
    });
});
