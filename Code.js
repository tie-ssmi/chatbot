var GEMINI_API_KEYS = [
  "*****"
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
      
      var lowMsg = userMessage.toLowerCase().trim();
      var quickReply = null;
      if (/^h+e+l+o+$|^hi+$|ສະບາຍດີ|สบายดี|sabaidee/i.test(lowMsg)) {
        quickReply = "ສະບາຍດີ! ຂ້ອຍແມ່ນ ນ້ອງໄຂ່ ຜູ້ຊ່ວຍ HR ຂອງ SSMI, ມີຫຍັງໃຫ້ຊ່ວຍໃນມື້ນີ້ບໍ່?";
      } else if (/thank\s*you|^thanks$|^thx$|ຂອບໃຈ/i.test(lowMsg)) {
        quickReply = "ຍິນດີສະເໝີ! ຖ້າມີຄຳຖາມກ່ຽວກັບລະບຽບການ ຫຼື ສະຫວັດດີການ ຖາມນ້ອງໄຂ່ໄດ້ຕະຫຼອດເລີຍເດີ້.";
      }
      
      if (quickReply && (!requestData.files || requestData.files.length === 0)) {
        logToSheet(userId, userName, userMessage, quickReply, "QuickReply", "");
        return createJsonResponse({ reply: quickReply });
      }

      var clientHistory = normalizeClientHistory(requestData.history);
      var cachedContentName = PropertiesService.getScriptProperties().getProperty("GEMINI_CACHE_NAME");

      // 🌟 รับค่าหมวดหมู่ AI ที่พนักงานเลือก
      var selectedCategory = requestData.modelCategory || "hr"; 
      
      // ดึงข้อมูลเฉพาะแท็บที่เลือก (ปิดระบบ Cache เดิมไปก่อน เพราะข้อมูลสั้นลงมากแล้ว)
      var knowledgeContext = getKnowledgeByCategory(selectedCategory);
      if (!knowledgeContext) return createJsonResponse({ error: "ຂໍອະໄພ, ບໍ່ພົບຂໍ້ມູນລະບຽບໃນໝວດໝູ່ນີ້" });

      var historyContext = buildHistoryTextFromClient(clientHistory);
      if (!historyContext) historyContext = getRecentHistoryText(userId);
      
      if (!cachedContentName) {
         knowledgeContext = getKnowledgeContext();
         if (!knowledgeContext) return createJsonResponse({ error: "ບໍ່ສາມາດອ່ານຂໍ້ມູນຈາກລະບົບເອກະສານໄດ້" });
      }

      var historyContext = buildHistoryTextFromClient(clientHistory);
      if (!historyContext) historyContext = getRecentHistoryText(userId);

      var systemPrompt = `You are an AI HR assistant and Expert Document Auditor for the organization SSMI (Sinsap Muang Neua). Your name is "ນ້ອງໄຂ່" (Nong Khai). You are speaking with: ${userName}.

Your strict rules:
1. HR Questions: Answer based ONLY on the provided context.
2. Missing Info: If unknown, say: "ຂໍອະໄພ, ນ້ອງໄຂ່ບໍ່ມີຂໍ້ມູນໃນສ່ວນນີ້..."
3. No Hallucination.
4. Language: Respond in clear, polite Lao language.

--- CONVERSATIONAL RULES ---
5. Greetings: Greet back naturally.
6. Compliments: Accept politely.
7. Small Talk: Respond naturally but keep it brief.
CRITICAL: Work/regulation questions are NOT small talk.

--- AUDITOR & MULTIMODAL RULES ---
8. If the user uploads multiple documents:
   - Act as an extremely strict and expert company auditor.
   - Cross-check ALL values, names, account numbers, and totals across the uploaded documents.
   - Compare the findings with the HR/Company Regulations in your context.
   - Summarize your findings using bullet points. Point out any discrepancies (ຂໍ້ຜິດພາດ), and state whether it is approved/correct.
   - CRITICAL: Keep your summary CONCISE and straight to the point (ສະຫຼຸບໃຫ້ສັ້ນ, ກະຊັບ, ແລະ ເຂົ້າໃຈງ່າຍ). You MUST ensure your response is fully complete and NEVER cut off mid-sentence.`;

      var finalPrompt = "";
      if (!cachedContentName) finalPrompt += "Context ຂໍ້ມູນລະບຽບການທັງໝົດ: \n" + knowledgeContext + "\n\n";
      if (historyContext !== "") finalPrompt += historyContext;
      finalPrompt += "ຄຳຖາມປັດຈຸບັນຈາກພະນັກງານ: " + userMessage;

      if (requestData.files && requestData.files.length > 0) {
         finalPrompt += "\n\n[System Note: ພະນັກງານໄດ້ແນບເອກະສານມາ " + requestData.files.length + " ສະບັບ (ລວມທັງ PDF). ຈົ່ງອ່ານ, ປຽບທຽບຂໍ້ມູນຂ້າມເອກະສານ ແລະ ກວດສອບກັບລະບຽບການຢ່າງເຂັ້ມງວດ.]";
      }

      var partsArray = [{ "text": finalPrompt }];
      var savedFileUrls = []; 

      // 🌟 วนลูปยัดไฟล์ให้ AI และเซฟลง Drive
      if (requestData.files && requestData.files.length > 0) {
        for (var i = 0; i < requestData.files.length; i++) {
          partsArray.push({
            "inlineData": {
              "mimeType": requestData.files[i].mimeType,
              "data": requestData.files[i].base64
            }
          });
          
          var fileUrl = saveFileToDrive(requestData.files[i].base64, requestData.files[i].mimeType, userId, i);
          savedFileUrls.push(fileUrl);
        }
      }

      var payload = {
        "contents": [{ "role": "user", "parts": partsArray }],
        "systemInstruction": { "parts": [{ "text": systemPrompt }] },
        "generationConfig": { "temperature": 0.2, "maxOutputTokens": 8000 }
      };

      if (cachedContentName) payload.cachedContent = cachedContentName;

      var options = {
        "method": "post",
        "contentType": "application/json",
        "payload": JSON.stringify(payload),
        "muteHttpExceptions": true
      };

      var activeApiKey = GEMINI_API_KEYS[0];
      var url = "https://generativelanguage.googleapis.com/v1beta/models/" + GEMINI_MODEL + ":generateContent?key=" + activeApiKey;
      var response = UrlFetchApp.fetch(url, options);
      var responseData = JSON.parse(response.getContentText());

      var aiReply = null;
      var lastError = "";

      if (responseData.candidates && responseData.candidates.length > 0) {
        aiReply = responseData.candidates[0].content.parts[0].text;
      } else {
        lastError = JSON.stringify(responseData);
      }

      // นำลิงก์ที่เซฟได้มาเว้นบรรทัด เพื่อเก็บลงชีท
      var logFileUrls = savedFileUrls.length > 0 ? savedFileUrls.join(" \n ") : "";

      if (aiReply) {
        logToSheet(userId, userName, userMessage, aiReply, "Success", logFileUrls); 
        return createJsonResponse({ reply: aiReply });
      } else {
        logToSheet(userId, userName, userMessage, lastError, "Error", logFileUrls);
        return createJsonResponse({ error: "AI ບໍ່ສາມາດສ້າງຄຳຕອບໄດ້: " + lastError.substring(0, 50) });
      }
    }
  } catch (err) {
    return createJsonResponse({ error: "ເກີດຂໍ້ຜິດພາດ: " + err.toString() });
  }
}

// ==========================================
// 🌟 ฟังก์ชันเซฟไฟล์ลง Google Drive (ต้องมีอันนี้นะครับ)
// ==========================================
function saveFileToDrive(base64, mimeType, userId, index) {
  try {
    var folder = DriveApp.getFolderById(IMAGE_FOLDER_ID);
    
    var ext = "";
    if (mimeType.includes("pdf")) ext = ".pdf";
    else if (mimeType.includes("jpeg") || mimeType.includes("jpg")) ext = ".jpg";
    else if (mimeType.includes("png")) ext = ".png";

    var fileName = "DOC_" + userId + "_" + new Date().getTime() + "_" + index + ext;
    var blob = Utilities.newBlob(Utilities.base64Decode(base64), mimeType, fileName);
    var file = folder.createFile(blob);
    
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    if (mimeType.includes("image")) {
      return "https://drive.google.com/thumbnail?id=" + file.getId() + "&sz=w2000";
    } else {
      return file.getUrl(); 
    }
  } catch (e) {
    return "ERROR: " + e.toString();
  }
}

// ==========================================
// 🌟 2. ระบบจัดการ Gemini Context Cache
// ==========================================
function setupGeminiCache() {
  var knowledgeText = getKnowledgeContext(); 
  if (!knowledgeText) return Logger.log("ไม่สามารถอ่านข้อมูลจาก Docs/Txt ได้");

  var url = "https://generativelanguage.googleapis.com/v1beta/cachedContents?key=" + GEMINI_API_KEYS[0];
  var payload = {
    "model": "models/" + GEMINI_MODEL,
    "contents": [{ "role": "user", "parts": [{ "text": "Context ຂໍ້ມູນລະບຽບການທັງໝົດ: \n" + knowledgeText }] }],
    "ttl": "86400s"
  };
  var options = { "method": "post", "contentType": "application/json", "payload": JSON.stringify(payload), "muteHttpExceptions": true };
  var response = UrlFetchApp.fetch(url, options);
  var result = JSON.parse(response.getContentText());
  if (result.name) {
    PropertiesService.getScriptProperties().setProperty("GEMINI_CACHE_NAME", result.name);
    Logger.log("✅ สร้าง Cache สำเร็จ! ชื่อ: " + result.name);
  } else {
    Logger.log("❌ เกิดข้อผิดพลาด: " + response.getContentText());
  }
}

function extendGeminiCacheLife() {
  var cacheName = PropertiesService.getScriptProperties().getProperty("GEMINI_CACHE_NAME");
  if (!cacheName) return setupGeminiCache();
  
  var url = "https://generativelanguage.googleapis.com/v1beta/" + cacheName + "?key=" + GEMINI_API_KEYS[0];
  var payload = { "ttl": "86400s" }; 
  var options = { "method": "patch", "contentType": "application/json", "payload": JSON.stringify(payload), "muteHttpExceptions": true };
  var response = UrlFetchApp.fetch(url, options);
  if (response.getResponseCode() === 200) Logger.log("✅ ต่ออายุ Cache เรียบร้อย");
  else setupGeminiCache();
}

function deleteGeminiCache() {
  var cacheName = PropertiesService.getScriptProperties().getProperty("GEMINI_CACHE_NAME");
  if (!cacheName) return;
  var url = "https://generativelanguage.googleapis.com/v1beta/" + cacheName + "?key=" + GEMINI_API_KEYS[0];
  UrlFetchApp.fetch(url, { "method": "delete", "muteHttpExceptions": true });
  PropertiesService.getScriptProperties().deleteProperty("GEMINI_CACHE_NAME");
  Logger.log("🗑️ ลบ Cache ทิ้งเรียบร้อยแล้ว");
}

// ==========================================
// 3. Utility Functions 
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
  } catch (e) { return createJsonResponse({ success: false, message: "Error: " + e.toString() }); }
}

function logToSheet(userId, userName, question, answer, status, imageUrl) { 
  try {
    var sheet = SpreadsheetApp.openById(GOOGLE_SHEET_ID).getSheetByName(LOG_SHEET_NAME);
    if(sheet) sheet.appendRow([new Date(), userId, userName, question, answer, status, imageUrl || ""]);
  } catch (e) {}
}

function getKnowledgeByCategory(category) {
  var cache = CacheService.getScriptCache();
  var cacheKey = "DOC_TAB_" + category;
  var cachedData = cache.get(cacheKey);
  if (cachedData) return cachedData; // ถ้ามีในความจำระยะสั้น ดึงมาตอบเลย

  try {
    // 🌟 Map ชื่อภาษาอังกฤษ กับ ชื่อแท็บภาษาลาวให้ตรงเป๊ะ
    var tabMapping = {
      "hr": "ລະບຽບວ່າດ້ວຍພະນັກງານ ແລະ ການບໍລິຫານບຸກຄະລາກອນ",
      "expense": "ລະບຽບວ່າດ້ວຍການຄຸ້ມຄອງລາຍຈ່າຍ ແລະ ການລົງບັນຊີ",
      "loan_gov": "ລະບຽບວ່າດ້ວຍສິນເຊື່ອ ລັດຖະກອນ",
      "loan_sec": "ລະບຽບວ່າດ້ວຍສິນເຊື່ອ ຫຼັກຊັບຄ້ຳປະກັນ",
      "deposit": "ລະບຽບວ່າດ້ວຍເງິນຝາກ"
    };

    var targetTabTitle = tabMapping[category];
    if (!targetTabTitle) targetTabTitle = tabMapping["hr"]; // Default
    
    var doc = DocumentApp.openById(GOOGLE_DOC_ID);
    var allTabs = doc.getTabs(); 
    var extractedText = "";

    // วนลูปหาแท็บที่ชื่อตรงกับที่เลือก
    function findAndExtractTab(tabs) {
      for (var i = 0; i < tabs.length; i++) {
        var tab = tabs[i];
        if (tab.getTitle().trim() === targetTabTitle.trim()) {
          // เจอแท็บเป้าหมายแล้ว! สั่งดูดข้อความทั้งหมดออกมา
           try { extractedText = "--- [ໝວດໝູ່: " + tab.getTitle() + "] ---\n" + tab.asDocumentTab().getBody().getText() + "\n\n"; } catch (err) {}
           return true; // หยุดค้นหาทันที
        }
        var childTabs = tab.getChildTabs();
        if (childTabs && childTabs.length > 0) {
           if (findAndExtractTab(childTabs)) return true;
        }
      }
      return false;
    }

    findAndExtractTab(allTabs); 
    
    // บันทึกลงหน่วยความจำระยะสั้นของ Apps Script (1 ชั่วโมง)
    if (extractedText !== "") {
      try { cache.put(cacheKey, extractedText, 3600); } catch(e) {}
    }
    
    return extractedText;
  } catch (e) { 
    return "Error reading document: " + e.toString(); 
  }
}

function readGoogleTxtContent() {
  var cache = CacheService.getScriptCache();
  var cachedTxt = cache.get("HR_TXT_V2");
  if (cachedTxt) return cachedTxt; 
  try {
    var file = DriveApp.getFileById(GOOGLE_TXT_ID);
    var txtContent = file.getBlob().getDataAsString();
    var finalTxtContext = "--- [ຂໍ້ມູນເພີ່ມເຕີມຈາກ TXT File] ---\n" + txtContent;
    try { cache.put("HR_TXT_V2", finalTxtContext, 21600); } catch(e) {}
    return finalTxtContext;
  } catch (e) { return ""; }
}

function getChatHistory(userId) {
  try {
    var sheet = SpreadsheetApp.openById(GOOGLE_SHEET_ID).getSheetByName(LOG_SHEET_NAME);
    if (!sheet) return createJsonResponse({ history: [] });
    var data = getRecentLogRows(sheet, 1200, 7); 
    var history = [];
    for (var i = data.length - 1; i >= 1 && history.length < 15; i--) {
      if (data[i][1].toString() === userId) {
        history.unshift({ question: data[i][3], answer: data[i][4], imageUrl: data[i][6] && data[i][6].toString().startsWith("http") ? data[i][6].toString() : "" });
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
      if (data[i][1].toString() === userId && !data[i][4].toString().includes("API Error")) {
        tempHistory.unshift("ພະນັກງານ: " + data[i][3] + "\nAI: " + data[i][4]);
        if (tempHistory.length >= 4) break; 
      }
    }
    return tempHistory.length > 0 ? "--- ປະຫວັດການສົນທະນາຫຼ້າສຸດ ---\n" + tempHistory.join("\n\n") + "\n\n" : "";
  } catch (e) { return ""; }
}

function createJsonResponse(dataObject) {
  return ContentService.createTextOutput(JSON.stringify(dataObject)).setMimeType(ContentService.MimeType.JSON);
}

function getKnowledgeContext() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get("HR_KNOWLEDGE_V4");
  if (cached) return cached;
  var fallback = readGoogleDocContent() + "\n\n" + readGoogleTxtContent();
  try { cache.put("HR_KNOWLEDGE_V4", fallback, 21600); } catch(e) {}
  return fallback;
}

function normalizeClientHistory(history) {
  if (!history || !Array.isArray(history)) return [];
  var clean = [];
  for (var i = 0; i < history.length; i++) {
    var item = history[i];
    if (!item) continue;
    var role = (item.role || "").toLowerCase();
    var message = (item.message || "").trim();
    if ((role === "user" || role === "assistant") && message !== "") clean.push({ role: role, message: message });
  }
  return clean.length > 12 ? clean.slice(clean.length - 12) : clean;
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
  return sheet.getRange(startRow, 1, lastRow - startRow + 1, columnCount).getValues();
}