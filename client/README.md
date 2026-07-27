# SCC Inspector

Analyze and debug SCC (Scenarist Closed Caption / EIA-608) files in VS Code.

SCC files store captions as timecoded pairs of hex words — compact for broadcast workflows, opaque for humans. SCC Inspector decodes them in place: hover any code to see exactly what it does, read every caption at a glance from code lenses, and catch parity, timing, and buffer problems as you type.

## Features

### Real-time diagnostics

Problems are flagged as you edit and listed in the Problems panel, with red line tints and minimap bands so trouble spots stand out while scrolling.

![Diagnostics](https://raw.githubusercontent.com/dkneeland/scc-inspector/main/client/images/diagnostics.png)

| Code | Severity | Meaning |
| --- | --- | --- |
| `SCC001` | Error | Parity error — a byte fails the EIA-608 odd-parity check |
| `SCC002` | Error | Invalid timestamp — field values out of range |
| `SCC003` | Warning | Buffer overflow — more packets than fit before the next timestamp |
| `SCC004` | Warning | Caption never displayed — has text but no EOC (End of Caption) |
| `SCC005` | Info | Caption never erased — has EOC but no EDM (Erase Displayed Memory) |
| `SCC006` | Warning | Non-monotonic timestamp — goes backwards from the previous line |

### Rich hover tooltips

Hover any hex word to see the decoded command, the exact time that packet hits air (frame-accurate, drop-frame aware), and the caption buffer at that moment with the hovered code highlighted in context. Hover a timestamp for frame rate, packet count, and line duration.

![Hover tooltip](https://raw.githubusercontent.com/dkneeland/scc-inspector/main/client/images/hover.png)

### Decoded-caption code lenses

Every caption line gets a lens showing its decoded text and display timing — `Hello [00:00:01:00 → 00:00:05:00]` — so you can read the file top to bottom without decoding a single byte. Captions that never display or never erase are called out.

![Code lenses](https://raw.githubusercontent.com/dkneeland/scc-inspector/main/client/images/lenses.png)

### Outline navigation

Caption text appears in the Outline view and breadcrumbs. Jump to any caption with `Ctrl+Shift+O`.

### Syntax highlighting

Timestamps, control codes, caption start/end commands, and text bytes are color-coded via a TextMate grammar.

### Frame rate handling

The frame rate (23.98, 25, 29.97 drop-frame, 29.97 non-drop) is auto-detected from the file, and all timing math — including SMPTE drop-frame — follows it. Force a specific rate with the `sccInspector.frameRateOverride` setting when a file lies about itself.

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `sccInspector.hoverEnabled` | `true` | Enable hover tooltips for SCC codes |
| `sccInspector.decorationsEnabled` | `true` | Enable line tint and minimap highlighting of problem lines |
| `sccInspector.frameRateOverride` | `"auto"` | Force a frame rate: `23.98`, `25`, `29.97 DF`, or `29.97 NDF` |

## Limitations

- **Pop-on captions only** — roll-up and paint-on styles are not yet supported.
- **Frame rates** — 23.98, 25, 29.97 NDF, and 29.97 DF; other rates are not implemented.

## Acknowledgments

- [libcaption](https://github.com/szatmary/libcaption) — reference implementation for EIA-608 decoding
- [McPoodle's SCC Tools](http://www.theneitherworld.com/mcpoodle/SCC_TOOLS/DOCS/SCC_TOOLS.HTML) — comprehensive SCC format documentation
- Successor to the [scc_inspector](https://github.com/dkneeland/scc_inspector) Notepad++ plugin

## License

MIT
