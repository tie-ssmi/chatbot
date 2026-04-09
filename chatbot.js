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

window.onload = function() {
    if (!localStorage.getItem('ssmi_user_id')) {
        if (!window.location.href.includes('login.html')) window.location.href = 'login.html';
    } else {
        if (document.getElementById('chat-app')) showChat();
        loadChatThreads(); 
        loadChatHistory(); 
        checkQuotaOnLoad(); 
        
        // 🌟 โค้ดที่เปลี่ยน: เอาชื่อไปโชว์ในกล่อง Settings แทน
        const userName = localStorage.getItem('ssmi_user_name');
        if (userName) {
            const userBox = document.getElementById('settings-user-name');
            if (userBox) userBox.innerText = userName;
        }
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
    loadChatThreads(); 
}

// 🌟 ดึงรายการห้องแชทมาโชว์ที่ Sidebar
async function loadChatThreads() {
    const userId = localStorage.getItem('ssmi_user_id');
    try {
        const res = await fetch(CHATBOT_CONFIG.API_URL, {
            method: 'POST',
            body: JSON.stringify({ action: 'getThreads', userId: userId }),
            headers: { 'Content-Type': 'text/plain;charset=utf-8' }
        });
        const data = await res.json();
        const container = document.getElementById('thread-list-container');
        if(!container) return;
        container.innerHTML = '';
        
        if (data.threads && data.threads.length > 0) {
            data.threads.forEach(th => {
                const div = document.createElement('div');
                div.className = `thread-item ${th.sessionId === currentSessionId ? 'active' : ''}`;
                div.onclick = () => switchThread(th.sessionId);
                div.innerText = '💬 ' + th.title;
                container.appendChild(div);
            });
        } else {
            container.innerHTML = '<div style="color: #888; font-size: 0.8rem; text-align: center; margin-top: 20px;">ຍັງບໍ່ມີປະຫວັດການສົນທະນາ</div>';
        }
    } catch(e) { console.log(e); }
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
                sessionId: currentSessionId // 🌟 ส่ง Session ปัจจุบันไปด้วย
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

const GREETING_PATTERNS = [
    /^hi$/i,
    /^hello$/i,
    /^hey$/i,
    /^good\s*morning$/i,
    /^ສະບາຍດີ$/,
    /^ເຮ$/
];

function isGreetingMessage(text) {
    const normalized = (text || '').trim();
    return GREETING_PATTERNS.some(pattern => pattern.test(normalized));
}

function closeGreetingVideo() {
    const videoModal = document.getElementById('video-greeting-modal');
    const greetingVideo = document.getElementById('greeting-video');
    if (!videoModal || !greetingVideo) return;
    greetingVideo.pause();
    greetingVideo.currentTime = 0;
    videoModal.style.display = 'none';
}

function showGreetingVideoPopup() {
    const videoModal = document.getElementById('video-greeting-modal');
    const greetingVideo = document.getElementById('greeting-video');
    if (!videoModal || !greetingVideo) return;

    videoModal.style.display = 'flex';
    greetingVideo.currentTime = 0;
    greetingVideo.play().catch(() => {
        // Ignore playback blocking to keep chat flow stable.
    });

    setTimeout(() => {
        closeGreetingVideo();
    }, 8000);
}

async function sendMessage() {
    const text = userInput.value.trim();
    if (!text && currentFiles.length === 0) return;

    if (isGreetingMessage(text) && currentFiles.length === 0) {
        showGreetingVideoPopup();
        userInput.value = '';
        return;
    }

    let userDisplayHtml = text;
    if (currentFiles.length > 0) {
        let filesHtml = '<div style="display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 5px;">';
        currentFiles.forEach(file => {
            if (file.mimeType.includes('pdf')) filesHtml += `<div style="background:#eef5f8; color:#176b8a; padding:6px 12px; border-radius:8px; font-size:0.8rem; border:1px solid #c8dae2;">📄 ເອກະສານ: ${file.name}</div>`;
            else filesHtml += `<img src="data:${file.mimeType};base64,${file.base64}" class="chat-img" onclick="openModal(this.src)" style="max-width: 150px; max-height: 150px; border-radius: 8px; object-fit: cover; cursor: pointer;">`;
        });
        filesHtml += '</div>';
        userDisplayHtml = filesHtml + text;
    }

    const welcomeMsg = document.getElementById('welcome-message');
    if (welcomeMsg) welcomeMsg.style.display = 'none'; 

    appendMessage(userDisplayHtml, 'user-message', null, true); 
    userInput.value = '';
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
                sessionId: currentSessionId // 🌟 ส่งรหัสห้องแชท
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
        } else if (data.error) {    
            const formattedError = data.error.replace(/\n/g, '<br>');
            appendMessage(formattedError, 'bot-message', null, true);
            
            // 🌟 ถ้าติดโควตาให้ล็อกเป็นป้ายไฟเลื่อนทันที!
            if (data.error.includes("ໂກຕ້າ")) {
                const flatErrorMsg = data.error.replace(/\n/g, '   |   ');
                lockInputWithMarquee(`🔒 ${flatErrorMsg}`);
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
// 5. ระบบเสียง & UI Helpers (ของเดิม)
// ==========================================
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition; let isRecording = false; let mediaRecorder = null; let recordedChunks = []; let isRecordingFallback = false;

if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.lang = CHATBOT_CONFIG.LANGUAGE;
    recognition.continuous = false; recognition.interimResults = false; recognition.maxAlternatives = 1;
    recognition.onstart = () => { isRecording = true; micBtn.classList.add('recording'); };
    recognition.onresult = (event) => { userInput.value = event.results[0][0].transcript; sendMessage(); };
    recognition.onnomatch = () => { alert('⚠️ ບໍ່ພົບເຄື່ອງມື ຫຼື ບໍ່ສາມາດແປງສຽງເປັນຂໍ້ຄວາມໄດ້'); };
    recognition.onspeechend = () => { if (isRecording) recognition.stop(); };
    recognition.onend = () => { isRecording = false; micBtn.classList.remove('recording'); };
    recognition.onerror = () => { isRecording = false; micBtn.classList.remove('recording'); };
}

async function toggleMic() {
    if (recognition) {
        if (isRecording) { recognition.stop(); return; }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach(track => track.stop());
            recognition.start();
        } catch (err) { alert("⚠️ ບໍ່ສາມາດເປີດໄມໂຄຣໂຟນໄດ້!"); }
    }
}

function speakText(text) {
    if (!('speechSynthesis' in window) || !autoSpeakToggle.checked) return;
    window.speechSynthesis.cancel(); 
    const utterance = new SpeechSynthesisUtterance(text.replace(/[\*\#\_]/g, ""));
    utterance.rate = 0.9; 
    window.speechSynthesis.speak(utterance);
}

function handleEnter(event) { if (event.key === 'Enter') sendMessage(); }

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
    if (event) event.stopPropagation(); // ป้องกันการคลิกทะลุ
    const modal = document.getElementById('settings-modal');
    if (modal) modal.style.display = 'none';
}