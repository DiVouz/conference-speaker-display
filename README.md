# Conference Speaker Display

A lightweight conference presentation tool for managing speakers and showing a real-time stage screen.

This project includes:

- A public conference view (logo + speaker banner)
- A speaker-only view (banner only)
- An admin dashboard to control speakers, styling, background, and logo
- Real-time sync via WebSockets

> ***Vibe Coding Notice***:
> Most of this code is generated with AI assistance.
> Use it with caution, review the implementation before production use, and test in a staging environment first.

## Features

- Add, remove, and clear speakers
- Set or clear the active speaker
- Live updates across all connected screens
- Live preview window inside the admin page
- Customize:
  - Background color
  - Speaker box visibility, color, and padding
  - Speaker name/title colors
  - Speaker name/title font family, size, and weight
- Upload a custom logo (stored as data URL)
- Local network URL panel in admin view with quick actions (preview/open/copy)
- Automatic HTTPS support with self-signed certificate generation for local use

## Tech Stack

- Node.js
- Express
- ws (WebSocket)
- Vanilla HTML, CSS, JavaScript

## Project Structure

```text
.
├── index.js               # Server, API, WebSocket, HTTPS bootstrapping
├── package.json
├── data/
│   └── state.json         # Persistent app state
└── public/
    ├── index.html         # Main conference view
    ├── speaker.html       # Speaker-only view
    ├── admin.html         # Admin dashboard
    ├── css/
    ├── images/
    └── js/
```

## Getting Started

### 1. Install Node.js (LTS)

Download and install Node.js from the official website:

- <https://nodejs.org/>

Then verify the installation:

```bash
node -v
npm -v
```

### 2. Install dependencies

```bash
npm install
```

### 3. Start the app

```bash
npm start
```

The app starts the server and opens the admin page automatically in your browser.

## Available Views

- Admin: `/admin`
- Conference view: `/`
- Speaker-only view: `/speaker`

## Real-Time Behavior

Clients connect to `/ws` and receive state updates instantly whenever the admin changes speakers or styling.

## API Endpoints

### State and network

- `GET /api/state` - Get current state
- `GET /api/network-info` - Get local URLs (HTTP/HTTPS index and speaker pages)

### Speaker management

- `POST /api/speakers` - Add speaker
- `DELETE /api/speakers/:id` - Remove speaker
- `POST /api/speakers/clear` - Remove all speakers
- `POST /api/active` - Set active speaker (`{ id }`) or clear (`{ id: null }`)

### Styling and branding

- `POST /api/background` - Update background color
- `POST /api/logo` - Update/remove logo
- `POST /api/speaker-style` - Update speaker banner style

## Environment Variables

- `PORT` - Base/default port (default: `3000`)
- `HTTP_PORT` - HTTP port (default: same as `PORT`)
- `HTTPS_PORT` - HTTPS port (default: `3443`)
- `DISABLE_HTTPS=true` - Disable HTTPS and run HTTP only
- `HTTPS_KEY_PATH` - Path to TLS private key file
- `HTTPS_CERT_PATH` - Path to TLS certificate file

If HTTPS is enabled and certificate files are not found, the app generates a self-signed certificate at runtime for local development.

## Data Persistence

Application state is stored in `data/state.json`, including:

- Speaker list
- Active speaker
- Background color
- Logo data URL
- Speaker banner style settings

## Local Use and Security Notice

- This project is intended for local network/live event use.
- It has no authentication or authorization.
- It has no built-in protection for client-server communication.
- Do not expose this app directly to the public internet in its current form.
