import {
    createConnection,
    TextDocuments,
    ProposedFeatures,
    InitializeParams,
    DidChangeConfigurationNotification,
    TextDocumentPositionParams,
    TextDocumentSyncKind,
    InitializeResult,
    Hover,
    MarkupKind,
    Diagnostic,
    DiagnosticSeverity,
    Range,
    CodeLens
} from 'vscode-languageserver/node';

import { TextDocument } from 'vscode-languageserver-textdocument';
import { parseSccCode, iterHexWords, TIMESTAMP_PATTERN, HexWord } from './sccDecoder';
import { addFrames, parseTimestampStr } from './sccTimecode';
import { SccDocument } from './sccAnalyzer';
import { formatTooltip, formatTimestampLine, TooltipCard } from './sccTooltip';
import { buildCodeLenses } from './sccNavigation';

const connection = createConnection(ProposedFeatures.all);
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

const sccDocuments: Map<string, SccDocument> = new Map();
const pendingDiagnostics: Map<string, NodeJS.Timeout> = new Map();

let hasConfigurationCapability = false;

connection.onInitialize((params: InitializeParams) => {
    const capabilities = params.capabilities;

    hasConfigurationCapability = !!(
        capabilities.workspace && !!capabilities.workspace.configuration
    );

    const result: InitializeResult = {
        capabilities: {
            textDocumentSync: TextDocumentSyncKind.Incremental,
            hoverProvider: true,
            codeLensProvider: { resolveProvider: false }
        }
    };

    return result;
});

connection.onInitialized(() => {
    if (hasConfigurationCapability) {
        connection.client.register(
            DidChangeConfigurationNotification.type,
            undefined
        );
    }
});

interface SCCSettings {
    hoverEnabled: boolean;
    decorationsEnabled: boolean;
}

const defaultSettings: SCCSettings = {
    hoverEnabled: true,
    decorationsEnabled: true
};

let globalSettings: SCCSettings = defaultSettings;
const documentSettings: Map<string, Thenable<SCCSettings>> = new Map();

function _getDocumentSettings(resource: string): Thenable<SCCSettings> {
    if (!hasConfigurationCapability) {
        return Promise.resolve(globalSettings);
    }
    let result = documentSettings.get(resource);
    if (!result) {
        result = connection.workspace.getConfiguration({
            scopeUri: resource,
            section: 'sccInspector'
        });
        documentSettings.set(resource, result);
    }
    return result;
}

connection.onDidChangeConfiguration(change => {
    if (hasConfigurationCapability) {
        documentSettings.clear();
    } else {
        globalSettings = <SCCSettings>(
            (change.settings.sccInspector || defaultSettings)
        );
    }
});

documents.onDidClose(e => {
    documentSettings.delete(e.document.uri);
    sccDocuments.delete(e.document.uri);
    clearTimeout(pendingDiagnostics.get(e.document.uri));
    pendingDiagnostics.delete(e.document.uri);
    connection.sendDiagnostics({ uri: e.document.uri, diagnostics: [] });
});

function getOrCreateSccDocument(uri: string): SccDocument {
    let doc = sccDocuments.get(uri);
    if (!doc) {
        doc = new SccDocument();
        sccDocuments.set(uri, doc);
    }
    return doc;
}

function formatHeaderHover(document: TextDocument, sccDoc: SccDocument, lineText: string): Hover {
    const analysis = sccDoc.analyze(document.getText(), document.version);
    const diagnostics = sccDoc.collectDiagnostics();
    const errorCount = diagnostics.filter(d => d.severity === 'error').length;
    const warningCount = diagnostics.filter(d => d.severity === 'warning').length;
    const infoCount = diagnostics.filter(d => d.severity === 'info').length;

    const lines = [
        '**SCC File**',
        '',
        `- **Frame rate:** ${analysis.detectedFrameRate ?? 'unknown'}`,
        `- **Data lines:** ${analysis.timestampMap.size}`,
        `- **Diagnostics:** ${errorCount} error(s), ${warningCount} warning(s), ${infoCount} info`
    ];

    return {
        contents: {
            kind: MarkupKind.Markdown,
            value: lines.join('\n')
        },
        range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: lineText.trimEnd().length }
        }
    };
}

function formatTimestampHover(tsMatch: RegExpMatchArray, lineNum: number, analysis: ReturnType<SccDocument['analyze']>): Hover {
    const timestampInfo = analysis.timestampMap.get(lineNum);
    const packetCount = timestampInfo?.packetCount ?? 0;
    const durationFrames = Math.max(0, packetCount - 1);

    let durationLine = '**Duration:** no data packets on this line';
    if (packetCount > 0) {
        durationLine = `**Duration:** ${durationFrames} frame${durationFrames === 1 ? '' : 's'}`;
    }
    if (analysis.frameRate && durationFrames > 0) {
        try {
            const [durationText] = addFrames(0, 0, 0, 0, durationFrames, analysis.frameRate);
            durationLine = `**Duration:** ${durationText} (${durationFrames} frame${durationFrames === 1 ? '' : 's'})`;
        } catch {
            // Keep the frame-count-only fallback.
        }
    }

    return {
        contents: {
            kind: MarkupKind.Markdown,
            value: [
                `- **Timestamp:** \`${tsMatch[0]}\``,
                `- **Frame rate:** ${analysis.detectedFrameRate ?? 'unknown'}`,
                `- **Packets on line:** ${packetCount}`,
                durationLine
            ].join('\n')
        },
        range: {
            start: { line: lineNum, character: tsMatch.index ?? 0 },
            end: { line: lineNum, character: (tsMatch.index ?? 0) + tsMatch[0].length }
        }
    };
}

function publishDiagnostics(uri: string): void {
    const document = documents.get(uri);
    if (!document) return;
    
    const sccDoc = getOrCreateSccDocument(uri);
    sccDoc.analyze(document.getText(), document.version);
    const rawDiagnostics = sccDoc.collectDiagnostics();
    
    const diagnostics: Diagnostic[] = rawDiagnostics.map(d => ({
        severity: d.severity === 'error' ? DiagnosticSeverity.Error
            : d.severity === 'warning' ? DiagnosticSeverity.Warning
            : DiagnosticSeverity.Information,
        range: Range.create(
            d.lineNum,
            d.startChar,
            d.lineNum,
            d.endChar
        ),
        message: d.message,
        code: d.code,
        source: 'scc-inspector'
    }));
    
    connection.sendDiagnostics({ uri, diagnostics });
}

documents.onDidOpen(e => {
    publishDiagnostics(e.document.uri);
});

documents.onDidChangeContent(e => {
    const uri = e.document.uri;
    
    clearTimeout(pendingDiagnostics.get(uri));
    pendingDiagnostics.set(uri, setTimeout(() => {
        publishDiagnostics(uri);
        pendingDiagnostics.delete(uri);
    }, 500));
});

connection.onHover(
    (textDocumentPosition: TextDocumentPositionParams): Hover | undefined => {
        const document = documents.get(textDocumentPosition.textDocument.uri);
        if (!document) {
            return undefined;
        }

        const position = textDocumentPosition.position;
        const line = document.getText({
            start: { line: position.line, character: 0 },
            end: { line: position.line, character: Number.MAX_VALUE }
        });

        const sccDoc = getOrCreateSccDocument(document.uri);

        if (position.line === 0 && line.trim() === 'Scenarist_SCC V1.0') {
            return formatHeaderHover(document, sccDoc, line);
        }

        const tsMatch = line.match(TIMESTAMP_PATTERN);
        if (!tsMatch) {
            return undefined;
        }

        const tsStart = tsMatch.index ?? 0;
        const tsEnd = tsStart + tsMatch[0].length;
        if (position.character >= tsStart && position.character < tsEnd) {
            return formatTimestampHover(tsMatch, position.line, sccDoc.analyze(document.getText(), document.version));
        }

        const hexWords = [...iterHexWords(line)];
        let targetWord: HexWord | null = null;
        let logicalIdx = 0;
        let packetIdx = 0;
        let pairRangeWord: HexWord | null = null;
        let pairRangeLogicalIdx = 0;
        let pairRangePacketIdx = 0;

        for (const word of hexWords) {
            const isSecondOfPair = word.isPaired && word.start > word.pairStart;
            
            if (position.character >= word.start && position.character < word.end) {
                targetWord = word;
                break;
            }

            if (!pairRangeWord && position.character >= word.pairStart && position.character < word.pairEnd) {
                pairRangeWord = word;
                pairRangeLogicalIdx = logicalIdx;
                pairRangePacketIdx = packetIdx;
            }
            
            packetIdx++;

            if (!isSecondOfPair) {
                logicalIdx++;
            }
        }

        if (!targetWord) {
            if (!pairRangeWord) {
                return undefined;
            }
            targetWord = pairRangeWord;
            logicalIdx = pairRangeLogicalIdx;
            packetIdx = pairRangePacketIdx;
        }

        const isDuplicateOfPair = targetWord.isPaired && targetWord.start > targetWord.pairStart;
        const snapshotLogicalIdx = isDuplicateOfPair ? Math.max(0, logicalIdx - 1) : logicalIdx;

        const decoded = parseSccCode(targetWord.text, targetWord.isPaired);
        const code = targetWord.text.toUpperCase();

        let card: TooltipCard;
        switch (decoded.type) {
            case 'TEXT':
                card = {
                    title: 'Text',
                    summary: `"${decoded.text}"`,
                    code
                };
                break;
            case 'PAC': {
                const ul = decoded.underline ? ' Und' : '';
                card = {
                    title: 'Preamble Address Code',
                    summary: `Row ${decoded.row} · Col ${decoded.col} · ${decoded.color}${ul}`,
                    code,
                    label: decoded.label,
                    dup: isDuplicateOfPair
                };
                break;
            }
            case 'MIDROW': {
                const ul2 = decoded.underline ? ' Und' : '';
                card = {
                    title: 'Mid-Row Command',
                    summary: `Mid-Row · ${decoded.color}${ul2}`,
                    code,
                    label: decoded.label,
                    dup: isDuplicateOfPair
                };
                break;
            }
            case 'CONTROL':
                card = {
                    title: decoded.name?.split('(')[0].trim() || 'Control Command',
                    code,
                    label: decoded.label,
                    dup: isDuplicateOfPair
                };
                break;
            case 'INDENT': {
                const n = decoded.spaces;
                card = {
                    title: 'Indent',
                    summary: `${n} ${n === 1 ? 'space' : 'spaces'}`,
                    code,
                    label: decoded.label,
                    dup: isDuplicateOfPair
                };
                break;
            }
            case 'NULL':
                card = {
                    title: 'Null / Padding',
                    code,
                    label: decoded.label,
                    notes: ['Padding or filler code. No effect on the caption buffer.']
                };
                break;
            case 'ERROR':
                card = {
                    title: 'Parity Error',
                    summary: decoded.desc || 'Parity error',
                    code,
                    label: decoded.label
                };
                break;
            default:
                card = {
                    title: 'Unknown Code',
                    code
                };
        }
        const analysis = sccDoc.analyze(document.getText(), document.version);
        const baseTime = tsMatch[0];
        
        let displayTime = baseTime;
        if (analysis.frameRate) {
            try {
                const ts = parseTimestampStr(baseTime);
                [displayTime] = addFrames(ts.hours, ts.minutes, ts.seconds, ts.frames, packetIdx, analysis.frameRate);
            } catch {
                // Keep the raw line timestamp when frame math fails.
            }
        }
        const timestampDesc = formatTimestampLine(displayTime, packetIdx, !!analysis.frameRate);

        const snapshot = sccDoc.getBufferSnapshot(position.line, snapshotLogicalIdx);
        if (decoded.type === 'TEXT' && snapshot.channelLabel !== undefined) {
            card.label = snapshot.channelLabel;
        }
        
        const isControl = decoded.type === 'CONTROL' || decoded.type === 'NULL';
        const overflow = sccDoc.checkOverflow(position.line);
        const overflowInfo: [boolean, number] | undefined = overflow.isOverflow ? [true, overflow.overflowCount] : undefined;

        const tooltipText = formatTooltip(
            card,
            timestampDesc,
            snapshot.bufferText,
            snapshot.highlightStart,
            snapshot.highlightEnd,
            isControl,
            overflowInfo
        );

        return {
            contents: {
                kind: MarkupKind.Markdown,
                value: tooltipText
            },
            range: {
                start: { line: position.line, character: targetWord.start },
                end: { line: position.line, character: targetWord.end }
            }
        };
    }
);

connection.onCodeLens((params): CodeLens[] => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return [];
    const sccDoc = getOrCreateSccDocument(params.textDocument.uri);
    const analysis = sccDoc.analyze(document.getText(), document.version);
    return buildCodeLenses(analysis).map(l => ({
        range: Range.create(l.line, 0, l.line, 0),
        command: { title: l.title, command: l.command }
    }));
});

documents.listen(connection);
connection.listen();
