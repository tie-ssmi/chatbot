var GEMINI_API_KEY = "AIzaSyASzdzrmN3xqhGwM87X0WqsHZ5enCFuBC0"; 
var GOOGLE_DOC_ID = "1cObuEeUbwHTpA05WoHQVymlDMVr-ZR0KVzLjSsWkvC0";
var GOOGLE_SHEET_ID = "1Ipsf6-ryft-AhsyhUhGa3hT7dlDbH7rO2Eu_E8HJX1A";
var GEMINI_MODEL = "gemini-2.5-flash";
var USER_SHEET_NAME = "Users"; 
var LOG_SHEET_NAME = "Logs";   

// ==========================================
// 1. ฟังก์ชันหลัก (รับคำสั่งจากเว็บ)
// ==========================================
function doPost(e) {
  try {
    var requestData = JSON.parse(e.postData.contents);
    var action = requestData.action; 

    // --- ส่วนที่ 1: จัดการการ Login ---
    if (action === "login") {
      return handleLogin(requestData.username, requestData.password);
    }

    // --- ส่วนที่ 2: ดึงประวัติโหลดหน้าแชทครั้งแรก ---
    if (action === "getHistory") { 
      return getChatHistory(requestData.userId); 
    }

    // --- ส่วนที่ 3: จัดการการ Chat ---
    if (action === "chat") {
      var userMessage = requestData.message;
      var userId = requestData.userId || "Unknown";
      var userName = requestData.userName || "ພະນັກງານ";

      // 3.1 อ่านสมอง (Google Docs) - ดึงมาทั้งเล่มเลย เพราะ AI อ่านไหว!
      var docContext = readGoogleDocContent();
      if (!docContext) {
        return createJsonResponse({ error: "ບໍ່ສາມາດອ່ານຂໍ້ມູນຈາກ Google Docs ໄດ້" });
      }

      // 3.2 ดึงประวัติการคุยล่าสุด เพื่อให้ AI จำบริบทต่อเนื่องได้
      var historyContext = getRecentHistoryText(userId);

      // 3.3 กำหนดบทบาท AI
      var systemPrompt = `ເຈົ້າແມ່ນ AI ຜູ້ຊ່ວຍ HR ຂອງອົງກອນ SSMI (ສິນຊັບເມືອງເໜືອ). ຕອນນີ້ເຈົ້າກຳລັງລົມກັບພະນັກງານຊື່: ${userName}.
ໜ້າທີ່ຫຼັກຂອງເຈົ້າແມ່ນການຕອບຄຳຖາມຂອງພະນັກງານ ກ່ຽວກັບລະບຽບການ, ນະໂຍບາຍ ແລະ ສະຫວັດດີການຕ່າງໆ.
ກົດລະບຽບທີ່ສຳຄັນທີ່ສຸດຂອງເຈົ້າ:
1. ເຈົ້າຕ້ອງຕອບຄຳຖາມໂດຍອີງໃສ່ຂໍ້ມູນໃນ Context ທີ່ໃຫ້ມາເທົ່ານັ້ນ.
2. ຖ້າຄຳຖາມໃດທີ່ບໍ່ມີຂໍ້ມູນໃນ Context, ໃຫ້ຕອບວ່າ "ຂໍອະໄພ, ຂ້ອຍບໍ່ມີຂໍ້ມູນໃນສ່ວນນີ້. ກະລຸນາຕິດຕໍ່ພະແນກ HR ເພື່ອສອບຖາມເພີ່ມເຕີມ."
3. ຫ້າມຄິດຄຳຕອບຂຶ້ນມາເອງ (No Hallucination) ເດັດຂາດ.
4. ຕ້ອງຕອບເປັນ "ພາສາລາວ" (Lao language) ເທົ່ານັ້ນ, ໃຫ້ໃຊ້ຄຳສັບທີ່ສຸພາບ, ເປັນທາງການແຕ່ເຂົ້າໃຈງ່າຍ.`;

      // 3.4 ประกอบร่าง Prompt รวม (เอาเอกสารทั้งเล่ม + ประวัติเก่า + คำถามใหม่ ยัดรวมกัน)
      var finalPrompt = "Context ຂໍ້ມູນລະບຽບການທັງໝົດ: \n" + docContext + "\n\n";
      if (historyContext !== "") {
         finalPrompt += historyContext;
      }
      finalPrompt += "ຄຳຖາມປັດຈຸບັນຈາກພະນັກງານ: " + userMessage;

      var payload = {
        "contents": [{
          "role": "user",
          "parts": [{ "text": finalPrompt }]
        }],
        "systemInstruction": {
          "parts": [{ "text": systemPrompt }]
        },
        "generationConfig": {
          "temperature": 0.2, // ความแม่นยำสูง ไม่มั่ว
          "maxOutputTokens": 1000
        }
      };

      // 3.5 ส่งไปถาม Gemini
      var url = "https://generativelanguage.googleapis.com/v1beta/models/" + GEMINI_MODEL + ":generateContent?key=" + GEMINI_API_KEY;
      var options = {
        "method": "post",
        "contentType": "application/json",
        "payload": JSON.stringify(payload),
        "muteHttpExceptions": true
      };

      var response = UrlFetchApp.fetch(url, options);
      var responseData = JSON.parse(response.getContentText());

      // 3.6 ส่งคำตอบกลับและบันทึก
      if (responseData.candidates && responseData.candidates.length > 0) {
        var aiReply = responseData.candidates[0].content.parts[0].text;
        logToSheet(userId, userName, userMessage, aiReply, "Success"); 
        return createJsonResponse({ reply: aiReply });
      } else {
        var errorMsg = "API Error: " + JSON.stringify(responseData);
        logToSheet(userId, userName, userMessage, errorMsg, "Error");
        return createJsonResponse({ error: "AI ບໍ່ສາມາດສ້າງຄຳຕອບໄດ້ໃນຕອນນີ້. (ອາດຈະຕິດ Quota 15 ຄັ້ງ/ນາທີ, ກະລຸນາລໍຖ້າຈັກໜ້ອຍ)" });
      }
    }

  } catch (err) {
    return createJsonResponse({ error: "ເກີດຂໍ້ຜິດພາດ: " + err.toString() });
  }
}

// ==========================================
// 2. ฟังก์ชันตรวจสอบการ Login
// ==========================================
function handleLogin(username, password) {
  try {
    var sheet = SpreadsheetApp.openById(GOOGLE_SHEET_ID).getSheetByName(USER_SHEET_NAME);
    if (!sheet) return createJsonResponse({ success: false, message: "ບໍ່ພົບ Tab 'Users'" });
    
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) { 
      if (data[i][0].toString() === username && data[i][1].toString() === password) {
        return createJsonResponse({ success: true, userId: data[i][0], userName: data[i][2] });
      }
    }
    return createJsonResponse({ success: false, message: "ລະຫັດພະນັກງານ ຫຼື ລະຫັດຜ່ານບໍ່ຖືກຕ້ອງ" });
  } catch (e) {
    return createJsonResponse({ success: false, message: "Error: " + e.toString() });
  }
}

// ==========================================
// 3. ฟังก์ชันบันทึกประวัติลง Sheets
// ==========================================
function logToSheet(userId, userName, question, answer, status) {
  try {
    var sheet = SpreadsheetApp.openById(GOOGLE_SHEET_ID).getSheetByName(LOG_SHEET_NAME);
    if(sheet) {
      sheet.appendRow([new Date(), userId, userName, question, answer, status]);
    }
  } catch (e) {}
}

// ==========================================
// 4. ฟังก์ชันอ่านเอกสาร Google Docs (แบบมี Cache V3)
// ==========================================
function readGoogleDocContent() {
  var cache = CacheService.getScriptCache();
  var cacheKey = "HR_DOC_V3"; // อัปเดต Cache เป็น V3 เพื่อล้างความจำผิดๆ ทิ้งไป
  var cachedDoc = cache.get(cacheKey);

  if (cachedDoc) return cachedDoc; 

  try {
    var doc = DocumentApp.openById(GOOGLE_DOC_ID);
    var allTabs = doc.getTabs(); 
    var fullText = "";

    function extractTextFromTabs(tabs) {
      for (var i = 0; i < tabs.length; i++) {
        var tab = tabs[i];
        if (tab.getType() === DocumentApp.TabType.DOCUMENT_TAB) {
           try {
             fullText += "--- [ໝວດໝູ່/Tab: " + tab.getTitle() + "] ---\n";
             fullText += tab.asDocumentTab().getBody().getText() + "\n\n";
           } catch (err) {}
        }
        var childTabs = tab.getChildTabs();
        if (childTabs && childTabs.length > 0) extractTextFromTabs(childTabs); 
      }
    }
    extractTextFromTabs(allTabs); 
    
    // พยายามเก็บลง Cache (เก็บได้สูงสุด 100KB)
    try {
      cache.put(cacheKey, fullText, 21600); // เก็บไว้ 6 ชั่วโมง
    } catch(e) {
      // ถ้าเอกสารใหญ่กว่า 100KB มันจะข้ามการจำไปอ่านสดแทน ไม่เป็นไรครับ
    }
    
    return fullText;
  } catch (e) {
    return null;
  }
}

// ==========================================
// 5. ฟังก์ชันดึงประวัติไปโชว์ในเว็บ
// ==========================================
function getChatHistory(userId) {
  try {
    var sheet = SpreadsheetApp.openById(GOOGLE_SHEET_ID).getSheetByName(LOG_SHEET_NAME);
    var data = sheet.getDataRange().getValues();
    var history = [];
    for (var i = data.length - 1; i >= 1 && history.length < 15; i--) {
      if (data[i][1].toString() === userId) {
        history.unshift({ question: data[i][3], answer: data[i][4] });
      }
    }
    return createJsonResponse({ history: history });
  } catch (e) {
    return createJsonResponse({ history: [] });
  }
}

// ==========================================
// 6. ฟังก์ชันดึงประวัติเป็นความจำ AI
// ==========================================
function getRecentHistoryText(userId) {
  try {
    var sheet = SpreadsheetApp.openById(GOOGLE_SHEET_ID).getSheetByName(LOG_SHEET_NAME);
    if(!sheet) return "";
    var data = sheet.getDataRange().getValues();
    var tempHistory = [];

    for (var i = data.length - 1; i >= 1; i--) {
      if (data[i][1].toString() === userId) {
        if (!data[i][4].toString().includes("API Error")) {
           tempHistory.unshift("ພະນັກງານ: " + data[i][3] + "\nAI: " + data[i][4]);
        }
        if (tempHistory.length >= 4) break; 
      }
    }

    if (tempHistory.length > 0) {
      return "--- ປະຫວັດການສົນທະນາຫຼ້າສຸດ ---\n" + tempHistory.join("\n\n") + "\n-----------------------\n\n";
    }
    return "";
  } catch (e) {
    return "";
  }
}

function createJsonResponse(dataObject) {
  return ContentService.createTextOutput(JSON.stringify(dataObject)).setMimeType(ContentService.MimeType.JSON);
}