const speakerNameEl = document.getElementById('speakerName');
const speakerTitleEl = document.getElementById('speakerTitle');
const speakerBannerEl = document.querySelector('.speaker-banner');
const sceneEl = document.querySelector('.scene');
const logoEl = document.querySelector('.conference-logo');

let lastSignature = '';
let lastSpeakerToken = '';
let socket = null;
let reconnectTimer = null;
let bannerAnimationTimer = null;

function triggerBannerAnimation(className, durationMs) {
    if (!speakerBannerEl) {
        return;
    }

    if (bannerAnimationTimer) {
        clearTimeout(bannerAnimationTimer);
    }

    speakerBannerEl.classList.remove(className);
    // Force reflow so the same animation can re-run on repeated updates.
    void speakerBannerEl.offsetWidth;
    speakerBannerEl.classList.add(className);

    bannerAnimationTimer = setTimeout(() => {
        speakerBannerEl.classList.remove(className);
    }, durationMs);
}

function applyBackgroundColor(backgroundColor) {
    const value = typeof backgroundColor === 'string' ? backgroundColor : '#04151f';
    document.body.style.backgroundColor = value;

    if (sceneEl) {
        sceneEl.style.backgroundColor = value;
    }
}

function applyLogo(state) {
    if (!logoEl || !state) {
        return;
    }

    logoEl.src = state.logoDataUrl || 'images/logo.svg';
}

function applySpeakerStyle(state) {
    if (!speakerBannerEl || !state) {
        return;
    }

    const root = speakerBannerEl;
    root.classList.toggle('box-hidden', state.speakerBoxVisible === false);
    root.style.setProperty('--speaker-box-color', state.speakerBoxColor || '#081d2a');
    root.style.setProperty(
        '--speaker-box-padding-x',
        `${state.speakerBoxPaddingX ?? state.speakerBoxPadding ?? 24}px`
    );
    root.style.setProperty(
        '--speaker-box-padding-y',
        `${state.speakerBoxPaddingY ?? state.speakerBoxPadding ?? 24}px`
    );
    root.style.setProperty('--speaker-box-padding', `${state.speakerBoxPaddingY ?? state.speakerBoxPadding ?? 24}px`);
    root.style.setProperty('--speaker-text-color', state.speakerTextColor || '#f6fbff');
    root.style.setProperty('--speaker-name-color', state.speakerNameColor || state.speakerTextColor || '#f6fbff');
    root.style.setProperty('--speaker-title-color', state.speakerTitleColor || state.speakerTextColor || '#d8e3ec');
    root.style.setProperty(
        '--speaker-font-family',
        state.speakerFontFamily || '"Trebuchet MS", "Segoe UI", Tahoma, sans-serif'
    );
    root.style.setProperty(
        '--speaker-name-font-family',
        state.speakerNameFontFamily || state.speakerFontFamily || '"Trebuchet MS", "Segoe UI", Tahoma, sans-serif'
    );
    root.style.setProperty(
        '--speaker-title-font-family',
        state.speakerTitleFontFamily || state.speakerFontFamily || '"Trebuchet MS", "Segoe UI", Tahoma, sans-serif'
    );
    root.style.setProperty('--speaker-name-size', `${state.speakerNameSize || 64}px`);
    root.style.setProperty('--speaker-title-size', `${state.speakerTitleSize || 28}px`);
    root.style.setProperty('--speaker-font-weight', String(state.speakerFontWeight || 800));
    root.style.setProperty(
        '--speaker-name-font-weight',
        String(state.speakerNameFontWeight || state.speakerFontWeight || 400)
    );
    root.style.setProperty(
        '--speaker-title-font-weight',
        String(state.speakerTitleFontWeight || state.speakerFontWeight || 400)
    );
}

function applySpeaker(activeSpeaker) {
    if (!activeSpeaker) {
        speakerNameEl.textContent = '';
        speakerTitleEl.textContent = '';
        speakerBannerEl.classList.add('is-hidden');
        speakerBannerEl.classList.remove('is-entering', 'is-updating');
        lastSpeakerToken = '';
        return;
    }

    const nextName = activeSpeaker.name || 'Unnamed speaker';
    const nextTitle = activeSpeaker.title || '';
    const nextToken = `${nextName}::${nextTitle}`;
    const wasHidden = speakerBannerEl.classList.contains('is-hidden');
    const changed = nextToken !== lastSpeakerToken;

    speakerNameEl.textContent = nextName;
    speakerTitleEl.textContent = nextTitle;
    speakerBannerEl.classList.remove('is-hidden');

    if (wasHidden) {
        triggerBannerAnimation('is-entering', 420);
    } else if (changed) {
        triggerBannerAnimation('is-updating', 360);
    }

    lastSpeakerToken = nextToken;
}

async function refresh() {
    try {
        const response = await fetch('/api/state', { cache: 'no-store' });
        const state = await response.json();
        const signature = JSON.stringify(state);

        if (signature === lastSignature) {
            return;
        }

        lastSignature = signature;

        const activeSpeaker = state.speakers.find(
            (speaker) => speaker.id === state.activeSpeakerId
        );

        applyBackgroundColor(state.backgroundColor);
        applyLogo(state);
        applySpeakerStyle(state);
        applySpeaker(activeSpeaker);
    } catch (_error) {
        // Keep the last rendered state if network hiccups occur.
    }
}

function connectSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    socket = new WebSocket(`${protocol}//${window.location.host}/ws`);

    socket.addEventListener('message', (event) => {
        try {
            const payload = JSON.parse(event.data);

            if (payload.type !== 'state' || !payload.state) {
                return;
            }

            const state = payload.state;
            const signature = JSON.stringify(state);

            if (signature === lastSignature) {
                return;
            }

            lastSignature = signature;
            const activeSpeaker = state.speakers.find(
                (speaker) => speaker.id === state.activeSpeakerId
            );
            applyBackgroundColor(state.backgroundColor);
            applyLogo(state);
            applySpeakerStyle(state);
            applySpeaker(activeSpeaker);
        } catch (_error) {
            // Ignore malformed messages and keep the last valid render.
        }
    });

    socket.addEventListener('close', () => {
        if (reconnectTimer) {
            clearTimeout(reconnectTimer);
        }

        reconnectTimer = setTimeout(() => {
            refresh();
            connectSocket();
        }, 1000);
    });

    socket.addEventListener('error', () => {
        socket.close();
    });
}

refresh();
connectSocket();
