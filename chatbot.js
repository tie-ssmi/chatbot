// --- chatbot.js ---

const chatMessages = document.getElementById('chat-messages');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const micBtn = document.getElementById('mic-btn');
const autoSpeakToggle = document.getElementById('auto-speak');


// ==========================================
// 1. ระบบจัดการ Session & History
// ==========================================

// ตรวจสอบตอนเปิดหน้าเว็บ
window.onload = function() {
    if (!localStorage.getItem('ssmi_user_id')) {
        // ถ้ายังไม่ได้ Login ให้เตะไปหน้า login.html (กรณีแยกไฟล์)
        if (!window.location.href.includes('login.html')) {
            window.location.href = 'login.html';
        }
    } else {
        // ถ้า Login แล้ว ให้แสดงหน้าแชท และโหลดประวัติเก่า
        if (document.getElementById('chat-app')) showChat();
        loadChatHistory();
        const userName = localStorage.getItem('ssmi_user_name');
        if (userName) {
            document.getElementById('user-display-name').innerText = '👤 ' + userName;
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

// ฟังก์ชันดึงประวัติจาก Google Sheets มาแสดง
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
                appendMessage(item.question, 'user-message');
                if (!item.answer.includes("API Error")) {
                    // 🌟 เพิ่มการแปลง \n เป็น <br> และแปลง **ข้อความ** เป็นตัวหนา
                    let formattedAnswer = item.answer.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
                    appendMessage(formattedAnswer, 'bot-message', null, true);
                }  else {
                    appendMessage("⚠️ ຂໍອະໄພ, ຂໍ້ຄວາມນີ້ເກີດຂໍ້ຜິດພາດ", 'bot-message');
                }
            });
        }
    } catch (e) { console.log("Load history failed", e); }
}

// ==========================================
// 2. โลจิกการส่งข้อความ (ตัวที่สมบูรณ์)
// ==========================================
let currentChatHistory = [];
async function sendMessage() {
    const text = userInput.value.trim();
    if (!text) return;

    // แสดงข้อความฝั่ง User
    appendMessage(text, 'user-message');
    userInput.value = '';
    toggleInput(false);

    const userId = localStorage.getItem('ssmi_user_id') || "Unknown";
    const userName = localStorage.getItem('ssmi_user_name') || "ພະນັກງານ";

    const loadingId = 'loading-' + Date.now();
    appendMessage('<div class="typing-indicator"><span></span><span></span><span></span></div>', 'bot-message', loadingId, true);

    try {
        const response = await fetch(CHATBOT_CONFIG.API_URL, {
            method: 'POST',
            body: JSON.stringify({ 
                action: 'chat', 
                message: text,
                userId: userId,
                userName: userName,
                history: currentChatHistory // <--- ส่งประวัติไปด้วย
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
            if (currentChatHistory.length > 20) {
                currentChatHistory = currentChatHistory.slice(-20);
            }
            speakText(data.reply); 
            
        } else if (data.error) {    
            // แสดง Error ให้เห็นในแชทเลยจะได้ไม่งง
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
// ==========================================
// 3. ระบบเสียง & UI Helpers
// ==========================================

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

// 🌟 แก้ไขลำดับ MimeType ให้รองรับ iOS Safari (mp4) เป็นอันดับแรกสุด
const supportedRecorderMimeType = (() => {
    if (!window.MediaRecorder || !MediaRecorder.isTypeSupported) return '';
    if (MediaRecorder.isTypeSupported('audio/mp4')) return 'audio/mp4'; // iOS ມັກໂຕນີ້
    if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) return 'audio/webm;codecs=opus';
    if (MediaRecorder.isTypeSupported('audio/webm')) return 'audio/webm';
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
    
    recognition.onstart = () => { 
        isRecording = true; 
        micBtn.classList.add('recording'); 
    };
    
    recognition.onresult = (event) => { 
        const transcript = event.results[0][0].transcript;
        console.log('Speech recognition result:', transcript);
        userInput.value = transcript; 
        sendMessage(); 
    };

    recognition.onnomatch = () => {
        alert('⚠️ ບໍ່ພົບເຄື່ອງມື ຫຼື ບໍ່ສາມາດແປງສຽງເປັນຂໍ້ຄວາມໄດ້');
    };

    recognition.onspeechend = () => {
        if (isRecording) recognition.stop();
    };
    
    recognition.onend = () => { 
        isRecording = false; 
        micBtn.classList.remove('recording'); 
    };

    recognition.onerror = (event) => {
        console.error("Speech recognition error:", event.error);
        if (event.error === 'not-allowed') {
            // แจ้งเตือนเวลาโดน Block
            alert("⚠️ ລະບົບຖືກບລັອກໄມໂຄຣໂຟນ! \n(ສຳລັບ iPhone ໃຫ້ກົດປຸ່ມ 'aA' ຫຼື ຮູບແມ່ກະແຈ ຢູ່ແຖບ URL ແລ້ວເລືອກອະນຸຍາດໄມໂຄຣໂຟນ)");
        }
        isRecording = false;
        micBtn.classList.remove('recording');
    };
}

// 🌟 อัปเกรดฟังก์ชันปุ่มไมค์ (เอา await ออกเพื่อเอาใจ iOS)
async function toggleMic() {
    const hasMediaRecorder = !!(navigator.mediaDevices && window.MediaRecorder);
    if (!recognition && !hasMediaRecorder) {
        return alert("⚠️ Browser ຂອງທ່ານບໍ່ຮອງຮັບການບັນທຶກສຽງ (ແນະນຳໃຫ້ໃຊ້ Safari ຫຼື Chrome).");
    }

    // --- กรณีที่ 1: ระบบรองรับ Web Speech API (iOS เวอร์ชั่นใหม่ และ Chrome) ---
    if (recognition) {
        if (isRecording) {
            recognition.stop();
            return;
        }

        try {
            // กฎเหล็ก iOS: จิ้มปุ่มปุ๊บ สั่ง start() ทันที ระบบจะเด้งหน้าต่างขออนุญาตไมค์เองแบบถูกต้อง
            recognition.start();
        } catch (err) {
            console.error("Mic start error:", err);
            alert("⚠️ ບໍ່ສາມາດເປີດໄມໂຄຣໂຟນໄດ້! ກະລຸນາກວດສອບການອະນຸຍາດ.");
        }
        return;
    }

    // --- กรณีที่ 2: ระบบ Fallback ไปใช้ MediaRecorder (อัดไฟล์ส่ง Server) ---
    if (isRecordingFallback) {
        if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
        return;
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        recordedChunks = [];
        const recorderOptions = supportedRecorderMimeType ? { mimeType: supportedRecorderMimeType } : {};
        mediaRecorder = new MediaRecorder(stream, recorderOptions);

        mediaRecorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) recordedChunks.push(e.data);
        };

        mediaRecorder.onstart = () => {
            isRecordingFallback = true;
            micBtn.classList.add('recording');
        };

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
                const resp = await fetch(CHATBOT_CONFIG.API_URL, {
                    method: 'POST',
                    body: form
                });
                const result = await resp.json();
                if (result && result.transcript) {
                    userInput.value = result.transcript;
                    sendMessage();
                } else {
                    appendMessage('⚠️ ບໍ່ສາມາດຖືກແປງສຽງໄດ້', 'bot-message');
                }
            } catch (uploadErr) {
                appendMessage('🌐 ບໍ່ສາມາດອັບໂຫຼດສຽງໄດ້', 'bot-message');
            }
        };

        mediaRecorder.start();
        // หยุดอัดอัตโนมัติเมื่อครบ 12 วินาที
        setTimeout(() => {
            if (mediaRecorder && mediaRecorder.state === 'recording') mediaRecorder.stop();
        }, 12000);

    } catch (err) {
        alert('⚠️ ບໍ່ສາມາດເປີດໄມໂຄຣໂຟນໄດ້! \nກະລຸນາກວດສອບວ່າທ່ານໄດ້ກົດອະນຸຍາດ (Allow) ແລ້ວຫຼືຍັງ.');
    }
}

    // Fallback: MediaRecorder-based recording (for iOS / browsers without Web Speech API)
    if (isRecordingFallback) {
        // stop recording
        if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
        return;
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // start MediaRecorder
        recordedChunks = [];
        const recorderOptions = supportedRecorderMimeType ? { mimeType: supportedRecorderMimeType } : {};
        mediaRecorder = new MediaRecorder(stream, recorderOptions);
        console.log('MediaRecorder mimeType:', supportedRecorderMimeType);

        mediaRecorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) recordedChunks.push(e.data);
        };

        mediaRecorder.onstart = () => {
            isRecordingFallback = true;
            micBtn.classList.add('recording');
        };

        mediaRecorder.onstop = async () => {
            isRecordingFallback = false;
            micBtn.classList.remove('recording');
            // stop local tracks
            stream.getTracks().forEach(t => t.stop());
            // upload blob to server for transcription
            const blobType = recordedChunks.length ? recordedChunks[0].type : supportedRecorderMimeType || 'audio/webm';
            const fileExtension = blobType.includes('mp4') ? 'mp4' : blobType.includes('aac') ? 'aac' : blobType.includes('webm') ? 'webm' : recorderFileExtension;
            const blob = new Blob(recordedChunks, { type: blobType });
            try {
                const form = new FormData();
                form.append('action', 'transcribeAudio');
                form.append('file', blob, `recording.${fileExtension}`);
                const resp = await fetch(CHATBOT_CONFIG.API_URL, {
                    method: 'POST',
                    body: form
                });
                const result = await resp.json();
                if (result && result.transcript) {
                    userInput.value = result.transcript;
                    sendMessage();
                } else if (result && result.error) {
                    appendMessage('⚠️ ບໍ່ສາມາດຖືກແປງສຽງ: ' + result.error, 'bot-message');
                } else {
                    appendMessage('⚠️ ການແປພາສາບໍ່ສຳເລັດ', 'bot-message');
                }
            } catch (uploadErr) {
                console.error('Upload/transcribe failed', uploadErr);
                appendMessage('🌐 ບໍ່ສາມາດອັບໂຫຼດສຽງໄດ້', 'bot-message');
            }
        };

        mediaRecorder.start();
        // optional: auto-stop after 12s to avoid very long recordings
        setTimeout(() => {
            if (mediaRecorder && mediaRecorder.state === 'recording') mediaRecorder.stop();
        }, 12000);

    } catch (err) {
        console.error('MediaRecorder/permission error', err);
        alert('⚠️ ບໍ່ສາມາດເປີດໄມໂຄຣໂຟນໄດ້! \nກະລຸນາກວດສອບວ່າທ່ານໄດ້ກົດອະນຸຍາດ (Allow) ແລ້ວຫຼືຍັງ.');
    }


function pickBestVoice() {
    const voices = availableVoices.length ? availableVoices : (window.speechSynthesis.getVoices() || []);
    if (!voices.length) return null;

    const exactLao = voices.find(v => (v.lang || '').toLowerCase() === 'lo-la');
    if (exactLao) return exactLao;

    const laoFamily = voices.find(v => (v.lang || '').toLowerCase().startsWith('lo'));
    return laoFamily || null;
}

function speakText(text) {
    if (!('speechSynthesis' in window)) return;
    if (!autoSpeakToggle.checked) return;
    window.speechSynthesis.cancel(); // หยุดเสียงเก่าก่อน

    // ลบสัญลักษณ์พิเศษออกเพื่อให้ AI อ่านลื่นขึ้น
    const cleanText = text.replace(/[\*\#\_]/g, "");
    const utterance = new SpeechSynthesisUtterance(cleanText);

    refreshVoices();
    const selectedVoice = pickBestVoice();

    if (selectedVoice) {
        utterance.voice = selectedVoice;
        utterance.lang = selectedVoice.lang;
        console.log("เลือกใช้เสียง: " + selectedVoice.name);
    } else {
        // Lao-only mode: do not fallback to Thai/English voice
        if (!hasWarnedNoLaoVoice) {
            hasWarnedNoLaoVoice = true;
            console.warn('No Lao voice (lo-LA) installed in this browser. Lao-only speech is disabled until a Lao voice is installed.');
        }
        return;
    }

    utterance.rate = 0.9; // ลดความเร็วลงนิดนึงเพื่อให้ฟังภาษาลาวจากเสียงไทยได้ชัดขึ้น
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
    window.speechSynthesis.addEventListener('voiceschanged', () => {
        refreshVoices();
    });
}
function removeMessage(id) { const el = document.getElementById(id); if (el) el.remove(); }
function toggleInput(enable) { userInput.disabled = !enable; sendBtn.disabled = !enable; if(enable) userInput.focus(); }