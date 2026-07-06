/**
 * SCC Tooltip Module
 *
 * Tooltip formatting logic for hover tooltips.
 */

const TOOLTIP_WIDTH = 60;

export interface TooltipCard {
    title: string;
    metaLines: string[];
    notes?: string[];
}

export function formatBufferWithMarkers(
    bufferText: string,
    highlightStart: number,
    highlightEnd: number,
    isControl: boolean,
    prefix: string = 'BUF : '
): [string, string] {
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
    card: TooltipCard,
    timestampDesc: string,
    bufferText: string,
    highlightStart: number,
    highlightEnd: number,
    isControl: boolean,
    overflowInfo?: [boolean, number]
): string {
    const [fullBuf, markers] = formatBufferWithMarkers(
        bufferText,
        highlightStart,
        highlightEnd,
        isControl,
        ''
    );
    const wrapped = wrapTooltipLines(fullBuf, markers);

    const sections: string[] = [`### ${card.title}`];

    if (card.metaLines.length > 0) {
        sections.push(...card.metaLines);
    }

    if (card.notes && card.notes.length > 0) {
        for (const note of card.notes) {
            sections.push(`> ${note}`);
        }
    }

    sections.push('');
    sections.push('**Time**');
    sections.push(timestampDesc);

    if (overflowInfo && overflowInfo[0]) {
        sections.push(`> **Overflow:** ${overflowInfo[1]} packet(s) past the next timestamp`);
    }

    if (!bufferText) {
        sections.push('');
        sections.push('**Buffer**');
        sections.push('_empty_');
        return sections.join('\n');
    }

    sections.push('');
    sections.push('**Buffer**');
    sections.push('```text');
    sections.push(...wrapped);
    sections.push('```');
    return sections.join('\n');
}
