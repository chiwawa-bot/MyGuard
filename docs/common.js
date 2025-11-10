// ==========================================
// 1. Footer 載入與初始化
// ==========================================

async function initFooter(currentPageId) {
  try {
    const response = await fetch('../components/footer.html');
    const html = await response.text();
    document.getElementById('footer-container').innerHTML = html;
    
    // 高亮當前頁面按鈕
    highlightCurrentPage(currentPageId);
  } catch (error) {
    console.error('載入 footer 失敗:', error);
  }
}

function highlightCurrentPage(pageId) {
  // 移除所有 active class
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  
  // 加上當前頁面的 active class
  const currentBtn = document.getElementById(pageId);
  if (currentBtn) {
    currentBtn.classList.add('active');
  }
}

// ==========================================
// 2. 頁面跳轉
// ==========================================

function navigateTo(page) {
  window.location.href = `./${page}.html`;
}

// ==========================================
// 3. 設定檢查 (localStorage)
// ==========================================

function checkSettings() {
  const settings = getSetting('appSettings');
  
  if (!settings || !settings.serviceAccount || !settings.sheetIds) {
    // 沒有設定,跳轉到設定頁
    if (!window.location.pathname.includes('settings.html')) {
      alert('請先完成基本設定');
      window.location.href = './settings.html';
    }
    return false;
  }
  
  return true;
}

// ==========================================
// 4. localStorage 存取
// ==========================================

function getSetting(key) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : null;
  } catch (error) {
    console.error('讀取設定失敗:', error);
    return null;
  }
}

function setSetting(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.error('儲存設定失敗:', error);
    return false;
  }
}

// ==========================================
// 5. 載入動畫
// ==========================================

function showLoading(message = '載入中...') {
  const loadingDiv = document.createElement('div');
  loadingDiv.id = 'loading-overlay';
  loadingDiv.innerHTML = `
    <style>
      #loading-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(245, 245, 243, 0.95);
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        z-index: 9999;
      }
      .loading-spinner {
        font-size: 48px;
        animation: spin 1s linear infinite;
      }
      .loading-text {
        margin-top: 20px;
        font-size: 16px;
        color: #666;
      }
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    </style>
    <div class="loading-spinner">⏳</div>
    <div class="loading-text">${message}</div>
  `;
  document.body.appendChild(loadingDiv);
}

function hideLoading() {
  const loadingDiv = document.getElementById('loading-overlay');
  if (loadingDiv) {
    loadingDiv.remove();
  }
}

// ==========================================
// 6. 錯誤提示
// ==========================================

function showError(message, duration = 3000) {
  const errorDiv = document.createElement('div');
  errorDiv.innerHTML = `
    <style>
      .error-toast {
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: #F5F5F3;
        color: #D32F2F;
        padding: 15px 25px;
        border-radius: 12px;
        box-shadow: 
          4px 4px 8px rgba(163, 163, 163, 0.4),
          -4px -4px 8px rgba(255, 255, 255, 0.9);
        z-index: 10000;
        font-size: 14px;
        font-weight: 500;
        animation: slideDown 0.3s ease;
      }
      @keyframes slideDown {
        from {
          opacity: 0;
          transform: translateX(-50%) translateY(-20px);
        }
        to {
          opacity: 1;
          transform: translateX(-50%) translateY(0);
        }
      }
    </style>
    <div class="error-toast">❌ ${message}</div>
  `;
  
  document.body.appendChild(errorDiv);
  
  setTimeout(() => {
    errorDiv.remove();
  }, duration);
}

// ==========================================
// 7. 成功提示
// ==========================================

function showSuccess(message, duration = 2000) {
  const successDiv = document.createElement('div');
  successDiv.innerHTML = `
    <style>
      .success-toast {
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: #F5F5F3;
        color: #388E3C;
        padding: 15px 25px;
        border-radius: 12px;
        box-shadow: 
          4px 4px 8px rgba(163, 163, 163, 0.4),
          -4px -4px 8px rgba(255, 255, 255, 0.9);
        z-index: 10000;
        font-size: 14px;
        font-weight: 500;
        animation: slideDown 0.3s ease;
      }
      @keyframes slideDown {
        from {
          opacity: 0;
          transform: translateX(-50%) translateY(-20px);
        }
        to {
          opacity: 1;
          transform: translateX(-50%) translateY(0);
        }
      }
    </style>
    <div class="success-toast">✅ ${message}</div>
  `;
  
  document.body.appendChild(successDiv);
  
  setTimeout(() => {
    successDiv.remove();
  }, duration);
}