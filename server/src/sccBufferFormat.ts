/**
 * SCC Buffer Format Module
 *
 * Fast single-pass annotation rendering.
 */

import { iterHexWords, parseSccCode, DecodeEvent } from './decoder';

export interface AnnotationSegment {
    text: string;
    isItalic: boolean;
}

export function renderLineAnnotation(lineText: string): AnnotationSegment[] {
    const segments: AnnotationSegment[] = [];
    let currentText = '';
    let isItalic = false;
    let hasContent = false;
    
    for (const word of iterHexWords(lineText)) {
        // Skip second of paired codes
        if (word.isPaired && word.start > word.pairStart) {
            continue;
        }
        
        const evt = parseSccCode(word.text, word.isPaired);
        
        switch (evt.type) {
            case 'TEXT':
                currentText += evt.text || '';
                hasContent = true;
                break;
                
            case 'PAC':
                if (currentText) {
                    segments.push({ text: currentText, isItalic });
                    currentText = '';
                }
                if (segments.length > 0) {
                    segments.push({ text: '\u23ce', isItalic: false }); // newline symbol
                }
                isItalic = evt.isItalic || false;
                hasContent = true;
                break;
                
            case 'MIDROW':
                if (currentText) {
                    segments.push({ text: currentText, isItalic });
                    currentText = '';
                }
                isItalic = evt.isItalic || false;
                hasContent = true;
                break;
                
            case 'INDENT':
                currentText += ' '.repeat(evt.spaces || 0);
                hasContent = true;
                break;
                
            case 'CONTROL':
                if (evt.isBackspace && currentText) {
                    currentText = currentText.slice(0, -1);
                }
                break;
        }
    }
    
    if (currentText) {
        segments.push({ text: currentText, isItalic });
    }
    
    return hasContent ? segments : [];
}