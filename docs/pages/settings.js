// settings.js - 設定頁面邏輯

// ==========================================
// 載入已儲存的設定
// ==========================================

function loadSettings() {
  const settings = getSetting('appSettings');
  
  if (settings) {
    // 載入服務帳戶設定
    if (settings.serviceAccount) {
      document.getElementById('clientEmail').value = settings.serviceAccount.client_email || '';
      document.getElementById('privateKey').value = settings.serviceAccount.private_key || '';
    }
    
    // 載入 Sheet ID 設定
    if (settings.sheetIds) {
      document.getElementById('passwordSheetId').value = settings.sheetIds.password || '';
      document.getElementById('cardSheetId').value = settings.sheetIds.card || '';
    }
  }
}

// ==========================================
// 儲存設定 + 測試所有 Sheet 連線
// ==========================================

async function saveSettings() {
  const saveBtn = document.querySelector('.save-btn');
  const originalText = saveBtn.textContent;
  
  try {
    // 取得表單資料
    const clientEmail = document.getElementById('clientEmail').value.trim();
    const privateKey = document.getElementById('privateKey').value.trim();
    const passwordSheetId = document.getElementById('passwordSheetId').value.trim();
    const cardSheetId = document.getElementById('cardSheetId').value.trim();
    
    // 驗證必填欄位
    if (!clientEmail || !privateKey) {
      showError('請填寫服務帳戶資訊');
      return;
    }
    
    if (!passwordSheetId || !cardSheetId) {
      showError('請填寫所有 Sheet ID');
      return;
    }
    
    // 組合設定物件
    const settings = {
      serviceAccount: {
        client_email: clientEmail,
        private_key: privateKey
      },
      sheetIds: {
        password: passwordSheetId,
        card: cardSheetId,
      }
    };
    
    // 儲存到 localStorage
    const success = setSetting('appSettings', settings);
    
    if (!success) {
      showError('儲存失敗');
      return;
    }
    
    // ✨ 測試所有 Sheet 連線
    saveBtn.textContent = 'connecting...';
    saveBtn.disabled = true;
    
    console.log('開始測試所有 Google Sheets 連線...');
    
    const testResults = [];
    const sheetsToTest = [
      { name: 'PASSWORD', id: passwordSheetId },
      { name: 'CARD', id: cardSheetId },
    ];
    
    // 逐一測試每張 Sheet
    for (const sheet of sheetsToTest) {
      if (sheet.id) {
        console.log(`測試 ${sheet.name} Sheet...`);
        const result = await testConnection(sheet.id);
        testResults.push({
          name: sheet.name,
          success: result.success,
          error: result.error
        });
        
        // 顯示個別測試結果
        if (result.success) {
          console.log(`✅ ${sheet.name} 連線成功`);
        } else {
          console.error(`❌ ${sheet.name} 連線失敗:`, result.error);
        }
      }
    }
    
    saveBtn.textContent = originalText;
    saveBtn.disabled = false;
    
    // 檢查測試結果並顯示訊息
    const allSuccess = testResults.every(r => r.success);
    const failedSheets = testResults.filter(r => !r.success);
    
    if (allSuccess) {
      showSuccess(`✅ 設定已儲存，Sheet 連線成功！`);
    } else if (failedSheets.length === testResults.length) {
      const errorMsg = failedSheets[0].error || '未知錯誤';
      showError(`❌ 設定已儲存，所有Sheet連線失敗：${errorMsg}`);
      console.error('失敗的 Sheet:', failedSheets);
    } else {
      const failedNames = failedSheets.map(s => s.name).join(', ');
      showWarning(`⚠️ 設定已儲存，連線失敗Sheet：${failedNames}`);
      console.error('失敗的 Sheet:', failedSheets);
    }
    
  } catch (error) {
    saveBtn.textContent = originalText;
    saveBtn.disabled = false;
    showError(`發生錯誤: ${error.message}`);
    console.error('儲存設定時發生錯誤:', error);
  }
}

// ==========================================
// 重置所有設定
// ==========================================

function resetSettings() {
  if (confirm('確定要清除所有設定嗎?此操作無法復原!')) {
    localStorage.removeItem('appSettings');
    
    // 清空表單
    document.getElementById('clientEmail').value = '';
    document.getElementById('privateKey').value = '';
    document.getElementById('passwordSheetId').value = '';
    document.getElementById('cardSheetId').value = '';
    
    showSuccess('設定已清除');
  }
}

// ==========================================
// 訊息提示函數
// ==========================================

function showMessage(text, type = 'success') {
  const messageEl = document.getElementById('message');
  messageEl.textContent = text;
  messageEl.className = `message ${type}`;
  messageEl.classList.add('show');
  
  setTimeout(() => {
    messageEl.classList.remove('show');
  }, 3000);
}

function showSuccess(text) {
  showMessage(text, 'success');
}

function showError(text) {
  showMessage(text, 'error');
}

function showWarning(text) {
  showMessage(text, 'warning');
}