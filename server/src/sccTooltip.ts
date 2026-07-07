const TOOLTIP_WIDTH = 60;

export const HIGHLIGHT_SENTINEL = '\u200B';
export const INSERTION_GLYPH = '▏';

export interface TooltipCard {
    title: string;
    summary?: string;
    code: string;
    label?: string;
    notes?: string[];
}

export function formatBufferHighlight(
    bufferText: string,
    highlightStart: number,
    highlightEnd: number,
    isControl: boolean,
    maxWidth: number = TOOLTIP_WIDTH
): string[] {
    const indent = '      ';
    let text = bufferText;

    if (!text) {
        return [];
    }

    const hasRange = highlightStart >= 0 && highlightEnd > highlightStart;
    if (!hasRange && isControl) {
        text += INSERTION_GLYPH;
    }

    const lines: string[] = [];
    let offset = 0;
    let isFirst = true;
    while (offset < text.length) {
        const limit = isFirst ? maxWidth : maxWidth - indent.length;
        const seg = text.slice(offset, offset + limit);
        const segStart = offset;
        const segEnd = offset + seg.length;
        let rendered = seg;
        if (hasRange) {
            const s = Math.max(highlightStart, segStart);
            const e = Math.min(highlightEnd, segEnd);
            if (e > s) {
                const localS = s - segStart;
                const localE = e - segStart;
                rendered = seg.slice(0, localS) + HIGHLIGHT_SENTINEL
                    + seg.slice(localS, localE) + HIGHLIGHT_SENTINEL
                    + seg.slice(localE);
            }
        }
        lines.push(isFirst ? rendered : indent + rendered);
        offset = segEnd;
        isFirst = false;
    }
    return lines;
}

export function formatTimestampLine(
    displayTime: string,
    packetIdx: number,
    frameRateDetected: boolean
): string {
    const pktWord = packetIdx === 1 ? 'packet' : 'packets';
    const offsetPart = packetIdx === 0 ? '' : ` · offset +${packetIdx} ${pktWord}`;
    const ratePart = frameRateDetected ? '' : ' · *frame rate not detected*';
    return `\`${displayTime}\`${offsetPart}${ratePart}`;
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
    const sections: string[] = [];

    if (bufferText) {
        sections.push('```scc-buffer');
        sections.push(...formatBufferHighlight(bufferText, highlightStart, highlightEnd, isControl));
        sections.push('```');
    } else {
        sections.push('```scc-buffer');
        sections.push('');
        sections.push('```');
        sections.push('');
        sections.push('*Buffer empty*');
    }

    const summaryPart = card.summary ? `  ${card.summary}` : '';
    const labelPart = card.label ? ` · ${card.label}` : '';
    sections.push(`**${card.title}${summaryPart}**  ·  \`${card.code}\`${labelPart}`);
    sections.push('');
    sections.push(timestampDesc);

    if (overflowInfo && overflowInfo[0]) {
        sections.push(`> **Overflow:** ${overflowInfo[1]} packet(s) past the next timestamp`);
    }

    if (card.notes) {
        for (const note of card.notes) {
            sections.push(`> ${note}`);
        }
    }

    return sections.join('\n');
}
