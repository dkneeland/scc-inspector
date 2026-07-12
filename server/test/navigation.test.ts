import * as assert from 'assert';
import { SccDocument } from '../out/sccAnalyzer';
import { buildCodeLenses, buildDocumentSymbols } from '../out/sccNavigation';

suite('Code lenses', () => {
    const text = [
        'Scenarist_SCC V1.0',
        '',
        '00:00:01:00\t9420 9420 9470 9470 c8e5 ecec ef80 942c 942c 942f 942f',
        '',
        '00:00:05:00\t942c 942c',
        ''
    ].join('\n');

    function lenses(t: string) {
        const doc = new SccDocument();
        return buildCodeLenses(doc.analyze(t));
    }

    test('caption line yields rendered text with in/out timing', () => {
        const ls = lenses(text);
        const capt = ls.find(l => l.line === 2);
        assert.ok(capt, 'expected lens on caption line 2');
        assert.ok(capt!.title.includes('Hello'), capt!.title);
        assert.ok(capt!.title.includes('['), capt!.title);
        assert.ok(capt!.title.includes('→'), capt!.title);
    });

    test('control-only line yields no lens', () => {
        const ls = lenses(text);
        assert.strictEqual(ls.find(l => l.line === 4), undefined);
    });

    test('never-displayed line shows warning', () => {
        const t = 'Scenarist_SCC V1.0\n\n00:00:01:00\t9420 9420 9470 9470 c8e5 ecec ef80\n';
        const ls = lenses(t);
        const capt = ls.find(l => l.line === 2);
        assert.ok(capt, 'expected lens on never-displayed line');
        assert.ok(capt!.title.includes('never displayed'), capt!.title);
    });

    test('never-erased line shows note', () => {
        const t = 'Scenarist_SCC V1.0\n\n00:00:01:00\t9420 9420 9470 9470 c8e5 ecec ef80 942f 942f\n';
        const ls = lenses(t);
        const capt = ls.find(l => l.line === 2);
        assert.ok(capt, 'expected lens on never-erased line');
        assert.ok(capt!.title.includes('never erased'), capt!.title);
    });
});

suite('Document symbols', () => {
    const text = 'Scenarist_SCC V1.0\n\n00:00:01:00\t9420 9420 9470 9470 c8e5 ecec ef80 942c 942c 942f 942f\n\n00:00:05:00\t942c 942c\n';

    test('caption block becomes a named symbol with timing detail', () => {
        const doc = new SccDocument();
        const syms = buildDocumentSymbols(doc.analyze(text));
        assert.strictEqual(syms.length, 1);
        assert.strictEqual(syms[0].name, 'Hello');
        assert.strictEqual(syms[0].line, 2);
        assert.match(syms[0].detail, /→/);
    });

    test('long names are truncated', () => {
        const doc = new SccDocument();
        const longText = 'Scenarist_SCC V1.0\n\n00:00:01:00\t9420 9420 9470 9470 ' + 'c8e5 '.repeat(30) + '942f 942f\n';
        const syms = buildDocumentSymbols(doc.analyze(longText));
        assert.ok(syms[0].name.length <= 41);
        assert.ok(syms[0].name.endsWith('…'));
    });
});
