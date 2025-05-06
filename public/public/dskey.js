const firebaseConfig = {
    apiKey: "AIzaSyBhj6nv3QcIHyuznWPNM4t_0NjL0ghMwFw",
    authDomain: "dsignertv.firebaseapp.com",
    databaseURL: "https://dsignertv-default-rtdb.firebaseio.com",
    projectId: "dsignertv",
    storageBucket: "dsignertv.firebasestorage.app",
    messagingSenderId: "930311416952",
    appId: "1:930311416952:web:d0e7289f0688c46492d18d"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const storage = firebase.storage();

// DOM Elements
const elements = {
    generatorMode: document.getElementById('generator-mode'),
    playerMode: document.getElementById('player-mode'),
    activationKey: document.getElementById('activation-key'),
    viewBtn: document.getElementById('view-btn'),
    exitBtn: document.getElementById('exit-btn'),
    mediaDisplay: document.getElementById('media-display')
};

// State Variables
let currentKey = loadKey();
let unsubscribe = null;
let currentMedia = null;
let dbStore = null;

// Initialize IndexedDB
async function initIndexedDB() {
    dbStore = await idb.openDB('dsigner-offline', 1, {
        upgrade(db) {
            db.createObjectStore('mediaFiles', { keyPath: 'url' });
        }
    });
}

// Initial Setup
elements.activationKey.textContent = currentKey;
updateGenStatus('Pronto para uso', 'online');
initIndexedDB().catch(err => console.error('Erro ao inicializar IndexedDB:', err));

// Event Listeners
elements.viewBtn.addEventListener('click', enterPlayerMode);
document.addEventListener('keydown', handleKeyboardShortcuts);
elements.exitBtn.addEventListener('click', exitPlayerMode);

// Utility Functions
function loadKey() {
    let key = localStorage.getItem('deviceKey');
    if (!key) {
        key = generateKey();
        localStorage.setItem('deviceKey', key);
    }
    return key;
}

function generateKey() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let key = '';
    for (let i = 0; i < 8; i++) {
        key += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return key;
}

async function enterPlayerMode() {
    elements.generatorMode.style.display = 'none';
    elements.playerMode.style.display = 'block';
    await initPlayerMode(currentKey);
    enterFullscreen();
}

function exitPlayerMode() {
    exitFullscreen();
    elements.playerMode.style.display = 'none';
    elements.generatorMode.style.display = 'flex';
    stopListening();
}

function enterFullscreen() {
    const element = document.documentElement;
    if (element.requestFullscreen) element.requestFullscreen();
    else if (element.mozRequestFullScreen) element.mozRequestFullScreen();
    else if (element.webkitRequestFullscreen) element.webkitRequestFullscreen();
    else if (element.msRequestFullscreen) element.msRequestFullscreen();
    document.body.classList.add('fullscreen-mode');
}

function exitFullscreen() {
    if (document.fullscreenElement || document.mozFullScreenElement || 
        document.webkitFullscreenElement || document.msFullscreenElement) {
        if (document.exitFullscreen) document.exitFullscreen();
        else if (document.mozCancelFullScreen) document.mozCancelFullScreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        else if (document.msExitFullscreen) document.msExitFullscreen();
    }
    document.body.classList.remove('fullscreen-mode');
}

function updateGenStatus(message, status) {
    const el = document.getElementById('gen-status');
    el.textContent = message;
    el.className = `connection-status ${status}`;
}

function stopListening() {
    if (unsubscribe) {
        db.ref('midia/' + currentKey).off('value', unsubscribe);
        unsubscribe = null;
    }
    clearMedia();
}

function clearMedia() {
    elements.mediaDisplay.innerHTML = '';
    currentMedia = null;
}

// Offline Storage Functions
async function saveMediaOffline(media) {
    localStorage.setItem(`media_${currentKey}`, JSON.stringify(media));
    if (media.tipo === 'image' || media.tipo === 'video') {
        await cacheFile(media.url);
    } else if (media.tipo === 'playlist' && media.items) {
        for (const item of media.items) {
            if (item.type === 'image' || item.type === 'video') {
                await cacheFile(item.url);
            }
        }
    }
}

async function cacheFile(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Falha ao baixar arquivo');
        const blob = await response.blob();
        await dbStore.put('mediaFiles', { url, blob });
        console.log('Arquivo salvo no IndexedDB:', url);
    } catch (err) {
        console.error('Erro ao salvar arquivo:', url, err);
    }
}

async function loadMediaOffline() {
    const mediaJson = localStorage.getItem(`media_${currentKey}`);
    if (!mediaJson) return null;
    const media = JSON.parse(mediaJson);
    if (media.tipo === 'image' || media.tipo === 'video') {
        media.url = await getCachedFileUrl(media.url);
    } else if (media.tipo === 'playlist' && media.items) {
        for (const item of media.items) {
            if (item.type === 'image' || item.type === 'video') {
                item.url = await getCachedFileUrl(item.url);
            }
        }
    }
    return media;
}

async function getCachedFileUrl(url) {
    const file = await dbStore.get('mediaFiles', url);
    if (file && file.blob) {
        return URL.createObjectURL(file.blob);
    }
    return url;
}

// Player Mode Functions
async function initPlayerMode(key) {
    updatePlayerStatus('Conectando...', 'offline');
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    if (!navigator.onLine) {
        const offlineMedia = await loadMediaOffline();
        if (offlineMedia) {
            handleMediaUpdateOffline(offlineMedia);
            updatePlayerStatus('⚡ Offline - Usando dados locais', 'offline');
        } else {
            showError('Nenhum conteúdo offline disponível');
        }
        return;
    }

    startPublicListening(key);
}

function handleOnline() {
    updatePlayerStatus('✔ Online', 'online');
    if (!unsubscribe) startPublicListening(currentKey);
}

function handleOffline() {
    updatePlayerStatus('⚡ Offline', 'offline');
    stopListening();
    loadMediaOffline().then(offlineMedia => {
        if (offlineMedia) {
            handleMediaUpdateOffline(offlineMedia);
        } else {
            showError('Nenhum conteúdo offline disponível');
        }
    });
}

function startPublicListening(key) {
    console.log('Ouvindo:', 'midia/' + key);
    updatePlayerStatus('Conectando...', 'offline');
    stopListening();

    unsubscribe = db.ref('midia/' + key).on('value', 
        async (snapshot) => {
            if (snapshot.exists()) {
                const media = snapshot.val();
                await saveMediaOffline(media);
                handleMediaUpdate(snapshot);
            } else {
                showError('Nenhum conteúdo encontrado para esta chave');
            }
        },
        (error) => {
            console.error('Erro ao acessar mídia:', error);
            updatePlayerStatus('Erro de conexão: ' + error.message, 'offline');
            loadMediaOffline().then(offlineMedia => {
                if (offlineMedia) {
                    handleMediaUpdateOffline(offlineMedia);
                } else {
                    showError('Erro de conexão e nenhum conteúdo offline disponível');
                }
            });
        }
    );
}

function handleMediaUpdate(snapshot) {
    const media = snapshot.val();
    if (JSON.stringify(currentMedia) === JSON.stringify(media)) return;
    currentMedia = media;
    console.log('Mídia recebida:', media);

    updatePlayerStatus('✔ Online - Conteúdo recebido', 'online');
    elements.mediaDisplay.innerHTML = '';

    if (media.tipo === 'text') {
        const textDiv = document.createElement('div');
        textDiv.className = 'text-message';
        textDiv.textContent = media.content;
        textDiv.style.background = media.bgColor || '#2a2f5b';
        textDiv.style.color = media.color || 'white';
        textDiv.style.fontSize = `${media.fontSize || 24}px`;
        elements.mediaDisplay.appendChild(textDiv);
    } else if (media.tipo === 'image') {
        const img = document.createElement('img');
        img.src = media.url;
        img.onerror = () => showError('Erro ao carregar a imagem');
        elements.mediaDisplay.appendChild(img);
    } else if (media.tipo === 'video') {
        const video = document.createElement('video');
        video.src = media.url;
        video.autoplay = true;
        video.muted = true;
        video.playsinline = true;
        video.controls = false;
        video.loop = media.loop || false;
        video.onerror = () => showError('Erro ao carregar o vídeo');
        video.onloadeddata = () => video.play().catch(e => showError('Falha ao reproduzir o vídeo'));
        elements.mediaDisplay.appendChild(video);
    } else if (media.tipo === 'playlist' && media.items && media.items.length > 0) {
        playPlaylist(media.items);
    } else if (media.tipo === 'activation' || media.tipo === 'status') {
        showError('Nenhum conteúdo para exibir (ativação ou status)');
    } else {
        showError('Tipo de mídia desconhecido');
    }
}

function handleMediaUpdateOffline(media) {
    if (JSON.stringify(currentMedia) === JSON.stringify(media)) return;
    currentMedia = media;
    console.log('Mídia offline carregada:', media);

    elements.mediaDisplay.innerHTML = '';

    if (media.tipo === 'text') {
        const textDiv = document.createElement('div');
        textDiv.className = 'text-message';
        textDiv.textContent = media.content;
        textDiv.style.background = media.bgColor || '#2a2f5b';
        textDiv.style.color = media.color || 'white';
        textDiv.style.fontSize = `${media.fontSize || 24}px`;
        elements.mediaDisplay.appendChild(textDiv);
    } else if (media.tipo === 'image') {
        const img = document.createElement('img');
        img.src = media.url;
        img.onerror = () => showError('Erro ao carregar a imagem offline');
        elements.mediaDisplay.appendChild(img);
    } else if (media.tipo === 'video') {
        const video = document.createElement('video');
        video.src = media.url;
        video.autoplay = true;
        video.muted = true;
        video.playsinline = true;
        video.controls = false;
        video.loop = media.loop || false;
        video.onerror = () => showError('Erro ao carregar o vídeo offline');
        video.onloadeddata = () => video.play().catch(e => showError('Falha ao reproduzir o vídeo offline'));
        elements.mediaDisplay.appendChild(video);
    } else if (media.tipo === 'playlist' && media.items && media.items.length > 0) {
        playPlaylist(media.items);
    } else {
        showError('Tipo de mídia offline desconhecido');
    }
}

function playPlaylist(items) {
    let currentIndex = 0;
    const sortedItems = items.slice().sort((a, b) => (a.order || 0) - (b.order || 0));

    function showNextItem() {
        if (currentIndex >= sortedItems.length) currentIndex = 0;
        const item = sortedItems[currentIndex];
        console.log('Exibindo item da playlist:', item);

        elements.mediaDisplay.innerHTML = '';

        if (item.type === 'image') {
            const img = document.createElement('img');
            img.src = item.url;
            img.onerror = () => {
                console.error('Erro ao carregar imagem:', item.url);
                currentIndex++;
                showNextItem();
            };
            elements.mediaDisplay.appendChild(img);
            setTimeout(() => {
                currentIndex++;
                showNextItem();
            }, (item.duration || 10) * 1000);
        } else if (item.type === 'video') {
            const video = document.createElement('video');
            video.src = item.url;
            video.autoplay = true;
            video.muted = true;
            video.playsinline = true;
            video.controls = false;
            video.onerror = () => {
                console.error('Erro ao carregar vídeo:', item.url);
                currentIndex++;
                showNextItem();
            };
            video.onended = () => {
                currentIndex++;
                showNextItem();
            };
            video.onloadeddata = () => video.play().catch(e => {
                console.error('Erro ao reproduzir vídeo:', e);
                currentIndex++;
                showNextItem();
            });
            elements.mediaDisplay.appendChild(video);
        } else {
            console.log('Tipo de item desconhecido:', item.type);
            currentIndex++;
            showNextItem();
        }
    }

    showNextItem();
}

function showError(message) {
    elements.mediaDisplay.innerHTML = `<div class="error-message">${message}</div>`;
}

function handleKeyboardShortcuts(e) {
    if (e.key === 'Escape' || e.key === 'Backspace') {
        exitPlayerMode();
    }
}

function updatePlayerStatus(message, status) {
    console.log(`Status: ${message} (${status})`);
    const statusEl = document.getElementById('player-status');
    if (statusEl) {
        statusEl.textContent = message;
        statusEl.className = `connection-status ${status}`;
    }
}