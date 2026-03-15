/**
 * SCC Tooltip Module
 *
 * Tooltip formatting logic for hover tooltips.
 */

const TOOLTIP_WIDTH = 60;

export function formatBufferWithMarkers(
    bufferText: string,
    highlightStart: number,
    highlightEnd: number,
    isControl: boolean
): [string, string] {
    const prefix = 'BUF : ';
    let fullText = prefix + bufferText;
    
    if (isControl && bufferText) {
        fullText += ' ';
    }
    
    const markers = Array(fullText.length).fill(' ');
    
    if (highlightStart >= 0 && highlightEnd > highlightStart) {
        const absStart = highlightStart + prefix.length;
        const absEnd = highlightEnd + prefix.length;
        for (let i = absStart; i < Math.min(absEnd, markers.length); i++) {
            markers[i] = '^';
        }
    } else if (isControl && bufferText) {
        markers[markers.length - 1] = '^';
    }
    
    return [fullText, markers.join('')];
}

export function wrapTooltipLines(
    text: string,
    markers: string,
    maxWidth: number = TOOLTIP_WIDTH
): string[] {
    const lines: string[] = [];
    const indent = '      ';
    let isFirst = true;
    const segments: Array<[string, string, boolean]> = [];
    
    while (text) {
        const limit = isFirst ? maxWidth : maxWidth - indent.length;
        const textSlice = text.slice(0, limit);
        const markSlice = markers.slice(0, limit);
        const displayText = isFirst ? textSlice : indent + textSlice;
        const displayMark = isFirst ? markSlice : indent + markSlice;
        text = text.slice(limit);
        markers = markers.slice(limit);
        segments.push([displayText, displayMark, markSlice.includes('^')]);
        isFirst = false;
    }
    
    let i = 0;
    while (i < segments.length) {
        const [textLine, markLine, hasCarets] = segments[i];
        lines.push(textLine);
        
        if (!hasCarets) {
            i++;
            continue;
        }
        
        const isLastSegment = i >= segments.length - 1;
        if (isLastSegment) {
            lines.push(markLine);
            i++;
        } else {
            const nextText = segments[i + 1][0];
            const caretStr = markLine.trimStart();
            const padding = Math.max(0, maxWidth - nextText.length - caretStr.length);
            lines.push(nextText + ' '.repeat(padding) + caretStr);
            if (segments[i + 1][2]) {
                lines.push(segments[i + 1][1]);
            }
            i += 2;
        }
    }
    
    return lines;
}

export function formatTooltip(
    eventDesc: string,
    timestampDesc: string,
    bufferText: string,
    highlightStart: number,
    highlightEnd: number,
    isControl: boolean,
    overflowInfo?: [boolean, number]
): string {
    const separator = '-'.repeat(TOOLTIP_WIDTH);
    
    const [fullBuf, markers] = formatBufferWithMarkers(
        bufferText,
        highlightStart,
        highlightEnd,
        isControl
    );
    const wrapped = wrapTooltipLines(fullBuf, markers);
    
    let bufferSection: string;
    if (overflowInfo && overflowInfo[0]) {
        const overflowMsg = '!!! BUFFER OVERFLOW !!!';
        bufferSection = overflowMsg + '\n' + wrapped.join('\n');
    } else {
        bufferSection = wrapped.join('\n');
    }
    
    return `${eventDesc}\n${separator}\n${timestampDesc}\n${separator}\n${bufferSection}`;
}