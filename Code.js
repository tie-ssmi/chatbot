var GEMINI_API_KEYS = [
  "AIzaSyD-EXAMPLE-KEY-1",
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

      // 3.1 Fetch shared context
      var knowledgeContext = getKnowledgeContext();

      if (!knowledgeContext) {
        return createJsonResponse({ error: "ບໍ່ສາມາດອ່ານຂໍ້ມູນຈາກລະບົບເອກະສານໄດ້ (ໄຟລ໌ອາດຈະໃຫຍ່ເກີນໄປ ຫຼື ບໍ່ພົບໄຟລ໌)" });
      }

      // 3.2 Prefer lightweight client-side history
      var historyContext = buildHistoryTextFromClient(clientHistory);
      if (!historyContext) {
        historyContext = getRecentHistoryText(userId);
      }

      // 3.3 Define AI Role 
      var systemPrompt = `You are an AI HR assistant for the organization SSMI (Sinsap Muang Neua). You are currently speaking with an employee named: ${userName}.
Your main responsibility is to answer employee questions regarding regulations, policies, benefits, and the organizational structure.

Your most important rules are:
1. You must answer questions based only on the information provided in the given context.
2. If a question cannot be answered using the provided context, respond with: "Sorry, I do not have information on this topic. Please contact the HR department for further assistance."
3. You must not generate or assume any information (No hallucination under any circumstances).
4. You must respond in clear, polite, and professional Lao language.
5. CRITICAL: If the user uploads an image (such as a receipt, form, or document), you MUST act as an expert document scanner (OCR). Carefully read and extract ALL visible text, tables, numbers, and details within the image. Then, use that extracted information to match with the HR regulations to answer the user's question accurately.`;
      
      // 3.4 Assemble Final Prompt
      var finalPrompt = "Context ຂໍ້ມູນລະບຽບການທັງໝົດ: \n" + knowledgeContext + "\n\n";

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

      // 🌟 ย้ายระบบเซฟรูปลง Drive มาไว้ตรงนี้ (ให้เซฟทันที ไม่ต้องรอ AI)
      var imageUrl = "";
      if (requestData.imageBase64 && requestData.imageMimeType) {
        imageUrl = saveImageToDrive(requestData.imageBase64, requestData.imageMimeType, userId);
      }

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

      var options = {
        "method": "post",
        "contentType": "application/json",
        "payload": JSON.stringify(payload),
        "muteHttpExceptions": true
      };

      var aiReply = null;
      var lastError = "";

      var shuffledKeys = GEMINI_API_KEYS.slice().sort(function() { return 0.5 - Math.random() });

      for (var i = 0; i < shuffledKeys.length; i++) {
        var url = "https://generativelanguage.googleapis.com/v1beta/models/" + GEMINI_MODEL + ":generateContent?key=" + shuffledKeys[i];
        var response = UrlFetchApp.fetch(url, options);
        var responseData = JSON.parse(response.getContentText());

        if (responseData.candidates && responseData.candidates.length > 0) {
          aiReply = responseData.candidates[0].content.parts[0].text;
          break; 
        } else {
          lastError = JSON.stringify(responseData);
        }
      }

      // 3.6 Log and Return
      if (aiReply) {
        logToSheet(userId, userName, userMessage, aiReply, "Success", imageUrl); 
        return createJsonResponse({ reply: aiReply });
      } else {
        logToSheet(userId, userName, userMessage, lastError, "Error", imageUrl);
        return createJsonResponse({ error: "AI ບໍ່ສາມາດສ້າງຄຳຕອບໄດ້ໃນຕອນນີ້. (API ອາດຈະຕິດລິມິດ)" });
      }
    }
  } catch (err) {
    return createJsonResponse({ error: "ເກີດຂໍ້ຜິດພາດ: " + err.toString() });
  }
}

// ==========================================
// 2. Login Check
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
// 3. Log History to Sheets
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
// 4. Read Google Docs
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
// 5. Read Text File from Drive
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
// 6. Utility Functions (History & JSON)
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
// 7. Combine Knowledge Context (Docs + Txt Only)
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
    // 🌟 คาย Error ออกมาให้รู้กันไปเลยว่าพังเพราะอะไร!
    return "ERROR_SAVE_IMAGE: " + e.toString();
  }
}

// 🌟 ฟังก์ชันตัวล่อเวอร์ชันใหม่ (บังคับขอสิทธิ์สร้างไฟล์)
function authorizeDrive() {
  DriveApp.createFile("test_permission.txt", "ทดสอบขอสิทธิ์"); 
}