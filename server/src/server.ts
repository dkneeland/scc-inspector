import {
    createConnection,
    TextDocuments,
    ProposedFeatures,
    InitializeParams,
    DidChangeConfigurationNotification,
    CompletionItem,
    CompletionItemKind,
    TextDocumentPositionParams,
    TextDocumentSyncKind,
    InitializeResult,
    Hover,
    MarkupKind
} from 'vscode-languageserver/node';

import { TextDocument } from 'vscode-languageserver-textdocument';
import { parseSccCode, iterHexWords, TIMESTAMP_PATTERN, isEoc, isEdm, isEnm } from './sccDecoder';
import { SccDocument } from './sccAnalyzer';

const connection = createConnection(ProposedFeatures.all);
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

const sccDocuments: Map<string, SccDocument> = new Map();

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;

connection.onInitialize((params: InitializeParams) => {
    const capabilities = params.capabilities;

    hasConfigurationCapability = !!(
        capabilities.workspace && !!capabilities.workspace.configuration
    );
    hasWorkspaceFolderCapability = !!(
        capabilities.workspace && !!capabilities.workspace.workspaceFolders
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

function getDocumentSettings(resource: string): Thenable<SCCSettings> {
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
});

function getOrCreateSccDocument(uri: string): SccDocument {
    let doc = sccDocuments.get(uri);
    if (!doc) {
        doc = new SccDocument();
        sccDocuments.set(uri, doc);
    }
    return doc;
}

documents.onDidOpen(e => {
    const sccDoc = getOrCreateSccDocument(e.document.uri);
    sccDoc.analyze(e.document.getText());
});

documents.onDidChangeContent(e => {
    const sccDoc = getOrCreateSccDocument(e.document.uri);
    sccDoc.analyze(e.document.getText());
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
        let targetWord = null;
        let logicalIdx = 0;
        let currentLogicalIdx = 0;
        const seenPaired = new Set<string>();

        for (const word of hexWords) {
            if (word.isPaired && seenPaired.has(word.text)) {
                continue;
            }
            if (word.isPaired) {
                seenPaired.add(word.text);
            }

            if (position.character >= word.start && position.character <= word.end) {
                targetWord = word;
                logicalIdx = currentLogicalIdx;
                break;
            }
            currentLogicalIdx++;
        }

        if (!targetWord) {
            return undefined;
        }

        const decoded = parseSccCode(targetWord.text, targetWord.isPaired);
        let hoverContent = `**${targetWord.text.toUpperCase()}**\n\n`;

        if (decoded.type === 'TEXT') {
            hoverContent += `Text: \`${decoded.text}\``;
        } else if (decoded.type === 'CONTROL') {
            hoverContent += `Control: \`${decoded.name}\``;
        } else if (decoded.type === 'PAC') {
            hoverContent += `PAC: Row ${decoded.row}, Col ${decoded.col}, ${decoded.color}`;
        } else if (decoded.type === 'MIDROW') {
            hoverContent += `Midrow: ${decoded.color}${decoded.underline ? ', Underline' : ''}`;
        } else if (decoded.type === 'INDENT') {
            hoverContent += `Tab Offset: ${decoded.spaces} spaces`;
        } else if (decoded.type === 'NULL') {
            hoverContent += `Null / Padding`;
        } else if (decoded.type === 'ERROR') {
            hoverContent += `**Error**: ${decoded.desc}`;
        } else {
            hoverContent += `Unknown code`;
        }

        const sccDoc = getOrCreateSccDocument(document.uri);
        sccDoc.analyze(document.getText());

        const snapshot = sccDoc.getBufferSnapshot(position.line, logicalIdx);
        if (snapshot.bufferText) {
            hoverContent += '\n\n---\n\n**BUF:**\n```\n' + snapshot.bufferText + '\n```';
            if (snapshot.highlightStart >= 0 && snapshot.highlightEnd > snapshot.highlightStart) {
                const caretLine = ' '.repeat(snapshot.highlightStart) + '^'.repeat(snapshot.highlightEnd - snapshot.highlightStart);
                hoverContent += '\n```\n' + caretLine + '\n```';
            }
        }

        return {
            contents: {
                kind: MarkupKind.Markdown,
                value: hoverContent
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