var GEMINI_API_KEYS = [
  "AIzaSyAw5pY18otDX98Zj5d9QFWBGCUjLLhS02I",
  "AIzaSyDaWNv1YoKfZNxV0cMTKp_JmQFVKpzFn5M",
  "AIzaSyBjcIdyDKp8UC33OVjImYbIb2jrJX-zSLc",
  "AIzaSyD0jW7EyZco6iRrnLOX5bi15Ji6edf4DPk",
  "AIzaSyAcuP3BIF5oKfJGtn7FmOuNlUel0po16GE",  
  "AIzaSyASzdzrmN3xqhGwM87X0WqsHZ5enCFuBC0", 
  "AIzaSyAW9V1C6bjXgE2EzTpwrr15a4eyYLdW6WE",  
  "AIzaSyBMDQSoAps9l_tW74w0NidFneXft78h1gQ",
  "AIzaSyCiReSFLydaJytmtVr-OxSko2CrsVw6PuU",
  "AIzaSyCsQWiLyQlQBbApf-KVmH1tj7FSDs-hatY",
  "AIzaSyA4cYCKylAkOL1P-KRuA4N34fzoO9HOJEE",
  "AIzaSyCUdXTmWxDtVdg6cyG2j3MlgZTl0VZr9eQ",
  "AIzaSyAZTZjpgmVNDdL0QJHb8vqt0K93x_TAsRY"
];
var GOOGLE_DOC_ID = "1cObuEeUbwHTpA05WoHQVymlDMVr-ZR0KVzLjSsWkvC0";
var GOOGLE_TXT_ID = "1tx6FwdLdDi9Lzl-Ghk780X58XbGm7VLg00"; 
var GOOGLE_SHEET_ID = "1Ipsf6-ryft-AhsyhUhGa3hT7dlDbH7rO2Eu_E8HJX1A";

var IMAGE_FOLDER_ID = "1TxL2wcMH2oLK4l8eMxjbi6FUq-0oL_XH";

var GEMINI_MODEL = "gemini-2.5-flash"; 

var USER_SHEET_NAME = "Users"; 
var LOG_SHEET_NAME = "Logs";   

// ==========================================
// 1. Main Function (Handle Web Requests)
// ==========================================
function doPost(e) {
  try {
    var requestData = JSON.parse(e.postData.contents);
    var action = requestData.action; 

    if (action === "login") return handleLogin(requestData.username, requestData.password);
    if (action === "getHistory") return getChatHistory(requestData.userId); 

    if (action === "chat") {
      var userMessage = requestData.message;
      var userId = requestData.userId || "Unknown";
      var userName = requestData.userName || "ພະນັກງານ";
      var clientHistory = normalizeClientHistory(requestData.history);

      
      // 🌟 3.1 ตรวจสอบว่ามี Cache อยู่หรือไม่
      var cachedContentName = PropertiesService.getScriptProperties().getProperty("GEMINI_CACHE_NAME");
      var knowledgeContext = "";
      
      // ถ้าไม่มี Cache ให้ดึงข้อมูลแบบ Manual เหมือนเดิม
      if (!cachedContentName) {
         knowledgeContext = getKnowledgeContext();
         if (!knowledgeContext) {
           return createJsonResponse({ error: "ບໍ່ສາມາດອ່ານຂໍ້ມູນຈາກລະບົບເອກະສານໄດ້ (ໄຟລ໌ອາດຈະໃຫຍ່ເກີນໄປ ຫຼື ບໍ່ພົບໄຟລ໌)" });
         }
      }

      // 3.2 Prefer lightweight client-side history
      var historyContext = buildHistoryTextFromClient(clientHistory);
      if (!historyContext) {
        historyContext = getRecentHistoryText(userId);
      }
    
      // 3.3 Define AI Role (อัปเดตใหม่ เพิ่มเงื่อนไขการพูดคุยทั่วไป)
      var systemPrompt = `You are an AI HR assistant for the organization SSMI (Sinsap Muang Neua). Your name is "ນ້ອງໄຂ່" (Nong Khai). You are currently speaking with an employee named: ${userName}.
Your main responsibility is to answer employee questions regarding regulations, policies, benefits, and the organizational structure based on the provided context.

Your strict rules:
1. HR Questions: You must answer HR questions based ONLY on the information provided in the context.
2. Missing Info: If an HR question cannot be answered using the provided context, respond politely with: "ຂໍອະໄພ, ນ້ອງໄຂ່ບໍ່ມີຂໍ້ມູນໃນສ່ວນນີ້. ກະລຸນາຕິດຕໍ່ພະແນກ HR ເພື່ອສອບຖາມເພີ່ມເຕີມເດີ້."
3. No Hallucination: You must not generate or assume any organizational information.
4. Language: You must respond in clear, polite, friendly, and professional Lao language.

--- CONVERSATIONAL HANDLING RULES ---
5. Greetings: If the user simply greets you (e.g., ສະບາຍດີ, Hi, Hello), do NOT say you don't have info. Instead, greet them back naturally as Nong Khai and ask how you can help them today.
6. Compliments/Thanks: If the user thanks you, praises you, or says general positive things (e.g., ຂອບໃຈ, ເກັ່ງຫຼາຍ, ຢ້ຽມ, ດີຫຼາຍ), politely accept the compliment or say "You're welcome" naturally.
7. Small Talk/Well-being: If the user asks how you are doing (e.g., ເປັນຈັ່ງໃດ, ສະບາຍດີບໍ່), respond that you are doing well and ready to assist them.

CRITICAL: Carefully distinguish between small talk and actual work questions. For example, if the user asks "ລະບຽບມັນເປັນຈັ່ງໃດ" (How is the regulation?), you MUST treat it as an HR question (Rule 1 & 2), NOT as small talk (Rule 7).

8. Image Processing: If the user uploads an image, act as an expert document scanner (OCR). Extract ALL visible text and use it to answer their question accurately.`;
      
      // 3.4 Assemble Final Prompt
      var finalPrompt = "";
      
      // 🌟 ถ้าไม่มี Cache ถึงจะแนบข้อความยาวๆ ไปด้วย
      if (!cachedContentName) {
         finalPrompt += "Context ຂໍ້ມູນລະບຽບການທັງໝົດ: \n" + knowledgeContext + "\n\n";
      }

      if (historyContext !== "") {
         finalPrompt += historyContext;
      }
      finalPrompt += "ຄຳຖາມປັດຈຸບັນຈາກພະນັກງານ: " + userMessage;

      if (requestData.imageBase64 && requestData.imageMimeType) {
         finalPrompt += "\n\n[System Note: ພະນັກງານໄດ້ແນບຮູບພາບເອກະສານມາພ້ອມ. ຈົ່ງອ່ານຂໍ້ຄວາມ ແລະ ຕົວເລກທັງໝົດໃນຮູບພາບຢ່າງລະອຽດ, ແລ້ວນຳມາປຽບທຽບກັບລະບຽບການເພື່ອຕອບຄຳຖາມ.]";
      }

      var partsArray = [{ "text": finalPrompt }];

      if (requestData.imageBase64 && requestData.imageMimeType) {
        partsArray.push({
          "inlineData": {
            "mimeType": requestData.imageMimeType,
            "data": requestData.imageBase64
          }
        });
      }

      // เซฟรูปลง Drive
      var imageUrl = "";
      if (requestData.imageBase64 && requestData.imageMimeType) {
        imageUrl = saveImageToDrive(requestData.imageBase64, requestData.imageMimeType, userId);
      }

      // 🌟 3.5 ประกอบ Payload ส่งหา Gemini
      var payload = {
        "contents": [{
          "role": "user",
          "parts": partsArray 
        }],
        "systemInstruction": {
          "parts": [{ "text": systemPrompt }]
        },
        "generationConfig": {
          "temperature": 0.2, 
          "maxOutputTokens": 8000 
        }
      };

      // 🌟 ถ้ามี Cache ให้แนบชื่อ Cache ไปด้วย (ประหยัด Token ทันที)
      if (cachedContentName) {
         payload.cachedContent = cachedContentName;
      }

      var options = {
        "method": "post",
        "contentType": "application/json",
        "payload": JSON.stringify(payload),
        "muteHttpExceptions": true
      };

      var aiReply = null;
      var lastError = "";

      // 🌟 ถ้าใช้ Cache บังคับใช้ Key หลัก (Index 0) เพื่อไม่ให้หา Cache ไม่เจอ
      var activeApiKey = cachedContentName ? GEMINI_API_KEYS[0] : GEMINI_API_KEYS[Math.floor(Math.random() * GEMINI_API_KEYS.length)];

      var url = "https://generativelanguage.googleapis.com/v1beta/models/" + GEMINI_MODEL + ":generateContent?key=" + activeApiKey;
      var response = UrlFetchApp.fetch(url, options);
      var responseData = JSON.parse(response.getContentText());

      if (responseData.candidates && responseData.candidates.length > 0) {
        aiReply = responseData.candidates[0].content.parts[0].text;
      } else {
        lastError = JSON.stringify(responseData);
      }

      // 3.6 Log and Return
      if (aiReply) {
        logToSheet(userId, userName, userMessage, aiReply, "Success", imageUrl); 
        return createJsonResponse({ reply: aiReply });
      } else {
        logToSheet(userId, userName, userMessage, lastError, "Error", imageUrl);
        return createJsonResponse({ error: "AI ບໍ່ສາມາດສ້າງຄຳຕອບໄດ້ໃນຕອນນີ້. (API ອາດຈະຕິດລິມິດ) ຂໍ້ມູນ: " + lastError.substring(0, 50) });
      }
    }
  } catch (err) {
    return createJsonResponse({ error: "ເກີດຂໍ້ຜິດພາດ: " + err.toString() });
  }
}

// ==========================================
// 🌟 2. ระบบจัดการ Gemini Context Cache (ฟังก์ชันใหม่)
// ==========================================

// 2.1 รันฟังก์ชันนี้ "ด้วยตัวเอง 1 ครั้ง" เพื่อสร้าง Cache
function setupGeminiCache() {
  var knowledgeText = getKnowledgeContext(); 
  if (!knowledgeText) {
    Logger.log("ไม่สามารถอ่านข้อมูลจาก Docs/Txt ได้ กรุณาตรวจสอบ ID");
    return;
  }

  var url = "https://generativelanguage.googleapis.com/v1beta/cachedContents?key=" + GEMINI_API_KEYS[0];
  
  var payload = {
    "model": "models/" + GEMINI_MODEL,
    "contents": [{
      "role": "user",
      "parts": [{ "text": "Context ຂໍ້ມູນລະບຽບການທັງໝົດ: \n" + knowledgeText }]
    }],
    "ttl": "86400s" // เก็บไว้ 24 ชั่วโมง
  };
  
  var options = {
    "method": "post",
    "contentType": "application/json",
    "payload": JSON.stringify(payload),
    "muteHttpExceptions": true
  };
  
  var response = UrlFetchApp.fetch(url, options);
  var result = JSON.parse(response.getContentText());
  
  if (result.name) {
    PropertiesService.getScriptProperties().setProperty("GEMINI_CACHE_NAME", result.name);
    Logger.log("✅ สร้าง Cache สำเร็จ! ชื่อ: " + result.name);
  } else {
    Logger.log("❌ เกิดข้อผิดพลาดในการสร้าง Cache: " + response.getContentText());
  }
}

// 2.2 ตั้ง Trigger ให้รันฟังก์ชันนี้ "ทุกๆ 12 ชั่วโมง" เพื่อต่ออายุ Cache
function extendGeminiCacheLife() {
  var cacheName = PropertiesService.getScriptProperties().getProperty("GEMINI_CACHE_NAME");
  if (!cacheName) {
    Logger.log("ไม่พบ Cache Name ในระบบ อาจจะต้องรัน setupGeminiCache() ใหม่");
    return;
  }
  
  var url = "https://generativelanguage.googleapis.com/v1beta/" + cacheName + "?key=" + GEMINI_API_KEYS[0];
  var payload = { "ttl": "86400s" }; // ยืดออกไป 24 ชั่วโมง
  var options = {
    "method": "patch",
    "contentType": "application/json",
    "payload": JSON.stringify(payload),
    "muteHttpExceptions": true
  };
  
  var response = UrlFetchApp.fetch(url, options);
  if (response.getResponseCode() === 200) {
    Logger.log("✅ ต่ออายุ Cache เรียบร้อย: " + cacheName);
  } else {
    Logger.log("❌ ต่ออายุไม่สำเร็จ (Cache อาจหมดอายุไปแล้ว): " + response.getContentText());
    // ถ้าต่ออายุไม่สำเร็จ ให้สร้างใหม่เลย
    setupGeminiCache();
  }
}

// 2.3 ฟังก์ชันเอาไว้เคลียร์/ลบ Cache ทิ้ง (เผื่อแก้ไขเอกสาร)
function deleteGeminiCache() {
  var cacheName = PropertiesService.getScriptProperties().getProperty("GEMINI_CACHE_NAME");
  if (!cacheName) return;
  var url = "https://generativelanguage.googleapis.com/v1beta/" + cacheName + "?key=" + GEMINI_API_KEYS[0];
  UrlFetchApp.fetch(url, { "method": "delete", "muteHttpExceptions": true });
  PropertiesService.getScriptProperties().deleteProperty("GEMINI_CACHE_NAME");
  Logger.log("🗑️ ลบ Cache ทิ้งเรียบร้อยแล้ว");
}

// ==========================================
// 3. Login Check
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
// 4. Log History to Sheets
// ==========================================
function logToSheet(userId, userName, question, answer, status, imageUrl) { 
  try {
    var sheet = SpreadsheetApp.openById(GOOGLE_SHEET_ID).getSheetByName(LOG_SHEET_NAME);
    if(sheet) {
      sheet.appendRow([new Date(), userId, userName, question, answer, status, imageUrl || ""]);
    }
  } catch (e) {}
}

// ==========================================
// 5. Read Google Docs
// ==========================================
function readGoogleDocContent() {
  var cache = CacheService.getScriptCache();
  var cacheKey = "HR_DOC_V5"; 
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
    
    try { cache.put(cacheKey, fullText, 21600); } catch(e) {}
    
    return fullText;
  } catch (e) { return ""; }
}

// ==========================================
// 6. Read Text File from Drive
// ==========================================
function readGoogleTxtContent() {
  var cache = CacheService.getScriptCache();
  var cacheKey = "HR_TXT_V2"; 
  var cachedTxt = cache.get(cacheKey);
  if (cachedTxt) return cachedTxt; 

  try {
    var file = DriveApp.getFileById(GOOGLE_TXT_ID);
    var txtContent = file.getBlob().getDataAsString();
    var finalTxtContext = "--- [ຂໍ້ມູນເພີ່ມເຕີມຈາກ TXT File] ---\n" + txtContent;
    
    try { cache.put(cacheKey, finalTxtContext, 21600); } catch(e) {}
    
    return finalTxtContext;
  } catch (e) { return ""; }
}

// ==========================================
// 7. Utility Functions (History & JSON)
// ==========================================
function getChatHistory(userId) {
  try {
    var sheet = SpreadsheetApp.openById(GOOGLE_SHEET_ID).getSheetByName(LOG_SHEET_NAME);
    if (!sheet) return createJsonResponse({ history: [] });
    
    var data = getRecentLogRows(sheet, 1200, 7); 
    
    var history = [];
    for (var i = data.length - 1; i >= 1 && history.length < 15; i--) {
      if (data[i][1].toString() === userId) {
        history.unshift({ 
          question: data[i][3], 
          answer: data[i][4],
          imageUrl: data[i][6] ? data[i][6].toString() : "" 
        });
      }
    }
    return createJsonResponse({ history: history });
  } catch (e) { return createJsonResponse({ history: [] }); }
}

function getRecentHistoryText(userId) {
  try {
    var sheet = SpreadsheetApp.openById(GOOGLE_SHEET_ID).getSheetByName(LOG_SHEET_NAME);
    if(!sheet) return "";
    var data = getRecentLogRows(sheet, 800, 5);
    var tempHistory = [];

    for (var i = data.length - 1; i >= 1; i--) {
      if (data[i][1].toString() === userId) {
        if (!data[i][4].toString().includes("API Error")) {
           tempHistory.unshift("ພະນັກງານ: " + data[i][3] + "\nAI: " + data[i][4]);
        }
        if (tempHistory.length >= 4) break; 
      }
    }
    return tempHistory.length > 0 ? "--- ປະຫວັດການສົນທະນາຫຼ້າສຸດ ---\n" + tempHistory.join("\n\n") + "\n\n" : "";
  } catch (e) { return ""; }
}

function createJsonResponse(dataObject) {
  return ContentService.createTextOutput(JSON.stringify(dataObject)).setMimeType(ContentService.MimeType.JSON);
}

// ==========================================
// 8. Combine Knowledge Context (Docs + Txt Only)
// ==========================================
function getKnowledgeContext() {
  var cache = CacheService.getScriptCache();
  var cacheKey = "HR_KNOWLEDGE_V4"; 
  var cached = cache.get(cacheKey);
  if (cached) return cached;

  var lock = LockService.getScriptLock();
  var acquired = false;
  try {
    acquired = lock.tryLock(5000);
    if (acquired) {
      cached = cache.get(cacheKey);
      if (cached) return cached;

      var docContext = readGoogleDocContent();
      var txtContext = readGoogleTxtContent();

      var combined = "";
      if (docContext && docContext.trim() !== "") {
        combined += docContext + "\n\n";
      }
      if (txtContext && txtContext.trim() !== "") {
        combined += txtContext + "\n\n";
      }

      if (combined.replace(/\s+/g, "").length > 0) {
        try { cache.put(cacheKey, combined, 21600); } catch(e) {}
      }
      return combined;
    }
  } catch (e) {}
  finally {
    if (acquired) {
      try { lock.releaseLock(); } catch (err) {}
    }
  }

  var fallback = readGoogleDocContent() + "\n\n" + readGoogleTxtContent();
  return fallback;
}

function normalizeClientHistory(history) {
  if (!history || !Array.isArray(history)) return [];
  var clean = [];
  for (var i = 0; i < history.length; i++) {
    var item = history[i];
    if (!item) continue;
    var role = item.role || "";
    var message = item.message || "";
    if (typeof role !== "string" || typeof message !== "string") continue;
    role = role.toLowerCase();
    if ((role === "user" || role === "assistant") && message.trim() !== "") {
      clean.push({ role: role, message: message.trim() });
    }
  }
  if (clean.length > 12) {
    clean = clean.slice(clean.length - 12);
  }
  return clean;
}

function buildHistoryTextFromClient(history) {
  if (!history || history.length === 0) return "";
  var lines = [];
  for (var i = 0; i < history.length; i++) {
    var speaker = history[i].role === "assistant" ? "AI" : "ພະນັກງານ";
    lines.push(speaker + ": " + history[i].message);
  }
  return "--- ປະຫວັດການສົນທະນາຫຼ້າສຸດ ---\n" + lines.join("\n") + "\n\n";
}

function getRecentLogRows(sheet, maxRows, columnCount) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [["", "", "", "", ""]];
  var startRow = Math.max(2, lastRow - maxRows + 1);  
  var numRows = lastRow - startRow + 1;
  return sheet.getRange(startRow, 1, numRows, columnCount).getValues();
}

function saveImageToDrive(base64, mimeType, userId) {
  try {
    var folder = DriveApp.getFolderById(IMAGE_FOLDER_ID);
    var fileName = "IMG_" + userId + "_" + new Date().getTime();
    var blob = Utilities.newBlob(Utilities.base64Decode(base64), mimeType, fileName);
    var file = folder.createFile(blob);
    
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    return "https://drive.google.com/thumbnail?id=" + file.getId() + "&sz=w800";
  } catch (e) {
    return "ERROR_SAVE_IMAGE: " + e.toString();
  }
}

function authorizeDrive() {
  DriveApp.createFile("test_permission.txt", "ทดสอบขอสิทธิ์"); 
}