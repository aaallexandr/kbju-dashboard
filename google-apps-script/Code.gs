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
    const contents = JSON.parse(e.postData.contents);
    if (Array.isArray(contents)) return handleWeightUpdate(contents);
    if (contents.weight !== undefined) return handleWeightUpdate([contents]); 
    return createJsonResponse({ success: false, error: 'Unknown request type' });
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
  const fallbackList = []; // Для того, что ВООБЩЕ никак не похоже на дату
  
  // 1. Считываем старые данные
  if (values.length > 1) {
    for (let i = 1; i < values.length; i++) {
      const rawDate = values[i][0];
      const weight = values[i][1];
      
      // Пропускаем полностью пустые
      if ((rawDate === null || rawDate === '') && (weight === null || weight === '')) continue;

      const normDate = normalizeDate(rawDate);
      
      if (normDate) {
        // Успешно распознали дату -> сохраняем как валидную (перезапишем дубли)
        validMap.set(normDate, weight);
      } else {
        // Не смогли распознать -> сохраняем как есть (Safe Mode)
        // Логируем, чтобы понять причину
        const typeInfo = (rawDate && typeof rawDate === 'object') ? rawDate.constructor.name : typeof rawDate;
        logToSheet(`⚠️ Preserving unparsed ROW ${i+1}: Val='${rawDate}' Type=[${typeInfo}]`);
        fallbackList.push([rawDate, weight]);
      }
    }
  }
  
  // 2. Накатываем новые
  dataArray.forEach(item => {
    const date = normalizeDate(item.date) || normalizeDate(new Date());
    const weight = parseFloat(item.weight);
    
    if (date && !isNaN(weight)) {
      validMap.set(date, weight);
    }
  });
  
  // 3. Сборка (Сортируем только Валидные, Невалидные кидаем в начало)
  const sortedRows = [];
  validMap.forEach((w, d) => {
    sortedRows.push([d, w]);
  });
  
  sortedRows.sort((a, b) => {
    return new Date(a[0]) - new Date(b[0]);
  });
  
  // Сначала "мусор/текст", потом красивые даты
  const finalOutput = [...fallbackList, ...sortedRows];
  
  // 4. Запись
  sheet.clearContents();
  const outputData = [['Date', 'Weight'], ...finalOutput];
  
  if (outputData.length > 0) {
    sheet.getRange(1, 1, outputData.length, 2).setValues(outputData);
  }
  
  return createJsonResponse({ success: true, message: `Processed.` });
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
