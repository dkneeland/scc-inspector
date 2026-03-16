/**
 * SCC Buffer Format Module
 *
 * Fast single-pass annotation rendering.
 */
export interface AnnotationSegment {
    text: string;
    isItalic: boolean;
}
export declare function renderLineAnnotation(lineText: string): AnnotationSegment[];
