import { AnalysisResult } from './sccAnalyzer';
import { renderLineAnnotation } from './sccBufferFormat';

export interface LensData {
    line: number;
    title: string;
    command: string;
}

export interface SymbolData {
    name: string;
    detail: string;
    line: number;
}

const MAX_SYMBOL_NAME = 40;

export function buildDocumentSymbols(analysis: AnalysisResult): SymbolData[] {
    const symbols: SymbolData[] = [];
    for (const [lineNum, lineText] of analysis.lineTexts) {
        const segments = renderLineAnnotation(lineText);
        let name = segments.map(s => s.text).join('').trim();
        if (!name) continue;
        if (name.length > MAX_SYMBOL_NAME) {
            name = name.slice(0, MAX_SYMBOL_NAME) + '…';
        }
        const tr = analysis.timeMap.get(lineNum);
        const detail = tr?.startTime && tr?.endTime ? `${tr.startTime} → ${tr.endTime}` : '';
        symbols.push({ name, detail, line: lineNum });
    }
    return symbols.sort((a, b) => a.line - b.line);
}

export function buildCodeLenses(analysis: AnalysisResult): LensData[] {
    const lenses: LensData[] = [];
    for (const [lineNum, lineText] of analysis.lineTexts) {
        const segments = renderLineAnnotation(lineText);
        if (segments.length === 0) continue;
        const text = segments.map(s => s.text).join('');
        const tr = analysis.timeMap.get(lineNum);
        let title: string;
        if (tr?.startTime === null) {
            title = `never displayed — ${text}`;
        } else if (tr && tr.startTime && tr.endTime) {
            title = `[${tr.startTime} → ${tr.endTime}] ${text}`;
        } else if (tr && tr.startTime && tr.endTime === null) {
            title = `[${tr.startTime} → never erased] ${text}`;
        } else {
            title = text;
        }
        lenses.push({ line: lineNum, title, command: '' });
    }
    return lenses.sort((a, b) => a.line - b.line);
}
