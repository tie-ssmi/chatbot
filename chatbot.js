const chatMessages = document.getElementById('chat-messages');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const micBtn = document.getElementById('mic-btn');
const autoSpeakToggle = document.getElementById('auto-speak');

// ==========================================
// 1. ระบบจัดการ Session & History
// ==========================================
window.onload = function() {
    if (!localStorage.getItem('ssmi_user_id')) {
        if (!window.location.href.includes('login.html')) window.location.href = 'login.html';
    } else {
        if (document.getElementById('chat-app')) showChat();
        loadChatHistory();
        const userName = localStorage.getItem('ssmi_user_name');
        if (userName) document.getElementById('user-display-name').innerText = '👤 ' + userName;
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

// ฟังก์ชันดึงประวัติจาก Google Sheets มาแสดง (รองรับหลายไฟล์และ PDF)
async function loadChatHistory() {
    const userId = localStorage.getItem('ssmi_user_id');
    if (!userId) return;

    try {
        const response = await fetch(CHATBOT_CONFIG.API_URL, {
            method: 'POST',
            body: JSON.stringify({ action: 'getHistory', userId: userId }),
            headers: { 'Content-Type': 'text/plain;charset=utf-8' }
        });
        const data = await response.json();
        if (data.history && data.history.length > 0) {
            data.history.forEach(item => {
                let userDisplayHtml = item.question;
                
                // 🌟 ระบบแยกลิงก์ โชว์หลายรูป และสร้างปุ่มกดดู PDF
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
                
                appendMessage(userDisplayHtml, 'user-message', null, true);

                if (!item.answer.includes("API Error")) {
                    let formattedAnswer = item.answer.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
                    appendMessage(formattedAnswer, 'bot-message', null, true);
                } else {
                    appendMessage("⚠️ ຂໍອະໄພ, ຂໍ້ຄວາມນີ້ເກີດຂໍ້ຜິດພາດ", 'bot-message');
                }
            });
        }
    } catch (e) { console.log("Load history failed", e); }
}

// ==========================================
// 2. โลจิกการส่งข้อความและจัดการไฟล์
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
            currentFiles.push({
                base64: base64Data,
                mimeType: file.type,
                name: file.name
            });
            
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
    document.getElementById('file-preview-container').style.display = 'none';
    document.getElementById('file-tags').innerHTML = '';
}

// 🌟 แทนที่ฟังก์ชัน sendMessage() เดิมด้วยตัวนี้ครับ
async function sendMessage() {
    const text = userInput.value.trim();
    if (!text && currentFiles.length === 0) return;

    // 🌟 1. ดึงไฟล์มาโชว์ในแชททันทีที่กดส่ง
    let userDisplayHtml = text;
    if (currentFiles.length > 0) {
        let filesHtml = '<div style="display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 5px;">';
        currentFiles.forEach(file => {
            if (file.mimeType.includes('pdf')) {
                // ถ้าเป็น PDF ให้โชว์กล่องชื่อไฟล์สวยๆ
                filesHtml += `<div style="background:#eef5f8; color:#176b8a; padding:6px 12px; border-radius:8px; font-size:0.8rem; border:1px solid #c8dae2;">📄 ເອກະສານ: ${file.name}</div>`;
            } else {
                // ถ้าเป็นรูปภาพ ให้โชว์รูปขนาดย่อทันที
                filesHtml += `<img src="data:${file.mimeType};base64,${file.base64}" class="chat-img" onclick="openModal(this.src)" style="max-width: 150px; max-height: 150px; border-radius: 8px; object-fit: cover; cursor: pointer;">`;
            }
        });
        filesHtml += '</div>';
        userDisplayHtml = filesHtml + text;
    }

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
                modelCategory: selectedModel // 🌟 ส่งหมวดหมู่แนบไปด้วย!
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
        } else if (data.error) {    
            appendMessage("⚠️ ຂໍອະໄພ: " + data.error, 'bot-message');
        }
    } catch (error) {
        removeMessage(loadingId);
        appendMessage("🌐 ບໍ່ສາມາດເຊື່ອມຕໍ່ກັບເຊີບເວີໄດ້", 'bot-message');
    } finally {
        toggleInput(true);
    }
}

// ==========================================
// 3. ระบบเสียง & UI Helpers
// ==========================================
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
const supportedRecorderMimeType = (() => {
    if (!window.MediaRecorder || !MediaRecorder.isTypeSupported) return '';
    if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) return 'audio/webm;codecs=opus';
    if (MediaRecorder.isTypeSupported('audio/webm')) return 'audio/webm';
    if (MediaRecorder.isTypeSupported('audio/mp4')) return 'audio/mp4';
    if (MediaRecorder.isTypeSupported('audio/aac')) return 'audio/aac';
    return '';
})();
const recorderFileExtension = supportedRecorderMimeType.includes('mp4') ? 'mp4' : supportedRecorderMimeType.includes('aac') ? 'aac' : 'webm';
let recognition;
let isRecording = false;
let mediaRecorder = null;
let recordedChunks = [];
let isRecordingFallback = false;

if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.lang = CHATBOT_CONFIG.LANGUAGE;
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => { isRecording = true; micBtn.classList.add('recording'); };
    recognition.onresult = (event) => { 
        const transcript = event.results[0][0].transcript;
        userInput.value = transcript; 
        sendMessage(); 
    };
    recognition.onnomatch = () => { alert('⚠️ ບໍ່ພົບເຄື່ອງມື ຫຼື ບໍ່ສາມາດແປງສຽງເປັນຂໍ້ຄວາມໄດ້'); };
    recognition.onspeechend = () => { if (isRecording) recognition.stop(); };
    recognition.onend = () => { isRecording = false; micBtn.classList.remove('recording'); };
    recognition.onerror = (event) => {
        if (event.error === 'not-allowed') {
            alert("⚠️ ລະບົບຖືກບລັອກໄມໂຄຣໂຟນ! \nກະລຸນາກົດປຸ່ມຮູບແມ່ກະແຈ (Padlock) ຢູ່ແຖບ URL ດ້ານເທິງ, ແລ້ວເລືອກອະນຸຍາດ (Allow) ໃຫ້ໄມໂຄຣໂຟນ.");
        }
        isRecording = false;
        micBtn.classList.remove('recording');
    };
}

async function toggleMic() {
    const hasMediaRecorder = !!(navigator.mediaDevices && window.MediaRecorder);
    if (!recognition && !hasMediaRecorder) return alert("⚠️ Browser ຂອງທ່ານບໍ່ຮອງຮັບການບັນທຶກສຽງ.");
    if (recognition) {
        if (isRecording) { recognition.stop(); return; }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach(track => track.stop());
            recognition.start();
        } catch (err) {
            alert("⚠️ ບໍ່ສາມາດເປີດໄມໂຄຣໂຟນໄດ້! \nກະລຸນາກວດສອບວ່າທ່ານໄດ້ກົດອະນຸຍາດ (Allow) ແລ້ວຫຼືຍັງ.");
        }
        return;
    }
    if (isRecordingFallback) {
        if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
        return;
    }
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        recordedChunks = [];
        const recorderOptions = supportedRecorderMimeType ? { mimeType: supportedRecorderMimeType } : {};
        mediaRecorder = new MediaRecorder(stream, recorderOptions);
        mediaRecorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) recordedChunks.push(e.data); };
        mediaRecorder.onstart = () => { isRecordingFallback = true; micBtn.classList.add('recording'); };
        mediaRecorder.onstop = async () => {
            isRecordingFallback = false;
            micBtn.classList.remove('recording');
            stream.getTracks().forEach(t => t.stop());
            const blobType = recordedChunks.length ? recordedChunks[0].type : supportedRecorderMimeType || 'audio/webm';
            const fileExtension = blobType.includes('mp4') ? 'mp4' : blobType.includes('aac') ? 'aac' : blobType.includes('webm') ? 'webm' : recorderFileExtension;
            const blob = new Blob(recordedChunks, { type: blobType });
            try {
                const form = new FormData();
                form.append('action', 'transcribeAudio');
                form.append('file', blob, `recording.${fileExtension}`);
                const resp = await fetch(CHATBOT_CONFIG.API_URL, { method: 'POST', body: form });
                const result = await resp.json();
                if (result && result.transcript) { userInput.value = result.transcript; sendMessage(); }
                else if (result && result.error) appendMessage('⚠️ ' + result.error, 'bot-message');
                else appendMessage('⚠️ ການແປພາສາບໍ່ສຳເລັດ', 'bot-message');
            } catch (uploadErr) { appendMessage('🌐 ບໍ່ສາມາດອັບໂຫຼດສຽງໄດ້', 'bot-message'); }
        };
        mediaRecorder.start();
        setTimeout(() => { if (mediaRecorder && mediaRecorder.state === 'recording') mediaRecorder.stop(); }, 12000);
    } catch (err) { alert('⚠️ ບໍ່ສາມາດເປີດໄມໂຄຣໂຟນໄດ້!'); }
}

let availableVoices = [];
function refreshVoices() {
    if (!('speechSynthesis' in window)) return;
    availableVoices = window.speechSynthesis.getVoices() || [];
}
function pickBestVoice() {
    const voices = availableVoices.length ? availableVoices : (window.speechSynthesis.getVoices() || []);
    if (!voices.length) return null;
    const exactLao = voices.find(v => (v.lang || '').toLowerCase() === 'lo-la');
    if (exactLao) return exactLao;
    const laoFamily = voices.find(v => (v.lang || '').toLowerCase().startsWith('lo'));
    return laoFamily || null;
}
let hasWarnedNoLaoVoice = false;

function speakText(text) {
    if (!('speechSynthesis' in window)) return;
    if (!autoSpeakToggle.checked) return;
    window.speechSynthesis.cancel(); 
    const cleanText = text.replace(/[\*\#\_]/g, "");
    const utterance = new SpeechSynthesisUtterance(cleanText);
    refreshVoices();
    const selectedVoice = pickBestVoice();
    if (selectedVoice) {
        utterance.voice = selectedVoice;
        utterance.lang = selectedVoice.lang;
    } else {
        return;
    }
    utterance.rate = 0.9; 
    utterance.pitch = 1.0; 
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

if ('speechSynthesis' in window) {
    refreshVoices();
    window.speechSynthesis.addEventListener('voiceschanged', () => refreshVoices());
}

function openModal(src) {
    let fullSrc = src;
    if(src.includes('thumbnail?id=') && src.includes('&sz=w800')) {
         fullSrc = src.replace('&sz=w800', '&sz=w2000'); 
    }
    document.getElementById("image-modal").style.display = "flex";
    document.getElementById("modal-img").src = fullSrc;
}

function closeModal() { document.getElementById("image-modal").style.display = "none"; }
function removeMessage(id) { const el = document.getElementById(id); if (el) el.remove(); }
function toggleInput(enable) { userInput.disabled = !enable; sendBtn.disabled = !enable; if(enable) userInput.focus(); }