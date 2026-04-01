// ກວດສອບກ່ອນວ່າ ຖ້າເຄີຍລັອກອິນແລ້ວ ໃຫ້ເຕະໄປໜ້າ Chat ເລີຍ
window.onload = function() {
    if (localStorage.getItem('ssmi_user_id')) {
        window.location.href = 'index.html';
    }
};

function handleLoginEnter(event) {
    if (event.key === 'Enter') attemptLogin();
}

async function attemptLogin() {
    const user = document.getElementById('username').value.trim();
    const pass = document.getElementById('password').value.trim();
    const errorMsg = document.getElementById('error-msg');
    const loginBtn = document.getElementById('login-btn');

    if (!user || !pass) {
        showError("ກະລຸນາປ້ອນຂໍ້ມູນໃຫ້ຄົບຖ້ວນ");
        return;
    }

    // ສະແດງສະຖານະກຳລັງໂຫຼດ
    loginBtn.disabled = true;
    loginBtn.innerText = "ກຳລັງກວດສອບ...";
    errorMsg.style.display = 'none';

    try {
        const response = await fetch(CHATBOT_CONFIG.API_URL, {
            method: 'POST',
            body: JSON.stringify({ action: 'login', username: user, password: pass }),
            headers: { 'Content-Type': 'text/plain;charset=utf-8' }
        });

        const data = await response.json();

        if (data.success) {
            // ບັນທຶກຂໍ້ມູນພະນັກງານລົງໃນເຄື່ອງ (Local Storage)
            localStorage.setItem('ssmi_user_id', data.userId);
            localStorage.setItem('ssmi_user_name', data.userName);
            
            // ປ່ຽນໜ້າໄປທີ່ໜ້າ Chat (index.html)
            window.location.href = 'index.html';
        } else {
            showError(data.message || "ລະຫັດບໍ່ຖືກຕ້ອງ");
        }
    } catch (error) {
        showError("ບໍ່ສາມາດເຊື່ອມຕໍ່ລະບົບໄດ້. ກະລຸນາລອງໃໝ່.");
    } finally {
        loginBtn.disabled = false;
        loginBtn.innerText = "ເຂົ້າສູ່ລະບົບ";
    }
}

function showError(msg) {
    const errorMsg = document.getElementById('error-msg');
    errorMsg.innerText = msg;
    errorMsg.style.display = 'block';
}