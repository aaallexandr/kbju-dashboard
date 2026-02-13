/**
 * KBJU Dashboard API
 * Version: v16 (Ultra-Flexible Date Parser)
 */

function logToSheet(message) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName('debug_log');
    if (!sheet) {
      sheet = ss.insertSheet('debug_log');
      sheet.appendRow(['Timestamp', 'Message']);
    }
    sheet.appendRow([new Date(), message]);
  } catch (e) {
    // ignore
  }
}

function doGet(e) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet();
    const weightData = getSheetData(sheet.getSheetByName('weight_data'));
    const kbjuData = getSheetData(sheet.getSheetByName('kbju_data'));
    
    return createJsonResponse({
      success: true,
      weight: weightData,
      kbju: kbjuData
    });
  } catch (error) {
    return createJsonResponse({ success: false, error: error.toString() });
  }
}

function doPost(e) {
  try {
    const rawContent = e.postData.contents;
    // Log the RAW payload to see exactly what is being sent
    logToSheet("📦 RAW PAYLOAD: " + rawContent.substring(0, 3000)); 

    const contents = JSON.parse(rawContent);
    const dataArray = Array.isArray(contents) ? contents : [contents];
    
    if (dataArray.length === 0) return createJsonResponse({ success: false, error: 'Empty data' });

    // Detect type based on fields in first object
    const first = dataArray[0];
    
    // Weight update
    if (getVal(first, 'weight') !== undefined) {
      return handleWeightUpdate(dataArray);
    }
    
    // KBJU update (check various keys)
    if (getVal(first, 'calories') !== undefined || getVal(first, 'proteins') !== undefined) {
      return handleKBJUUpdate(dataArray);
    }

    return createJsonResponse({ success: false, error: 'Unknown request type. Use "weight" or nutrition fields ("calories", etc.)' });
  } catch (error) {
    logToSheet("🔥 Error in doPost: " + error.toString());
    return createJsonResponse({ success: false, error: error.toString() });
  }
}

function handleWeightUpdate(dataArray) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('weight_data');
  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues(); 
  
  const validMap = new Map();
  const fallbackList = []; 
  
  if (values.length > 1) {
    for (let i = 1; i < values.length; i++) {
      const rawDate = values[i][0];
      const weight = values[i][1];
      if ((rawDate === null || rawDate === '') && (weight === null || weight === '')) continue;

      const normDate = normalizeDate(rawDate);
      if (normDate) {
        validMap.set(normDate, weight);
      } else {
        fallbackList.push([rawDate, weight]);
      }
    }
  }
  
  dataArray.forEach(item => {
    const date = normalizeDate(item.date) || normalizeDate(new Date());
    const weight = parseFloat(item.weight);
    if (date && !isNaN(weight)) {
      validMap.set(date, weight);
    }
  });
  
  const sortedRows = [];
  validMap.forEach((w, d) => {
    sortedRows.push([d, w]);
  });
  
  sortedRows.sort((a, b) => new Date(a[0]) - new Date(b[0]));
  const finalOutput = [...fallbackList, ...sortedRows];
  
  sheet.clearContents();
  const outputData = [['Date', 'Weight'], ...finalOutput];
  if (outputData.length > 0) {
    sheet.getRange(1, 1, outputData.length, 2).setValues(outputData);
  }
  
  return createJsonResponse({ success: true, message: `Weight processed.` });
}

function handleKBJUUpdate(dataArray) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('kbju_data');
  if (!sheet) return createJsonResponse({ success: false, error: 'Sheet kbju_data not found' });

  logToSheet("🥗 Processing Nutrition data...");

  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(h => h.toString().toLowerCase().trim());
  const validMap = new Map();
  const fallbackList = [];
  
  if (values.length > 1) {
    for (let i = 1; i < values.length; i++) {
      const normDate = normalizeDate(values[i][0]);
      if (normDate) {
        let obj = {};
        for (let j = 1; j < headers.length; j++) obj[headers[j]] = values[i][j];
        validMap.set(normDate, obj);
      } else if (values[i][0] !== '' || values[i].some(v => v !== '')) {
        fallbackList.push(values[i]);
      }
    }
  }

  // Helper to parse numbers with commas or dots and cleanup
  const parseNum = (val) => {
    if (val === undefined || val === null || val === '') return undefined;
    // Handle non-breaking spaces and other whitespace
    let str = val.toString().replace(/,/g, '.').replace(/[\s\u00A0]/g, '');
    const num = parseFloat(str);
    return isNaN(num) ? undefined : num;
  };
  
  // Helper to get value case-insensitively
  const getVal = (obj, key) => {
    const foundKey = Object.keys(obj).find(k => k.toLowerCase() === key.toLowerCase());
    return foundKey ? obj[foundKey] : undefined;
  };

  dataArray.forEach(item => {
    const date = normalizeDate(getVal(item, 'date')) || normalizeDate(new Date());
    if (date) {
      if (!validMap.has(date)) validMap.set(date, { calories:'', proteins:'', fats:'', carbs:'' });
      const current = validMap.get(date);
      
      const cal = parseNum(getVal(item, 'calories'));
      const pro = parseNum(getVal(item, 'proteins'));
      const fat = parseNum(getVal(item, 'fats'));
      const carb = parseNum(getVal(item, 'carbs'));

      if (cal !== undefined) current.calories = cal;
      if (pro !== undefined) current.proteins = pro;
      if (fat !== undefined) current.fats = fat;
      if (carb !== undefined) current.carbs = carb;
      
      if(cal || pro) logToSheet(`   📝 Update for ${date}: Cal=${cal}, Pro=${pro}`);
      else logToSheet(`   ⚠️ Received data for ${date} but values are empty. Raw keys: ${Object.keys(item).join(',')}`);
    }
  });

  const sortedRows = Array.from(validMap.entries())
    .sort((a, b) => new Date(a[0]) - new Date(b[0]))
    .map(([d, v]) => [d, v.calories, v.proteins, v.fats, v.carbs]);

  sheet.clearContents();
  const output = [['Date', 'Calories', 'Proteins', 'Fats', 'Carbs'], ...fallbackList, ...sortedRows];
  if (output.length > 0) {
    sheet.getRange(1, 1, output.length, 5).setValues(output);
  }
  logToSheet("✅ Nutrition (KBJU) updated.");
  return createJsonResponse({ success: true, message: `KBJU processed.` });
}

// === ULTIMATE DATE PARSER ===
function normalizeDate(input) {
  if (!input) return null;
  
  try {
    // A. Объект Date (из Sheet)
    if (input instanceof Date) {
      if (isNaN(input.getTime())) return null;
      return Utilities.formatDate(input, 'Europe/Moscow', 'yyyy-MM-dd');
    }
    
    // B. Строка
    if (typeof input === 'string') {
      let str = input.trim();
      
      // Бронебойная очистка от невидимых символов, кавычек и мусора
      // Оставляем только цифры, дефисы, точки и слэши
      // str = str.replace(/[^\d\-\.\/]/g, ''); // Опасно, может склеить 2026 01 02

      // 1. ISO Flexible (2026-1-2, 2026-01-02)
      const isoMatch = str.match(/^(\d{4})[-\.](\d{1,2})[-\.](\d{1,2})/);
      if (isoMatch) {
        return `${isoMatch[1]}-${isoMatch[2].padStart(2,'0')}-${isoMatch[3].padStart(2,'0')}`;
      }
      
      // 2. RU/EU Flexible (1.2.2026, 01.02.2026, 1/2/2026)
      const ruMatch = str.match(/^(\d{1,2})[-\.\/](\d{1,2})[-\.\/](\d{4})/);
      if (ruMatch) {
         return `${ruMatch[3]}-${ruMatch[2].padStart(2,'0')}-${ruMatch[1].padStart(2,'0')}`;
      }
      
      // 3. Fallback: new Date()
      // Позволяет парсить "Jan 2, 2026" и прочее
      const d = new Date(str);
      if (!isNaN(d.getTime())) {
         return Utilities.formatDate(d, 'Europe/Moscow', 'yyyy-MM-dd');
      }
    }
    
    return null;
  } catch (e) {
    return null;
  }
}

// === UTILS ===

function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

function getSheetData(sheet) {
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  const headers = data[0].map(function(h) { return h.toString().toLowerCase().trim(); });
  
  return data.slice(1).filter(function(row) { return row[0] !== ''; }).map(function(row) {
    const obj = {};
    headers.forEach(function(header, i) {
      const normDate = normalizeDate(row[i]);
      let value = row[i];
      if (header === 'date' && normDate) value = normDate;
      if (header !== 'date') {
        if (value === '-' || value === '' || value == null) value = null;
        else if (typeof value === 'number') value = parseFloat(value.toFixed(2));
      }
      obj[header] = value;
    });
    return obj;
  });
}
