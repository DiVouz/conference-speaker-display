const speakerForm = document.getElementById('speakerForm');
const makeActiveNowInput = document.getElementById('makeActiveNow');
const backgroundColorInput = document.getElementById('backgroundColorInput');
const logoUploadInput = document.getElementById('logoUploadInput');
const resetLogoBtn = document.getElementById('resetLogoBtn');
const logoUploadStatus = document.getElementById('logoUploadStatus');
const speakerStyleForm = document.getElementById('speakerStyleForm');
const speakerBoxVisibleInput = document.getElementById('speakerBoxVisibleInput');
const speakerBoxColorInput = document.getElementById('speakerBoxColorInput');
const speakerBoxPaddingXInput = document.getElementById('speakerBoxPaddingXInput');
const speakerBoxPaddingYInput = document.getElementById('speakerBoxPaddingYInput');
const speakerNameColorInput = document.getElementById('speakerNameColorInput');
const speakerTitleColorInput = document.getElementById('speakerTitleColorInput');
const speakerNameFontSelect = document.getElementById('speakerNameFontSelect');
const speakerTitleFontSelect = document.getElementById('speakerTitleFontSelect');
const speakerNameSizeInput = document.getElementById('speakerNameSizeInput');
const speakerTitleSizeInput = document.getElementById('speakerTitleSizeInput');
const speakerNameFontWeightSelect = document.getElementById('speakerNameFontWeightSelect');
const speakerTitleFontWeightSelect = document.getElementById('speakerTitleFontWeightSelect');
const clearAllBtn = document.getElementById('clearAllBtn');
const previewWindow = document.getElementById('previewWindow');
const previewFrame = document.getElementById('previewFrame');
const networkUrlsList = document.getElementById('networkUrlsList');
const speakerList = document.getElementById('speakerList');
const clearActiveBtn = document.getElementById('clearActiveBtn');
const activeSpotlight = document.getElementById('activeSpotlight');

let state = {
    speakers: [],
    activeSpeakerId: null,
    backgroundColor: '#04151f',
};
let socket = null;
let reconnectTimer = null;
let backgroundSaveTimer = null;
let speakerStyleSaveTimer = null;
let networkInfoTimer = null;
let lastNetworkInfo = null;

const styleRangeInputs = [
    speakerBoxPaddingXInput,
    speakerBoxPaddingYInput,
    speakerNameSizeInput,
    speakerTitleSizeInput,
].filter(Boolean);

function getRangeValueLabel(input) {
    return `${input.value}px`;
}

function syncRangeValueDisplays() {
    styleRangeInputs.forEach((input) => {
        const display = speakerStyleForm?.querySelector(
            `[data-range-value-for="${input.id}"]`
        );

        if (display) {
            display.textContent = getRangeValueLabel(input);
        }
    });
}

function ensureRangeValueDisplays() {
    styleRangeInputs.forEach((input) => {
        let display = speakerStyleForm?.querySelector(
            `[data-range-value-for="${input.id}"]`
        );

        if (!display) {
            display = document.createElement('div');
            display.className = 'range-value';
            display.dataset.rangeValueFor = input.id;
            input.insertAdjacentElement('afterend', display);
        }
    });

    syncRangeValueDisplays();
}

function normalizeUrl(value) {
    if (!value) {
        return '';
    }

    try {
        return new URL(value, window.location.href).href;
    } catch (_error) {
        return String(value);
    }
}

function getCurrentPreviewUrl() {
    return previewFrame?.src ? normalizeUrl(previewFrame.src) : '';
}

function isCurrentPreviewUrl(url) {
    return normalizeUrl(url) === getCurrentPreviewUrl();
}

function renderNetworkUrls(networkInfo) {
    if (!networkUrlsList) {
        return;
    }

    lastNetworkInfo = networkInfo || lastNetworkInfo;

    const url = networkInfo?.url;

    if (!url || !url.address) {
        networkUrlsList.innerHTML = '<p class="helper">No local network URLs found.</p>';
        return;
    }

    const buildUrlRow = (label, link) => {
        const safeLink = escapeHtml(link || '');
        const safeLabel = escapeHtml(label);

        if (!link) {
            return `
                <div class="network-url-row">
                    <div class="network-url-main">
                        <span class="network-url-label">${safeLabel}</span>
                        <code class="network-url-value">Unavailable</code>
                    </div>
                    <div class="network-url-actions">
                        <button type="button" class="network-action-button secondary" disabled aria-label="Preview ${safeLabel}" title="Preview ${safeLabel}"><i class="fa-solid fa-display" aria-hidden="true"></i></button>
                        <button type="button" class="network-action-button" disabled aria-label="Open ${safeLabel}" title="Open ${safeLabel}"><i class="fa-solid fa-up-right-from-square" aria-hidden="true"></i></button>
                        <button type="button" class="network-action-button secondary" disabled aria-label="Copy ${safeLabel}" title="Copy ${safeLabel}"><i class="fa-regular fa-copy" aria-hidden="true"></i></button>
                    </div>
                </div>
            `;
        }

        return `
            <div class="network-url-row">
                <div class="network-url-main">
                    <span class="network-url-label">${safeLabel}</span>
                    <code class="network-url-value">${safeLink}</code>
                </div>
                <div class="network-url-actions">
                    <button type="button" class="network-action-button secondary" data-action="preview" data-url="${safeLink}" aria-label="Preview ${safeLabel}" title="Preview ${safeLabel}" ${isCurrentPreviewUrl(link) ? 'disabled aria-pressed="true"' : ''}><i class="fa-solid fa-display" aria-hidden="true"></i></button>
                    <button type="button" class="network-action-button" data-action="open" data-url="${safeLink}" aria-label="Open ${safeLabel}" title="Open ${safeLabel}"><i class="fa-solid fa-up-right-from-square" aria-hidden="true"></i></button>
                    <button type="button" class="network-action-button secondary" data-action="copy" data-url="${safeLink}" aria-label="Copy ${safeLabel}" title="Copy ${safeLabel}"><i class="fa-regular fa-copy" aria-hidden="true"></i></button>
                </div>
            </div>
        `;
    };

    networkUrlsList.innerHTML = `
        <div class="network-url-card">
            <div class="network-url-header">
                <strong>${escapeHtml(url.address)}</strong>
                <span class="network-url-badge">Local network</span>
            </div>
            ${buildUrlRow('Index (HTTP)', url.indexUrl)}
            ${buildUrlRow('Index (HTTPS)', url.httpsIndexUrl)}
            ${buildUrlRow('Speaker (HTTP)', url.speakerUrl)}
            ${buildUrlRow('Speaker (HTTPS)', url.httpsSpeakerUrl)}
        </div>
    `;
}

async function copyTextToClipboard(text) {
    if (!text) {
        return false;
    }

    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
    }

    const fallbackInput = document.createElement('textarea');
    fallbackInput.value = text;
    fallbackInput.setAttribute('readonly', 'true');
    fallbackInput.style.position = 'fixed';
    fallbackInput.style.opacity = '0';
    document.body.appendChild(fallbackInput);
    fallbackInput.select();

    try {
        document.execCommand('copy');
        return true;
    } finally {
        document.body.removeChild(fallbackInput);
    }
}

function escapeHtml(value = '') {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function renderList() {
    const activeSpeaker = state.speakers.find((speaker) => speaker.id === state.activeSpeakerId);

    if (backgroundColorInput) {
        backgroundColorInput.value = state.backgroundColor || '#04151f';
    }

    if (logoUploadStatus) {
        logoUploadStatus.textContent = state.logoDataUrl
            ? 'Custom logo uploaded.'
            : 'Default logo in use.';
    }

    if (speakerBoxColorInput) {
        speakerBoxColorInput.value = state.speakerBoxColor || '#081d2a';
    }

    if (speakerBoxVisibleInput) {
        speakerBoxVisibleInput.checked = state.speakerBoxVisible !== false;
    }

    if (speakerBoxPaddingXInput) {
        speakerBoxPaddingXInput.value = String(state.speakerBoxPaddingX ?? state.speakerBoxPadding ?? 24);
    }

    if (speakerBoxPaddingYInput) {
        speakerBoxPaddingYInput.value = String(state.speakerBoxPaddingY ?? state.speakerBoxPadding ?? 24);
    }

    if (speakerNameColorInput) {
        speakerNameColorInput.value = state.speakerNameColor || state.speakerTextColor || '#f6fbff';
    }

    if (speakerTitleColorInput) {
        speakerTitleColorInput.value = state.speakerTitleColor || state.speakerTextColor || '#d8e3ec';
    }

    if (speakerNameFontSelect) {
        speakerNameFontSelect.value =
            state.speakerNameFontFamily || state.speakerFontFamily || '"Trebuchet MS", "Segoe UI", Tahoma, sans-serif';
    }

    if (speakerTitleFontSelect) {
        speakerTitleFontSelect.value =
            state.speakerTitleFontFamily || state.speakerFontFamily || '"Trebuchet MS", "Segoe UI", Tahoma, sans-serif';
    }

    if (speakerNameSizeInput) {
        speakerNameSizeInput.value = String(state.speakerNameSize || 64);
    }

    if (speakerTitleSizeInput) {
        speakerTitleSizeInput.value = String(state.speakerTitleSize || 28);
    }

    if (speakerNameFontWeightSelect) {
        speakerNameFontWeightSelect.value = String(state.speakerNameFontWeight || state.speakerFontWeight || 400);
    }

    if (speakerTitleFontWeightSelect) {
        speakerTitleFontWeightSelect.value = String(state.speakerTitleFontWeight || state.speakerFontWeight || 400);
    }

    syncRangeValueDisplays();

    if (activeSpeaker) {
        activeSpotlight.textContent = `ACTIVE: ${activeSpeaker.name}${
            activeSpeaker.title ? ` - ${activeSpeaker.title}` : ''
        }`;
    } else {
        activeSpotlight.textContent = 'No active speaker';
    }

    if (!state.speakers.length) {
        speakerList.innerHTML = '<li class="speaker-item">No speakers yet.</li>';
        return;
    }

    speakerList.innerHTML = state.speakers
        .map((speaker) => {
            const activeClass =
                speaker.id === state.activeSpeakerId ? 'speaker-item active' : 'speaker-item';

            return `
                <li class="${activeClass}" data-id="${speaker.id}" role="button" tabindex="0" aria-label="Set ${escapeHtml(
                                speaker.name
                        )} as active speaker">
          <div class="speaker-main">
            <strong>${escapeHtml(speaker.name)}</strong>
            <span class="meta">${escapeHtml(speaker.title || '')}</span>
          </div>
                    <div class="speaker-actions">
                        <button class="remove-speaker" type="button" data-id="${speaker.id}" aria-label="Remove ${escapeHtml(
                                                                speaker.name
                                                )}">Remove</button>
                    </div>
        </li>
      `;
        })
        .join('');
}

networkUrlsList?.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-action][data-url]');

    if (!button) {
        return;
    }

    const url = button.dataset.url || '';
    const action = button.dataset.action || '';

    if (!url) {
        return;
    }

    if (action === 'open') {
        window.open(url, '_blank', 'noopener,noreferrer');
        return;
    }

    if (action === 'preview') {
        if (previewFrame) {
            previewFrame.src = url;
            updatePreviewScale();
        }

        if (lastNetworkInfo) {
            renderNetworkUrls(lastNetworkInfo);
        }

        return;
    }

    if (action === 'copy') {
        const originalHtml = button.innerHTML;
        const originalTitle = button.getAttribute('title') || '';

        try {
            await copyTextToClipboard(url);
            button.innerHTML = '<i class="fa-solid fa-check" aria-hidden="true"></i>';
            button.setAttribute('title', 'Copied');
            button.setAttribute('aria-label', 'Copied');
            window.setTimeout(() => {
                button.innerHTML = originalHtml;
                button.setAttribute('title', originalTitle);
                button.setAttribute('aria-label', originalTitle);
            }, 1200);
        } catch (_error) {
            alert('Could not copy URL.');
        }
    }
});

async function fetchState() {
    const response = await fetch('/api/state', { cache: 'no-store' });
    state = await response.json();
    renderList();
}

async function fetchNetworkInfo() {
    const response = await fetch('/api/network-info', { cache: 'no-store' });
    const networkInfo = await response.json();
    renderNetworkUrls(networkInfo);
}

function applyState(nextState) {
    state = nextState;
    renderList();
}

function queueSave(callback, timerName, delayMs = 140) {
    if (window[timerName]) {
        clearTimeout(window[timerName]);
    }

    window[timerName] = setTimeout(callback, delayMs);
}

async function saveBackgroundColor() {
    const backgroundColor = String(backgroundColorInput?.value || '').trim();
    const response = await fetch('/api/background', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ backgroundColor }),
    });

    if (!response.ok) {
        alert('Could not update background color.');
    }
}

function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Could not read file.'));
        reader.readAsDataURL(file);
    });
}

async function saveLogoDataUrl(logoDataUrl) {
    const response = await fetch('/api/logo', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ logoDataUrl }),
    });

    if (!response.ok) {
        alert('Could not update logo.');
        return false;
    }

    return true;
}

async function saveSpeakerStyle() {
    const payload = {
        speakerBoxVisible: speakerBoxVisibleInput?.checked !== false,
        speakerBoxColor: String(speakerBoxColorInput?.value || '').trim(),
        speakerBoxPaddingX: Number(speakerBoxPaddingXInput?.value || 24),
        speakerBoxPaddingY: Number(speakerBoxPaddingYInput?.value || 24),
        speakerNameColor: String(speakerNameColorInput?.value || '').trim(),
        speakerTitleColor: String(speakerTitleColorInput?.value || '').trim(),
        speakerNameFontFamily: String(speakerNameFontSelect?.value || '').trim(),
        speakerTitleFontFamily: String(speakerTitleFontSelect?.value || '').trim(),
        speakerNameSize: Number(speakerNameSizeInput?.value || 64),
        speakerTitleSize: Number(speakerTitleSizeInput?.value || 28),
        speakerNameFontWeight: Number(speakerNameFontWeightSelect?.value || 400),
        speakerTitleFontWeight: Number(speakerTitleFontWeightSelect?.value || 400),
    };

    const response = await fetch('/api/speaker-style', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        alert('Could not update speaker style.');
    }
}

function updatePreviewScale() {
    if (!previewWindow || !previewFrame) {
        return;
    }

    const rect = previewWindow.getBoundingClientRect();
    const scale = Math.min(rect.width / 1920, rect.height / 1080);
    const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;

    previewFrame.style.setProperty('--preview-scale', String(safeScale));
}

function initPreviewScale() {
    if (!previewWindow || !previewFrame) {
        return;
    }

    updatePreviewScale();
    previewFrame.addEventListener('load', () => {
        updatePreviewScale();
    });

    window.addEventListener('resize', () => {
        updatePreviewScale();
    });

    requestAnimationFrame(() => {
        updatePreviewScale();
    });

    if (window.ResizeObserver) {
        const observer = new ResizeObserver(() => {
            updatePreviewScale();
        });

        observer.observe(previewWindow);
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

            applyState(payload.state);
        } catch (_error) {
            // Ignore malformed websocket payloads.
        }
    });

    socket.addEventListener('close', () => {
        if (reconnectTimer) {
            clearTimeout(reconnectTimer);
        }

        reconnectTimer = setTimeout(() => {
            fetchState();
            connectSocket();
        }, 1000);
    });

    socket.addEventListener('error', () => {
        socket.close();
    });
}

speakerForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const formData = new FormData(speakerForm);
    const payload = {
        name: String(formData.get('name') || ''),
        title: String(formData.get('title') || ''),
        activeImmediately: formData.get('makeActiveNow') === 'on',
    };

    const response = await fetch('/api/speakers', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        alert('Could not add speaker.');
        return;
    }

    speakerForm.reset();
    if (makeActiveNowInput) {
        makeActiveNowInput.checked = false;
    }
    if (!socket || socket.readyState !== WebSocket.OPEN) {
        await fetchState();
    }
});

function triggerLiveBackgroundSave() {
    queueSave(async () => {
        await saveBackgroundColor();
        if (!socket || socket.readyState !== WebSocket.OPEN) {
            await fetchState();
        }
    }, 'backgroundSaveTimer');
}

function refreshNetworkInfoLater() {
    if (networkInfoTimer) {
        clearTimeout(networkInfoTimer);
    }

    networkInfoTimer = setTimeout(() => {
        fetchNetworkInfo().catch(() => {
            if (networkUrlsList) {
                networkUrlsList.innerHTML = '<p class="helper">Could not load local URLs.</p>';
            }
        });
    }, 100);
}

function triggerLiveSpeakerStyleSave() {
    queueSave(async () => {
        await saveSpeakerStyle();
        if (!socket || socket.readyState !== WebSocket.OPEN) {
            await fetchState();
        }
    }, 'speakerStyleSaveTimer');
}

function bindStyleRangeInput(input) {
    if (!input) {
        return;
    }

    input.addEventListener('input', () => {
        syncRangeValueDisplays();
        triggerLiveSpeakerStyleSave();
    });

    input.addEventListener('change', () => {
        syncRangeValueDisplays();
        triggerLiveSpeakerStyleSave();
    });
}

ensureRangeValueDisplays();
refreshNetworkInfoLater();

backgroundColorInput?.addEventListener('input', triggerLiveBackgroundSave);
backgroundColorInput?.addEventListener('change', triggerLiveBackgroundSave);

logoUploadInput?.addEventListener('change', async () => {
    const file = logoUploadInput.files?.[0];

    if (!file) {
        return;
    }

    if (!file.type.startsWith('image/')) {
        alert('Please upload an image file.');
        logoUploadInput.value = '';
        return;
    }

    try {
        const logoDataUrl = await readFileAsDataUrl(file);
        const updated = await saveLogoDataUrl(logoDataUrl);

        if (!updated) {
            return;
        }

        if (logoUploadStatus) {
            logoUploadStatus.textContent = 'Custom logo uploaded.';
        }

        if (!socket || socket.readyState !== WebSocket.OPEN) {
            await fetchState();
        }
    } catch (_error) {
        alert('Could not read logo file.');
    } finally {
        logoUploadInput.value = '';
    }
});

resetLogoBtn?.addEventListener('click', async () => {
    const updated = await saveLogoDataUrl(null);

    if (!updated) {
        return;
    }

    if (logoUploadStatus) {
        logoUploadStatus.textContent = 'Default logo in use.';
    }

    if (!socket || socket.readyState !== WebSocket.OPEN) {
        await fetchState();
    }
});

speakerBoxColorInput?.addEventListener('input', triggerLiveSpeakerStyleSave);
speakerBoxColorInput?.addEventListener('change', triggerLiveSpeakerStyleSave);
speakerBoxVisibleInput?.addEventListener('change', triggerLiveSpeakerStyleSave);
speakerNameColorInput?.addEventListener('input', triggerLiveSpeakerStyleSave);
speakerNameColorInput?.addEventListener('change', triggerLiveSpeakerStyleSave);
speakerTitleColorInput?.addEventListener('input', triggerLiveSpeakerStyleSave);
speakerTitleColorInput?.addEventListener('change', triggerLiveSpeakerStyleSave);
speakerNameFontSelect?.addEventListener('change', triggerLiveSpeakerStyleSave);
speakerTitleFontSelect?.addEventListener('change', triggerLiveSpeakerStyleSave);
speakerNameFontWeightSelect?.addEventListener('change', triggerLiveSpeakerStyleSave);
speakerTitleFontWeightSelect?.addEventListener('change', triggerLiveSpeakerStyleSave);

bindStyleRangeInput(speakerBoxPaddingXInput);
bindStyleRangeInput(speakerBoxPaddingYInput);
bindStyleRangeInput(speakerNameSizeInput);
bindStyleRangeInput(speakerTitleSizeInput);

clearAllBtn?.addEventListener('click', async () => {
    const confirmed = window.confirm('Clear all speakers?');
    if (!confirmed) {
        return;
    }

    const response = await fetch('/api/speakers/clear', {
        method: 'POST',
    });

    if (!response.ok) {
        alert('Could not clear speakers.');
        return;
    }

    if (!socket || socket.readyState !== WebSocket.OPEN) {
        await fetchState();
    }
});

clearActiveBtn.addEventListener('click', async () => {
    const response = await fetch('/api/active', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: null }),
    });

    if (!response.ok) {
        alert('Could not clear active speaker.');
        return;
    }

    if (!socket || socket.readyState !== WebSocket.OPEN) {
        await fetchState();
    }
});

speakerList.addEventListener('click', async (event) => {
    const removeButton = event.target.closest('.remove-speaker[data-id]');

    if (removeButton) {
        event.stopPropagation();

        const id = removeButton.dataset.id;

        if (!id) {
            return;
        }

        const response = await fetch(`/api/speakers/${encodeURIComponent(id)}`, {
            method: 'DELETE',
        });

        if (!response.ok) {
            alert('Could not remove speaker.');
            return;
        }

        if (!socket || socket.readyState !== WebSocket.OPEN) {
            await fetchState();
        }

        return;
    }

    const card = event.target.closest('.speaker-item[data-id]');

    if (!card) {
        return;
    }

    const id = card.dataset.id;

    if (!id) {
        return;
    }

    const response = await fetch('/api/active', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id }),
    });

    if (!response.ok) {
        alert('Could not set active speaker.');
        return;
    }

    if (!socket || socket.readyState !== WebSocket.OPEN) {
        await fetchState();
    }
});

initPreviewScale();
fetchState();
connectSocket();
