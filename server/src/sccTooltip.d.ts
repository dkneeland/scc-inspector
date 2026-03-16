/**
 * SCC Tooltip Module
 *
 * Tooltip formatting logic for hover tooltips.
 */
export declare function formatBufferWithMarkers(bufferText: string, highlightStart: number, highlightEnd: number, isControl: boolean): [string, string];
export declare function wrapTooltipLines(text: string, markers: string, maxWidth?: number): string[];
export declare function formatTooltip(eventDesc: string, timestampDesc: string, bufferText: string, highlightStart: number, highlightEnd: number, isControl: boolean, overflowInfo?: [boolean, number]): string;
