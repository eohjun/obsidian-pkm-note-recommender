# PKM Note Recommender

Obsidian plugin that recommends related notes based on tags and graph connections.

## Features

- **Tag-based recommendations**: Find notes with similar tags
- **Graph connections**: Leverage your knowledge graph structure
- **Sidebar view**: Quick access to related notes
- **Status bar indicator**: See recommendation count at a glance

## Installation

### BRAT (Recommended)

1. Install [BRAT](https://github.com/TfTHacker/obsidian42-brat) plugin
2. Open BRAT settings
3. Click "Add Beta plugin"
4. Enter: `eohjun/obsidian-pkm-note-recommender`
5. Enable the plugin

### Manual

1. Download `main.js`, `manifest.json`, and `styles.css` from the latest release
2. Create folder: `<vault>/.obsidian/plugins/pkm-note-recommender/`
3. Copy downloaded files to the folder
4. Enable the plugin in Obsidian settings

## Usage

1. Open a Zettelkasten note (filename starting with 12-digit ID)
2. Click the lightbulb icon in the ribbon, or
3. Use command palette: "PKM: Show note recommendations"

## Settings

| Setting | Description | Default |
|---------|-------------|---------|
| Zettelkasten Folder | Notes location | `03_Zettelkasten/` |
| Max Recommendations | Number of results | 10 |
| Use Graph Connections | Include linked notes | true |
| Auto Show | Show on file open | false |

## Development

```bash
# Install dependencies
npm install

# Development with watch mode
npm run dev

# Production build
npm run build
```

## License

MIT
