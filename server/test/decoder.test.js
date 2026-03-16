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
const sccDecoder_1 = require("../src/sccDecoder");
const testCasesPath = path.join(__dirname, './test-cases/decoder_cases.json');
const testCases = require(testCasesPath);
suite('Decoder Tests', () => {
    suite('Standard Characters', () => {
        testCases.standard_characters.forEach((tc) => {
            test(tc.description || `decode ${tc.input}`, () => {
                const result = (0, sccDecoder_1.parseSccCode)(tc.input);
                assert.strictEqual(result.type, tc.expectedType);
                if (tc.expectedText) {
                    assert.strictEqual(result.text, tc.expectedText);
                }
            });
        });
    });
    suite('Extended Characters', () => {
        testCases.extended_characters.forEach((tc) => {
            test(tc.description || `decode ${tc.input}`, () => {
                const result = (0, sccDecoder_1.parseSccCode)(tc.input);
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
        testCases.special_characters.forEach((tc) => {
            test(tc.description || `decode ${tc.input}`, () => {
                const result = (0, sccDecoder_1.parseSccCode)(tc.input);
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
        testCases.pac_tests.forEach((tc) => {
            test(tc.description || `decode ${tc.input}`, () => {
                const result = (0, sccDecoder_1.parseSccCode)(tc.input);
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
        testCases.midrow_tests.forEach((tc) => {
            test(tc.description || `decode ${tc.input}`, () => {
                const result = (0, sccDecoder_1.parseSccCode)(tc.input);
                assert.strictEqual(result.type, tc.expectedType);
                if (tc.expectedColor !== undefined && tc.expectedColor !== null) {
                    assert.strictEqual(result.color, tc.expectedColor);
                }
            });
        });
    });
    suite('Control Codes Not Text', () => {
        testCases.control_codes_not_text.forEach((tc) => {
            test(tc.description || `${tc.input} not TEXT`, () => {
                const result = (0, sccDecoder_1.parseSccCode)(tc.input);
                assert.notStrictEqual(result.type, 'TEXT');
                assert.strictEqual(result.type, tc.expectedType);
            });
        });
    });
    suite('Line Decode Tests', () => {
        testCases.line_decode_tests.forEach((tc) => {
            test(tc.description || 'line decode', () => {
                let text = '';
                for (const word of (0, sccDecoder_1.iterHexWords)(tc.line)) {
                    if (word.isPaired && word.start > word.pairStart)
                        continue;
                    const evt = (0, sccDecoder_1.parseSccCode)(word.text, word.isPaired);
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
        testCases.pair_detection.forEach((tc) => {
            test(`pair detection: ${tc.line}`, () => {
                const words = [...(0, sccDecoder_1.iterHexWords)(tc.line)];
                const pairs = words.map(w => w.isPaired);
                assert.deepStrictEqual(pairs, tc.expectedPaired);
            });
        });
    });
    suite('Hex Pattern', () => {
        testCases.hex_pattern.forEach((tc) => {
            test(`find ${tc.expectedMatchCount} matches`, () => {
                const matches = tc.input.match(sccDecoder_1.HEX_PATTERN) || [];
                assert.strictEqual(matches.length, tc.expectedMatchCount);
            });
        });
    });
    suite('Pairing Command Tests', () => {
        testCases.pairing_command_tests.forEach((tc) => {
            test(tc.description || `${tc.input}`, () => {
                const val = parseInt(tc.input, 16);
                const result = (0, sccDecoder_1.isPairingCommand)(val);
                assert.strictEqual(result, tc.isPairingCommand);
            });
        });
    });
    suite('Decode Single Code', () => {
        testCases.decode_single_code_tests.forEach((tc) => {
            test(tc.description || `decode ${tc.input}`, () => {
                const result = (0, sccDecoder_1.decodeSingleCode)(tc.input);
                if (tc.expectedContains) {
                    assert.ok(result.includes(tc.expectedContains), `Expected "${tc.expectedContains}" in "${result}"`);
                }
            });
        });
    });
    suite('Iterator Tests', () => {
        testCases.iterator_tests.forEach((tc) => {
            test(tc.description || 'iterator test', () => {
                const words = [...(0, sccDecoder_1.iterHexWords)(tc.line)];
                assert.strictEqual(words.length, tc.expectedWordCount);
                if (tc.expectedPairing) {
                    const pairs = words.map(w => w.isPaired);
                    assert.deepStrictEqual(pairs, tc.expectedPairing);
                }
            });
        });
    });
});
//# sourceMappingURL=decoder.test.js.map