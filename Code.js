var GEMINI_API_KEYS = [
  "AIzaSyASzdzrmN3xqhGwM87X0WqsHZ5enCFuBC0", // Key 1
  "AIzaSyAW9V1C6bjXgE2EzTpwrr15a4eyYLdW6WE",  // Key 2
  "AIzaSyAcuP3BIF5oKfJGtn7FmOuNlUel0po16GE"
];
var GOOGLE_DOC_ID = "1cObuEeUbwHTpA05WoHQVymlDMVr-ZR0KVzLjSsWkvC0";
var GOOGLE_TXT_ID = "1tx6FwdLdDi9Lzl-Ghk780X58XbGm7VLg"; // Your Text File ID
var ssmi_link = "https://ssmilaos.com/or-structure-headoffice/";
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

      // 3.1 Fetch Context from all sources
      var docContext = readGoogleDocContent();
      var txtContext = readGoogleTxtContent(); // <--- Added Text File Reader
      var webContext = readWebsiteContent(ssmi_link);
      var webPro = readWebsiteContent(products_link);

      if (!docContext && !txtContext && !webContext && !webPro) {
        return createJsonResponse({ error: "ບໍ່ສາມາດອ່ານຂໍ້ມູນຈາກລະບົບເອກະສານໄດ້" });
      }

      // 3.2 Fetch recent chat history
      var historyContext = getRecentHistoryText(userId);

      // 3.3 Define AI Role
      var systemPrompt = `ເຈົ້າແມ່ນ AI ຜູ້ຊ່ວຍ HR ຂອງອົງກອນ SSMI (ສິນຊັບເມືອງເໜືອ). ຕອນນີ້ເຈົ້າກຳລັງລົມກັບພະນັກງານຊື່: ${userName}.
ໜ້າທີ່ຫຼັກຂອງເຈົ້າແມ່ນການຕອບຄຳຖາມຂອງພະນັກງານ ກ່ຽວກັບລະບຽບການ, ນະໂຍບາຍ, ສະຫວັດດີການ ແລະ ໂຄງສ້າງອົງກອນ.
ກົດລະບຽບທີ່ສຳຄັນທີ່ສຸດຂອງເຈົ້າ:
1. ເຈົ້າຕ້ອງຕອບຄຳຖາມໂດຍອີງໃສ່ຂໍ້ມູນໃນ Context ທີ່ໃຫ້ມາເທົ່ານັ້ນ.
2. ຖ້າຄຳຖາມໃດທີ່ບໍ່ມີຂໍ້ມູນໃນ Context, ໃຫ້ຕອບວ່າ "ຂໍອະໄພ, ຂ້ອຍບໍ່ມີຂໍ້ມູນໃນສ່ວນນີ້. ກະລຸນາຕິດຕໍ່ພະແນກ HR ເພື່ອສອບຖາມເພີ່ມເຕີມ."
3. ຫ້າມຄິດຄຳຕອບຂຶ້ນມາເອງ (No Hallucination) ເດັດຂາດ.
4. ຕ້ອງຕອບເປັນ "ພາສາລາວ" (Lao language) ເທົ່ານັ້ນ, ໃຫ້ໃຊ້ຄຳສັບທີ່ສຸພາບ, ເປັນທາງການແຕ່ເຂົ້າໃຈງ່າຍ.`;

      // 3.4 Assemble Final Prompt
      var finalPrompt = "Context ຂໍ້ມູນລະບຽບການທັງໝົດ: \n" + 
                        docContext + "\n\n" + 
                        txtContext + "\n\n" + // Integrated TXT context
                        webContext + "\n\n" + 
                        webPro + "\n\n";

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
    var data = sheet.getDataRange().getValues();
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
    return tempHistory.length > 0 ? "--- ປະຫວັດການສົນທະນາຫຼ້າສຸດ ---\n" + tempHistory.join("\n\n") + "\n\n" : "";
  } catch (e) { return ""; }
}

function createJsonResponse(dataObject) {
  return ContentService.createTextOutput(JSON.stringify(dataObject)).setMimeType(ContentService.MimeType.JSON);
}