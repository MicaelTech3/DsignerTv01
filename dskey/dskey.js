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

// Initial Setup
elements.activationKey.textContent = currentKey;
updateGenStatus('Pronto para uso', 'online');

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

function enterPlayerMode() {
    elements.generatorMode.style.display = 'none';
    elements.playerMode.style.display = 'block';
    initPlayerMode(currentKey);
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

// Player Mode Functions
function initPlayerMode(key) {
    updatePlayerStatus('Conectando...', 'offline');
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    startPublicListening(key);
}

function handleOnline() {
    updatePlayerStatus('✔ Online', 'online');
    if (!unsubscribe) startPublicListening(currentKey);
}

function handleOffline() {
    updatePlayerStatus('⚡ Offline', 'offline');
}

function startPublicListening(key) {
    console.log('Ouvindo:', 'midia/' + key);
    updatePlayerStatus('Conectando...', 'offline');
    stopListening();

    unsubscribe = db.ref('midia/' + key).on('value', 
        (snapshot) => {
            if (snapshot.exists()) {
                handleMediaUpdate(snapshot);
            } else {
                showError('Nenhum conteúdo encontrado para esta chave');
            }
        },
        (error) => {
            console.error('Erro ao acessar mídia:', error);
            updatePlayerStatus('Erro de conexão: ' + error.message, 'offline');
        }
    );
}

function handleMediaUpdate(snapshot) {
    const media = snapshot.val();
    if (JSON.stringify(currentMedia) === JSON.stringify(media)) return; // Evita recarregar a mesma mídia
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

function playPlaylist(items) {
    let currentIndex = 0;
    const sortedItems = items.slice().sort((a, b) => (a.order || 0) - (b.order || 0));

    function showNextItem() {
        if (currentIndex >= sortedItems.length) currentIndex = 0; // Volta ao início
        const item = sortedItems[currentIndex];
        console.log('Exibindo item da playlist:', item);

        elements.mediaDisplay.innerHTML = ''; // Limpa o container

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
            }, (item.duration || 10) * 1000); // Duração padrão de 10s
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

    showNextItem(); // Inicia a playlist
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

// CSS
const style = document.createElement('style');
style.textContent = `
    .error-message {
        color: #ff5555;
        font-size: 24px;
        text-align: center;
        padding: 20px;
    }
    .text-message {
        padding: 20px;
        border-radius: 10px;
        max-width: 80%;
        margin: 0 auto;
        text-align: center;
        word-break: break-word;
    }
    #media-display {
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    video, img {
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
    }
`;
document.head.appendChild(style);