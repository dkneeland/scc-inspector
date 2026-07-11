import { AnalysisResult } from './sccAnalyzer';
import { renderLineAnnotation } from './sccBufferFormat';

export interface LensData {
    line: number;
    title: string;
    command: string;
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
