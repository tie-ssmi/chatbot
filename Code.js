var GEMINI_API_KEYS = [
  "AIzaSyAw5pY18otDX98Zj5d9QFWBGCUjLLhS02I",
  "AIzaSyAcuP3BIF5oKfJGtn7FmOuNlUel0po16GE",  
  "AIzaSyASzdzrmN3xqhGwM87X0WqsHZ5enCFuBC0", // Key 1
  "AIzaSyAW9V1C6bjXgE2EzTpwrr15a4eyYLdW6WE",  // Key 2
  
  "AIzaSyBMDQSoAps9l_tW74w0NidFneXft78h1gQ",
  "AIzaSyCiReSFLydaJytmtVr-OxSko2CrsVw6PuU"
   // Key 3
];
var GOOGLE_DOC_ID = "1cObuEeUbwHTpA05WoHQVymlDMVr-ZR0KVzLjSsWkvC0";
var GOOGLE_TXT_ID = "1tx6FwdLdDi9Lzl-Ghk780X58XbGm7VLg"; // Your Text File ID
var ssmi_link = "https://ssmilaos.com/or-structure-headoffice/";
// var ssmi_info = "https://ssmilaos.com/contact-us/";
var products_link = "https://ssmilaos.com/our-products/loan/";
var GOOGLE_SHEET_ID = "1Ipsf6-ryft-AhsyhUhGa3hT7dlDbH7rO2Eu_E8HJX1A";
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

    // Login logic
    if (action === "login") {
      return handleLogin(requestData.username, requestData.password);
    }

    // History logic
    if (action === "getHistory") { 
      return getChatHistory(requestData.userId); 
    }

    // Chat logic
    if (action === "chat") {
      var userMessage = requestData.message;
      var userId = requestData.userId || "Unknown";
      var userName = requestData.userName || "ພະນັກງານ";
      var clientHistory = normalizeClientHistory(requestData.history);

      // 3.1 Fetch shared context (single cached block, lock-protected rebuild)
      var knowledgeContext = getKnowledgeContext();

      if (!knowledgeContext) {
        return createJsonResponse({ error: "ບໍ່ສາມາດອ່ານຂໍ້ມູນຈາກລະບົບເອກະສານໄດ້" });
      }

      // 3.2 Prefer lightweight client-side history, fallback to sheet history
      var historyContext = buildHistoryTextFromClient(clientHistory);
      if (!historyContext) {
        historyContext = getRecentHistoryText(userId);
      }

      // 3.3 Define AI Role
      var systemPrompt = `You are an AI HR assistant for the organization SSMI (Sinsap Muang Neua). You are currently speaking with an employee named: ${userName}.
Your main responsibility is to answer employee questions regarding regulations, policies, benefits, and the organizational structure.

Your most important rules are:
1. You must answer questions based only on the information provided in the given context.
2. If a question cannot be answered  using the provided context, respond with: "Sorry, I do not have information on this topic. Please contact the HR department for further assistance."
3. You must not generate or assume any information (No hallucination under any circumstances).
4. You must respond in clear, polite, and professional Lao language.`;
      // 3.4 Assemble Final Prompt
      var finalPrompt = "Context ຂໍ້ມູນລະບຽບການທັງໝົດ: \n" + knowledgeContext + "\n\n";

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
          "temperature": 0.2, 
          "maxOutputTokens": 1000
        }
      };

      // 3.5 Send to Gemini with Key Cycling
      var options = {
        "method": "post",
        "contentType": "application/json",
        "payload": JSON.stringify(payload),
        "muteHttpExceptions": true
      };

      var aiReply = null;
      var lastError = "";

      for (var i = 0; i < GEMINI_API_KEYS.length; i++) {
        var url = "https://generativelanguage.googleapis.com/v1beta/models/" + GEMINI_MODEL + ":generateContent?key=" + GEMINI_API_KEYS[i];
        var response = UrlFetchApp.fetch(url, options);
        var responseData = JSON.parse(response.getContentText());

        if (responseData.candidates && responseData.candidates.length > 0) {
          aiReply = responseData.candidates[0].content.parts[0].text;
          break; 
        } else {
          lastError = JSON.stringify(responseData);
          console.log("Key " + (i+1) + " failed/quota reached.");
        }
      }

      // 3.6 Log and Return
      if (aiReply) {
        logToSheet(userId, userName, userMessage, aiReply, "Success"); 
        return createJsonResponse({ reply: aiReply });
      } else {
        logToSheet(userId, userName, userMessage, lastError, "Error");
        return createJsonResponse({ error: "AI ບໍ່ສາມາດສ້າງຄຳຕອບໄດ້ໃນຕອນນີ້. ກະລຸນາລໍຖ້າຈັກໜ້ອຍ" });
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
function logToSheet(userId, userName, question, answer, status) {
  try {
    var sheet = SpreadsheetApp.openById(GOOGLE_SHEET_ID).getSheetByName(LOG_SHEET_NAME);
    if(sheet) {
      sheet.appendRow([new Date(), userId, userName, question, answer, status]);
    }
  } catch (e) {}
}

// ==========================================
// 4. Read Google Docs (With Cache)
// ==========================================
function readGoogleDocContent() {
  var cache = CacheService.getScriptCache();
  var cacheKey = "HR_DOC_V3"; 
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
    cache.put(cacheKey, fullText, 21600); 
    return fullText;
  } catch (e) { return ""; }
}

// ==========================================
// 5. Read Text File from Drive (New)
// ==========================================
function readGoogleTxtContent() {
  var cache = CacheService.getScriptCache();
  var cacheKey = "HR_TXT_V1"; 
  var cachedTxt = cache.get(cacheKey);
  if (cachedTxt) return cachedTxt; 

  try {
    var file = DriveApp.getFileById(GOOGLE_TXT_ID);
    var txtContent = file.getBlob().getDataAsString();
    var finalTxtContext = "--- [ຂໍ້ມູນເພີ່ມເຕີມຈາກ TXT File] ---\n" + txtContent;
    cache.put(cacheKey, finalTxtContext, 21600); 
    return finalTxtContext;
  } catch (e) { return ""; }
}

// ==========================================
// 6. Read Website (Clean HTML)
// ==========================================
function readWebsiteContent(url) {
  var cache = CacheService.getScriptCache();
  var cacheKey = "HR_WEB_" + Utilities.base64Encode(url).substring(0, 50);
  var cachedWeb = cache.get(cacheKey);
  if (cachedWeb) return cachedWeb;

  try {
    var response = UrlFetchApp.fetch(url);
    var htmlContent = response.getContentText();
    var textOnly = htmlContent.replace(/<script[^>]*>([\S\s]*?)<\/script>/gmi, '');
    textOnly = textOnly.replace(/<style[^>]*>([\S\s]*?)<\/style>/gmi, '');
    textOnly = textOnly.replace(/<\/?[^>]+(>|$)/g, " ");
    textOnly = textOnly.replace(/\s+/g, ' ').trim();

    var finalWebContext = "--- [ຂໍ້ມູນຈາກ Website: " + url + "] ---\n" + textOnly;
    cache.put(cacheKey, finalWebContext, 21600);
    return finalWebContext;
  } catch (e) { return "--- [ບໍ່ສາມາດດຶງຂໍ້ມູນຈາກ Website ໄດ້] ---"; }
}

// ==========================================
// 7. Utility Functions (History & JSON)
// ==========================================
function getChatHistory(userId) {
  try {
    var sheet = SpreadsheetApp.openById(GOOGLE_SHEET_ID).getSheetByName(LOG_SHEET_NAME);
    if (!sheet) return createJsonResponse({ history: [] });
    var data = getRecentLogRows(sheet, 1200, 5);
    var history = [];
    for (var i = data.length - 1; i >= 1 && history.length < 15; i--) {
      if (data[i][1].toString() === userId) {
        history.unshift({ question: data[i][3], answer: data[i][4] });
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

function getKnowledgeContext() {
  var cache = CacheService.getScriptCache();
  var cacheKey = "HR_KNOWLEDGE_V1";
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
      var webContext = readWebsiteContent(ssmi_link);
      // var webInfo = readWebsiteContent(ssmi_info);
      var webPro = readWebsiteContent(products_link);

      var combined = "";
      if (docContext && docContext.trim() !== "") {
        combined += docContext + "\n\n";
      }
      if (txtContext && txtContext.trim() !== "") {
        combined += txtContext + "\n\n";
      }
      if (webContext && webContext.trim() !== "") {
        combined += webContext + "\n\n";
      }
      if (webPro && webPro.trim() !== "") {
        combined += webPro;
      }

      if (combined.replace(/\s+/g, "").length > 0) {
        cache.put(cacheKey, combined, 21600);
      }
      return combined;
    }
  } catch (e) {}
  finally {
    if (acquired) {
      try { lock.releaseLock(); } catch (err) {}
    }
  }

  // If lock was not acquired, return available partial contexts quickly.
  var fallback = readGoogleDocContent() + "\n\n" + readGoogleTxtContent() + "\n\n" + readWebsiteContent(ssmi_link) + "\n\n" + readWebsiteContent(products_link);
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