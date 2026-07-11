import * as path from 'path';
import {
    workspace, window, languages, ExtensionContext, TextEditor,
    Range, ThemeColor, OverviewRulerLane, TextEditorDecorationType,
    DecorationOptions
} from 'vscode';
import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
    TransportKind
} from 'vscode-languageclient/node';

let client: LanguageClient;
let problemDecoration: TextEditorDecorationType;

function applyProblemDecorations(editor: TextEditor): void {
    if (editor.document.languageId !== 'scc') {
        editor.setDecorations(problemDecoration, []);
        return;
    }
    const config = workspace.getConfiguration('sccInspector');
    if (!config.get<boolean>('decorationsEnabled', true)) {
        editor.setDecorations(problemDecoration, []);
        return;
    }
    const diags = languages.getDiagnostics(editor.document.uri);
    const lineSet = new Set<number>();
    for (const diag of diags) {
        lineSet.add(diag.range.start.line);
    }
    const decorations: DecorationOptions[] = [];
    for (const line of lineSet) {
        decorations.push({ range: new Range(line, 0, line, 0) });
    }
    editor.setDecorations(problemDecoration, decorations);
}

export function activate(context: ExtensionContext) {
    const serverModule = context.asAbsolutePath(path.join('dist', 'server.js'));

    const serverOptions: ServerOptions = {
        run: { module: serverModule, transport: TransportKind.ipc },
        debug: {
            module: serverModule,
            transport: TransportKind.ipc,
            options: { execArgv: ['--nolazy', '--inspect=6009'] }
        }
    };

    const clientOptions: LanguageClientOptions = {
        documentSelector: [{ scheme: 'file', language: 'scc' }],
        synchronize: {
            configurationSection: 'sccInspector',
            fileEvents: workspace.createFileSystemWatcher('**/*.scc')
        }
    };

    client = new LanguageClient(
        'sccLanguageServer',
        'SCC Inspector',
        serverOptions,
        clientOptions
    );

    problemDecoration = window.createTextEditorDecorationType({
        isWholeLine: true,
        backgroundColor: new ThemeColor('editorError.background'),
        overviewRulerColor: new ThemeColor('editorError.foreground'),
        overviewRulerLane: OverviewRulerLane.Full
    });
    context.subscriptions.push(problemDecoration);

    context.subscriptions.push(
        languages.onDidChangeDiagnostics(event => {
            for (const uri of event.uris) {
                const editor = window.visibleTextEditors.find(e => e.document.uri.toString() === uri.toString());
                if (editor) applyProblemDecorations(editor);
            }
        }),
        window.onDidChangeActiveTextEditor(editor => {
            if (editor) applyProblemDecorations(editor);
        }),
        workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration('sccInspector.decorationsEnabled')) {
                const editor = window.activeTextEditor;
                if (editor) applyProblemDecorations(editor);
            }
        })
    );

    client.start();
    if (window.activeTextEditor) {
        applyProblemDecorations(window.activeTextEditor);
    }
}

export function deactivate(): Thenable<void> | undefined {
    if (!client) return undefined;
    return client.stop();
}
