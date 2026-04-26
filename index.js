const express = require('express');
const os = require('os');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { randomUUID } = require('crypto');
const { WebSocketServer, WebSocket } = require('ws');
const selfsigned = require('selfsigned');
const open = require('open').default;

const PORT = Number(process.env.PORT) || 3000;
const HTTP_PORT = Number(process.env.HTTP_PORT) || PORT;
const HTTPS_PORT = Number(process.env.HTTPS_PORT) || 3443;
const HTTPS_KEY_PATH = process.env.HTTPS_KEY_PATH || path.join(__dirname, 'certs', 'localhost-key.pem');
const HTTPS_CERT_PATH = process.env.HTTPS_CERT_PATH || path.join(__dirname, 'certs', 'localhost.pem');
const DISABLE_HTTPS = String(process.env.DISABLE_HTTPS || '').toLowerCase() === 'true';
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_FILE = path.join(__dirname, 'data', 'state.json');
const app = express();

const wsServers = [];

function attachWebSocketServer(server) {
    const wsServer = new WebSocketServer({ server, path: '/ws' });

    wsServer.on('connection', (socket) => {
        const state = readState();
        socket.send(JSON.stringify({ type: 'state', state }));
    });

    wsServers.push(wsServer);
}

function getHttpsCredentials() {
    if (DISABLE_HTTPS) {
        return null;
    }

    if (!fs.existsSync(HTTPS_KEY_PATH) || !fs.existsSync(HTTPS_CERT_PATH)) {
        const addresses = getLocalIPv4Addresses();
        const altNames = [{ type: 2, value: 'localhost' }, { type: 7, ip: '127.0.0.1' }];

        addresses.forEach((address) => {
            altNames.push({ type: 7, ip: address });
        });

        const certBundle = selfsigned.generate([{ name: 'commonName', value: 'conference.local' }], {
            days: 365,
            keySize: 2048,
            algorithm: 'sha256',
            extensions: [{ name: 'subjectAltName', altNames }],
        });

        return {
            key: certBundle.private,
            cert: certBundle.cert,
            source: 'generated',
        };
    }

    return {
        key: fs.readFileSync(HTTPS_KEY_PATH, 'utf8'),
        cert: fs.readFileSync(HTTPS_CERT_PATH, 'utf8'),
        source: 'files',
    };
}

function getDefaultState() {
    return {
        speakers: [],
        activeSpeakerId: null,
        logoDataUrl: null,
        backgroundColor: '#04151f',
        speakerBoxVisible: true,
        speakerBoxColor: '#081d2a',
        speakerBoxPaddingX: 24,
        speakerBoxPaddingY: 24,
        speakerBoxPadding: 24,
        speakerTextColor: '#f6fbff',
        speakerFontFamily: '"Trebuchet MS", "Segoe UI", Tahoma, sans-serif',
        speakerNameSize: 64,
        speakerTitleSize: 28,
        speakerFontWeight: 400,
        speakerNameColor: '#f6fbff',
        speakerTitleColor: '#d8e3ec',
        speakerNameFontFamily: '"Trebuchet MS", "Segoe UI", Tahoma, sans-serif',
        speakerTitleFontFamily: '"Trebuchet MS", "Segoe UI", Tahoma, sans-serif',
        speakerNameFontWeight: 400,
        speakerTitleFontWeight: 400,
    };
}

function normalizeBackgroundColor(value) {
    if (typeof value !== 'string') {
        return null;
    }

    const trimmed = value.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
        return trimmed.toLowerCase();
    }

    return null;
}

function normalizeHexColor(value) {
    if (typeof value !== 'string') {
        return null;
    }

    const trimmed = value.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
        return trimmed.toLowerCase();
    }

    return null;
}

function normalizeFontFamily(value) {
    if (typeof value !== 'string') {
        return null;
    }

    const trimmed = value.trim();
    const allowed = new Set([
        '"Trebuchet MS", "Segoe UI", Tahoma, sans-serif',
        'Trebuchet MS, Segoe UI, Tahoma, sans-serif',
        'Arial, Helvetica, sans-serif',
        'Georgia, serif',
        '"Times New Roman", Times, serif',
        'Times New Roman, Times, serif',
    ]);

    return allowed.has(trimmed) ? trimmed : null;
}

function normalizeNumber(value, minimum, maximum) {
    const number = typeof value === 'number' ? value : Number(value);

    if (!Number.isFinite(number)) {
        return null;
    }

    const rounded = Math.round(number);
    if (rounded < minimum || rounded > maximum) {
        return null;
    }

    return rounded;
}

function normalizeLogoDataUrl(value) {
    if (value === null || value === '') {
        return null;
    }

    if (typeof value !== 'string') {
        return null;
    }

    const trimmed = value.trim();
    const isDataImage = /^data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=\s]+$/.test(trimmed);

    if (!isDataImage) {
        return null;
    }

    if (trimmed.length > 6_000_000) {
        return null;
    }

    return trimmed;
}

function getLocalIPv4Addresses() {
    const interfaces = os.networkInterfaces();
    const addresses = [];
    const seen = new Set();

    Object.values(interfaces).forEach((networkEntries) => {
        if (!Array.isArray(networkEntries)) {
            return;
        }

        networkEntries.forEach((networkEntry) => {
            if (
                !networkEntry ||
                networkEntry.family !== 'IPv4' ||
                networkEntry.internal ||
                typeof networkEntry.address !== 'string'
            ) {
                return;
            }

            if (seen.has(networkEntry.address)) {
                return;
            }

            seen.add(networkEntry.address);
            addresses.push(networkEntry.address);
        });
    });

    if (!addresses.length) {
        addresses.push('127.0.0.1');
    }

    return addresses;
}

function isPrivateIPv4(address) {
    return (
        /^10\./.test(address) ||
        /^192\.168\./.test(address) ||
        /^172\.(1[6-9]|2\d|3[0-1])\./.test(address)
    );
}

function getPrimaryLocalIPv4Address() {
    const addresses = getLocalIPv4Addresses();
    const privateAddress = addresses.find((address) => isPrivateIPv4(address));

    return privateAddress || addresses[0] || '127.0.0.1';
}

function buildNetworkUrls() {
    const address = getPrimaryLocalIPv4Address();
    const hasHttps = !!getHttpsCredentials();

    return {
        address,
        indexUrl: `http://${address}:${HTTP_PORT}/`,
        speakerUrl: `http://${address}:${HTTP_PORT}/speaker`,
        httpsIndexUrl: hasHttps ? `https://${address}:${HTTPS_PORT}/` : null,
        httpsSpeakerUrl: hasHttps ? `https://${address}:${HTTPS_PORT}/speaker` : null,
    };
}

function ensureDataFile() {
    const dataDir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }

    if (!fs.existsSync(DATA_FILE)) {
        fs.writeFileSync(DATA_FILE, JSON.stringify(getDefaultState(), null, 2));
    }
}

function readState() {
    ensureDataFile();

    try {
        const raw = fs.readFileSync(DATA_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        const defaultState = getDefaultState();
        const speakers = Array.isArray(parsed.speakers)
            ? parsed.speakers.map((speaker) => ({
                  id: typeof speaker.id === 'string' ? speaker.id : randomUUID(),
                  name: typeof speaker.name === 'string' ? speaker.name : '',
                  title: typeof speaker.title === 'string' ? speaker.title : '',
              }))
            : [];
        const activeSpeakerId =
            typeof parsed.activeSpeakerId === 'string' ? parsed.activeSpeakerId : null;
        const hasActiveSpeaker = speakers.some((speaker) => speaker.id === activeSpeakerId);
        const logoDataUrl = normalizeLogoDataUrl(parsed.logoDataUrl);
        const backgroundColor =
            normalizeBackgroundColor(parsed.backgroundColor) || defaultState.backgroundColor;
        const speakerBoxVisible =
            typeof parsed.speakerBoxVisible === 'boolean'
                ? parsed.speakerBoxVisible
                : defaultState.speakerBoxVisible;
        const speakerBoxColor =
            normalizeHexColor(parsed.speakerBoxColor) || defaultState.speakerBoxColor;
        const legacySpeakerBoxPadding = normalizeNumber(parsed.speakerBoxPadding, 0, 500);
        const speakerBoxPaddingX =
            normalizeNumber(parsed.speakerBoxPaddingX, 0, 500) ??
            legacySpeakerBoxPadding ??
            defaultState.speakerBoxPaddingX;
        const speakerBoxPaddingY =
            normalizeNumber(parsed.speakerBoxPaddingY, 0, 500) ??
            legacySpeakerBoxPadding ??
            defaultState.speakerBoxPaddingY;
        const speakerTextColor =
            normalizeHexColor(parsed.speakerTextColor) || defaultState.speakerTextColor;
        const speakerFontFamily =
            normalizeFontFamily(parsed.speakerFontFamily) || defaultState.speakerFontFamily;
        const speakerNameSize =
            normalizeNumber(parsed.speakerNameSize, 12, 240) ?? defaultState.speakerNameSize;
        const speakerTitleSize =
            normalizeNumber(parsed.speakerTitleSize, 12, 240) ?? defaultState.speakerTitleSize;
        const speakerFontWeight =
            normalizeNumber(parsed.speakerFontWeight, 100, 900) ?? defaultState.speakerFontWeight;
        const speakerNameColor =
            normalizeHexColor(parsed.speakerNameColor) || speakerTextColor || defaultState.speakerNameColor;
        const speakerTitleColor =
            normalizeHexColor(parsed.speakerTitleColor) || speakerTextColor || defaultState.speakerTitleColor;
        const speakerNameFontFamily =
            normalizeFontFamily(parsed.speakerNameFontFamily) || speakerFontFamily || defaultState.speakerNameFontFamily;
        const speakerTitleFontFamily =
            normalizeFontFamily(parsed.speakerTitleFontFamily) || speakerFontFamily || defaultState.speakerTitleFontFamily;
        const speakerNameFontWeight =
            normalizeNumber(parsed.speakerNameFontWeight ?? parsed.speakerFontWeight, 100, 900) ??
            speakerFontWeight;
        const speakerTitleFontWeight =
            normalizeNumber(parsed.speakerTitleFontWeight ?? parsed.speakerFontWeight, 100, 900) ??
            speakerFontWeight;

        return {
            speakers,
            activeSpeakerId: hasActiveSpeaker ? activeSpeakerId : null,
            logoDataUrl,
            backgroundColor,
            speakerBoxVisible,
            speakerBoxColor,
            speakerBoxPaddingX,
            speakerBoxPaddingY,
            speakerBoxPadding: speakerBoxPaddingY,
            speakerTextColor,
            speakerFontFamily,
            speakerNameSize,
            speakerTitleSize,
            speakerFontWeight,
            speakerNameColor,
            speakerTitleColor,
            speakerNameFontFamily,
            speakerTitleFontFamily,
            speakerNameFontWeight,
            speakerTitleFontWeight,
        };
    } catch (error) {
        return getDefaultState();
    }
}

function writeState(state) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2));
}

function broadcastState(state) {
    if (!wsServers.length) {
        return;
    }

    const payload = JSON.stringify({ type: 'state', state });

    wsServers.forEach((wsServer) => {
        wsServer.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(payload);
            }
        });
    });
}

app.use(express.json({ limit: '8mb' }));
app.use(express.static(PUBLIC_DIR));

// STATIC ENDPOINTS

app.get('/', (_req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));
app.get('/admin', (_req, res) => res.sendFile(path.join(PUBLIC_DIR, 'admin.html')));
app.get('/speaker', (_req, res) => res.sendFile(path.join(PUBLIC_DIR, 'speaker.html')));

// API ENDPOINTS

app.get('/api/state', (_req, res) => res.status(200).json(readState()));

app.get('/api/network-info', (_req, res) => {
    res.status(200).json({
        port: PORT,
        url: buildNetworkUrls(),
    });
});

app.post('/api/speakers', (req, res) => {
    const body = req.body || {};
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const activeImmediately = body.activeImmediately === true;

    if (!name) {
        res.status(400).json({ error: 'Speaker name is required.' });
        return;
    }

    const speaker = {
        id: randomUUID(),
        name,
        title: typeof body.title === 'string' ? body.title.trim() : '',
    };

    const state = readState();
    state.speakers.push(speaker);

    if (activeImmediately) {
        state.activeSpeakerId = speaker.id;
    }

    writeState(state);
    broadcastState(state);
    res.status(201).json(state);
});

app.post('/api/active', (req, res) => {
    const body = req.body || {};

    if (body.id === null || body.id === '') {
        const state = readState();
        state.activeSpeakerId = null;
        writeState(state);
        broadcastState(state);
        res.status(200).json(state);
        return;
    }

    const id = typeof body.id === 'string' ? body.id : '';
    const state = readState();
    const exists = state.speakers.some((speaker) => speaker.id === id);

    if (!exists) {
        res.status(400).json({ error: 'Speaker not found.' });
        return;
    }

    state.activeSpeakerId = id;
    writeState(state);
    broadcastState(state);
    res.status(200).json(state);
});

app.post('/api/background', (req, res) => {
    const body = req.body || {};
    const backgroundColor = normalizeBackgroundColor(body.backgroundColor);

    if (!backgroundColor) {
        res.status(400).json({ error: 'A valid hex color is required.' });
        return;
    }

    const state = readState();
    state.backgroundColor = backgroundColor;
    writeState(state);
    broadcastState(state);
    res.status(200).json(state);
});

app.post('/api/logo', (req, res) => {
    const body = req.body || {};
    const logoDataUrl = normalizeLogoDataUrl(body.logoDataUrl);

    if (body.logoDataUrl !== null && body.logoDataUrl !== '' && !logoDataUrl) {
        res.status(400).json({ error: 'A valid image data URL is required.' });
        return;
    }

    const state = readState();
    state.logoDataUrl = logoDataUrl;
    writeState(state);
    broadcastState(state);
    res.status(200).json(state);
});

app.post('/api/speaker-style', (req, res) => {
    const body = req.body || {};
    const speakerBoxVisible =
        typeof body.speakerBoxVisible === 'boolean' ? body.speakerBoxVisible : null;
    const speakerBoxColor = normalizeHexColor(body.speakerBoxColor);
    const speakerBoxPaddingX = normalizeNumber(body.speakerBoxPaddingX, 0, 500);
    const speakerBoxPaddingY = normalizeNumber(body.speakerBoxPaddingY, 0, 500);
    const legacySpeakerBoxPadding = normalizeNumber(body.speakerBoxPadding, 0, 500);
    const speakerNameColor = normalizeHexColor(body.speakerNameColor);
    const speakerTitleColor = normalizeHexColor(body.speakerTitleColor);
    const speakerNameFontFamily = normalizeFontFamily(body.speakerNameFontFamily);
    const speakerTitleFontFamily = normalizeFontFamily(body.speakerTitleFontFamily);
    const speakerNameSize = body.speakerNameSize;
    const speakerTitleSize = body.speakerTitleSize;
    const speakerNameFontWeight = body.speakerNameFontWeight;
    const speakerTitleFontWeight = body.speakerTitleFontWeight;

    if (
        speakerBoxVisible === null ||
        !speakerBoxColor ||
        speakerBoxPaddingX === null ||
        speakerBoxPaddingY === null ||
        !speakerNameColor ||
        !speakerTitleColor ||
        !speakerNameFontFamily ||
        !speakerTitleFontFamily
    ) {
        res.status(400).json({ error: 'Valid speaker style values are required.' });
        return;
    }

    const state = readState();
    state.speakerBoxVisible = speakerBoxVisible;
    state.speakerBoxColor = speakerBoxColor;
    state.speakerBoxPaddingX = speakerBoxPaddingX;
    state.speakerBoxPaddingY = speakerBoxPaddingY;
    state.speakerBoxPadding = speakerBoxPaddingY;
    state.speakerNameColor = speakerNameColor;
    state.speakerTitleColor = speakerTitleColor;
    state.speakerNameFontFamily = speakerNameFontFamily;
    state.speakerTitleFontFamily = speakerTitleFontFamily;
    state.speakerNameSize = normalizeNumber(speakerNameSize, 12, 240) ?? state.speakerNameSize;
    state.speakerTitleSize = normalizeNumber(speakerTitleSize, 12, 240) ?? state.speakerTitleSize;
    state.speakerNameFontWeight =
        normalizeNumber(speakerNameFontWeight, 100, 900) ?? state.speakerNameFontWeight;
    state.speakerTitleFontWeight =
        normalizeNumber(speakerTitleFontWeight, 100, 900) ?? state.speakerTitleFontWeight;
    state.speakerTextColor = speakerNameColor;
    state.speakerFontFamily = speakerNameFontFamily;
    state.speakerFontWeight = state.speakerNameFontWeight;

    if (legacySpeakerBoxPadding !== null) {
        state.speakerBoxPaddingX = legacySpeakerBoxPadding;
        state.speakerBoxPaddingY = legacySpeakerBoxPadding;
        state.speakerBoxPadding = legacySpeakerBoxPadding;
    }

    writeState(state);
    broadcastState(state);
    res.status(200).json(state);
});

app.post('/api/speakers/clear', (_req, res) => {
    const state = readState();
    state.speakers = [];
    state.activeSpeakerId = null;
    writeState(state);
    broadcastState(state);
    res.status(200).json(state);
});

app.delete('/api/speakers/:id', (req, res) => {
    const id = req.params.id;
    const state = readState();
    const nextSpeakers = state.speakers.filter((speaker) => speaker.id !== id);

    if (nextSpeakers.length === state.speakers.length) {
        res.status(404).json({ error: 'Speaker not found.' });
        return;
    }

    state.speakers = nextSpeakers;

    if (!state.speakers.some((speaker) => speaker.id === state.activeSpeakerId)) {
        state.activeSpeakerId = null;
    }

    writeState(state);
    broadcastState(state);
    res.status(200).json(state);
});

app.use((_req, res) => {
    res.status(404).json({ error: 'Not found.' });
});

const httpsCredentials = getHttpsCredentials();

if (httpsCredentials) {
    const httpServer = http.createServer(app);
    const secureServer = https.createServer(httpsCredentials, app);

    httpServer.listen(HTTP_PORT, () => {
        console.log(`Conference site running at http://0.0.0.0:${HTTP_PORT}`);
    });

    secureServer.listen(HTTPS_PORT, () => {
        if (httpsCredentials.source === 'generated') {
            console.warn('Using a generated self-signed HTTPS certificate for local development.');
        }

        console.log(`Conference site running at https://0.0.0.0:${HTTPS_PORT}`);
        open(`https://${getPrimaryLocalIPv4Address()}:${HTTPS_PORT}/admin`);
    });

    attachWebSocketServer(httpServer);
    attachWebSocketServer(secureServer);
} else {
    console.warn('HTTPS was disabled with DISABLE_HTTPS=true. Running HTTP only.');

    const server = app.listen(HTTP_PORT, () => {
        console.log(`Conference site running at http://0.0.0.0:${HTTP_PORT}`);
        open(`http://${getPrimaryLocalIPv4Address()}:${HTTP_PORT}/admin`);
    });

    attachWebSocketServer(server);
}
