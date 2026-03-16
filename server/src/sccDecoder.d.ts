/**
 * SCC Decoder Module
 *
 * Low-level EIA-608 closed caption decoding logic.
 * Translated from Python scc_decoder.py, loads shared data from scc-core.
 */
export declare const HEX_PATTERN: RegExp;
export declare const TIMESTAMP_PATTERN: RegExp;
export declare function isPairingCommand(val: number): boolean;
export interface HexWord {
    text: string;
    start: number;
    end: number;
    isPaired: boolean;
    pairStart: number;
    pairEnd: number;
}
export interface DecodeEvent {
    type: 'TEXT' | 'CONTROL' | 'PAC' | 'MIDROW' | 'INDENT' | 'NULL' | 'ERROR' | 'UNKNOWN';
    label?: string;
    text?: string;
    name?: string;
    row?: number;
    col?: number;
    color?: string;
    underline?: boolean;
    isItalic?: boolean;
    isExtended?: boolean;
    isNewline?: boolean;
    isBackspace?: boolean;
    desc?: string;
    raw?: string;
    spaces?: number;
}
export declare function iterHexWords(lineText: string): Generator<HexWord>;
export declare function parseSccCode(wordText: string, isPair?: boolean): DecodeEvent;
export declare function decodeSingleCode(wordText: string, isPair?: boolean): string;
export declare function getCommandByte(wordText: string): number;
export declare function isEoc(wordText: string): boolean;
export declare function isRcl(wordText: string): boolean;
export declare function isEnm(wordText: string): boolean;
export declare function isEdm(wordText: string): boolean;
export declare function checkParityFast(hexStr: string): boolean;
