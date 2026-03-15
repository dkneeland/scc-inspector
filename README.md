# SCC Language Server

A Language Server Protocol (LSP) implementation for SCC (Scenarist Closed Caption) files.

## Features

- Hover tooltips showing decoded EIA-608 commands
- Error diagnostics for parity and timing issues
- Support for 23.98, 25, 29.97 DF, and 29.97 NDF frame rates

## Installation

### VS Code

Install the SCC Inspector extension from the VS Code Marketplace.

### Other Editors

```bash
npm install -g scc-language-server
```

Then configure your editor's LSP client to use `scc-language-server --stdio`.

## Development

```bash
npm install
npm run compile
npm test
```

## Structure

```
├── client/     # VS Code extension
├── server/     # LSP server
│   ├── src/    # Core modules
│   └── data/   # EIA-608 constants
└── samples/    # Sample SCC files
```

## License

MIT