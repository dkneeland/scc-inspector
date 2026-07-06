import * as assert from 'assert';
import {
    formatBufferHighlight,
    HIGHLIGHT_SENTINEL,
    INSERTION_GLYPH
} from '../out/sccTooltip';

const ZW = HIGHLIGHT_SENTINEL;
const stripZW = (s: string) => s.split(ZW).join('');

suite('formatBufferHighlight', () => {
    test('wraps the highlight span in a sentinel pair', () => {
        const lines = formatBufferHighlight('{R14 C12 White}  Oh.', 19, 20, false);
        assert.strictEqual(lines.length, 1);
        assert.strictEqual(lines[0], `{R14 C12 White}  Oh${ZW}.${ZW}`);
    });

    test('appends insertion glyph for control codes without a span', () => {
        const lines = formatBufferHighlight('{R14 C12 White}  Oh.', -1, -1, true);
        assert.strictEqual(lines.length, 1);
        assert.strictEqual(lines[0], `{R14 C12 White}  Oh.${INSERTION_GLYPH}`);
        assert.ok(!lines[0].includes(ZW), 'no sentinels when there is no span');
    });

    test('a valid span wins over the control glyph', () => {
        const lines = formatBufferHighlight('{R14 C12 White}  Oh.', 19, 20, true);
        assert.strictEqual(lines[0], `{R14 C12 White}  Oh${ZW}.${ZW}`);
        assert.ok(!lines[0].includes(INSERTION_GLYPH));
    });

    test('empty buffer produces no lines', () => {
        assert.deepStrictEqual(formatBufferHighlight('', -1, -1, true), []);
    });

    test('wraps at 60 chars with 6-space continuation indent', () => {
        const lines = formatBufferHighlight('A'.repeat(80), -1, -1, false);
        assert.deepStrictEqual(lines, ['A'.repeat(60), '      ' + 'A'.repeat(20)]);
    });

    test('sentinels never distort wrap geometry', () => {
        const lines = formatBufferHighlight('A'.repeat(80), 10, 20, false);
        assert.strictEqual(stripZW(lines[0]), 'A'.repeat(60));
        assert.strictEqual(stripZW(lines[1]), '      ' + 'A'.repeat(20));
    });

    test('highlight spanning a wrap boundary gets a sentinel pair per segment', () => {
        const lines = formatBufferHighlight('B'.repeat(80), 55, 65, false);
        assert.strictEqual(lines.length, 2);
        assert.strictEqual(lines[0], 'B'.repeat(55) + ZW + 'B'.repeat(5) + ZW);
        assert.strictEqual(lines[1], '      ' + ZW + 'B'.repeat(5) + ZW + 'B'.repeat(15));
    });
});
