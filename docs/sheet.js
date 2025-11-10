// sheet.js - Google Sheets API 操作
// 使用服務帳戶進行身份驗證 (純前端實作)

// ==========================================
// 0. Access Token 快取
// ==========================================
let cachedToken = null;
let tokenExpireTime = 0;

// ==========================================
// 0.5 Sheet 類型映射
// ==========================================

function getSheetIdAndTab(sheetType) {
  const settings = getSetting('appSettings');
  
  const sheetMapping = {
    'task': { sheetId: settings.sheetIds.task, tabName: 'task' },
    'password': { sheetId: settings.sheetIds.password, tabName: 'password' },
    'card': { sheetId: settings.sheetIds.card, tabName: 'card' }
  };
  
  const mapping = sheetMapping[sheetType];
  if (!mapping) {
    throw new Error(`未知的 sheetType: ${sheetType}，請在 sheet.js 的映射表中新增`);
  }
  
  if (!mapping.sheetId) {
    throw new Error(`請先在設定頁面設定 ${sheetType} 的 Sheet ID`);
  }
  
  return mapping;
}

// ==========================================
// 1. 取得 Access Token (JWT 方式)
// ==========================================

async function getAccessToken() {
  const settings = getSetting('appSettings');
  
  if (!settings || !settings.serviceAccount) {
    throw new Error('請先在設定頁面配置服務帳戶');
  }
  
  // 檢查快取的 token 是否還有效
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && tokenExpireTime > now + 60) {
    console.log('使用快取的 Access Token');
    return cachedToken;
  }
  
  const { client_email, private_key } = settings.serviceAccount;
  
  try {
    // ✨ 格式化 Private Key
    let formattedKey = private_key.trim();
    
    // 如果 \n 是字面文字,替換成真正的換行符號
    if (formattedKey.includes('\\n')) {
      formattedKey = formattedKey.replace(/\\n/g, '\n');
    }
    
    // 確保有正確的開頭和結尾
    if (!formattedKey.includes('-----BEGIN PRIVATE KEY-----')) {
      throw new Error('Private Key 缺少開頭標記');
    }
    if (!formattedKey.includes('-----END PRIVATE KEY-----')) {
      throw new Error('Private Key 缺少結尾標記');
    }
    
    console.log('Private Key 格式檢查通過');
    
    // 1. 建立 JWT Header 和 Payload
    const header = {
      alg: 'RS256',
      typ: 'JWT'
    };
    
    const payload = {
      iss: client_email,
      scope: 'https://www.googleapis.com/auth/spreadsheets',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now
    };
    
    // 2. 使用 jsrsasign 簽名 JWT
    const sHeader = JSON.stringify(header);
    const sPayload = JSON.stringify(payload);
    const jwt = KJUR.jws.JWS.sign('RS256', sHeader, sPayload, formattedKey);
    
    console.log('✅ JWT 簽名成功');
    
    // 3. 向 Google OAuth2 換取 Access Token
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`取得 Access Token 失敗: ${errorText}`);
    }
    
    const data = await response.json();
    
    // 快取 token
    cachedToken = data.access_token;
    tokenExpireTime = now + 3600;
    
    console.log('✅ Access Token 取得成功');
    return data.access_token;
    
  } catch (error) {
    console.error('取得 Access Token 失敗:', error);
    throw error;
  }
}

// ==========================================
// 1.5 測試連線
// ==========================================

async function testConnection(sheetId) {
  try {
    console.log('開始測試 Google Sheets 連線...');
    console.log('Sheet ID:', sheetId);
    
    // 1. 取得 Access Token
    const token = await getAccessToken();
    
    // 2. 嘗試讀取 Sheet 的第一列資料
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/A1:Z1`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || '讀取 Sheet 失敗');
    }
    
    const data = await response.json();
    console.log('✅ Google Sheets 連線測試成功');
    console.log('第一列資料:', data.values);
    
    return {
      success: true,
      message: '連線測試成功',
      firstRow: data.values ? data.values[0] : []
    };
    
  } catch (error) {
    console.error('❌ Google Sheets 連線測試失敗:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// ==========================================
// 2. 讀取 Sheet 資料
// ==========================================

async function readSheet(sheetType, range = 'A:Z') {
  try {
    const { sheetId, tabName } = getSheetIdAndTab(sheetType);
    const token = await getAccessToken();
    
    // 使用 tabName 而非 sheetType
    const fullRange = `${tabName}!${range}`;
    
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${fullRange}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || '讀取失敗');
    }
    
    const data = await response.json();
    console.log(`✅ 讀取 ${sheetType} (${tabName}) 成功`);
    
    return data.values || [];
    
  } catch (error) {
    console.error('讀取 Sheet 失敗:', error);
    throw error;
  }
}

// ==========================================
// 3. 寫入 Sheet 資料
// ==========================================

async function writeSheet(sheetType, range, values) {
  try {
    const { sheetId, tabName } = getSheetIdAndTab(sheetType);
    const token = await getAccessToken();
    
    // 使用 tabName 而非 sheetType
    const fullRange = `${tabName}!${range}`;
    
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${fullRange}?valueInputOption=USER_ENTERED`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          values: values
        })
      }
    );
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || '寫入失敗');
    }
    
    const data = await response.json();
    console.log(`✅ 寫入 ${sheetType} (${tabName}) 成功`, data);
    
    return data;
    
  } catch (error) {
    console.error('寫入 Sheet 失敗:', error);
    throw error;
  }
}

// ==========================================
// 4. 更新 Sheet 資料
// ==========================================

async function updateSheet(sheetType, range, values) {
  try {
    const { sheetId, tabName } = getSheetIdAndTab(sheetType);
    const token = await getAccessToken();
    
    // 使用 tabName 而非 sheetType
    const fullRange = `${tabName}!${range}`;
    
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${fullRange}?valueInputOption=USER_ENTERED`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          values: values
        })
      }
    );
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || '更新失敗');
    }
    
    const data = await response.json();
    console.log(`✅ 更新 ${sheetType} (${tabName}) 成功`);
    
    return data;
    
  } catch (error) {
    console.error('更新 Sheet 失敗:', error);
    throw error;
  }
}

// ==========================================
// 5. 新增一列資料
// ==========================================

async function appendRow(sheetType, values) {
  try {
    const { sheetId, tabName } = getSheetIdAndTab(sheetType);
    
    console.log('📋 appendRow - sheetType:', sheetType);
    console.log('📋 appendRow - sheetId:', sheetId);
    console.log('📋 appendRow - tabName:', tabName);
    console.log('📋 appendRow - values:', values);
    
    const token = await getAccessToken();
    console.log('🔑 Access Token 取得成功');
    
    // 使用 tabName 而非 sheetType
    const range = `${tabName}!A:A`;
    console.log('📍 使用範圍:', range);
    
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}:append?valueInputOption=USER_ENTERED`;
    console.log('🌐 API URL:', url);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        values: [values]
      })
    });
    
    console.log('📡 Response Status:', response.status);
    
    if (!response.ok) {
      const errorData = await response.json();
      console.error('❌ API 錯誤:', errorData);
      throw new Error(errorData.error?.message || '新增失敗');
    }
    
    const data = await response.json();
    console.log(`✅ 新增列到 ${sheetType} (${tabName}) 成功:`, data);
    
    return data;
    
  } catch (error) {
    console.error('❌ 新增列失敗:', error);
    throw error;
  }
}

// ==========================================
// 6. 刪除一列資料
// ==========================================

async function deleteRow(sheetType, rowIndex) {
  try {
    const { sheetId, tabName } = getSheetIdAndTab(sheetType);
    const token = await getAccessToken();
    
    // ⭐ 先取得 spreadsheet 資訊
    const spreadsheetResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );
    
    if (!spreadsheetResponse.ok) {
      throw new Error('無法取得 Sheet 資訊');
    }
    
    const spreadsheetData = await spreadsheetResponse.json();
    
    // ⭐ 找到對應的工作表（Tab）- 使用 tabName
    const targetSheet = spreadsheetData.sheets.find(
      sheet => sheet.properties.title === tabName
    );
    
    if (!targetSheet) {
      throw new Error(`找不到工作表: ${tabName}`);
    }
    
    const sheetIdInternal = targetSheet.properties.sheetId;
    
    console.log(`🗑️ 刪除工作表 "${tabName}" (ID: ${sheetIdInternal}) 的第 ${rowIndex} 列`);
    
    // 刪除該列
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}:batchUpdate`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          requests: [{
            deleteDimension: {
              range: {
                sheetId: sheetIdInternal,
                dimension: 'ROWS',
                startIndex: rowIndex - 1,
                endIndex: rowIndex
              }
            }
          }]
        })
      }
    );
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || '刪除失敗');
    }
    
    console.log(`✅ 刪除 ${sheetType} (${tabName}) 第 ${rowIndex} 列成功`);
    return true;
    
  } catch (error) {
    console.error('刪除列失敗:', error);
    throw error;
  }
}

// ==========================================
// 7. 自動建立工作表(如果不存在)
// ==========================================

async function ensureSheetExists(sheetType, headers) {
  try {
    const { sheetId, tabName } = getSheetIdAndTab(sheetType);
    
    // 1. 檢查工作表是否存在
    const exists = await checkSheetTabExists(sheetId, tabName);
    
    if (exists) {
      console.log(`✅ ${tabName} 工作表已存在`);
      return true;
    }
    
    // 2. 工作表不存在,建立新的工作表(Tab)
    console.log(`📝 建立 ${tabName} 工作表...`);
    await createSheetTab(sheetId, tabName);
    
    // 3. 寫入表頭
    console.log(`📝 寫入 ${tabName} 表頭...`);
    await writeSheet(sheetType, 'A1', [headers]);
    console.log(`✅ ${tabName} 工作表建立成功`);
    
    return true;
  } catch (error) {
    console.error('確保工作表存在時失敗:', error);
    throw error;
  }
}

// ==========================================
// 7.1 檢查工作表(Tab)是否存在
// ==========================================

async function checkSheetTabExists(spreadsheetId, sheetName) {
  try {
    const token = await getAccessToken();
    
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );
    
    if (!response.ok) {
      throw new Error('無法取得 Spreadsheet 資訊');
    }
    
    const data = await response.json();
    const sheets = data.sheets || [];
    
    // 檢查是否有同名的工作表
    return sheets.some(sheet => sheet.properties.title === sheetName);
    
  } catch (error) {
    console.error('檢查工作表失敗:', error);
    return false;
  }
}

// ==========================================
// 7.2 建立新的工作表(Tab)
// ==========================================

async function createSheetTab(spreadsheetId, sheetName) {
  try {
    const token = await getAccessToken();
    
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          requests: [{
            addSheet: {
              properties: {
                title: sheetName,
                gridProperties: {
                  rowCount: 1000,
                  columnCount: 26
                }
              }
            }
          }]
        })
      }
    );
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || '建立工作表失敗');
    }
    
    console.log(`✅ 工作表 "${sheetName}" 建立成功`);
    return true;
    
  } catch (error) {
    console.error('建立工作表失敗:', error);
    throw error;
  }
}

// ==========================================
// 8. 取得下一個可用的 ID
// ==========================================

async function getNextId(sheetType, prefix) {
  try {
    const data = await readSheet(sheetType, 'A:A');
    
    if (!data || data.length <= 1) {
      return `${prefix}_001`;
    }
    
    // 找出最大的數字
    const maxNum = data.slice(1).reduce((max, row) => {
      if (!row || !row[0]) return max;
      const match = row[0].match(/\d+$/);
      const num = match ? parseInt(match[0]) : 0;
      return Math.max(max, num);
    }, 0);
    
    return `${prefix}_${String(maxNum + 1).padStart(3, '0')}`;
  } catch (error) {
    console.error('取得下一個 ID 失敗:', error);
    return `${prefix}_001`;
  }
}

// ==========================================
// 9. 取得所有資料（排除表頭）
// ==========================================

async function getAllData(sheetType) {
  try {
    const data = await readSheet(sheetType);
    
    if (!data || data.length <= 1) {
      return [];
    }
    
    // 第一列是表頭，從第二列開始
    const headers = data[0];
    const rows = data.slice(1);
    
    // 將每一列轉換為物件
    return rows.map(row => {
      const obj = {};
      headers.forEach((header, index) => {
        obj[header] = row[index] || '';
      });
      return obj;
    });
  } catch (error) {
    console.error('取得所有資料失敗:', error);
    return [];
  }
}

// ==========================================
// 10. 根據 ID 更新某一列
// ==========================================

async function updateRowById(sheetType, id, newData) {
  try {
    const allData = await readSheet(sheetType);
    
    if (!allData || allData.length <= 1) {
      throw new Error('找不到資料');
    }
    
    // 找到該 ID 的列索引
    const rowIndex = allData.findIndex((row, index) => {
      return index > 0 && row[0] === id;
    });
    
    if (rowIndex === -1) {
      throw new Error(`找不到 ID: ${id}`);
    }
    
    // 更新該列 (rowIndex 是從 0 開始，但 Google Sheets 從 1 開始，且要跳過表頭)
    const sheetRow = rowIndex + 1;
    const range = `A${sheetRow}:Z${sheetRow}`;
    
    await updateSheet(sheetType, range, [newData]);
    console.log(`✅ 更新 ID: ${id} 成功`);
    
    return true;
  } catch (error) {
    console.error('更新列失敗:', error);
    throw error;
  }
}

// ==========================================
// 11. 根據 ID 刪除某一列
// ==========================================

async function deleteRowById(sheetType, id) {
  try {
    const allData = await readSheet(sheetType);
    
    if (!allData || allData.length <= 1) {
      throw new Error('找不到資料');
    }
    
    // 找到該 ID 的列索引
    const rowIndex = allData.findIndex((row, index) => {
      return index > 0 && row[0] === id;
    });
    
    if (rowIndex === -1) {
      throw new Error(`找不到 ID: ${id}`);
    }
    
    // 刪除該列 (rowIndex 是從 0 開始，但 Google Sheets 從 1 開始)
    await deleteRow(sheetType, rowIndex + 1);
    console.log(`✅ 刪除 ID: ${id} 成功`);
    
    return true;
  } catch (error) {
    console.error('刪除列失敗:', error);
    throw error;
  }
}

// ==========================================
// 輔助函數
// ==========================================

// 將欄位索引轉換為字母 (0 -> A, 1 -> B, ...)
function columnIndexToLetter(index) {
  let letter = '';
  while (index >= 0) {
    letter = String.fromCharCode((index % 26) + 65) + letter;
    index = Math.floor(index / 26) - 1;
  }
  return letter;
}

// 將字母轉換為欄位索引 (A -> 0, B -> 1, ...)
function columnLetterToIndex(letter) {
  let index = 0;
  for (let i = 0; i < letter.length; i++) {
    index = index * 26 + letter.charCodeAt(i) - 64;
  }
  return index - 1;
}