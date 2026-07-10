# Emnex Anime API

<div align="center">

![Version](https://img.shields.io/badge/version-3.0.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![Bun](https://img.shields.io/badge/bun-%23000000.svg?style=flat&logo=bun&logoColor=white)
![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?style=flat&logo=typescript&logoColor=white)

**A fast RESTful anime data & streaming API — built and maintained by emnex Tech.**

[Features](#features) • [Installation](#installation) • [API Reference](#api-reference) • [Streaming](#streaming-guide) • [Deployment](#deployment)

</div>

---

## Table of Contents

- [Overview](#overview)
- [Disclaimer](#disclaimer)
- [Features](#features)
- [Installation](#installation)
- [Configuration](#configuration)
- [Deployment](#deployment)
- [API Reference](#api-reference)
- [Streaming Guide](#streaming-guide)
- [Development](#development)
- [License](#license)
- [Support](#support)

---

## Overview

**Emnex Anime API** is a RESTful API that aggregates publicly available anime
metadata, episode listings, and video streams into a single, clean JSON
interface. It exposes anime details, catalogues, search, schedules, per-episode
sub/dub streaming sources, and a built-in media proxy for cross-origin playback.

Built with [Bun](https://bun.sh) + [Hono](https://hono.dev) and written in
TypeScript for speed and type safety.

## Disclaimer

> ![Disclaimer](https://img.shields.io/badge/Disclaimer-red?style=for-the-badge&logo=alert&logoColor=white)

1. This API is intended for **personal and educational use**. Deploy your own
   instance and customise it as needed.
2. Emnex Anime API does not host any of the content it references. All metadata
   and media belong to their respective owners; this project only demonstrates
   how to build an aggregation API over publicly reachable sources.
3. You are responsible for how you deploy and use this software.

---

## Features

- 🏠 Home feed — spotlight, trending, popular, and recent
- 🔎 Keyword search & autocomplete suggestions
- 📄 Full anime details (genres, synopsis, ratings, seasons, posters)
- 📺 Complete episode listings with **sub & dub** support
- ▶️ **Streaming** — resolves episodes to direct HLS (`.m3u8`) sources + subtitles
- 🔀 Built-in **media proxy** — plays cross-origin without CORS/Referer headaches
- 🗂️ Category listings, genres, filters, schedules
- ⚡ Bun + Hono, fully typed, retry-aware upstream client

---

## Installation

### Prerequisites

Make sure you have [Bun](https://bun.sh/docs/installation) installed.

### Local Setup

```bash
# 1. Clone
git clone https://github.com/emnextech/emnex-anime-api.git
cd emnex-anime-api

# 2. Install dependencies
bun install

# 3. Start the dev server (hot reload)
bun run dev
```

The server starts at [http://localhost:5000](http://localhost:5000).

---

## Configuration

Runtime configuration lives in [`src/config/config.ts`](src/config/config.ts):

| Key | Description | Default |
| --- | --- | --- |
| `baseurl` | Upstream data source | `https://kaa.lt` |
| `imageBase` | Poster/thumbnail CDN base | `https://kaa.lt/image/poster` |
| `port` | Port the server listens on | `5000` |
| `origin` | Allowed CORS origin(s), comma-separated or `*` | `*` |
| `enableLogging` | Log every request to stdout | `true` |
| `isProduction` | Production mode flag | `true` |

---

## Deployment

### Docker

```bash
docker build -t emnex-anime-api .
docker run -p 5000:5000 emnex-anime-api
```

### Vercel (Serverless)

1. Fork/clone this repository to your GitHub account.
2. Import the project at [vercel.com](https://vercel.com).
3. Deploy. The included [`vercel.json`](vercel.json) routes all traffic to the
   serverless entry point.

---

## API Reference

All endpoints return JSON of the form `{ "success": true, "data": ... }`.

**Base URL:** `/api/v2`

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/home` | Home feed (spotlight, trending, popular, recent) |
| GET | `/top-search` | Top / trending search titles |
| GET | `/search?keyword=&page=` | Search anime by keyword |
| GET | `/suggestion?keyword=` | Autocomplete suggestions |
| GET | `/anime/:id` | Full anime details |
| GET | `/animes/:query/:category?page=` | Category listings (see below) |
| GET | `/filter?keyword=&page=` | Filtered listing |
| GET | `/filter/options` | Available filter options |
| GET | `/genres` | All genres |
| GET | `/schedules?date=YYYY-MM-DD` | 7-day schedule window |
| GET | `/episodes/:id?lang=sub\|dub` | Episode list for an anime |
| GET | `/episode/servers?animeId=&episodeId=` | Streaming servers for an episode |
| GET | `/episode/sources?animeId=&episodeId=&server=` | Resolved HLS sources + subtitles |
| GET | `/proxy?url=&ref=` | Media proxy for m3u8 / segments / subtitles |
| GET | `/random` | A random anime id |
| GET | `/characters/:id` | Character list *(not available from current source)* |
| GET | `/character/:id` | Character details *(not available from current source)* |
| GET | `/news?page=` | Anime news *(not available from current source)* |
| GET | `/ping` | Health check |

### Category listings — `/animes/:query`

Valid `:query` values: `top-airing`, `most-popular`, `most-favorite`,
`completed`, `recently-added`, `recently-updated`, `top-upcoming`, `genre`,
`producer`, `az-list`, `subbed-anime`, `dubbed-anime`, `movie`, `tv`, `ova`,
`ona`, `special`, `events`.

```javascript
const res = await fetch('/api/v2/animes/most-popular?page=1');
const { data } = await res.json();
// data.response -> [ { title, alternativeTitle, id, poster, episodes, type, duration } ]
```

### Anime details — `/anime/:id`

```javascript
const res = await fetch('/api/v2/anime/naruto-f3cf');
const { data } = await res.json();
/* {
     title, alternativeTitle, japanese, id, poster, rating, type,
     episodes: { sub, dub, eps }, synopsis, aired, premiered, status,
     genres, ...
   } */
```

### Episodes — `/episodes/:id`

```javascript
// Subbed episodes (default)
await fetch('/api/v2/episodes/naruto-f3cf');
// Dubbed episodes
await fetch('/api/v2/episodes/naruto-f3cf?lang=dub');
/* data: {
     totalEpisodes,
     episodes: [ { title, episodeNumber, id: "ep-1-12cd96", isFiller, thumbnail } ]
   } */
```

Each episode `id` (e.g. `ep-1-12cd96`) is the token you pass to the streaming
endpoints as `episodeId`.

---

## Streaming Guide

Playing an episode is a three-step flow:

**1. List episodes** (choose `sub` or `dub`):

```javascript
const eps = await (await fetch('/api/v2/episodes/naruto-f3cf?lang=sub')).json();
const episodeId = eps.data.episodes[0].id;   // "ep-1-12cd96"
```

**2. (Optional) List servers:**

```javascript
await fetch(`/api/v2/episode/servers?animeId=naruto-f3cf&episodeId=${episodeId}`);
// data: { language, category: "sub", servers: [ { name, shortName } ], nextEpisodeId }
```

**3. Resolve sources:**

```javascript
const src = await (await fetch(
  `/api/v2/episode/sources?animeId=naruto-f3cf&episodeId=${episodeId}`
)).json();
/* data: {
     category: "sub",
     language: "ja-JP",
     server: "VidStreaming",
     sources:  [ { url, proxyUrl, type: "hls", isM3U8: true } ],
     subtitles: [ { lang, label, url, proxyUrl } ]
   } */
```

**4. Play it.** The upstream stream host requires a `Referer` and sends no CORS
headers, so use the **`proxyUrl`** (routed through this API's `/proxy`) with any
HLS player:

```html
<video id="player" controls></video>
<script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
<script>
  const src = /* data.sources[0].proxyUrl from step 3 */;
  const video = document.getElementById('player');
  if (Hls.isSupported()) {
    const hls = new Hls();
    hls.loadSource(src);       // e.g. /api/v2/proxy?url=...master.m3u8
    hls.attachMedia(video);
  }
</script>
```

> The master playlist exposes both **Japanese** and **English** audio tracks, so
> players can also switch sub/dub audio directly.

---

## Development

```bash
bun run dev          # hot-reload dev server
bun start            # production start
bun run type-check   # tsc --noEmit
bun run lint         # eslint --fix
bun run format       # prettier --write
bun run test         # vitest
```

---

## License

[MIT](LICENSE) © 2026 **emnex Tech**

---

## Support

If you find this project useful, consider giving it a star ⭐

Made with ❤️ by **emnex Tech**.
