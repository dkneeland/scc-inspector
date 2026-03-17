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
    Range
} from 'vscode-languageserver/node';

import { TextDocument } from 'vscode-languageserver-textdocument';
import { parseSccCode, iterHexWords, TIMESTAMP_PATTERN, HexWord } from './sccDecoder';
import { addFrames, parseTimestampStr } from './sccTimecode';
import { SccDocument } from './sccAnalyzer';
import { formatTooltip } from './sccTooltip';

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
            completionProvider: {
                resolveProvider: true
            }
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
    annotationsEnabled: boolean;
}

const defaultSettings: SCCSettings = {
    hoverEnabled: true,
    decorationsEnabled: true,
    annotationsEnabled: true
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

function publishDiagnostics(uri: string): void {
    const document = documents.get(uri);
    if (!document) return;
    
    const sccDoc = getOrCreateSccDocument(uri);
    sccDoc.analyze(document.getText());
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

        if (!line.match(TIMESTAMP_PATTERN)) {
            return undefined;
        }

        const hexWords = [...iterHexWords(line)];
        let targetWord: HexWord | null = null;
        let logicalIdx = 0;
        let packetIdx = 0;

        for (const word of hexWords) {
            const isSecondOfPair = word.isPaired && word.start > word.pairStart;
            
            // Use pair range for matching (same as Python: pair_start <= col < pair_end)
            if (position.character >= word.pairStart && position.character < word.pairEnd) {
                targetWord = word;
                break;
            }
            
            packetIdx++;

            if (!isSecondOfPair) {
                logicalIdx++;
            }
        }

        if (!targetWord) {
            return undefined;
        }

        const decoded = parseSccCode(targetWord.text, targetWord.isPaired);
        const lbl = decoded.label ? ` (${decoded.label})` : '';
        
        let eventDesc: string;
        switch (decoded.type) {
            case 'TEXT':
                eventDesc = `TEXT: "${decoded.text}" (${targetWord.text.toUpperCase()})${lbl}`;
                break;
            case 'PAC': {
                const ul = decoded.underline ? ' Und' : '';
                eventDesc = `PAC : Row ${decoded.row}, Col ${decoded.col}, ${decoded.color}${ul} (${targetWord.text.toUpperCase()})${lbl}`;
                break;
            }
            case 'MIDROW': {
                const ul2 = decoded.underline ? ' Und' : '';
                eventDesc = `CMD : Mid-Row: ${decoded.color?.slice(0, 3)}${ul2}${lbl}`;
                break;
            }
            case 'CONTROL':
                eventDesc = `CMD : ${decoded.name?.split('(')[0].trim()} (${targetWord.text.toUpperCase()})${lbl}`;
                break;
            case 'INDENT': {
                const n = decoded.spaces;
                eventDesc = `CMD : Indent ${n} ${n === 1 ? 'space' : 'spaces'} (${targetWord.text.toUpperCase()})${lbl}`;
                break;
            }
            case 'NULL':
                eventDesc = `NULL: Null / Padding (${targetWord.text.toUpperCase()})${lbl}`;
                break;
            case 'ERROR':
                eventDesc = `ERROR: ${decoded.desc} (${targetWord.text.toUpperCase()})${lbl}`;
                break;
            default:
                eventDesc = `UNKNOWN: ${targetWord.text.toUpperCase()}`;
        }

        const sccDoc = getOrCreateSccDocument(document.uri);
        const analysis = sccDoc.analyze(document.getText());
        
        const tsMatch = line.match(TIMESTAMP_PATTERN);
        const baseTime = tsMatch ? tsMatch[0] : '';
        
        let timestampDesc: string;
        if (analysis.frameRate && tsMatch) {
            try {
                const ts = parseTimestampStr(baseTime);
                const [pktTime] = addFrames(ts.hours, ts.minutes, ts.seconds, ts.frames, packetIdx, analysis.frameRate);
                const pktWord = packetIdx === 1 ? 'packet' : 'packets';
                timestampDesc = `TIME: ${pktTime} (+${packetIdx} ${pktWord})`;
            } catch {
                timestampDesc = `TIME: ${baseTime} (+${packetIdx})`;
            }
        } else {
            timestampDesc = `TIME: ${baseTime} (+${packetIdx})`;
        }

        const snapshot = sccDoc.getBufferSnapshot(position.line, logicalIdx);
        
        const isControl = decoded.type === 'CONTROL' || decoded.type === 'NULL';
        const overflow = sccDoc.checkOverflow(position.line);
        const overflowInfo: [boolean, number] | undefined = overflow.isOverflow ? [true, overflow.overflowCount] : undefined;

        const tooltipText = formatTooltip(
            eventDesc,
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
                value: '```\n' + tooltipText + '\n```'
            },
            range: {
                start: { line: position.line, character: targetWord.start },
                end: { line: position.line, character: targetWord.end }
            }
        };
    }
);

documents.listen(connection);
connection.listen();