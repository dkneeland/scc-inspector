import * as assert from 'assert';
import {
    formatBufferHighlight,
    formatTimestampLine,
    formatTooltip,
    HIGHLIGHT_SENTINEL,
    INSERTION_GLYPH,
    TooltipCard
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

    test('wraps at 60 chars, no continuation indent', () => {
        const lines = formatBufferHighlight('A'.repeat(80), -1, -1, false);
        assert.deepStrictEqual(lines, ['A'.repeat(60), 'A'.repeat(20)]);
    });

    test('sentinels never distort wrap geometry', () => {
        const lines = formatBufferHighlight('A'.repeat(80), 10, 20, false);
        assert.strictEqual(stripZW(lines[0]), 'A'.repeat(60));
        assert.strictEqual(stripZW(lines[1]), 'A'.repeat(20));
    });

    test('highlight spanning a wrap boundary gets a sentinel pair per segment', () => {
        const lines = formatBufferHighlight('B'.repeat(80), 55, 65, false);
        assert.strictEqual(lines.length, 2);
        assert.strictEqual(lines[0], 'B'.repeat(55) + ZW + 'B'.repeat(5) + ZW);
        assert.strictEqual(lines[1], ZW + 'B'.repeat(5) + ZW + 'B'.repeat(15));
    });
});

suite('formatTooltip (B2 layout)', () => {
    const textCard: TooltipCard = { title: 'Text', summary: '"."', code: 'AE80', label: 'CC2' };
    const textArgs: [string, number, number, boolean] = ['{R14 C12 White}  Oh.', 19, 20, false];

    test('buffer fence first, then identity and time lines', () => {
        const tooltip = formatTooltip(textCard, '`00:00:43:18` · offset +9 packets', ...textArgs);
        assert.strictEqual(tooltip, [
            '```scc-buffer',
            `{R14 C12 White}  Oh${ZW}.${ZW}`,
            '─'.repeat(60),
            '```',
            '**"."** · `AE80` CC2',
            '',
            '`00:00:43:18` · offset +9 packets'
        ].join('\n'));
    });

    test('no headings or section labels anywhere', () => {
        const tooltip = formatTooltip(textCard, '`00:00:43:18` · offset +9 packets', ...textArgs);
        assert.ok(!tooltip.includes('###'));
        assert.ok(!tooltip.includes('**Time**'));
        assert.ok(!tooltip.includes('**Buffer**'));
    });

    test('card without summary or label renders compact identity line', () => {
        const card: TooltipCard = { title: 'End of Caption', code: '942F' };
        const tooltip = formatTooltip(card, '`00:00:43:18`', '{R14 C12 White}  Oh.', -1, -1, true);
        assert.ok(tooltip.includes('**End of Caption** · `942F`'));
        assert.ok(tooltip.includes(INSERTION_GLYPH));
    });

    test('dup suffix appends to the identity line', () => {
        const card: TooltipCard = {
            title: 'Preamble Address Code',
            summary: 'Row 14 · Col 4 · White',
            code: '94F2',
            dup: true
        };
        const tooltip = formatTooltip(card, '`00:00:01:19` · offset +4 packets', '{R14 C04 White}Cafe', 0, 15, false);
        assert.ok(tooltip.includes(' · dup (ignored)'));
        assert.ok(!tooltip.includes('> Duplicate'));
    });

    test('real notes render as blockquotes after the time line', () => {
        const card: TooltipCard = {
            title: 'Null / Padding',
            code: '8080',
            notes: ['Padding or filler code. No effect on the caption buffer.']
        };
        const tooltip = formatTooltip(card, '`00:00:01:19` · offset +4 packets', '', -1, -1, true);
        const lines = tooltip.split('\n');
        assert.strictEqual(lines[lines.length - 1], '> Padding or filler code. No effect on the caption buffer.');
    });

    test('empty buffer shows empty fence and italic placeholder', () => {
        const card: TooltipCard = {
            title: 'Null / Padding',
            code: '8080',
            notes: ['Padding or filler code. No effect on the caption buffer.']
        };
        const tooltip = formatTooltip(card, '`00:00:01:19` · offset +4 packets', '', -1, -1, true);
        assert.ok(tooltip.includes('```scc-buffer'));
        assert.ok(tooltip.includes('Buffer empty'));
        assert.ok(tooltip.includes('> Padding or filler code. No effect on the caption buffer.'));
    });

    test('overflow warning survives an empty buffer', () => {
        const card: TooltipCard = { title: 'Null / Padding', code: '8080' };
        const tooltip = formatTooltip(card, '`00:00:01:19`', '', -1, -1, true, [true, 3]);
        assert.ok(tooltip.includes('> **Overflow:** 3 packet(s) past the next timestamp'));
        assert.ok(tooltip.includes('Buffer empty'));
    });
});

suite('formatTimestampLine', () => {
    test('zero offset renders just the timecode', () => {
        assert.strictEqual(formatTimestampLine('00:00:43:18', 0, true), '`00:00:43:18`');
    });

    test('singular packet offset', () => {
        assert.strictEqual(formatTimestampLine('00:00:43:10', 1, true), '`00:00:43:10` · offset +1 packet');
    });

    test('plural packet offset', () => {
        assert.strictEqual(formatTimestampLine('00:00:43:18', 9, true), '`00:00:43:18` · offset +9 packets');
    });

    test('missing frame rate appends italic note', () => {
        assert.strictEqual(
            formatTimestampLine('00:00:43:09', 9, false),
            '`00:00:43:09` · offset +9 packets · *frame rate not detected*'
        );
    });
});

suite('escapeMarkdownInline (internal)', () => {
    test('escapes asterisk inside bold', () => {
        const card: TooltipCard = {
            title: 'Text',
            summary: '"Hello *World*"',
            code: 'AE80'
        };
        const tooltip = formatTooltip(card, '`00:00:01:00`', '', -1, -1, true);
        // The bold markdown should survive because * is escaped
        assert.ok(tooltip.includes('**"Hello \\*World\\*"**'), 'asterisks inside bold should be escaped: ' + tooltip);
    });

    test('brackets and backslash are escaped', () => {
        const card: TooltipCard = {
            title: 'Text',
            summary: '"test [text] \\stuff"',
            code: 'AE80'
        };
        const tooltip = formatTooltip(card, '`00:00:01:00`', '', -1, -1, true);
        assert.ok(tooltip.includes('**"test \\[text\\] \\\\stuff"**'), 'brackets and backslash should be escaped');
    });

    test('underscore and backtick are escaped', () => {
        const card: TooltipCard = {
            title: 'Text',
            summary: '"a_b `code`"',
            code: 'AE80'
        };
        const tooltip = formatTooltip(card, '`00:00:01:00`', '', -1, -1, true);
        assert.ok(tooltip.includes('**"a\\_b \\`code\\`"**'), 'underscore and backtick should be escaped: ' + tooltip);
    });
});
