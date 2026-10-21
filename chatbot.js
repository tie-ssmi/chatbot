const chatMessages = document.getElementById('chat-messages');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const micBtn = document.getElementById('mic-btn');
const autoSpeakToggle = document.getElementById('auto-speak');

// ==========================================
// 🌟 1. ระบบจัดการ Session (แยกห้องแชท)
// ==========================================
let currentSessionId = localStorage.getItem('ssmi_current_session');
if (!currentSessionId) {
    currentSessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    localStorage.setItem('ssmi_current_session', currentSessionId);
}

// 🌟 แก้ไข Onload เพื่อกันหน้าจอค้างและเรียก Guide
window.onload = function() {
    if (!localStorage.getItem('ssmi_user_id')) {
        if (!window.location.href.includes('login.html')) window.location.href = 'login.html';
    } else {
        // 🌟 1. ดึงชื่อมาแสดงก่อนเป็นอันดับแรกสุด! (แก้ปัญหาชื่อค้าง "ກຳລັງໂຫຼດ...")
        const userName = localStorage.getItem('ssmi_user_name');
        if (userName) {
            const userBox = document.getElementById('settings-user-name');
            if (userBox) userBox.innerText = userName;
        }

        if (document.getElementById('chat-app')) showChat();
        loadChatThreads(); 
        loadChatHistory(); 
        checkQuotaOnLoad(); 
        
        // 🌟 2. หน่วงเวลาให้เว็บโหลดเสร็จสมบูรณ์ 1.5 วินาที ค่อยเรียก Guide Line
        setTimeout(() => {
            startGuideTour();
        }, 1500);
    }
};

function logout() {
    localStorage.removeItem('ssmi_user_id');
    localStorage.removeItem('ssmi_user_name');
    window.location.href = 'login.html';
}

function showChat() {
    const chatApp = document.getElementById('chat-app');
    const loginScreen = document.getElementById('login-screen');
    if (loginScreen) loginScreen.style.display = 'none';
    if (chatApp) chatApp.style.display = 'flex';
}

// 🌟 ฟังก์ชันเปิด-ปิด แถบ Sidebar
function toggleSidebar() {
    const sidebar = document.getElementById('chat-sidebar');
    if(sidebar) sidebar.classList.toggle('open');
    const backdrop = document.getElementById('sidebar-backdrop');
    if(backdrop) {
        if (backdrop.classList.contains('show')) {
            backdrop.classList.remove('show');
            setTimeout(() => backdrop.style.display = 'none', 300);
        } else {
            backdrop.style.display = 'block';
            setTimeout(() => backdrop.classList.add('show'), 10);
        }
    }
}

// 🌟 สร้างแชทใหม่
function startNewChat() {
    currentSessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    localStorage.setItem('ssmi_current_session', currentSessionId);
    
    chatMessages.innerHTML = '';
    historyOffset = 0;
    
    const welcomeHtml = `ສະບາຍດີ! ຂ້ອຍແມ່ນ SINA ຜູ້ຊ່ວຍ ຕອບຄຳຖາມທຸກຢ່າງ ຂອງ ສິນຊັບເມືອງເໜືອ.<br><br>
                ທ່ານສາມາດພິມຄຳຖາມ, <b>ແນບເອກະສານ (PDF/ຮູບ)</b> ຫຼື <b>ກົດປຸ່ມໄມໂຄຣໂຟນ</b> ເພື່ອເວົ້າຖາມຂ້ອຍໄດ້ເລີຍ!`;
    appendMessage(welcomeHtml, 'bot-message', 'welcome-message', true);
    
    toggleSidebar();
    updateActiveThread();
    loadChatThreads();
}

// 🌟 สลับไปคุยห้องเก่า
function switchThread(sessionId) {
    if (currentSessionId === sessionId) { toggleSidebar(); return; } 
    
    currentSessionId = sessionId;
    localStorage.setItem('ssmi_current_session', currentSessionId);
    
    chatMessages.innerHTML = '';
    historyOffset = 0;
    loadChatHistory();
    
    toggleSidebar();
    updateActiveThread();
}

// 🌟 ดึงรายการห้องแชทมาโชว์ที่ Sidebar
const THREADS_PAGE_SIZE = 10;
let threadOffset = 0;
let threadHasMore = false;
let isLoadingThreads = false;

async function loadChatThreads(loadMore = false) {
    const userId = localStorage.getItem('ssmi_user_id');
    const container = document.getElementById('thread-list-container');
    if (!userId || !container || isLoadingThreads || (loadMore && !threadHasMore)) return;

    isLoadingThreads = true;
    const offset = loadMore ? threadOffset : 0;
    if (!loadMore) {
        threadOffset = 0;
        threadHasMore = false;
        container.innerHTML = '';
    }

    try {
        const res = await fetch(CHATBOT_CONFIG.API_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'getThreads',
                userId: userId,
                offset: offset,
                limit: THREADS_PAGE_SIZE
            }),
            headers: { 'Content-Type': 'text/plain;charset=utf-8' }
        });
        const data = await res.json();
        
        if (data.threads && data.threads.length > 0) {
            data.threads.forEach(th => {
                const div = document.createElement('div');
                div.className = `thread-item ${th.sessionId === currentSessionId ? 'active' : ''}`;
                div.dataset.sessionId = th.sessionId;
                div.onclick = () => switchThread(th.sessionId);
                div.innerText = '💬 ' + th.title;
                container.appendChild(div);
            });
            threadOffset = offset + data.threads.length;
        } else if (!loadMore) {
            container.innerHTML = '<div style="color: #888; font-size: 0.8rem; text-align: center; margin-top: 20px;">ຍັງບໍ່ມີປະຫວັດການສົນທະນາ</div>';
        }
        threadHasMore = Boolean(data.hasMore);
        updateLoadMoreThreadsButton(container);
    } catch(e) { console.log(e); }
    finally {
        isLoadingThreads = false;
    }
}

function updateLoadMoreThreadsButton(container) {
    const existingButton = container.querySelector('.load-more-threads-btn');
    if (existingButton) existingButton.remove();
    if (!threadHasMore) return;

    const button = document.createElement('button');
    button.className = 'load-more-threads-btn';
    button.type = 'button';
    button.innerText = 'ໂຫຼດເພີ່ມເຕີມ';
    button.onclick = () => loadChatThreads(true);
    container.appendChild(button);
}

function updateActiveThread() {
    document.querySelectorAll('#thread-list-container .thread-item').forEach(item => {
        item.classList.toggle('active', item.dataset.sessionId === currentSessionId);
    });
}

// ==========================================
// 2. ລະບົບດຶງປະຫວັດແຊທໃນຫ້ອງນັ້ນໆ
// ==========================================
let historyOffset = 0;
const HISTORY_LIMIT = 10; 

async function loadChatHistory(isLoadMore = false) {
    const userId = localStorage.getItem('ssmi_user_id');
    if (!userId) return;

    let loadMoreContainer = document.getElementById('load-more-container');
    if (!loadMoreContainer) {
        chatMessages.insertAdjacentHTML('afterbegin', `
            <div id="load-more-container" style="text-align: center; margin-bottom: 15px; display: none;">
                <button onclick="loadMoreHistory()" style="background: white; color: var(--primary-color); border: 1px solid #c8dae2; padding: 6px 16px; border-radius: 20px; font-family: 'Noto Sans Lao', sans-serif; font-size: 0.85rem; font-weight: 600; cursor: pointer; box-shadow: 0 2px 6px rgba(0,0,0,0.05);">
                    + ໂຫຼດປະຫວັດເພີ່ມເຕີມ
                </button>
            </div>
        `);
        loadMoreContainer = document.getElementById('load-more-container');
    }

    if (isLoadMore && loadMoreContainer) {
        const btn = loadMoreContainer.querySelector('button');
        btn.innerText = "ກຳລັງໂຫຼດ...";
        btn.disabled = true;
    }

    try {
        const response = await fetch(CHATBOT_CONFIG.API_URL, {
            method: 'POST',
            body: JSON.stringify({ 
                action: 'getHistory', 
                userId: userId, 
                offset: historyOffset, 
                limit: HISTORY_LIMIT,
                sessionId: currentSessionId 
            }),
            headers: { 'Content-Type': 'text/plain;charset=utf-8' }
        });
        const data = await response.json();
        const oldScrollHeight = chatMessages.scrollHeight; 

        if (data.history && data.history.length > 0) {
            const chunkContainer = document.createDocumentFragment();

            data.history.forEach(item => {
                let userDisplayHtml = item.question;
                if (item.imageUrl && item.imageUrl.includes("http")) {
                    const urls = item.imageUrl.split(/[\n, ]+/).filter(u => u.startsWith("http"));
                    let filesHtml = '<div style="display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 5px;">';
                    urls.forEach(url => {
                        if (url.includes("view") || url.includes("pdf")) {
                            filesHtml += `<a href="${url}" target="_blank" style="background:#eef5f8; color:#176b8a; padding:6px 12px; border-radius:8px; font-size:0.8rem; text-decoration:none; border:1px solid #c8dae2;">📄 ເບິ່ງເອກະສານ PDF</a>`;
                        } else {
                            filesHtml += `<img src="${url}" class="chat-img" onclick="openModal(this.src)" style="max-width: 150px; max-height: 150px; border-radius: 8px; object-fit: cover;">`;
                        }
                    });
                    filesHtml += '</div>';
                    userDisplayHtml = filesHtml + userDisplayHtml;
                }
                
                const userDiv = document.createElement('div');
                userDiv.className = `message user-message`;
                userDiv.innerHTML = userDisplayHtml;
                chunkContainer.appendChild(userDiv);

                const botDiv = document.createElement('div');
                botDiv.className = `message bot-message`;
                if (!item.answer.includes("API Error")) {
                    botDiv.innerHTML = item.answer.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
                } else {
                    botDiv.textContent = "⚠️ ຂໍອະໄພ, ຂໍ້ຄວາມນີ້ເກີດຂໍ້ຜິດພາດ";
                }
                chunkContainer.appendChild(botDiv);
            });

            if (isLoadMore) {
                loadMoreContainer.parentNode.insertBefore(chunkContainer, loadMoreContainer.nextSibling);
            } else {
                const existingMessages = chatMessages.querySelectorAll('.message');
                existingMessages.forEach(msg => { if(msg.id !== 'welcome-message') msg.remove(); });
                const welcomeMsg = document.getElementById('welcome-message');
                if (welcomeMsg) welcomeMsg.style.display = 'none'; 
                chatMessages.appendChild(chunkContainer);
            }

            if (isLoadMore) {
                requestAnimationFrame(() => { chatMessages.scrollTop = chatMessages.scrollHeight - oldScrollHeight; });
            } else {
                const forceScrollToBottom = () => { chatMessages.scrollTop = chatMessages.scrollHeight; };
                forceScrollToBottom(); 
                requestAnimationFrame(forceScrollToBottom); 
                setTimeout(forceScrollToBottom, 150); 
                setTimeout(forceScrollToBottom, 500); 
                const images = chatMessages.querySelectorAll('img.chat-img');
                images.forEach(img => { img.addEventListener('load', forceScrollToBottom); });
            }
            historyOffset += data.history.length;
        } else if (!isLoadMore) {
            chatMessages.innerHTML = ''; 
            const welcomeHtml = `ສະບາຍດີ! ຂ້ອຍແມ່ນ SINA ຜູ້ຊ່ວຍ ຕອບຄຳຖາມທຸກຢ່າງ ຂອງ ສິນຊັບເມືອງເໜືອ.<br><br>
                ທ່ານສາມາດພິມຄຳຖາມ, <b>ແນບເອກະສານ (PDF/ຮູບ)</b> ຫຼື <b>ກົດປຸ່ມໄມໂຄຣໂຟນ</b> ເພື່ອເວົ້າຖາມຂ້ອຍໄດ້ເລີຍ!`;
            appendMessage(welcomeHtml, 'bot-message', 'welcome-message', true);
        }
        
        if (loadMoreContainer) {
            if (data.hasMore) {
                loadMoreContainer.style.display = 'block';
                const btn = loadMoreContainer.querySelector('button');
                btn.innerText = "+ ໂຫຼດປະຫວັດເພີ່ມເຕີມ";
                btn.disabled = false;
            } else {
                loadMoreContainer.style.display = 'none';
            }
        }
    } catch (e) { 
        if (isLoadMore && loadMoreContainer) {
            const btn = loadMoreContainer.querySelector('button');
            btn.innerText = "+ ໂຫຼດປະຫວັດເພີ່ມເຕີມ";
            btn.disabled = false;
        }
    }
}

function loadMoreHistory() { loadChatHistory(true); }

// ==========================================
// 3. โลจิกการส่งข้อความ
// ==========================================
let currentChatHistory = [];
let currentFiles = []; 

function handleFileSelection(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    const previewContainer = document.getElementById('file-preview-container');
    const tagsContainer = document.getElementById('file-tags');
    for (let file of files) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const base64Data = e.target.result.split(',')[1];
            currentFiles.push({ base64: base64Data, mimeType: file.type, name: file.name });
            const fileTag = document.createElement('span');
            fileTag.style.cssText = "background: #eef5f8; color: #176b8a; padding: 4px 8px; border-radius: 6px; font-size: 0.8rem; border: 1px solid #c8dae2;";
            const icon = file.type.includes('pdf') ? '📄' : '🖼️';
            fileTag.innerText = `${icon} ${file.name.substring(0, 15)}...`;
            tagsContainer.appendChild(fileTag);
            previewContainer.style.display = 'flex';
        };
        reader.readAsDataURL(file);
    }
}

function clearFiles() {
    currentFiles = [];
    document.getElementById('file-upload').value = '';
    const previewContainer = document.getElementById('file-preview-container');
    if(previewContainer) previewContainer.style.display = 'none';
    const tagsContainer = document.getElementById('file-tags');
    if(tagsContainer) tagsContainer.innerHTML = '';
}

async function sendMessage() {
    const text = userInput.value.trim();
    if (!text && currentFiles.length === 0) return;

    // 👇 เติมบรรทัดนี้ลงไป เพื่อปลดล็อกเสียงทันทีที่กดส่งข้อความ 👇
    unlockAudio();

    let userDisplayHtml = text.replace(/\n/g, '<br>');
    if (currentFiles.length > 0) {
        let filesHtml = '<div style="display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 5px;">';
        currentFiles.forEach(file => {
            if (file.mimeType.includes('pdf')) filesHtml += `<div style="background:#eef5f8; color:#176b8a; padding:6px 12px; border-radius:8px; font-size:0.8rem; border:1px solid #c8dae2;">📄 ເອກະສານ: ${file.name}</div>`;
            else filesHtml += `<img src="data:${file.mimeType};base64,${file.base64}" class="chat-img" onclick="openModal(this.src)" style="max-width: 150px; max-height: 150px; border-radius: 8px; object-fit: cover; cursor: pointer;">`;
        });
        filesHtml += '</div>';
        userDisplayHtml = filesHtml + text.replace(/\n/g, '<br>');
    }

    const welcomeMsg = document.getElementById('welcome-message');
    if (welcomeMsg) welcomeMsg.style.display = 'none'; 

    appendMessage(userDisplayHtml, 'user-message', null, true); 
    userInput.value = '';
    resizeChatInput();
    toggleInput(false);

    const userId = localStorage.getItem('ssmi_user_id') || "Unknown";
    const userName = localStorage.getItem('ssmi_user_name') || "ພະນັກງານ";
    const payloadFiles = [...currentFiles];
    clearFiles(); 

    const loadingId = 'loading-' + Date.now();
    appendMessage('<div class="typing-indicator"><span></span><span></span><span></span></div>', 'bot-message', loadingId, true);
    const selectedModel = document.getElementById('ai-model-select').value;
    
    try {
        const response = await fetch(CHATBOT_CONFIG.API_URL, {
            method: 'POST',
            body: JSON.stringify({ 
                action: 'chat', 
                message: text || "ກວດເບິ່ງເອກະສານເຫຼົ່ານີ້ໃຫ້ແດ່", 
                userId: userId,
                userName: userName,
                history: currentChatHistory,
                files: payloadFiles,
                modelCategory: selectedModel,
                sessionId: currentSessionId 
            }),
            headers: { 'Content-Type': 'text/plain;charset=utf-8' }
        });
        
        const data = await response.json();
        removeMessage(loadingId);

       if (data.reply) {
            const formattedReply = data.reply.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
            appendMessage(formattedReply, 'bot-message', null, true);
            currentChatHistory.push({ role: 'user', message: text });
            currentChatHistory.push({ role: 'assistant', message: data.reply });
            if (currentChatHistory.length > 20) currentChatHistory = currentChatHistory.slice(-20);
            speakText(data.reply); 
            
            // สั่งโหลดแถบเมนูใหม่
            loadChatThreads();

            // 🌟 สำคัญมาก: ปลดล็อกกล่องพิมพ์ข้อความเมื่อบอทตอบเสร็จ!
            toggleInput(true);

        } else if (data.error) {    
            const formattedError = data.error.replace(/\n/g, '<br>');
            appendMessage(formattedError, 'bot-message', null, true);
            
            // ถ้าติดโควตาให้ล็อกเป็นป้ายไฟเลื่อนทันที!
            if (data.error.includes("ໂຄວຕາ")) {
                const flatErrorMsg = data.error.replace(/\n/g, '   |   ');
                lockInputWithMarquee(`🔒 ${flatErrorMsg}`);
            } else {
                // 🌟 สำคัญมาก: ถ้าเป็น Error อื่นๆ ต้องปลดล็อกให้ผู้ใช้พิมพ์ถามใหม่ได้
                toggleInput(true);
            }
        }
    } catch (error) {
        removeMessage(loadingId);
        appendMessage("🌐 ບໍ່ສາມາດເຊື່ອມຕໍ່ກັບເຊີບເວີໄດ້", 'bot-message');
        toggleInput(true);
    } 
}

// ==========================================
// 4. ระบบโควตา ป้ายไฟเลื่อน และ Lock Input
// ==========================================
function lockInputWithMarquee(messageText) {
    toggleInput(false); 
    
    const inputField = document.getElementById('user-input');
    if (inputField) inputField.style.display = 'none'; 
    
    let scrollingBox = document.getElementById('locked-scrolling-box');
    if (!scrollingBox) {
        scrollingBox = document.createElement('div');
        scrollingBox.id = 'locked-scrolling-box';
        scrollingBox.className = 'locked-scrolling-box';
        scrollingBox.innerHTML = '<span id="locked-scrolling-text" class="locked-scrolling-text"></span>';
        if (inputField) inputField.parentNode.insertBefore(scrollingBox, inputField.nextSibling);
    }
    
    document.getElementById('locked-scrolling-text').innerText = messageText;
    scrollingBox.style.display = 'flex';
}

async function checkQuotaOnLoad() {
    const userId = localStorage.getItem('ssmi_user_id');
    if (!userId) return;
    try {
        const response = await fetch(CHATBOT_CONFIG.API_URL, {
            method: 'POST',
            body: JSON.stringify({ action: 'checkQuota', userId: userId }),
            headers: { 'Content-Type': 'text/plain;charset=utf-8' }
        });
        const data = await response.json();
        
        if (data.isLimited) {
            const msg = data.message.replace(/\n/g, '<br>');
            appendMessage(msg, 'bot-message', 'quota-warning', true);
            
            const marqueeText = `🔒ໂກຕ້າຂອງທ່ານໝົດແລ້ວ ຈະນຳໃຊ້ໄດ້ອີກຄັ້ງຫຼັງ ${data.timeString} ໂມງ (ອີກ ${data.remainString})`;
            lockInputWithMarquee(marqueeText);
        }
    } catch(e) { console.log("Quota check failed", e); }
}

function toggleInput(enable) { 
    userInput.disabled = !enable; 
    sendBtn.disabled = !enable; 
    
    const micBtnEl = document.getElementById('mic-btn');
    const attachBtnEl = document.getElementById('attach-btn');
    if (micBtnEl) micBtnEl.disabled = !enable;
    if (attachBtnEl) attachBtnEl.disabled = !enable;
    
    if (!enable) {
        if (micBtnEl) micBtnEl.style.opacity = '0.5';
        if (attachBtnEl) attachBtnEl.style.opacity = '0.5';
    } else {
        if (micBtnEl) micBtnEl.style.opacity = '1';
        if (attachBtnEl) attachBtnEl.style.opacity = '1';
        
        // ถ้ากลับมาปลดล็อกแล้ว ให้ซ่อนป้ายไฟเลื่อนแล้วโชว์กล่องพิมพ์คืน
        const inputField = document.getElementById('user-input');
        if (inputField) inputField.style.display = 'block'; 
        const scrollingBox = document.getElementById('locked-scrolling-box');
        if (scrollingBox) scrollingBox.style.display = 'none';
        
        userInput.focus(); 
    }
}

// ==========================================
// 5. ระบบเสียง & UI Helpers 
// ==========================================
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition; let isRecording = false; let mediaRecorder = null; let recordedChunks = []; let isRecordingFallback = false;
const SILENCE_TIMEOUT_MS = 5000;
const SILENCE_RMS_THRESHOLD = 0.02;
let silenceDetectionState = null;

function isAppleMobileDevice() {
    return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function shouldUseRecordingFallback() {
    return isAppleMobileDevice() || !SpeechRecognition;
}

function getSupportedAudioMimeType() {
    if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') return '';
    const mimeTypes = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
    return mimeTypes.find(type => MediaRecorder.isTypeSupported(type)) || '';
}

function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const result = reader.result;
            if (typeof result !== 'string') {
                reject(new Error('Audio conversion failed'));
                return;
            }
            resolve(result.split(',')[1]);
        };
        reader.onerror = () => reject(reader.error || new Error('Audio conversion failed'));
        reader.readAsDataURL(blob);
    });
}

function stopSilenceDetection() {
    if (!silenceDetectionState) return;

    if (silenceDetectionState.rafId) {
        cancelAnimationFrame(silenceDetectionState.rafId);
    }

    try {
        if (silenceDetectionState.source) silenceDetectionState.source.disconnect();
    } catch (e) {}

    try {
        if (silenceDetectionState.analyser) silenceDetectionState.analyser.disconnect();
    } catch (e) {}

    if (silenceDetectionState.audioContext && silenceDetectionState.audioContext.state !== 'closed') {
        silenceDetectionState.audioContext.close().catch(() => {});
    }

    silenceDetectionState = null;
}

function startSilenceDetection(stream) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    const audioContext = new AudioContextClass();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;

    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);

    const dataArray = new Uint8Array(analyser.fftSize);
    let lastSpeechAt = Date.now();

    silenceDetectionState = { audioContext, analyser, source, rafId: null };

    const monitor = () => {
        if (!isRecordingFallback || !mediaRecorder || mediaRecorder.state === 'inactive') {
            stopSilenceDetection();
            return;
        }

        analyser.getByteTimeDomainData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
            const normalized = (dataArray[i] - 128) / 128;
            sum += normalized * normalized;
        }
        const rms = Math.sqrt(sum / dataArray.length);

        if (rms > SILENCE_RMS_THRESHOLD) {
            lastSpeechAt = Date.now();
        }

        if (Date.now() - lastSpeechAt >= SILENCE_TIMEOUT_MS) {
            stopFallbackRecording();
            return;
        }

        silenceDetectionState.rafId = requestAnimationFrame(monitor);
    };

    silenceDetectionState.rafId = requestAnimationFrame(monitor);
}

function containsThaiScript(text) {
    return /[\u0E00-\u0E7F]/.test(text || '');
}

function containsLaoScript(text) {
    return /[\u0E80-\u0EFF]/.test(text || '');
}

function normalizeTextForInput(text) {
    return (text || '')
        .replace(/<br\s*\/?\s*>/gi, '\n')
        .replace(/<[^>]*>/g, '')
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .trim();
}

function convertThaiScriptToLao(text) {
    const map = {
        'ก': 'ກ', 'ข': 'ຂ', 'ฃ': 'ຂ', 'ค': 'ຄ', 'ฅ': 'ຄ', 'ฆ': 'ຄ',
        'ง': 'ງ', 'จ': 'ຈ', 'ฉ': 'ສ', 'ช': 'ຊ', 'ซ': 'ຊ', 'ฌ': 'ຊ',
        'ญ': 'ຍ', 'ฎ': 'ດ', 'ฏ': 'ຕ', 'ฐ': 'ຖ', 'ฑ': 'ທ', 'ฒ': 'ທ',
        'ณ': 'ນ', 'ด': 'ດ', 'ต': 'ຕ', 'ถ': 'ຖ', 'ท': 'ທ', 'ธ': 'ທ',
        'น': 'ນ', 'บ': 'ບ', 'ป': 'ປ', 'ผ': 'ຜ', 'ฝ': 'ຝ', 'พ': 'ພ',
        'ฟ': 'ຟ', 'ภ': 'ພ', 'ม': 'ມ', 'ย': 'ຍ', 'ร': 'ຣ', 'ล': 'ລ',
        'ว': 'ວ', 'ศ': 'ສ', 'ษ': 'ສ', 'ส': 'ສ', 'ห': 'ຫ', 'ฬ': 'ລ',
        'อ': 'ອ', 'ฮ': 'ຮ',
        'ะ': 'ະ', 'ั': 'ັ', 'า': 'າ', 'ำ': 'ຳ', 'ิ': 'ິ', 'ี': 'ີ',
        'ึ': 'ຶ', 'ื': 'ື', 'ุ': 'ຸ', 'ู': 'ູ', 'เ': 'ເ', 'แ': 'ແ',
        'โ': 'ໂ', 'ใ': 'ໃ', 'ไ': 'ໄ', '็': 'ໍ', 'ํ': 'ໍ',
        '่': '່', '้': '້', '๊': '໊', '๋': '໋',
        'ๆ': 'ໆ', '฿': '₭',
        '๐': '໐', '๑': '໑', '๒': '໒', '๓': '໓', '๔': '໔',
        '๕': '໕', '๖': '໖', '๗': '໗', '๘': '໘', '๙': '໙'
    };
    return (text || '').split('').map(ch => map[ch] || ch).join('');
}

function enforceLaoTranscript(text) {
    const clean = normalizeTextForInput(text);
    if (!clean) return clean;
    if (containsThaiScript(clean)) {
        const converted = convertThaiScriptToLao(clean);
        if (converted && containsLaoScript(converted)) return converted;
    }
    return clean;
}

async function submitRecordedAudio(audioBlob) {
    const base64Audio = await blobToBase64(audioBlob);
    const response = await fetch(CHATBOT_CONFIG.API_URL, {
        method: 'POST',
        body: JSON.stringify({
            action: 'transcribe',
            base64Audio: base64Audio,
            mimeType: audioBlob.type || 'audio/mp4',
            language: CHATBOT_CONFIG.LANGUAGE || 'lo-LA'
        }),
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }
    });

    const data = await response.json();
    if (data.transcript) {
        const finalTranscript = enforceLaoTranscript(data.transcript);
        userInput.value = finalTranscript;
        resizeChatInput();
        userInput.focus();
        userInput.setSelectionRange(userInput.value.length, userInput.value.length);
        return;
    }

    throw new Error(data.error || 'Transcription failed');
}

async function startFallbackRecording() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof MediaRecorder === 'undefined') {
        alert('⚠️ ອຸປະກອນນີ້ບໍ່ຮອງຮັບການອັດສຽງ');
        return;
    }

    const mimeType = getSupportedAudioMimeType();

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        recordedChunks = [];
        mediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
        isRecordingFallback = true;
        isRecording = true;
        micBtn.classList.add('recording');

        mediaRecorder.ondataavailable = (event) => {
            if (event.data && event.data.size > 0) recordedChunks.push(event.data);
        };

        mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(recordedChunks, { type: mediaRecorder.mimeType || mimeType || 'audio/mp4' });
            stopSilenceDetection();
            stream.getTracks().forEach(track => track.stop());
            mediaRecorder = null;
            recordedChunks = [];
            isRecordingFallback = false;
            isRecording = false;
            micBtn.classList.remove('recording');

            if (!audioBlob.size) {
                alert('⚠️ ບໍ່ພົບຂໍ້ມູນສຽງ');
                return;
            }

            try {
                await submitRecordedAudio(audioBlob);
            } catch (error) {
                alert('⚠️ ຖອດສຽງບໍ່ສຳເລັດ');
            }
        };

        mediaRecorder.onerror = () => {
            stopSilenceDetection();
            stream.getTracks().forEach(track => track.stop());
            mediaRecorder = null;
            recordedChunks = [];
            isRecordingFallback = false;
            isRecording = false;
            micBtn.classList.remove('recording');
            alert('⚠️ ການອັດສຽງລົ້ມເຫຼວ');
        };

        mediaRecorder.start();
        startSilenceDetection(stream);
    } catch (err) {
        stopSilenceDetection();
        isRecordingFallback = false;
        isRecording = false;
        micBtn.classList.remove('recording');
        alert('⚠️ ບໍ່ສາມາດເປີດໄມໂຄຣໂຟນໄດ້!');
    }
}

function stopFallbackRecording() {
    if (!mediaRecorder) return;
    if (mediaRecorder.state !== 'inactive') mediaRecorder.stop();
}

if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.lang = CHATBOT_CONFIG.LANGUAGE;
    recognition.continuous = false; recognition.interimResults = false; recognition.maxAlternatives = 1;
    recognition.onstart = () => { isRecording = true; micBtn.classList.add('recording'); };
    recognition.onresult = (event) => {
        const finalTranscript = enforceLaoTranscript(event.results[0][0].transcript);
        userInput.value = finalTranscript;
        resizeChatInput();
        userInput.focus();
        userInput.setSelectionRange(userInput.value.length, userInput.value.length);
    };
    recognition.onnomatch = () => { alert('⚠️ ບໍ່ພົບເຄື່ອງມື ຫຼື ບໍ່ສາມາດແປງສຽງເປັນຂໍ້ຄວາມໄດ້'); };
    recognition.onspeechend = () => { if (isRecording) recognition.stop(); };
    recognition.onend = () => { isRecording = false; micBtn.classList.remove('recording'); };
    recognition.onerror = () => { isRecording = false; micBtn.classList.remove('recording'); };
}

async function toggleMic() {
    if (shouldUseRecordingFallback()) {
        if (isRecordingFallback) {
            stopFallbackRecording();
            return;
        }
        await startFallbackRecording();
        return;
    }

    if (recognition) {
        if (isRecording) { recognition.stop(); return; }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach(track => track.stop());
            recognition.start();
        } catch (err) { alert("⚠️ ບໍ່ສາມາດເປີດໄມໂຄຣໂຟນໄດ້!"); }
    }
}

// ==========================================
// 🌟 ລະບົບສຽງອ່ານພາສາລາວ (ອັບເກຣດ: ປ້ອງກັນ Browser ບລັອກສຽງ 100%)
// ==========================================
let ttsAudio = new Audio(); 
let audioUnlocked = false; // ตัวแปรเช็กว่าปลดล็อกเสียงหรือยัง

// 🌟 ฟังก์ชันขออนุญาตบราวเซอร์ด้วย "เสียงเงียบ (Silent Audio)"
function unlockAudio() {
    if (audioUnlocked) return; // ถ้าปลดล็อกแล้วไม่ต้องทำซ้ำ
    
    // ใช้ไฟล์เสียงเงียบความยาว 0.1 วินาที (รหัส Base64) เพื่อหลอกให้บราวเซอร์ยอมรับการเล่นเสียง
    ttsAudio.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
    
    ttsAudio.play().then(() => {
        ttsAudio.pause();
        audioUnlocked = true; // บันทึกว่าปลดล็อกสำเร็จแล้ว!
    }).catch((err) => {
        console.log("Unlock failed:", err);
    });
}


function speakText(text) {
    const toggle = document.getElementById('auto-speak');
    if (!toggle || !toggle.checked) return;

    window.speechSynthesis.cancel();
    ttsAudio.pause();

    const cleanText = (text || '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/\*\*/g, '')
        .replace(/[#*_`]/g, ' ')
        .trim();

    if (!cleanText) return;

    // แยกข้อความตามประโยค โดยเก็บเครื่องหมายวรรคตอนไว้
    const sentences = cleanText.match(/[^.!?\u0964\u0EAF]+[.!?\u0964\u0EAF]*|[^.!?\u0964\u0EAF]+/g) || [cleanText];

    let index = 0;

    function playNext() {
        if (index >= sentences.length || !toggle.checked) return;

        const sentence = sentences[index].trim();
        index++;

        if (!sentence) {
            playNext();
            return;
        }

        // เลือกภาษาตามตัวอักษรที่ใช้จริงในประโยค
        const laoCount = (sentence.match(/[\u0E80-\u0EFF]/g) || []).length;
        const latinCount = (sentence.match(/[A-Za-z]/g) || []).length;
        const lang = laoCount >= latinCount ? 'lo' : 'en';

        ttsAudio.onended = playNext;
        ttsAudio.onerror = () => {
            console.error('TTS playback failed:', lang, sentence);
        };

        ttsAudio.src =
            'https://translate.googleapis.com/translate_tts' +
            '?client=gtx&ie=UTF-8&tl=' + lang +
            '&q=' + encodeURIComponent(sentence);

        ttsAudio.play().catch(error => {
            console.error('TTS error:', error);
        });
    }

    playNext();
}


function toggleAutoSpeak(isChecked) {
    if (!isChecked) {
        ttsAudio.pause();
        window.speechSynthesis.cancel();
    } else {
        // 🌟 ถ้าพนักงานมากดเปิดสวิตช์ ให้ถือโอกาสปลดล็อกเสียงตรงนี้ด้วยเลย
        unlockAudio();
    }
}

function resizeChatInput() {
    userInput.style.height = 'auto';
    const maxHeight = Math.min(window.innerHeight * 0.4, 240);
    userInput.style.height = `${Math.min(userInput.scrollHeight, maxHeight)}px`;
    userInput.style.overflowY = userInput.scrollHeight > maxHeight ? 'auto' : 'hidden';
}

function handleEnter(event) {
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    sendMessage();
}

function appendMessage(text, className, id = null, isHtml = false) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${className}`;
    if (id) messageDiv.id = id;
    if (isHtml) messageDiv.innerHTML = text; else messageDiv.textContent = text;
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function openModal(src) {
    document.getElementById("image-modal").style.display = "flex";
    document.getElementById("modal-img").src = src.replace('&sz=w800', '&sz=w2000');
}
function closeModal() { document.getElementById("image-modal").style.display = "none"; }
function removeMessage(id) { const el = document.getElementById(id); if (el) el.remove(); }

// ==========================================
// 🌟 ระบบ Popup ตั้งค่า (Settings)
// ==========================================
function toggleSettingsModal() {
    const modal = document.getElementById('settings-modal');
    if (modal) modal.style.display = 'flex';
}

function closeSettingsModal(event) {
    if (event) event.stopPropagation();
    const modal = document.getElementById('settings-modal');
    if (modal) modal.style.display = 'none';
}

// ==========================================
// 🌟 ระบบเปลี่ยนรหัสผ่าน (Change Password)
// ==========================================
function togglePasswordForm() {
    const form = document.getElementById('password-change-form');
    if (form.style.display === 'none') {
        form.style.display = 'block';
        document.getElementById('old-password').value = '';
        document.getElementById('new-password').value = '';
        document.getElementById('confirm-new-password').value = '';
        document.getElementById('password-msg').style.display = 'none';
    } else {
        form.style.display = 'none';
    }
}

async function submitPasswordChange() {
    const oldPass = document.getElementById('old-password').value.trim();
    const newPass = document.getElementById('new-password').value.trim();
    const confirmPass = document.getElementById('confirm-new-password').value.trim();
    const msgBox = document.getElementById('password-msg');
    const btn = document.getElementById('btn-submit-pass');
    const userId = localStorage.getItem('ssmi_user_id');

    if (!oldPass || !newPass || !confirmPass) {
        msgBox.innerText = "ກະລຸນາປ້ອນຂໍ້ມູນໃຫ້ຄົບ";
        msgBox.style.color = "red";
        msgBox.style.display = 'block';
        return;
    }
    if (newPass !== confirmPass) {
        msgBox.innerText = "ລະຫັດຜ່ານໃໝ່ບໍ່ຕົງກັນ";
        msgBox.style.color = "red";
        msgBox.style.display = 'block';
        return;
    }

    msgBox.style.display = 'none';
    btn.innerText = "ກຳລັງບັນທຶກ...";
    btn.disabled = true;

    try {
        const res = await fetch(CHATBOT_CONFIG.API_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'changePassword',
                userId: userId,
                oldPassword: oldPass,
                newPassword: newPass
            }),
            headers: { 'Content-Type': 'text/plain;charset=utf-8' }
        });
        const data = await res.json();
        
        if (data.success) {
            msgBox.innerText = "ປ່ຽນລະຫັດຜ່ານສຳເລັດແລ້ວ!";
            msgBox.style.color = "green";
            msgBox.style.display = 'block';
            setTimeout(() => {
                togglePasswordForm();
                msgBox.style.display = 'none';
            }, 2000); 
        } else {
            msgBox.innerText = data.message || "ເກີດຂໍ້ຜິດພາດ";
            msgBox.style.color = "red";
            msgBox.style.display = 'block';
        }
    } catch (e) {
        msgBox.innerText = "ບໍ່ສາມາດເຊື່ອມຕໍ່ລະບົບໄດ້";
        msgBox.style.color = "red";
        msgBox.style.display = 'block';
    }
    
    btn.innerText = "ບັນທຶກ";
    btn.disabled = false;
}

// ==========================================
// 🌟 ระบบ Guide Line สอนใช้งาน (Intro.js) - ฉบับกันค้าง
// ==========================================
function startGuideTour() {
    if (typeof introJs === 'undefined') {
        console.log("⚠️ Intro.js ຍັງບໍ່ພ້ອມໃຊ້ງານ");
        return;
    }

    const hasSeenGuide = localStorage.getItem('ssmi_has_seen_guide');
    
    if (!hasSeenGuide) {
        const modal = document.getElementById('settings-modal');
        if (modal) modal.style.display = 'none';

        introJs().setOptions({
            nextLabel: 'ຕໍ່ໄປ ➔',
            prevLabel: '⬅ ກັບຄືນ',
            doneLabel: '✅ ເຂົ້າໃຈແລ້ວ',
            showStepNumbers: true,
            showBullets: true,
            exitOnOverlayClick: false, 
            exitOnEsc: false,
            scrollToElement: false // 🌟 ปิดการเลื่อนหน้าจออัตโนมัติ (แก้ปัญหาจอกระตุก/กล่องหาย)
        }).oncomplete(function() {
            localStorage.setItem('ssmi_has_seen_guide', 'true');
        }).onexit(function() {
            localStorage.setItem('ssmi_has_seen_guide', 'true');
        }).start();
    }
}

function forceStartGuide() {
    const modal = document.getElementById('settings-modal');
    if (modal) modal.style.display = 'none';
    
    localStorage.removeItem('ssmi_has_seen_guide');
    
    setTimeout(() => {
        startGuideTour();
    }, 500);
}

// ==========================================
// 🌟 ระบบ Mini Guide: สอนเทคนิคการตั้งคำถาม (เด้งทุก 7 วัน)
// ==========================================
function checkAndShowPromptGuide() {
    const lastSeen = localStorage.getItem('ssmi_last_prompt_guide');
    const now = new Date().getTime();
    const oneWeek = 7 * 24 * 60 * 60 * 1000; 

    if (!lastSeen || (now - parseInt(lastSeen)) > oneWeek) {
        startPromptGuide();
    }
}

function startPromptGuide() {
    if (typeof introJs === 'undefined') return;

    const modal = document.getElementById('settings-modal');
    if (modal) modal.style.display = 'none';

    introJs().setOptions({
        steps: [
            {
                title: '💡 ເຕັກນິກການຖາມຄຳຖາມ (1/2)',
                intro: 'ເພື່ອໃຫ້ SINA ຕອບໄດ້ຕົງຈຸດທີ່ສຸດ, ໃຫ້ຕັ້ງຖາມທີ່ຊັດເຈນ:<br><br>❌ <b>ບໍ່ຄວນຖາມສັ້ນໆ ຫຼື ຖາມຍາວເກີນໄປ (2-3 ຄຳຖາມຊ້ອນກັນເຊັ່ນ:</b> "ພັກທ່ຽງ", "ເບີກເງິນບໍລິການ", "ເບີກເງິນນະໂຍບາຍ", "ພະນັກງານວິຊາການສາມາດເບີກເງິນນະໂຍບາຍແຕ່ງງານໄດ້ທໍ່ໃດ, ສາມາດເບີກໄດ້ຈັກເທື່ອ ແລະ ຖ້າໄດ້ຮັບແລ້ວສາມາດຮັບຕື່ມໄດ້ບໍ່❌ "<br>✅ <b>ຄວນຖາມລະບຸລາຍລະອຽດທີ່ຊັດເຈນເຊັ່ນ:</b> <br>"ພະນັກງານ 95% ສາມາດໃຊ້ວັນພັກປະຈຳປີໄດ້ຈັກວັນ?", <br>"ຢາກລາພັກ 10 ວັນ ຕ້ອງເຮັດແບບໃດ", <br>"ວິທີປະເມີນລູກຄ້າ ສຳລັບຫຼັກຊັບຄ້ຳປະກັນ", <br>"ສິດໃນການອະນຸມັດເງິນຝາກ ມີແນວໃດແດ່"<br>📌 <i>ຢ່າລືມບອກເງື່ອນໄຂເພີ່ມເຕີມ (ຖ້າມີ) ເຊັ່ນ: ຕຳແໜ່ງ, ເພດ ເພື່ອໃຫ້ໄດ້ຄຳຕອບທີ່ຊັດເຈນຂຶ້ນ.</i>'
            },
            {
                element: document.querySelector('#user-input'),
                title: '📎 ການຖາມເມື່ອແນບເອກະສານ (2/2)',
                intro: 'ຖ້າແນບຮູບ ຫຼື ໄຟລ໌, ຕ້ອງສັ່ງສະເໝີວ່າໃຫ້ SINA ເຮັດຫຍັງ:<br><br>❌ <b>ບໍ່ຄວນພິມແຕ່:</b> "ເບິ່ງໃຫ້ແດ່"<br>✅ <b>ຄວນພິມວ່າ:</b> "ຮູບນີ້ແມ່ນຫຍັງ ຕ້ອງລົງລາຍຈ່າຍໝວດໃດ", "ບິນນີ້ຕ້ອງລົງລາຍຈ່າຍໝວດໃດ", ຊ່ວຍກວດສອບປຽບທຽບລາຄາໃຫ້ແດ່ ວ່າຖືກຕ້ອງຕາມລະບຽບການຈັດຊື້ຫຼືບໍ່?"<br>📌 <i>ໝາຍເຫດ: ການອັບຮູບ ຫຼື ຟາຍ SINA ອາດຈະຕອບບໍ່ຖຶກຕ້ອງທັ້ງໝົດ ຕ້ອງໄປກວດທຽບກັບລະບຽບທຸກຄັ້ງ ກ່ອນນຳມາໃຊ້ຈິງ</i>',
                position: 'top' // 🌟 บังคับให้อยู่ด้านบนของช่องพิมพ์เสมอ
            }
        ],
        nextLabel: 'ຕໍ່ໄປ ➔',
        prevLabel: '⬅ ກັບຄືນ',
        doneLabel: '✅ ເຂົ້າໃຈແລ້ວ',
        showStepNumbers: false,
        showBullets: true,
        exitOnOverlayClick: false, 
        exitOnEsc: false,
        scrollToElement: false // 🌟 ปิดการเลื่อนหน้าจออัตโนมัติ
    }).oncomplete(function() {
        localStorage.setItem('ssmi_last_prompt_guide', new Date().getTime().toString());
    }).onexit(function() {
        localStorage.setItem('ssmi_last_prompt_guide', new Date().getTime().toString());
    }).start();
}

function forceStartPromptGuide() {
    const modal = document.getElementById('settings-modal');
    if (modal) modal.style.display = 'none';
    
    setTimeout(() => {
        startPromptGuide();
    }, 500);
}