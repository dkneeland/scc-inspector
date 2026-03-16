"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_1 = require("vscode-languageserver/node");
const vscode_languageserver_textdocument_1 = require("vscode-languageserver-textdocument");
const sccDecoder_1 = require("./sccDecoder");
const connection = (0, node_1.createConnection)(node_1.ProposedFeatures.all);
const documents = new node_1.TextDocuments(vscode_languageserver_textdocument_1.TextDocument);
let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
connection.onInitialize((params) => {
    const capabilities = params.capabilities;
    hasConfigurationCapability = !!(capabilities.workspace && !!capabilities.workspace.configuration);
    hasWorkspaceFolderCapability = !!(capabilities.workspace && !!capabilities.workspace.workspaceFolders);
    const result = {
        capabilities: {
            textDocumentSync: node_1.TextDocumentSyncKind.Incremental,
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
        connection.client.register(node_1.DidChangeConfigurationNotification.type, undefined);
    }
});
const defaultSettings = {
    hoverEnabled: true,
    decorationsEnabled: true,
    annotationsEnabled: true
};
let globalSettings = defaultSettings;
const documentSettings = new Map();
function getDocumentSettings(resource) {
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
    }
    else {
        globalSettings = ((change.settings.sccInspector || defaultSettings));
    }
});
documents.onDidClose(e => {
    documentSettings.delete(e.document.uri);
});
connection.onHover((textDocumentPosition) => {
    const document = documents.get(textDocumentPosition.textDocument.uri);
    if (!document) {
        return undefined;
    }
    const settings = getDocumentSettings(document.uri);
    const position = textDocumentPosition.position;
    const line = document.getText({
        start: { line: position.line, character: 0 },
        end: { line: position.line, character: Number.MAX_VALUE }
    });
    const hexPattern = /\b[0-9a-fA-F]{4}\b/g;
    let match;
    let hoverContent = '';
    while ((match = hexPattern.exec(line)) !== null) {
        const start = match.index;
        const end = start + 4;
        if (position.character >= start && position.character <= end) {
            const code = match[0].toUpperCase();
            const decoded = (0, sccDecoder_1.parseSccCode)(code);
            if (decoded) {
                hoverContent = `**${code}**\n\n`;
                if (decoded.type === 'TEXT') {
                    hoverContent += `Text: \`${decoded.text}\``;
                }
                else if (decoded.type === 'CONTROL') {
                    hoverContent += `Control: \`${decoded.name}\``;
                }
                else if (decoded.type === 'PAC') {
                    hoverContent += `PAC: Row ${decoded.row}, Col ${decoded.col}, ${decoded.color}`;
                }
                else if (decoded.type === 'MIDROW') {
                    hoverContent += `Midrow: ${decoded.color}${decoded.underline ? ', Underline' : ''}`;
                }
                else if (decoded.type === 'INDENT') {
                    hoverContent += `Tab Offset: ${decoded.spaces} spaces`;
                }
                else if (decoded.type === 'NULL') {
                    hoverContent += `Null / Padding`;
                }
                else if (decoded.type === 'ERROR') {
                    hoverContent += `**Error**: ${decoded.desc}`;
                }
                else {
                    hoverContent += `Unknown code`;
                }
            }
            break;
        }
    }
    if (hoverContent) {
        return {
            contents: {
                kind: node_1.MarkupKind.Markdown,
                value: hoverContent
            }
        };
    }
    return undefined;
});
documents.listen(connection);
connection.listen();
//# sourceMappingURL=server.js.map