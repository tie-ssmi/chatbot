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
                    appendMessage(item.answer, 'bot-message', null, true);
                } else {
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
            const formattedReply = data.reply.replace(/\n/g, '<br>');
            appendMessage(formattedReply, 'bot-message', null, true);
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

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition;
let isRecording = false;

if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.lang = CHATBOT_CONFIG.LANGUAGE;
    recognition.onstart = () => { isRecording = true; micBtn.classList.add('recording'); };
    recognition.onresult = (event) => { userInput.value = event.results[0][0].transcript; sendMessage(); };
    recognition.onend = () => { isRecording = false; micBtn.classList.remove('recording'); };
}

function toggleMic() {
    if (!recognition) return alert("Browser ບໍ່ຮອງຮັບ");
    isRecording ? recognition.stop() : recognition.start();
}

function speakText(text) {
    if (!autoSpeakToggle.checked) return;
    window.speechSynthesis.cancel(); // หยุดเสียงเก่าก่อน

    // 1. ลบสัญลักษณ์พิเศษออก
    const cleanText = text.replace(/[\*\#\_]/g, "");
    
    // 2. 🌟 ทริคพระเอก: แปลงอักษรลาว -> ไทย (เพื่อหลอกให้ AI ไทยอ่านออก)
    let speechText = "";
    for (let i = 0; i < cleanText.length; i++) {
        let code = cleanText.charCodeAt(i);
        // เช็คว่าถ้าเป็นตัวอักษรลาว (รหัส Unicode 0x0E80 ถึง 0x0EFF หรือ 3712 ถึง 3839)
        if (code >= 3712 && code <= 3839) {
            // ลบค่าด้วย 128 มันจะกลายเป็นตัวอักษรไทยตัวนั้นเป๊ะๆ (เช่น ກ -> ก)
            speechText += String.fromCharCode(code - 128); 
        } else {
            speechText += cleanText[i]; // ตัวเลขอังกฤษปล่อยผ่าน
        }
    }

    // 3. ส่งข้อความที่แปลงร่างแล้วไปให้ AI อ่าน
    const utterance = new SpeechSynthesisUtterance(speechText);
    
    // ดึงรายชื่อเสียงทั้งหมดที่มีในเครื่อง
    const voices = window.speechSynthesis.getVoices();
    
    // บังคับหาเสียงภาษาไทย (เพราะเราแปลง Text เป็นไทยแล้ว)
    let selectedVoice = voices.find(v => v.lang.includes('th') || v.lang.includes('TH'));

    if (selectedVoice) {
        utterance.voice = selectedVoice;
        utterance.lang = selectedVoice.lang;
    } else {
        utterance.lang = 'th-TH'; 
    }

    // ปรับความเร็วให้ช้าลงนิดนึง (0.85) จะทำให้สำเนียงฟังดูใกล้เคียงคนลาวพูดมากขึ้น
    utterance.rate = 0.85; 
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

window.speechSynthesis.onvoiceschanged = () => { window.speechSynthesis.getVoices(); };
function removeMessage(id) { const el = document.getElementById(id); if (el) el.remove(); }
function toggleInput(enable) { userInput.disabled = !enable; sendBtn.disabled = !enable; if(enable) userInput.focus(); }