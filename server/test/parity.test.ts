import * as assert from 'assert';
import * as path from 'path';
import { checkParityByte, checkParityFast, findParityErrors, parseSccCode } from '../out/sccDecoder';

const parityCasesPath = path.join(__dirname, './test-cases/parity_cases.json');
const parityCases = require(parityCasesPath);

suite('Parity Tests', () => {
    suite('Odd Parity Bytes', () => {
        parityCases.odd_parity_bytes.forEach((byteVal: number) => {
            test(`byte 0x${byteVal.toString(16).padStart(2, '0')} should have odd parity`, () => {
                assert.ok(checkParityByte(byteVal));
            });
        });
    });

    suite('Even Parity Bytes', () => {
        parityCases.even_parity_bytes.forEach((byteVal: number) => {
            test(`byte 0x${byteVal.toString(16).padStart(2, '0')} should NOT have odd parity`, () => {
                assert.strictEqual(checkParityByte(byteVal), false);
            });
        });
    });

    suite('Valid SCC Codes', () => {
        parityCases.valid_scc_codes.forEach((code: string) => {
            test(`${code} should be valid`, () => {
                const errors = findParityErrors(code);
                const parityErrors = errors.filter((e: { code: string }) => !checkParityFast(e.code));
                assert.strictEqual(parityErrors.length, 0);
            });
        });
    });

    suite('Invalid SCC Codes', () => {
        parityCases.invalid_scc_codes.forEach((tc: any) => {
            test(`${tc.code} should have parity error: ${tc.shouldHaveError}`, () => {
                const errors = findParityErrors(tc.code);
                const parityErrors = errors.filter((e: { code: string }) => !checkParityFast(e.code));
                if (tc.shouldHaveError) {
                    assert.ok(parityErrors.length > 0);
                } else {
                    assert.strictEqual(parityErrors.length, 0);
                }
            });
        });
    });

    suite('Parity Error Position', () => {
        const ep = parityCases.error_position;
        test(`${ep.line} should error on ${ep.expectedErrorCode}`, () => {
            const errors = findParityErrors(ep.line);
            const parityErrors = errors.filter((e: { code: string }) => !checkParityFast(e.code));
            assert.strictEqual(parityErrors.length, ep.expectedErrorCount);
            const e: { start: number; end: number; code: string } = parityErrors[0];
            assert.strictEqual(ep.line.slice(e.start, e.end).toUpperCase(), ep.expectedErrorCode.toUpperCase());
        });
    });

    suite('Parity Priority', () => {
        parityCases.priority_tests.forEach((tc: any) => {
            test(`${tc.input} should produce ${tc.expectedErrorType}`, () => {
                const evt = parseSccCode(tc.input);
                assert.strictEqual(evt.type, 'ERROR');
            });
        });
    });
});
