# SCC Inspector

A VS Code extension for analyzing and debugging SCC (Scenarist Closed Caption / EIA-608) files, built as a Language Server Protocol client/server pair.

Decodes hex caption codes on hover, surfaces parity/timing/buffer problems as diagnostics, shows decoded captions with in/out timecode as code lenses, and populates the Outline with caption text. See the [extension README](client/README.md) for the full feature tour, settings, and limitations.

Successor to the [scc_inspector](https://github.com/dkneeland/scc_inspector) Notepad++ plugin.

## Structure

```
├── client/     # VS Code extension (language registration, decorations, LSP client)
│   └── dist/   # esbuild bundles (extension + server), built by npm run compile
├── server/     # Language server — all SCC intelligence
│   ├── src/    # Analyzer, decoder, timecode, tooltip, navigation modules
│   ├── data/   # EIA-608 constants (single source of truth, JSON)
│   └── test/   # Mocha test suite
└── samples/    # Sample SCC files
```

## Development

```bash
npm install
npm run compile          # tsc + esbuild bundles into client/dist/
npm run test --workspace=server
npm run lint
npm run package          # builds client/scc-inspector-vscode-<version>.vsix
```

Press `F5` in VS Code to launch the Extension Development Host, then open a file from `samples/`.

## License

MIT
