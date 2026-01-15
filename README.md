# PKM Note Recommender

An Obsidian plugin that recommends related notes based on AI semantic similarity and tag/graph connections.

## Features

- **AI Semantic Recommendations**: Meaning-based similarity analysis using OpenAI, Google Gemini, or Anthropic (Voyage AI) embeddings
- **Tag-Based Recommendations**: Find notes with similar tags
- **Graph Connections**: Leverage knowledge graph structure
- **Sidebar View**: Quick access to related notes
- **Status Bar Display**: See recommendation count at a glance
- **Auto-Embedding**: Automatically update embeddings when notes are modified

## Supported AI Providers

| Provider | Model | Notes |
|----------|-------|-------|
| **OpenAI** (default) | text-embedding-3-small | Most stable, 1536 dimensions |
| **Google Gemini** | text-embedding-004 | 768 dimensions, free tier available |
| **Anthropic (Voyage AI)** | voyage-3-lite | High quality, 512 dimensions |

## Installation

### BRAT (Recommended)

1. Install [BRAT](https://github.com/TfTHacker/obsidian42-brat) plugin
2. Open BRAT settings
3. Click "Add Beta plugin"
4. Enter: `eohjun/obsidian-pkm-note-recommender`
5. Enable the plugin

### Manual

1. Download `main.js`, `manifest.json`, `styles.css` from the latest release
2. Create folder: `<vault>/.obsidian/plugins/pkm-note-recommender/`
3. Copy downloaded files to the folder
4. Enable the plugin in Obsidian settings

## Setup (AI Recommendations)

### 1. API Key Configuration

1. Open Settings → PKM Note Recommender
2. In **AI Provider Settings** section:
   - Select AI Provider (OpenAI recommended)
   - Enter API key
   - Click **Test** button to verify key

### 2. Generate Embeddings

1. Open Command Palette (Ctrl/Cmd + P)
2. Run "PKM: Generate embeddings for all notes"
3. Progress is shown in status bar (e.g., `💡 45`)
4. Semantic recommendations are available after completion

## Commands

| Command | Description |
|---------|-------------|
| **Show note recommendations** | Open recommendations panel |
| **Refresh note recommendations** | Refresh recommendations |
| **Generate embeddings for all notes** | Generate embeddings for all notes (required for initial setup) |
| **Generate embedding for current note** | Generate embedding for current note only |
| **Clear all embeddings** | Delete all embeddings (needed when changing providers) |
| **Show embedding statistics** | View embedding statistics |

### Embedding Commands Details

#### Generate embeddings for all notes
- Generates embedding vectors for all notes in the Zettelkasten folder at once
- **Required for initial setup**: Must run after first installing the plugin for semantic recommendations to work
- Skips notes that already have embeddings, only generates for changed notes (detected by content hash)
- API costs apply, may take time if you have many notes

#### Generate embedding for current note
- Generates embedding for only the currently open note
- Use when you want immediate recommendations after writing a new note
- Not needed if Auto-embed option is enabled

#### Clear all embeddings
- Deletes all stored embedding data
- **When to use**:
  - When changing AI provider (e.g., OpenAI → Gemini)
  - Different embedding models have different vector dimensions, making existing data incompatible
- After clearing, run "Generate embeddings for all notes" again

#### Show embedding statistics
- Displays current embedding information:
  - Provider: Current AI provider
  - Model: Embedding model name
  - Total embeddings: Number of embedded notes
  - Storage size: Storage space usage

## Usage Workflow

```
1. Configure API key → Verify with Test
2. Run "Generate embeddings for all notes" (once for initial setup)
3. Auto-embed handles new/modified notes if enabled
4. Check semantic similarity-based recommendations in the panel
```

## Settings

### Recommendation Settings

| Setting | Description | Default |
|---------|-------------|---------|
| Zettelkasten Folder | Note location | `04_Zettelkasten` |
| Max Recommendations | Maximum number of recommendations | 5 |
| Min Score | Minimum score threshold | 30% |
| Use Graph Connections | Include connected notes | true |
| Use Tag Similarity | Use tag similarity | true |
| Use Semantic Similarity | Use AI semantic similarity | true |

### AI Provider Settings

| Setting | Description | Default |
|---------|-------------|---------|
| AI Provider | AI provider to use | OpenAI |
| API Key | API key for selected provider | - |
| Auto-embed notes | Auto-embed on note modification | true |
| Semantic Threshold | Semantic similarity threshold | 50% |

### Display Settings

| Setting | Description | Default |
|---------|-------------|---------|
| Auto-show recommendations | Auto-show recommendations when opening notes | false |
| Show in sidebar | Show recommendations in sidebar | true |
| Debug mode | Enable debug logging | false |

## Development

```bash
# Install dependencies
npm install

# Development with watch mode
npm run dev

# Production build
npm run build

# Type check
npm run typecheck
```

## Architecture

Follows Clean Architecture principles:

```
src/
├── core/
│   ├── domain/           # Entities, Interfaces, Value Objects
│   ├── application/      # Use Cases, Services
│   └── adapters/         # LLM Adapters, Storage, Obsidian Adapters
├── views/                # UI Components
└── main.ts               # Plugin Entry Point
```

## License

MIT
