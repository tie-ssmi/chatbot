var GEMINI_API_KEYS = [
  "***"
];
var GOOGLE_DOC_ID = "1cObuEeUbwHTpA05WoHQVymlDMVr-ZR0KVzLjSsWkvC0";
var GOOGLE_TXT_ID = "1tx6FwdLdDi9Lzl-Ghk780X58XbGm7VLg00"; 
var GOOGLE_SHEET_ID = "1Ipsf6-ryft-AhsyhUhGa3hT7dlDbH7rO2Eu_E8HJX1A";
var IMAGE_FOLDER_ID = "1TxL2wcMH2oLK4l8eMxjbi6FUq-0oL_XH";
var GEMINI_MODEL = "gemini-2.5-pro"; 
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
    // 🌟 เปลี่ยน getHistory ให้รองรับ Session ID
    if (action === "getHistory") return getChatHistory(requestData.userId, requestData.offset, requestData.limit, requestData.sessionId); 
    // 🌟 เพิ่มระบบดึงรายชื่อห้องแชททั้งหมด
    if (action === "checkQuota") {
      var quota = checkUserQuotaLogic(requestData.userId);
      return createJsonResponse({ 
          isLimited: quota.isLimited, 
          message: quota.errorMsg || "",
          timeString: quota.timeString || "",
          remainString: quota.remainString || ""
      });
    }
    if (action === "getThreads") return getChatThreads(requestData.userId);

    if (action === "transcribe") return handleAudioTranscription(requestData.base64Audio, requestData.mimeType);

    if (action === "chat") {
      var userMessage = requestData.message;
      var userId = requestData.userId || "Unknown";
      var userName = requestData.userName || "ພະນັກງານ";
      // 🌟 รับค่า Session ID จากหน้าเว็บ (ถ้าไม่มีให้ใช้ค่าเริ่มต้น)
      var sessionId = requestData.sessionId || "MAIN_SESSION"; 
      
      // ==========================================
      // 🌟 ລະບົບຈຳກັດການຖາມ (Rate Limit) ແບບໃໝ່
      // ==========================================
      var quotaCheck = checkUserQuotaLogic(userId);
      if (quotaCheck.isLimited) {
          return createJsonResponse({ error: quotaCheck.errorMsg });
      } else {
          quotaCheck.history.push(new Date().getTime());
          quotaCheck.cache.put(quotaCheck.limitKey, JSON.stringify(quotaCheck.history), 21600);
      }
      // ==========================================

      var lowMsg = userMessage.toLowerCase().trim();
      var quickReply = null;
      
      // 1. ดักคำทักทาย
      if (/^h+e+l+o+$|^hi+$|ສະບາຍດີ|สบายดี|sabaidee/i.test(lowMsg)) {
        quickReply = "ສະບາຍດີ! ຂ້ອຍແມ່ນ SINA ຜູ້ຊ່ວຍຂອງ SSMI, ມີຫຍັງໃຫ້ຊ່ວຍໃນມື້ນີ້ບໍ່?";
      } 
      // 2. ดักคำขอบคุณ
      else if (/thank\s*you|^thanks$|^thx$|ຂອບໃຈ/i.test(lowMsg)) {
        quickReply = "ຍິນດີສະເໝີ! ຖ້າມີຄຳຖາມກ່ຽວກັບລະບຽບການ ຖາມ SINA ໄດ້ຕະຫຼອດເລີຍເດີ້.";
      }
      // 🌟 3. ดักข้อความสั้นเกินไป (ความยาวไม่เกิน 2 ตัวอักษร)
      else if (lowMsg.length <= 2) {
        quickReply = "ຂໍອະໄພ, ຂໍ້ຄວາມຂອງທ່ານສັ້ນເກີນໄປ. ກະລຸນາພິມຄຳຖາມໃຫ້ຊັດເຈນກວ່ານີ້ ເພື່ອໃຫ້ SINA ສາມາດຄົ້ນຫາລະບຽບການທີ່ຖືກຕ້ອງໃຫ້ໄດ້ເດີ້.";
      }

      if (quickReply && (!requestData.files || requestData.files.length === 0)) {
        logToSheet(userId, userName, userMessage, quickReply, "QuickReply", "", sessionId, 0);
        return createJsonResponse({ reply: quickReply });
      }

      var clientHistory = normalizeClientHistory(requestData.history);
      var selectedCategory = requestData.modelCategory || "hr"; 
      
      var tabMappingLao = {
        "hr": "AI ບຸກຄະລາກອນ (HR)",
        "expense": "AI ບັນຊີ (ຄຸ້ມຄອງລາຍຈ່າຍ)",
        "loan_gov": "AI ສິນເຊື່ອ (ລັດຖະກອນ)",
        "loan_sec": "AI ສິນເຊື່ອ (ຫຼັກຊັບຄ້ຳປະກັນ)",
        "deposit": "AI ເງິນຝາກ"
      };
      var currentAiName = tabMappingLao[selectedCategory] || "AI ບຸກຄະລາກອນ (HR)";

      // 1. ດຶງຂໍ້ມູນທັງຫມົດຈາກ Docs
      var fullKnowledgeContext = getKnowledgeByCategory(selectedCategory);
      if (!fullKnowledgeContext) return createJsonResponse({ error: "ຂໍອະໄພ, ບໍ່ພົບຂໍ້ມູນລະບຽບໃນໝວດໝູ່ນີ້" });

      // 🌟 2. ໃຊ້ລະບົບ RAG ກອງສະເພາະຍ່ອຫົວທີ່ກ່ຽວຂ້ອງ
      var knowledgeContext = extractRelevantContext(fullKnowledgeContext, userMessage);
      if (!knowledgeContext) {
          knowledgeContext = fullKnowledgeContext.substring(0, 3500);
      }

      var historyContext = buildHistoryTextFromClient(clientHistory);
      if (!historyContext) historyContext = getRecentHistoryText(userId, sessionId);

      var systemPrompt = `You are an AI assistant for SSMI named "SINA". You are speaking with: ${userName}.
Currently, the user has selected to speak with the: **${currentAiName}** department.

Your strict rules:
1. Answer based ONLY on the provided context text.
2. NO HALLUCINATION. If the exact answer is not in the text, do not guess.
3. Respond in clear, polite Lao language.

--- 🌟 CROSS-DEPARTMENT ROUTING (CRITICAL) 🌟 ---
4. If the user asks a question that is clearly NOT related to your current department (${currentAiName}) but belongs to another known department (like HR, Expense, Loan, or Deposit), you MUST NOT say "I don't know". 
Instead, politely explain that they are in the wrong menu, and suggest they change the AI model. 
Example response format: "ຄຳຖາມນີ້ເບິ່ງຄືວ່າຈະກ່ຽວຂ້ອງກັບພະແນກອື່ນ. ຕອນນີ້ທ່ານກຳລັງເລືອກໃຊ້ງານ **${currentAiName}** ຢູ່. ກະລຸນາປ່ຽນໂໝດ AI (ຢູ່ເມນູດ້ານເທິງ) ໄປເປັນໂໝດທີ່ກ່ຽວຂ້ອງ ເພື່ອໃຫ້ໄດ້ຄຳຕອບທີ່ຖືກຕ້ອງເດີ້."

--- AUDITOR & MULTIMODAL RULES ---
5. If the user uploads multiple documents, cross-check values across them and compare with the regulations in your context.
6. 🌟 CRITICAL RULE FOR QUOTATIONS (ໃບສະເໜີລາຄາ): If the uploaded documents are Quotations for price comparison, it is NORMAL for them to have DIFFERENT dates and DIFFERENT total amounts. DO NOT flag different amounts or dates as an error. Your job is only to verify that they are quoting for the SAME items/services, and check if the minimum required number of quotations is met according to the rules.
7. Summarize findings concisely using bullet points. Point out any real discrepancies, and state whether it is approved/correct.`;

      var finalPrompt = "Context ຂໍ້ມູນລະບຽບການ: \n" + knowledgeContext + "\n\n";
      if (historyContext !== "") finalPrompt += historyContext;
      finalPrompt += "ຄຳຖາມປັດຈຸບັນຈາກພະນັກງານ: " + userMessage;

      if (requestData.files && requestData.files.length > 0) {
         finalPrompt += "\n\n[System Note: ພະນັກງານໄດ້ແນບເອກະສານມາ. ຈົ່ງອ່ານ, ປຽບທຽບຂໍ້ມູນ ແລະ ກວດສອບກັບລະບຽບການ.]";
      }

      var partsArray = [{ "text": finalPrompt }];
      var savedFileUrls = []; 

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
      var usedTokens = 0;

      if (responseData.candidates && responseData.candidates.length > 0) {
        aiReply = responseData.candidates[0].content.parts[0].text;
        if (responseData.usageMetadata && responseData.usageMetadata.totalTokenCount) {
            usedTokens = responseData.usageMetadata.totalTokenCount;
        }
      } else {
        lastError = JSON.stringify(responseData);
      }

      var logFileUrls = savedFileUrls.length > 0 ? savedFileUrls.join(" \n ") : "";

      if (aiReply) {
        logToSheet(userId, userName, userMessage, aiReply, "Success", logFileUrls, sessionId, usedTokens); 
        return createJsonResponse({ reply: aiReply });
      } else {
        logToSheet(userId, userName, userMessage, lastError, "Error", logFileUrls, sessionId, 0);
        return createJsonResponse({ error: "AI ບໍ່ສາມາດສ້າງຄຳຕອບໄດ້: " + lastError.substring(0, 50) });
      }
    }
  } catch (err) {
    return createJsonResponse({ error: "ເກີດຂໍ້ຜິດພາດ: " + err.toString() });
  }
}

// ==========================================
// 🌟 2. Database & Utils (เพิ่มระบบ Session ID)
// ==========================================
// บันทึกลง Sheet ช่องที่ 9 (Column I) รวม usedTokens
function logToSheet(userId, userName, question, answer, status, imageUrl, sessionId, usedTokens) { 
  try {
    var sheet = SpreadsheetApp.openById(GOOGLE_SHEET_ID).getSheetByName(LOG_SHEET_NAME);
    if(sheet) sheet.appendRow([new Date(), userId, userName, question, answer, status, imageUrl || "", sessionId || "MAIN_SESSION", usedTokens || 0]);
  } catch (e) {}
}

function getChatHistory(userId, offset, limit, targetSessionId) {
  try {
    var startOffset = offset || 0;
    var fetchLimit = limit || 10;
    var currentSession = targetSessionId || "MAIN_SESSION";
    
    var sheet = SpreadsheetApp.openById(GOOGLE_SHEET_ID).getSheetByName(LOG_SHEET_NAME);
    if (!sheet) return createJsonResponse({ history: [], hasMore: false });
    
    var data = getRecentLogRows(sheet, 2000, 8); // ดึงมา 8 คอลัมน์
    var allUserHistory = [];
    
    for (var i = data.length - 1; i >= 1; i--) {
      // 🌟 เช็คว่าตรงกับผู้ใช้ และ ตรงกับห้องแชทไหม!
      var rowSessionId = data[i][7] ? data[i][7].toString() : "MAIN_SESSION";
      if (data[i][1].toString() === userId && rowSessionId === currentSession) {
        allUserHistory.push({ 
          question: data[i][3], 
          answer: data[i][4], 
          imageUrl: data[i][6] && data[i][6].toString().startsWith("http") ? data[i][6].toString() : "" 
        });
      }
    }
    
    var chunk = allUserHistory.slice(startOffset, startOffset + fetchLimit);
    chunk.reverse();
    var hasMore = (startOffset + fetchLimit) < allUserHistory.length;
    
    return createJsonResponse({ history: chunk, hasMore: hasMore });
  } catch (e) { return createJsonResponse({ history: [], hasMore: false }); }
}

function getRecentHistoryText(userId, targetSessionId) {
  try {
    var sheet = SpreadsheetApp.openById(GOOGLE_SHEET_ID).getSheetByName(LOG_SHEET_NAME);
    if(!sheet) return "";
    var data = getRecentLogRows(sheet, 800, 8);
    var tempHistory = [];
    var currentSession = targetSessionId || "MAIN_SESSION";

    for (var i = data.length - 1; i >= 1; i--) {
      var rowSessionId = data[i][7] ? data[i][7].toString() : "MAIN_SESSION";
      if (data[i][1].toString() === userId && rowSessionId === currentSession && !data[i][4].toString().includes("API Error")) {
        tempHistory.unshift("ພະນັກງານ: " + data[i][3] + "\nAI: " + data[i][4]);
        if (tempHistory.length >= 4) break; 
      }
    }
    return tempHistory.length > 0 ? "--- ປະຫວັດການສົນທະນາຫຼ້າສຸດ ---\n" + tempHistory.join("\n\n") + "\n\n" : "";
  } catch (e) { return ""; }
}

// 🌟 ระบบสร้างรายชื่อเมนูแถบด้านข้าง (ดึงเฉพาะประวัติล่าสุดของแต่ละห้องมาตั้งชื่อ)
function getChatThreads(userId) {
  try {
    var sheet = SpreadsheetApp.openById(GOOGLE_SHEET_ID).getSheetByName(LOG_SHEET_NAME);
    if (!sheet) return createJsonResponse({ threads: [] });
    
    var data = getRecentLogRows(sheet, 3000, 8);
    var threadsMap = {};
    var threadsList = [];

    // วนจากล่างขึ้นบน เพื่อให้ได้แชทล่าสุดก่อน
    for (var i = data.length - 1; i >= 1; i--) {
      if (data[i][1].toString() === userId) {
        var sid = data[i][7] ? data[i][7].toString() : "MAIN_SESSION";
        if (!threadsMap[sid]) {
          var questionText = data[i][3].toString();
          // เอาคำถามแรกมาตั้งชื่อห้องแชท (ตัดให้เหลือ 30 ตัวอักษร)
          var title = questionText.length > 30 ? questionText.substring(0, 30) + "..." : questionText;
          
          threadsMap[sid] = true;
          threadsList.push({
            sessionId: sid,
            title: title,
            date: data[i][0] // เก็บวันที่เพื่อเรียงลำดับ
          });
        }
      }
    }
    return createJsonResponse({ threads: threadsList });
  } catch (e) { return createJsonResponse({ threads: [] }); }
}

// ==========================================
// 3. ระบบอ่านเอกสาร แยกตามแผนก (โค้ดเดิม)
// ==========================================
function getKnowledgeByCategory(category) {
  var cache = CacheService.getScriptCache();
  var cacheKey = "DOC_TAB_" + category;
  var cachedData = cache.get(cacheKey);
  if (cachedData) return cachedData; 

  try {
    var tabMapping = {
      "hr": "ລະບຽບວ່າດ້ວຍພະນັກງານ ແລະ ການບໍລິຫານບຸກຄະລາກອນ",
      "expense": "ລະບຽບວ່າດ້ວຍການຄຸ້ມຄອງລາຍຈ່າຍ ແລະ ການລົງບັນຊີ",
      "loan_gov": "ລະບຽບວ່າດ້ວຍສິນເຊື່ອ ລັດຖະກອນ",
      "loan_sec": "ລະບຽບວ່າດ້ວຍສິນເຊື່ອ ຫຼັກຊັບຄ້ຳປະກັນ",
      "deposit": "ລະບຽບວ່າດ້ວຍເງິນຝາກ"
    };

    var targetTabTitle = tabMapping[category] || tabMapping["hr"];
    var doc = DocumentApp.openById(GOOGLE_DOC_ID);
    var allTabs = doc.getTabs(); 
    var extractedText = "";

    function findAndExtractTab(tabs) {
      for (var i = 0; i < tabs.length; i++) {
        var tab = tabs[i];
        if (tab.getTitle().trim() === targetTabTitle.trim()) {
           try { extractedText = "--- [ໝວດໝູ່: " + tab.getTitle() + "] ---\n" + tab.asDocumentTab().getBody().getText() + "\n\n"; } catch (err) {}
           return true; 
        }
        var childTabs = tab.getChildTabs();
        if (childTabs && childTabs.length > 0) {
           if (findAndExtractTab(childTabs)) return true;
        }
      }
      return false;
    }

    findAndExtractTab(allTabs); 
    if (extractedText !== "") { try { cache.put(cacheKey, extractedText, 3600); } catch(e) {} }
    return extractedText;
  } catch (e) { return "Error reading document: " + e.toString(); }
}

// ==========================================
// 4. Utility Functions 
// ==========================================
function saveFileToDrive(base64, mimeType, userId, index) {
  try {
    var folder = DriveApp.getFolderById(IMAGE_FOLDER_ID);
    var ext = mimeType.includes("pdf") ? ".pdf" : (mimeType.includes("png") ? ".png" : ".jpg");
    var fileName = "DOC_" + userId + "_" + new Date().getTime() + "_" + index + ext;
    var blob = Utilities.newBlob(Utilities.base64Decode(base64), mimeType, fileName);
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    if (mimeType.includes("image")) return "https://drive.google.com/thumbnail?id=" + file.getId() + "&sz=w2000";
    else return file.getUrl(); 
  } catch (e) { return "ERROR: " + e.toString(); }
}

// ==========================================
// ✅ Audio Transcription (iOS Mic Fallback)
// ==========================================
function handleAudioTranscription(base64Audio, mimeType) {
  try {
    var activeApiKey = GEMINI_API_KEYS[0];
    var url = "https://generativelanguage.googleapis.com/v1beta/models/" + GEMINI_MODEL + ":generateContent?key=" + activeApiKey;
    var payload = {
      "contents": [{
        "role": "user",
        "parts": [
          { "text": "Transcribe this audio exactly as spoken. Output only the transcribed text with no extra commentary, no quotation marks, and no formatting." },
          { "inlineData": { "mimeType": mimeType, "data": base64Audio } }
        ]
      }],
      "generationConfig": { "temperature": 0, "maxOutputTokens": 1000 }
    };
    var options = {
      "method": "post",
      "contentType": "application/json",
      "payload": JSON.stringify(payload),
      "muteHttpExceptions": true
    };
    var response = UrlFetchApp.fetch(url, options);
    var responseData = JSON.parse(response.getContentText());
    if (responseData.candidates && responseData.candidates[0] && responseData.candidates[0].content) {
      var transcript = responseData.candidates[0].content.parts[0].text.trim();
      return createJsonResponse({ transcript: transcript });
    }
    return createJsonResponse({ error: "ຖອດສຽງບໍ່ສຳເລັດ" });
  } catch (err) {
    return createJsonResponse({ error: "ເກີດຂໍ້ຜິດພາດ: " + err.toString() });
  }
}

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

function createJsonResponse(dataObject) {
  return ContentService.createTextOutput(JSON.stringify(dataObject)).setMimeType(ContentService.MimeType.JSON);
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
  if (lastRow < 2) {
      var defaultData = [];
      for(var j=0; j<columnCount; j++) defaultData.push("");
      return [defaultData];
  }
  var startRow = Math.max(2, lastRow - maxRows + 1);  
  return sheet.getRange(startRow, 1, lastRow - startRow + 1, columnCount).getValues();
}

// ==========================================
// 🌟 ຟັງຊັນກາງສຳລັບກວດສອບໂຄວຕາ (Rate Limit Logic)
// ==========================================
function checkUserQuotaLogic(userId) {
  var rateLimitCache = CacheService.getScriptCache();
  var limitKey = "LIMIT_" + userId;
  var limitData = rateLimitCache.get(limitKey);
  var askHistory = limitData ? JSON.parse(limitData) : [];
  
  var now = new Date().getTime();
  var waitTimeHours = 2;
  var windowMs = waitTimeHours * 60 * 60 * 1000;
  var timeLimitAgo = now - windowMs;

  askHistory = askHistory.filter(function(time) { return time > timeLimitAgo; });

  if (askHistory.length >= 10) {
      var oldestAskTime = Math.min.apply(null, askHistory);
      var unlockTimeMs = oldestAskTime + windowMs;
      var unlockDate = new Date(unlockTimeMs);
      var timeString = Utilities.formatDate(unlockDate, Session.getScriptTimeZone(), "HH:mm");
      
      var diffMs = unlockTimeMs - now;
      var diffMins = Math.floor(diffMs / 60000);
      var remHours = Math.floor(diffMins / 60);
      var remMins = diffMins % 60;
      
      var remainString = remHours > 0 ? (remHours + " ຊົ່ວໂມງ " + remMins + " ນາທີ") : (remMins + " ນາທີ");
      var errorMsg = "⚠️ ທ່ານໃຊ້ໂຄວຕາຄຳຖາມຄົບແລ້ວ (10 ຂໍ້ / " + waitTimeHours + " ຊົ່ວໂມງ).\n⏳ ສາມາດຖາມໄດ້ອີກຄັ້ງໃນເວລາ " + timeString + " ໂມງ (ອີກປະມານ " + remainString + ").";
      
      return { 
          isLimited: true, 
          errorMsg: errorMsg, 
          timeString: timeString, 
          remainString: remainString 
      };
  }
  return { isLimited: false, history: askHistory, cache: rateLimitCache, limitKey: limitKey };
}

// ==========================================
// 🌟 ຟັງຊັນ RAG ຄົ້ນຫາສະເພາະຍ່ອຫົວທີ່ກ່ຽວຂ້ອງ
// ==========================================
function extractRelevantContext(fullText, userMessage) {
  if (!fullText) return null;

  var questionWords = ["ແນວໃດ", "ແມ່ນຫຍັງ", "ເທົ່າໃດ", "ຈັກມື້", "ໄດ້ບໍ່", "ອະທິບາຍ", "ກ່ຽວກັບ", "ຊ່ວຍ", "ບອກ", "ຂໍຖາມ", "ພີ່ຄຮັບ", "ຊ່ວຍແດ່"];
  var searchWord = userMessage.toLowerCase();
  for (var i = 0; i < questionWords.length; i++) {
     searchWord = searchWord.replace(new RegExp(questionWords[i], "g"), "");
  }
  searchWord = searchWord.trim();

  if (searchWord.length < 2) return fullText.substring(0, 3000);

  var paragraphs = fullText.split(/\n/);
  var matchedChunks = [];

  for (var j = 0; j < paragraphs.length; j++) {
     var p = paragraphs[j].trim();
     if (p.length < 15) continue;

     if (p.toLowerCase().includes(searchWord)) {
         var prev = (j > 0) ? paragraphs[j-1].trim() : "";
         var next = (j < paragraphs.length - 1) ? paragraphs[j+1].trim() : "";
         matchedChunks.push(prev + "\n" + p + "\n" + next);
     }
  }

  if (matchedChunks.length === 0) return null;

  return matchedChunks.slice(0, 4).join("\n\n--- (ຂ້າມເນື້ອຫາບາງສ່ວນ) ---\n\n");
}