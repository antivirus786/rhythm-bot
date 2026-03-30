# 🎧 Rhythm — Discord Music Bot

A high-performance Discord music bot built with **Discord.js** and **Lavalink (Shoukaku)**, designed for smooth, low-latency audio playback across servers. Supports prefix commands, full slash command integration, interactive buttons, audio filters, infinite radio mode, and a built-in TTS announcer.

---

## ✨ Features

- 🎵 **Music Playback** — Play tracks by name or URL from YouTube
- 🔍 **Search & Select** — Search and pick from top 5 results interactively
- 📻 **Infinite Radio Mode** — Auto-queues related tracks using YouTube's mix system
- 🔂 **Loop & Shuffle** — Loop the current track or shuffle the queue
- ⚙️ **Audio Filters** — Nightcore, Lo-Fi, Bass Boost, Turbo, Chill, and Normal modes
- 🎚️ **Persistent Volume** — Volume settings are saved per server in a local JSON file
- ⏩ **Timeline Seeking** — Seek to any point in a track using `MM:SS` or seconds
- 🔀 **Queue Management** — View, clear, shuffle, and reorder the queue
- ⏮️ **Previous Track** — Jump back to the last played song
- 🖱️ **Button Controls** — Interactive playback buttons (Previous, Pause, Stop, Loop, Skip)
- 🗣️ **TTS Announcer** — Speak text in a voice channel using Google TTS with Urdu/Hindi phonetic support
- 📊 **System Diagnostics** — Check bot latency, Discord API ping, Lavalink node health, and voice feed
- 🌐 **Dual Command System** — Every command works as both a prefix command (`?`) and a slash command (`/`)
- 💬 **Welcome Embed** — Sends a full command dashboard when the bot joins a new server

---

## 🛠️ Tech Stack

| Library | Purpose |
|---|---|
| `discord.js` v14 | Discord API interaction |
| `shoukaku` | Lavalink v4 client wrapper |
| `lavalink` | Audio streaming node (self-hosted) |
| `pretty-ms` | Human-readable duration formatting |
| `Node.js` | Runtime |

---

## 📋 Prerequisites

Before running this bot, make sure you have the following:

- **Node.js** v18 or higher
- **A running Lavalink v4 node** (local or remote)
- **A Discord Bot Token** from the [Discord Developer Portal](https://discord.com/developers/applications)
- **Bot Permissions:** `Send Messages`, `Embed Links`, `Connect`, `Speak`, `View Channel`

---

## ⚙️ Installation

**1. Clone the repository**
```bash
git clone https://github.com/antivirus786/rhythm-bot.git
cd rhythm-bot
```

**2. Install dependencies**
```bash
npm install discord.js shoukaku pretty-ms
```

**3. Configure the bot**

Open `index.js` and update the config section at the top:

```js
const TOKEN = "YOUR_BOT_TOKEN_HERE";
const PREFIX = "?";                          // Change your prefix here
const BOT_STATUS = "🎻 playing your soul's rhythm";

const nodes = [
  {
    name: "Localhost",
    url: "YOUR_LAVALINK_HOST:PORT",          // e.g. 127.0.0.1:2333
    auth: "YOUR_LAVALINK_PASSWORD",
    secure: false
  }
];
```

**4. Set up Lavalink**

Download and run a [Lavalink v4](https://github.com/lavalink-devs/Lavalink) server. A minimal `application.yml` config:

```yaml
server:
  port: 2333
  address: 0.0.0.0
lavalink:
  server:
    password: "youshallnotpass"
    sources:
      youtube: true
```

**5. Start the bot**
```bash
node index.js
```

---

## 🎮 Commands

All commands are available as both **prefix** (`?command`) and **slash** (`/command`).

### 🚀 Playback

| Command | Description |
|---|---|
| `play [query/URL]` | Play a track by name or link. Supports playlists. |
| `search [query]` | Search YouTube and pick from top 5 results |
| `pause` | Pause the current track |
| `resume` | Resume playback |
| `skip` | Skip to the next track |
| `previous` | Go back to the previous track |
| `stop` | Stop playback and clear the queue |
| `disconnect` | Disconnect from the voice channel |
| `goto [time]` | Seek to a time (e.g. `1:30` or `90`) |

### 📊 Queue Management

| Command | Description |
|---|---|
| `queue` | View the current queue (now playing + next 10) |
| `shuffle` | Shuffle all upcoming tracks |
| `clear` | Remove all queued songs (keeps current track) |
| `move [position]` | Move a queued song to play next |
| `loop` | Toggle loop for the current track |
| `keep [query]` | Start infinite radio mode from a seed track |

### ⚙️ Audio Filters

| Command | Description |
|---|---|
| `filter fast` | Nightcore mode (sped up + higher pitch) |
| `filter slow` | Lo-Fi mode (slowed + lower pitch) |
| `filter bass` | Bass boost (low frequency boost) |
| `filter turbo` | Fast + heavy bass combined |
| `filter chill` | Slow + deep bass combined |
| `filter normal` | Reset all filters to default |

### 🔧 Utility

| Command | Description |
|---|---|
| `volume [1-100]` | Set or view the server volume (saved persistently) |
| `ping` | Show bot latency, API ping, node health, voice ping |
| `invite` | Get the bot's invite link |
| `help` | Show the full command dashboard |
| `say [text]` | Speak text in voice channel using TTS |

---

## 🗂️ Project Structure

```
rhythm-bot/
├── index.js        # Main bot file — client setup, prefix commands, core playback logic
├── slash.js        # Slash command registration and handlers
├── guildData.json  # Auto-generated — stores per-server volume settings
└── README.md
```

---

## 🔊 How the Audio Pipeline Works

1. User runs `?play` or `/play`
2. The bot resolves the query via the Lavalink REST API (YouTube search or direct URL)
3. The track is added to an in-memory per-guild queue
4. Shoukaku joins the voice channel and streams audio through the Lavalink node
5. When a track ends, the next song in queue is automatically played
6. In **radio mode** (`keep`), related tracks are auto-fetched using YouTube's mix system and queued to maintain continuous playback

---

## 💾 Persistent Volume

Volume levels are stored per server in `guildData.json` and automatically restored every time the bot joins a voice channel in that server. No database setup required.

---

## 🤝 Contributing

Pull requests are welcome! For major changes, please open an issue first to discuss what you'd like to change.

---

## 📄 License

This project is open source. Feel free to use, modify, and distribute it.
