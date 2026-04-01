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

    // ลบสัญลักษณ์พิเศษออกเพื่อให้ AI อ่านลื่นขึ้น
    const cleanText = text.replace(/[\*\#\_]/g, "");
    const utterance = new SpeechSynthesisUtterance(cleanText);
    
    // ดึงรายชื่อเสียงทั้งหมดที่มีในเครื่อง
    const voices = window.speechSynthesis.getVoices();
    
    // 1. พยายามหาเสียงภาษาลาว (lo-LA)
    let selectedVoice = voices.find(v => v.lang.includes('lo') || v.lang.includes('LO'));
    
    // 2. ถ้าเครื่องไม่มีเสียงลาว (ซึ่งส่วนใหญ่ไม่มี) ให้หาเสียงภาษาไทย (th-TH) แทน
    if (!selectedVoice) {
        // หาเสียงภาษาไทย เช่น Google ภาษาไทย หรือ Microsoft Niwatt
        selectedVoice = voices.find(v => v.lang.includes('th') || v.lang.includes('TH'));
    }

    if (selectedVoice) {
        utterance.voice = selectedVoice;
        utterance.lang = selectedVoice.lang;
        console.log("เลือกใช้เสียง: " + selectedVoice.name);
    } else {
        // ถ้าหาไม่ได้จริงๆ ให้ตั้งค่ากลางไว้
        utterance.lang = 'th-TH'; 
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

window.speechSynthesis.onvoiceschanged = () => { window.speechSynthesis.getVoices(); };
function removeMessage(id) { const el = document.getElementById(id); if (el) el.remove(); }
function toggleInput(enable) { userInput.disabled = !enable; sendBtn.disabled = !enable; if(enable) userInput.focus(); }