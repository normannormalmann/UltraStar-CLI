# UltraStar CLI

![UltraStar CLI Demo](https://raw.githubusercontent.com/martiinii/UltraScrap-cli/main/media/demo.gif)

### What is this?
UltraStar CLI is the fastest and most powerful tool to build, manage, and scale your local UltraStar karaoke song library. Search the biggest UltraStar database, preview results, and download complete, ready-to-sing folders in one go — lyrics, cover, and video included. No manual stitching. No messy files. Just search, queue, and sing.

### ✨ Why it’s awesome:
- **Blazing Fast TUI:** Powered by Ink (React for terminals), offering a modern, responsive, and intuitive command-line interface.
- **Smart Sourcing:** Pulls accurate metadata and lyrics from the largest UltraStar DB and automatically resolves/fetches matching high-quality video formats via YouTube.
- **Robust Bulk Downloading:** Queue thousands of songs at once. Process entire artist discographies or massive playlists in parallel without manual intervention.
- **Crash-Resilient Architecture:** Downloads are managed by a persistent queue. If you close the app or your PC crashes, your queue is saved and will resume exactly where it left off.
- **Automated Repair Mode:** Accidentally deleted videos? Encountered a YouTube bot-block? The built-in repair tool scans your local library and surgically re-downloads only the missing or broken files without touching your intact metadata.
- **Strict Duplicate Prevention:** The system remembers your download history. It prevents double-downloads across sessions, saving your bandwidth and storage.
- **Cross‑platform:** Works seamlessly on Linux, macOS, and Windows.

---

## 🚀 Requirements

- `yt-dlp` (required for downloading video and audio streams securely)
- `ffmpeg` (required by yt-dlp to merge video and audio streams)
- Node.js (via `npm`) or [Bun](https://bun.sh) (Highly Recommended for maximum performance)

### 1. Install yt-dlp
- **macOS:** `brew install yt-dlp` or `pipx install yt-dlp`
- **Windows:** `winget install yt-dlp.yt-dlp` or `choco install yt-dlp`
- **Linux:** Use your package manager (e.g., `apt install yt-dlp`, `pacman -S yt-dlp`)

### 2. Install a runtime
- **Node.js:** We recommend installing via [nvm](https://github.com/nvm-sh/nvm)
- **Bun (Recommended):** `curl -fsSL https://bun.sh/install | bash` (Windows users can install via PowerShell: `powershell -c "irm bun.sh/install.ps1 | iex"`)

---

## ⚡ Quick Start (No Install Required)

You can run the CLI directly without cloning the repository. The first run will automatically check your environment (yt-dlp, ffmpeg) and initialize a secure session.

### Bun (Recommended)
```bash
bunx --bun ultrastar
```

### npm
```bash
npx ultrastar
```

*By default, your songs will be saved under `./songs/Artist - Title/` relative to where you run the command. You can change this path within the app's Setup menu.*

---

## ⌨️ Keyboard Shortcuts & Controls

To prevent accidental inputs while typing in the search bar, all core commands are mapped securely using the `Ctrl` modifier.

### Global & Search Form
| Shortcut | Action |
| :--- | :--- |
| `Tab` | Switch focus between Artist and Title fields |
| `Enter` | Submit search |
| `Ctrl+S` | Open **Setup** (configure download directory and browser cookies) |
| `Ctrl+V` | Open **Repair Mode** (scan library for broken/missing videos) |
| `Esc` | Quit application |

### Search Results & Navigation
| Shortcut | Action |
| :--- | :--- |
| `↑` / `↓` | Select a song from the list |
| `←` / `→` | Navigate between pages |
| `Enter` | **Download immediately** (bypasses the queue) |
| `Ctrl+E` | Edit current search |
| `Ctrl+R` | Refresh results |
| `Esc` | Back to search form |

### 📥 Bulk Downloading & Queue Management
The CLI features a powerful, memory-safe queue system. You can queue up thousands of songs, and the CLI will process them in parallel in the background.

| Shortcut | Action |
| :--- | :--- |
| `Ctrl+Q` | Add the currently selected song to the queue |
| `Ctrl+A` | Add **all songs on the current page** to the queue |
| `Ctrl+P` | Fetch and add **every page of the search result** to the queue (Great for downloading an artist's entire discography) |
| `Ctrl+D` | **Start processing the queue** |

---

## 🛠️ How it works (Under the hood)

1. **Search:** The app securely authenticates with USDB and queries their database.
2. **Resolve:** If a song lacks a direct YouTube ID on USDB, the app utilizes `yt-dlp` to perform a targeted, heuristic search on YouTube to find the best matching karaoke/audio track.
3. **Download:** The video and audio are pulled in high quality via `yt-dlp` and merged via `ffmpeg`.
4. **Assemble:** The app fetches the cover art and lyrics, then formats a perfect, standard-compliant `song.txt` file compatible with UltraStar Deluxe, Vocaluxe, and UltraStar Play.
5. **Track:** Successful and failed downloads are recorded locally (`downloaded.json` and `failed-downloads.xlsx`) to prevent duplicates and make retries easy.

---

## 👨‍💻 Development

This project uses Bun natively. You can still run the built CLI with Node, but development is optimized for Bun.

### Setup Repository
```bash
git clone https://github.com/martiinii/UltraScrap-cli.git
cd UltraScrap-cli
bun install
```

### Start the TUI in Development Mode
```bash
bun run start
```

### Build the CLI (Production Artifacts)
```bash
bun run build
# Artifacts are written to ./build/dist
```

### Linting & Formatting (Biome)
```bash
bun run lint
bun run format
```

---

## 🚨 Troubleshooting & FAQ

- **YouTube Bot Protection Blocks (Sign in to confirm you're not a bot):** YouTube frequently blocks automated downloads. Press `Ctrl+S` to open the setup menu and provide the name of your primary browser (e.g., `edge`, `chrome`). The app will extract your active YouTube session cookies. *Make sure to close the browser before downloading so the cookie database isn't locked.*
- **yt-dlp / ffmpeg not found:** Ensure both tools are installed and added to your system's `PATH` environment variable.
- **Segmentation Faults / OOM Crashes:** Ensure you are using the latest version of the CLI. Older versions had memory leaks during massive bulk downloads, which have been fixed via debounced batch-writing and yielded queue processing.
- **Repairing Broken Songs:** If a download failed halfway, press `Ctrl+V` in the main menu. The app will locate the broken folders and securely patch them up.

## Links
- [USDB (UltraStar Database)](https://usdb.animux.de) - The largest database of UltraStar lyrics.
- [UltraStar España](https://ultrastar-es.org/) - Alternative database including full media packages.