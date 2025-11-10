// card.js - 信用卡管理邏輯（APP 版本 - 不關閉免輸入 PIN）

// ==========================================
// Session 管理
// ==========================================

const SESSION_KEY = 'cardAppUnlocked';
const ENCRYPTED_KEY = 'cardAppEncryptedKey';

function isSessionValid() {
  const unlocked = sessionStorage.getItem(SESSION_KEY);
  const encryptedKey = sessionStorage.getItem(ENCRYPTED_KEY);
  
  // 只要有這兩個值就表示 Session 有效
  return unlocked === 'true' && !!encryptedKey;
}

function setSessionUnlocked(pin) {
  sessionStorage.setItem(SESSION_KEY, 'true');
  
  // 加密後存入 sessionStorage
  const encrypted = CryptoJS.AES.encrypt(pin, 'app-unlock-key-2024').toString();
  sessionStorage.setItem(ENCRYPTED_KEY, encrypted);
  
  unlockKey = pin;
}

function restoreUnlockKey() {
  try {
    const encrypted = sessionStorage.getItem(ENCRYPTED_KEY);
    if (!encrypted) return null;
    
    const decrypted = CryptoJS.AES.decrypt(encrypted, 'app-unlock-key-2024');
    const pin = decrypted.toString(CryptoJS.enc.Utf8);
    
    if (!pin) return null;
    
    return pin;
  } catch (error) {
    console.error('恢復 unlockKey 失敗:', error);
    return null;
  }
}

function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(ENCRYPTED_KEY);
  unlockKey = null;
}


// ==========================================
// 全域變數
// ==========================================

let currentPin = '';
let unlockKey = null;
let cards = [];
let editingCardId = null;
let selectedCardType = 'VISA';
let clickTimer = null;
let clickCount = 0;
let sheetInitialized = false;  // 只有首次初始化sheet
let modalSwipeInitialized = false;  // ⭐ 滑動關閉

// ==========================================
// 1. 初始化
// ==========================================

document.addEventListener('DOMContentLoaded', async () => {
  // ⭐ 先初始化 Footer（在鎖定畫面也顯示）
  initFooter('card-btn');
  
  if (!checkSettings()) {
    return;
  }
  
  // ⭐ 檢查 Session 是否有效
  if (isSessionValid()) {
    console.log('✅ Session 有效，嘗試恢復...');
    
    // 從 sessionStorage 恢復 unlockKey
    unlockKey = restoreUnlockKey();
    
    if (unlockKey) {
      console.log('✅ 成功恢復 unlockKey，直接解鎖');
      unlockApp(true);  // ⭐ 傳入 true 表示是從恢復
      return; // ⭐ 不繼續往下執行
    } else {
      console.warn('⚠️ 無法恢復 unlockKey，清除 Session');
      clearSession();
    }
  }
  
  // Session 無效，顯示 PIN 畫面
  await checkPinStatus();
  setupCardNumberFormat();
  setupExpiryDateFormat();
});

// ==========================================
// 2. PIN 碼管理
// ==========================================

async function checkPinStatus() {
  const pinHash = localStorage.getItem('cardPinHash');
  
  if (!pinHash) {
    // 沒有本地 PIN，需要檢查 Sheet 是否有資料
    document.getElementById('lockTitle').textContent = '載入中...';
    document.getElementById('lockSubtitle').textContent = '正在檢查資料';
    
    try {
      const data = await getAllData('card');
      
      console.log('📊 getAllData 回傳:', data);
      console.log('📊 資料長度:', data ? data.length : 'null');
      
      const hasData = data && data.length > 0;
      
      console.log('📊 hasData 判斷結果:', hasData);
      
      if (hasData) {
        // Sheet 有資料 → 輸入既有 PIN
        document.getElementById('lockTitle').textContent = '請輸入 PIN 碼';
        document.getElementById('lockSubtitle').textContent = '偵測到已有資料，請輸入原本的 PIN 碼';
      } else {
        // Sheet 沒資料 → 設定新 PIN
        document.getElementById('lockTitle').textContent = '請設定 4 位數 PIN 碼';
        document.getElementById('lockSubtitle').textContent = '首次使用，請建立您的 PIN 碼';
      }
    } catch (error) {
      console.error('檢查 PIN 狀態失敗:', error);
      document.getElementById('lockTitle').textContent = '請設定 4 位數 PIN 碼';
      document.getElementById('lockSubtitle').textContent = '首次使用，請建立您的 PIN 碼';
    }
  } else {
    // 已有本地 PIN → 正常解鎖
    document.getElementById('lockTitle').textContent = '請輸入 PIN 碼';
    document.getElementById('lockSubtitle').textContent = '';
  }
}

function inputPin(num) {
  if (currentPin.length < 4) {
    currentPin += num;
    updatePinDisplay();
    
    if (currentPin.length === 4) {
      setTimeout(verifyPin, 300);
    }
  }
}

function deletePin() {
  if (currentPin.length > 0) {
    currentPin = currentPin.slice(0, -1);
    updatePinDisplay();
  }
}

function updatePinDisplay() {
  for (let i = 1; i <= 4; i++) {
    const dot = document.getElementById(`pin${i}`);
    if (i <= currentPin.length) {
      dot.classList.add('filled');
    } else {
      dot.classList.remove('filled');
    }
  }
}

async function verifyPin() {
  const pinHash = localStorage.getItem('cardPinHash');
  
  if (!pinHash) {
    // 第一次使用 - 需要判斷是「新 PIN」還是「驗證舊 PIN」
    console.log('🔐 第一次使用，檢查 Sheet...');
    const data = await getAllData('card');
    
    if (!data || data.length === 0) {
      // Sheet 沒資料 → 設定新 PIN
      console.log('✨ Sheet 無資料，設定新 PIN');
      await setupNewPin();
    } else {
      // Sheet 有資料 → 驗證舊 PIN
      console.log('🔑 Sheet 有資料，驗證舊 PIN');
      
      // ⭐ 重點：先設定 unlockKey，才能解密
      unlockKey = currentPin;
      
      try {
        const decrypted = decryptData(data[0].encrypted);
        
        // 解密成功，儲存 PIN Hash
        const hash = CryptoJS.SHA256(currentPin).toString();
        localStorage.setItem('cardPinHash', hash);
        
        console.log('✅ PIN 驗證成功(從加密資料)');
        unlockApp();
        
      } catch (error) {
        console.error('❌ 解密失敗:', error);
        
        // ⭐ 解密失敗，要清除 unlockKey
        unlockKey = null;
        
        showPinError('PIN 碼錯誤');
        currentPin = '';
        updatePinDisplay();
      }
    }
  } else {
    // 已有 PIN Hash，正常驗證
    console.log('🔐 已有 PIN Hash，正常驗證');
    await checkExistingPin();
  }
}

async function setupNewPin() {
  try {
    // 計算 PIN 的 Hash
    const hash = CryptoJS.SHA256(currentPin).toString();
    
    // 儲存 Hash
    localStorage.setItem('cardPinHash', hash);
    
    // 設定解鎖金鑰
    unlockKey = currentPin;
    
    // ⭐ 第一次使用，需要初始化工作表
    try {
      await initCardSheet();
    } catch (error) {
      console.error('初始化工作表失敗:', error);
      showError('初始化失敗: ' + error.message);
      return;
    }
    
    console.log('✅ PIN 碼設定成功');
    
    // 解鎖
    unlockApp();
    
  } catch (error) {
    console.error('設定 PIN 失敗:', error);
    showPinError('設定失敗,請重試');
    currentPin = '';
    updatePinDisplay();
  }
}

async function checkExistingPin() {
  try {
    const storedHash = localStorage.getItem('cardPinHash');
    const inputHash = CryptoJS.SHA256(currentPin).toString();
    
    if (inputHash === storedHash) {
      // PIN 正確
      unlockKey = currentPin;
      console.log('✅ PIN 驗證成功');
      unlockApp();
    } else {
      // PIN 錯誤
      showPinError('PIN 碼錯誤');
      currentPin = '';
      updatePinDisplay();
    }
    
  } catch (error) {
    console.error('驗證 PIN 失敗:', error);
    showPinError('驗證失敗,請重試');
    currentPin = '';
    updatePinDisplay();
  }
}



function showPinError(message) {
  const errorMsg = document.getElementById('errorMessage');
  errorMsg.textContent = message;
  errorMsg.classList.add('show');
  
  setTimeout(() => {
    errorMsg.classList.remove('show');
  }, 2000);
}

async function unlockApp(fromRestore = false) {
  if (!fromRestore && currentPin) {
    setSessionUnlocked(currentPin);
  }
  
  const lockScreen = document.getElementById('lockScreen');
  const lockIcon = document.getElementById('lockIcon');
  const doorIcon = document.getElementById('doorIcon');
  const mainContent = document.getElementById('mainContent');
  const addBtn = document.getElementById('addBtn');
  
  try {
    // === 階段 1: 門動畫（僅在首次輸入時播放）===
    if (!fromRestore && lockIcon && doorIcon) {
      lockIcon.classList.add('switching');
      await sleep(250);
      doorIcon.src = '../assets/icons/door-open.svg';
      await sleep(250);
      lockIcon.classList.remove('switching');
    }
    
    // === 階段 2 & 3：散開 + 進入（兩種情況都播放）===
    const loadPromise = loadCards();
    await sleep(100);
    lockScreen.classList.add('dissolving');
    await sleep(600);
    
    lockScreen.style.display = 'none';
    mainContent.style.display = 'block';
    addBtn.style.display = 'block';

    
    await loadPromise;
    
  } catch (error) {
    console.error('解鎖動畫錯誤:', error);
    lockScreen.style.display = 'none';
    mainContent.style.display = 'block';
    addBtn.style.display = 'block';
    loadCards();
  }
}

// 輔助函數
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 初始化部分
document.addEventListener('DOMContentLoaded', async () => {
  initFooter('card-btn');
  
  if (!checkSettings()) {
    return;
  }
  
  // ⭐ 檢查 Session 是否有效
  if (isSessionValid()) {
    console.log('✅ Session 有效，嘗試恢復...');
    
    unlockKey = restoreUnlockKey();
    
    if (unlockKey) {
      console.log('✅ 成功恢復 unlockKey，直接解鎖');
      unlockApp(true);  // ⭐ 傳入 true
      return;
    } else {
      console.warn('⚠️ 無法恢復 unlockKey，清除 Session');
      clearSession();
    }
  }
  
  await checkPinStatus();
  setupCardNumberFormat();
  setupExpiryDateFormat();
});



function lockApp() {
  // ⭐ 清除 Session
  clearSession();
  
  currentPin = '';
  updatePinDisplay();
  
  document.getElementById('lockScreen').style.display = 'flex';
  document.getElementById('mainContent').style.display = 'none';
  document.getElementById('addBtn').style.display = 'none';
  
  document.getElementById('lockTitle').textContent = '請輸入 PIN 碼';
  document.getElementById('lockSubtitle').textContent = '';
}

// ==========================================
// 3. 初始化 Sheet
// ==========================================

async function initCardSheet() {
  // ⭐ 如果已經初始化過，直接跳過
  if (sheetInitialized) {
    console.log('⚡ 工作表已初始化，跳過檢查');
    return true;
  }
  
  try {
    console.log('開始初始化卡片工作表...');
    const headers = ['id', 'encrypted', 'updatedAt', 'order'];
    await ensureSheetExists('card', headers);
    console.log('✅ 卡片工作表初始化完成');
    
    sheetInitialized = true;  // ⭐ 標記已初始化
    return true;
  } catch (error) {
    console.error('❌ 初始化卡片工作表失敗:', error);
    throw error;
  }
}

// ==========================================
// 4. 載入卡片
// ==========================================

async function loadCards() {
  try {
    const cardsList = document.getElementById('cardsList');
    cardsList.innerHTML = '<div class="loading">載入中...</div>';
    
    // 讀取所有卡片
    const data = await getAllData('card');
    
    if (!data || data.length === 0) {
      cardsList.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">💳</div>
          <div class="empty-text">尚未新增任何信用卡</div>
        </div>
      `;
      cards = [];
      return;
    }
    
    // 解密卡片資料
    cards = [];
    for (const row of data) {
      try {
        // 檢查是否有加密資料
        if (!row.encrypted) {
          console.warn('跳過無加密資料的列:', row.id);
          continue;
        }
        
        const decrypted = decryptData(row.encrypted);
        cards.push({
          id: row.id,
          ...decrypted,
          order: parseInt(row.order) || 0
        });
      } catch (error) {
        console.error('解密卡片失敗 (ID: ' + row.id + '):', error);
        // 繼續處理其他卡片
      }
    }
    
    // 按順序排序
    cards.sort((a, b) => a.order - b.order);
    
    // 渲染卡片
    renderCards();
    
  } catch (error) {
    console.error('載入卡片失敗:', error);
    document.getElementById('cardsList').innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⚠️</div>
        <div class="empty-text">載入失敗: ${error.message}</div>
      </div>
    `;
  }
}

// ==========================================
// 5. 渲染卡片
// ==========================================

function renderCards() {
  const cardsList = document.getElementById('cardsList');
  
  if (cards.length === 0) {
    cardsList.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">
          <img src="../assets/icons/credit-card.svg" alt="credit card">
        </div>
        <div class="empty-text">尚未新增任何信用卡</div>
      </div>
    `;
    return;
  }
  
  cardsList.innerHTML = cards.map((card, index) => `
  <div class="card-item" id="card-${card.id}">
    <div class="card-header" onclick="toggleCard('${card.id}')">
      <div class="card-header-top">
        <div class="card-icon">
          <img src="../assets/icons/credit-card.svg" alt="credit card">
        </div>
        <div class="card-name">${escapeHtml(card.name)}</div>
      </div>
      
      <div class="card-expanded-header">
        <div>${escapeHtml(card.name)}</div>
        <div class="card-header-actions">
          <button class="card-header-btn" onclick="event.stopPropagation(); copyFullNumber('${card.id}')">
            <img src="../assets/icons/copy.svg" alt="copy">
          </button>
          <button class="card-header-btn" onclick="event.stopPropagation(); editCard('${card.id}')">
            <img src="../assets/icons/pen-to-square.svg" alt="edit">
          </button>
          <button class="card-header-btn" onclick="event.stopPropagation(); deleteCard('${card.id}')">
            <img src="../assets/icons/trash-can.svg" alt="delete">
          </button>
        </div>
      </div>
      
      <div class="card-number-line" onclick="event.stopPropagation()">
        ${formatCardNumberWithSpans(card.cardNumber)}
      </div>
      
      <div class="card-info-line">
        <div class="card-cvs-block" onclick="event.stopPropagation(); copyCVV('${card.id}')">
          <div class="cvs-label">CVS</div>
          <div class="cvs-value">${escapeHtml(card.cvv)}</div>
        </div>
        
        <div class="card-expiry-block" onclick="event.stopPropagation(); copyExpiryDate('${card.id}')">
          <div class="expiry-labels">
            <div class="valid-label">VALID</div>
            <div class="thru-label">THRU</div>
          </div>
          <div class="expiry-value">${escapeHtml(card.expiryDate)}</div>
        </div>
      </div>
      
      <div class="card-bottom-line">
        <div class="card-notes-inline">
          ${card.notes ? '備註: ' + escapeHtml(card.notes) : ''}
        </div>
        <div class="card-type-badge">${card.cardType}</div>
      </div>
    </div>
    
    <div class="card-content">
      <div class="card-detail">
      </div>
    </div>
  </div>
`).join('');
  
  // 為每張卡片設定拖曳處理
  cards.forEach(card => {
    setupDragHandlers(card.id);
  });
}

// ==========================================
// 6. 卡片展開/收合
// ==========================================

function toggleCard(cardId) {
  const cardElement = document.getElementById(`card-${cardId}`);
  
  // 如果點擊的是已展開的卡片，直接收合
  if (currentExpandedCard === cardId) {
    cardElement.classList.remove('expanded');
    currentExpandedCard = null;
    return;
  }
  
  // 如果有其他卡片展開，先收合它
  if (currentExpandedCard) {
    const prevCard = document.getElementById(`card-${currentExpandedCard}`);
    if (prevCard) {
      prevCard.classList.remove('expanded');
    }
  }
  
  // 展開當前卡片
  cardElement.classList.add('expanded');
  currentExpandedCard = cardId;
}

// ==========================================
// 7. 加密/解密
// ==========================================

function encryptData(data) {
  if (!unlockKey) {
    throw new Error('未解鎖');
  }
  
  const jsonString = JSON.stringify(data);
  const encrypted = CryptoJS.AES.encrypt(jsonString, unlockKey).toString();
  return encrypted;
}

function decryptData(encryptedData) {
  if (!unlockKey) {
    throw new Error('未解鎖');
  }
  
  const decrypted = CryptoJS.AES.decrypt(encryptedData, unlockKey);
  const jsonString = decrypted.toString(CryptoJS.enc.Utf8);
  
  if (!jsonString) {
    throw new Error('解密失敗');
  }
  
  return JSON.parse(jsonString);
}

// ==========================================
// 8. 新增卡片
// ==========================================

function openAddModal() {
  editingCardId = null;

  document.getElementById('cardForm').reset();
  selectedCardType = 'VISA';
  updateCardTypeSelection();
  document.getElementById('cardModal').classList.add('show');

  // ⭐ 只初始化一次
  if (!modalSwipeInitialized) {
    setupModalSwipeToClose();
    modalSwipeInitialized = true;
  }
}

function selectCardType(type) {
  selectedCardType = type;
  updateCardTypeSelection();
}

function updateCardTypeSelection() {
  document.querySelectorAll('.card-type-btn').forEach(btn => {
    if (btn.dataset.type === selectedCardType) {
      btn.classList.add('selected');
    } else {
      btn.classList.remove('selected');
    }
  });
}

document.getElementById('cardForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  await saveCard();
});

async function saveCard() {
  try {
    const cardData = {
      name: document.getElementById('cardNameInput').value,
      cardType: selectedCardType,
      cardNumber: document.getElementById('cardNumberInput').value.replace(/\s/g, ''),
      expiryDate: document.getElementById('expiryDateInput').value,
      cvv: document.getElementById('cvvInput').value,
      notes: document.getElementById('notesInput').value
    };
    
    // 加密資料
    const encrypted = encryptData(cardData);
    const now = new Date().toISOString();
    
    if (editingCardId) {
      // 更新現有卡片
      const card = cards.find(c => c.id === editingCardId);
      const rowData = [editingCardId, encrypted, now, card.order];
      await updateRowById('card', editingCardId, rowData);
      showSuccess('卡片更新成功');
    } else {
      // 新增卡片
      const nextId = await getNextId('card', 'card');
      const order = cards.length;
      const rowData = [nextId, encrypted, now, order];
      await appendRow('card', rowData);
      showSuccess('卡片新增成功');
    }
    
    closeModal();
    await loadCards();
    
  } catch (error) {
    console.error('儲存卡片失敗:', error);
    showError('儲存失敗: ' + error.message);
  }
}

// ==========================================
// 9. 編輯卡片
// ==========================================

function editCard(cardId) {
  const card = cards.find(c => c.id === cardId);
  if (!card) return;
  
  editingCardId = cardId;
  //document.getElementById('modalTitle').textContent = '編輯信用卡';
  
  document.getElementById('cardNameInput').value = card.name;
  document.getElementById('cardNumberInput').value = formatCardNumberForInput(card.cardNumber);
  document.getElementById('expiryDateInput').value = card.expiryDate;
  document.getElementById('cvvInput').value = card.cvv;
  document.getElementById('notesInput').value = card.notes || '';
  
  selectedCardType = card.cardType;
  updateCardTypeSelection();
  
  document.getElementById('cardModal').classList.add('show');
    // ⭐ 只初始化一次
  if (!modalSwipeInitialized) {
    setupModalSwipeToClose();
    modalSwipeInitialized = true;
  }

}

// ==========================================
// 10. 刪除卡片
// ==========================================

let pendingDeleteId = null;

async function deleteCard(cardId) {
  pendingDeleteId = cardId;
  document.getElementById('confirmModal').classList.add('show');
}

function closeConfirm() {
  document.getElementById('confirmModal').classList.remove('show');
  pendingDeleteId = null;
}

async function confirmDelete() {
  if (!pendingDeleteId) return;
  
  try {
    await deleteRowById('card', pendingDeleteId);
    showSuccess('卡片刪除成功');
    await loadCards();
    closeConfirm();
  } catch (error) {
    console.error('刪除卡片失敗:', error);
    showError('刪除失敗: ' + error.message);
    closeConfirm();
  }
}

// ==========================================
// 11. 移動卡片
// ==========================================

async function moveCard(cardId, direction) {
  const index = cards.findIndex(c => c.id === cardId);
  if (index === -1) return;
  
  const newIndex = direction === 'up' ? index - 1 : index + 1;
  if (newIndex < 0 || newIndex >= cards.length) return;
  
  try {
    // 交換順序
    [cards[index], cards[newIndex]] = [cards[newIndex], cards[index]];
    
    // 更新 order 值
    for (let i = 0; i < cards.length; i++) {
      cards[i].order = i;
    }
    
    // 更新到 Sheet
    for (const card of [cards[index], cards[newIndex]]) {
      const encrypted = encryptData({
        name: card.name,
        cardType: card.cardType,
        cardNumber: card.cardNumber,
        expiryDate: card.expiryDate,
        cvv: card.cvv,
        notes: card.notes
      });
      const now = new Date().toISOString();
      const rowData = [card.id, encrypted, now, card.order];
      await updateRowById('card', card.id, rowData);
    }
    
    // 重新渲染
    renderCards();
    
  } catch (error) {
    console.error('移動卡片失敗:', error);
    showError('移動失敗: ' + error.message);
  }
}

// ==========================================
// 12. 複製卡號
// ==========================================

// 格式化卡號為可點擊的 span
function formatCardNumberWithSpans(cardNumber) {
  const groups = cardNumber.match(/.{1,4}/g) || [];
  return groups.map((group, index) => 
    `<span onclick="copyGroup('${group}', event)">${group}</span>`
  ).join(' ');
}

// 複製單組4碼
async function copyGroup(group, event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  await copyToClipboard(group);
  showCopyToast(`已複製 ${group}`);
}

// 複製完整16碼
async function copyFullNumber(cardId) {
  const card = cards.find(c => c.id === cardId);
  if (!card) return;
  
  await copyToClipboard(card.cardNumber);
  showCopyToast('已複製完整卡號');
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (error) {
    console.error('複製失敗:', error);
  }
}

function showCopyToast(message) {
  const toast = document.getElementById('copyToast');
  toast.textContent = message;
  toast.classList.add('show');
  
  setTimeout(() => {
    toast.classList.remove('show');
  }, 2000);
}

// 複製 CVV
async function copyCVV(cardId) {
  const card = cards.find(c => c.id === cardId);
  if (!card) return;
  
  await copyToClipboard(card.cvv);
  showCopyToast('已複製 CVV');
}
// 複製到期日期（移除斜線）
async function copyExpiryDate(cardId) {
  const card = cards.find(c => c.id === cardId);
  if (!card) return;
  
  const dateWithoutSlash = card.expiryDate.replace(/\//g, '');
  await copyToClipboard(dateWithoutSlash);
  showCopyToast('已複製到期日期');
}

// ==========================================
// 13. 長按拖曳排序
// ==========================================

let currentExpandedCard = null;  // ⭐ 新增這行
let draggedCard = null;
let longPressTimer = null;
let isDragging = false;

function setupDragHandlers(cardId) {
  const cardElement = document.getElementById(`card-${cardId}`);
  if (!cardElement) return;
  
  const header = cardElement.querySelector('.card-header');
  if (!header) return;
  
  // 觸控裝置
  header.addEventListener('touchstart', (e) => {
    if (cardElement.classList.contains('expanded')) return;
    
    longPressTimer = setTimeout(() => {
      startDrag(cardId, e);
    }, 500);
  });
  
  header.addEventListener('touchend', () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
    }
  });
  
  header.addEventListener('touchmove', (e) => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
    }
    if (isDragging) {
      handleDragMove(e);
    }
  });
  
  // 滑鼠裝置
  header.addEventListener('mousedown', (e) => {
    if (cardElement.classList.contains('expanded')) return;
    
    longPressTimer = setTimeout(() => {
      startDrag(cardId, e);
    }, 500);
  });
  
  header.addEventListener('mouseup', () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
    }
  });
  
  header.addEventListener('mousemove', (e) => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
    }
    if (isDragging) {
      handleDragMove(e);
    }
  });
}

function startDrag(cardId, event) {
  isDragging = true;
  draggedCard = cardId;
  
  const cardElement = document.getElementById(`card-${cardId}`);
  cardElement.classList.add('dragging');
  
  // 震動反饋 (支援的裝置)
  if (navigator.vibrate) {
    navigator.vibrate(50);
  }
}

function handleDragMove(event) {
  if (!isDragging || !draggedCard) return;
  
  event.preventDefault();
  
  const touch = event.touches ? event.touches[0] : event;
  const y = touch.clientY;
  
  // 找到當前位置下的卡片
  const elements = document.elementsFromPoint(touch.clientX, y);
  const targetCard = elements.find(el => el.classList.contains('card-item'));
  
  if (targetCard && targetCard.id !== `card-${draggedCard}`) {
    const targetId = targetCard.id.replace('card-', '');
    swapCards(draggedCard, targetId);
  }
}

async function swapCards(cardId1, cardId2) {
  const index1 = cards.findIndex(c => c.id === cardId1);
  const index2 = cards.findIndex(c => c.id === cardId2);
  
  if (index1 === -1 || index2 === -1) return;
  
  // 交換順序
  [cards[index1], cards[index2]] = [cards[index2], cards[index1]];
  
  // 更新 order
  for (let i = 0; i < cards.length; i++) {
    cards[i].order = i;
  }
  
  // 先重新渲染
  renderCards();
  
  // 等 DOM 更新後再添加動畫
  setTimeout(() => {
    const element1 = document.getElementById(`card-${cardId1}`);
    const element2 = document.getElementById(`card-${cardId2}`);
    
    if (element1 && element2) {
      // 閃爍效果
      element1.classList.add('swapping');
      element2.classList.add('swapping');
      
      // 添加方向動畫
      if (index1 < index2) {
        element1.classList.add('swap-down');
        element2.classList.add('swap-up');
      } else {
        element1.classList.add('swap-up');
        element2.classList.add('swap-down');
      }
      
      // 動畫結束後移除 class
      setTimeout(() => {
        element1.classList.remove('swapping', 'swap-up', 'swap-down');
        element2.classList.remove('swapping', 'swap-up', 'swap-down');
      }, 400);
    }
  }, 10);
}

document.addEventListener('touchend', endDrag);
document.addEventListener('mouseup', endDrag);

async function endDrag() {
  if (!isDragging) return;
  
  isDragging = false;
  
  if (draggedCard) {
    const cardElement = document.getElementById(`card-${draggedCard}`);
    if (cardElement) {
      cardElement.classList.remove('dragging');
    }
    
    // 保存順序到 Sheet
    await saveCardOrder();
    
    draggedCard = null;
  }
}

async function saveCardOrder() {
  try {
    for (const card of cards) {
      const encrypted = encryptData({
        name: card.name,
        cardType: card.cardType,
        cardNumber: card.cardNumber,
        expiryDate: card.expiryDate,
        cvv: card.cvv,
        notes: card.notes
      });
      const now = new Date().toISOString();
      const rowData = [card.id, encrypted, now, card.order];
      await updateRowById('card', card.id, rowData);
    }
    console.log('✅ 卡片順序已保存');
  } catch (error) {
    console.error('保存順序失敗:', error);
  }
}

// ==========================================
// 14. 輔助函數
// ==========================================

function getCardIcon(cardType) {
  const icons = {
    'VISA': '💳',
    'MASTER': '💳',
    'JCB': '💳'
  };
  return icons[cardType] || '💳';
}

function formatCardNumber(cardNumber) {
  return cardNumber.match(/.{1,4}/g).join(' ');
}

function formatCardNumberForInput(cardNumber) {
  return cardNumber.match(/.{1,4}/g).join(' ');
}

function setupCardNumberFormat() {
  const input = document.getElementById('cardNumberInput');
  let lastValue = '';

  input.addEventListener('keydown', (e) => {
    const key = e.key;
    const isDigit = /^\d$/.test(key);
    const isControl = ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(key);

    if (!isDigit && !isControl) {
      e.preventDefault();
    }
  });

  input.addEventListener('input', (e) => {
    const currentValue = e.target.value;

    if (currentValue === lastValue) {
      return;
    }

    const cursorPos = e.target.selectionStart;
    const rawBeforeCursor = currentValue.slice(0, cursorPos).replace(/\D/g, '');
    const rawDigitsBefore = rawBeforeCursor.length;

    const raw = currentValue.replace(/\D/g, '').slice(0, 16);
    const formatted = raw.replace(/(.{4})/g, '$1 ').trim();
    
    let newCursor = rawDigitsBefore; 
    
    if (rawDigitsBefore > 0) {
      newCursor += Math.floor((rawDigitsBefore - 1) / 4);
    }
    
    if (newCursor > formatted.length) {
      newCursor = formatted.length;
    }

    if (formatted !== currentValue) {
      lastValue = formatted;
      e.target.value = formatted;
      e.target.setSelectionRange(newCursor, newCursor);
    } else {
      lastValue = formatted;
    }
  });

  input.addEventListener('paste', (e) => {
    e.preventDefault();
    const pasted = (e.clipboardData || window.clipboardData).getData('text');
    const raw = pasted.replace(/\D/g, '').slice(0, 16);
    const formatted = raw.replace(/(.{4})/g, '$1 ').trim();
    lastValue = formatted;
    input.value = formatted;
    input.setSelectionRange(formatted.length, formatted.length);
  });
}

function setupExpiryDateFormat() {
  const input = document.getElementById('expiryDateInput');
  let lastValue = '';

  input.addEventListener('input', (e) => {
    const currentValue = e.target.value;
    
    if (currentValue === lastValue) {
      return;
    }
    
    const cursorPos = e.target.selectionStart;
    const raw = currentValue.replace(/\D/g, '').slice(0, 4);
    
    let formatted = raw;
    if (raw.length >= 3) {
      formatted = raw.slice(0, 2) + '/' + raw.slice(2);
    }
    
    if (formatted === currentValue) {
      lastValue = formatted;
      return;
    }
    
    const textBeforeCursor = currentValue.slice(0, cursorPos);
    const digitsBeforeCursor = textBeforeCursor.replace(/\D/g, '').length;
    
    let newCursor = 0;
    let digitsSeen = 0;
    
    for (let i = 0; i < formatted.length; i++) {
      if (/\d/.test(formatted[i])) {
        digitsSeen++;
        if (digitsSeen === digitsBeforeCursor) {
          newCursor = i + 1;
          break;
        }
      }
    }
    
    if (newCursor === 0) {
      newCursor = formatted.length;
    }
    
    lastValue = formatted;
    e.target.value = formatted;
    
    requestAnimationFrame(() => {
      e.target.setSelectionRange(newCursor, newCursor);
    });
  });

  input.addEventListener('paste', (e) => {
    e.preventDefault();
    const pasted = (e.clipboardData || window.clipboardData).getData('text');
    const raw = pasted.replace(/\D/g, '').slice(0, 4);
    let formatted = raw;
    if (raw.length >= 3) {
      formatted = raw.slice(0, 2) + '/' + raw.slice(2);
    }
    lastValue = formatted;
    input.value = formatted;
  });
}

function closeModal() {
  document.getElementById('cardModal').classList.remove('show');
  document.getElementById('cardForm').reset();
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function checkSettings() {
  const settings = getSetting('appSettings');
  
  if (!settings || !settings.serviceAccount) {
    showError('請先在設定頁面配置服務帳戶');
    setTimeout(() => {
      window.location.href = '../pages/settings.html';
    }, 2000);
    return false;
  }
  
  if (!settings.sheetIds || !settings.sheetIds.card) {
    showError('請先在設定頁面設定卡片 Sheet ID');
    setTimeout(() => {
      window.location.href = '../pages/settings.html';
    }, 2000);
    return false;
  }
  
  return true;
}

// ==========================================
// 15. 彈窗滑動關閉功能
// ==========================================

let modalStartY = 0;
let modalCurrentY = 0;
let isModalDragging = false;
let modalScrollable = null;

function setupModalSwipeToClose() {
  const modalContent = document.querySelector('#cardModal .modal-content');
  if (!modalContent) return;
  
  // 找到實際可滾動的容器(通常是 modal-body 或 modal-content 本身)
  modalScrollable = modalContent.querySelector('.modal-body') || modalContent;
  
  // 觸控開始
  modalContent.addEventListener('touchstart', (e) => {
    modalStartY = e.touches[0].clientY;
    modalCurrentY = modalStartY;
    
    // 只有在滾動容器已經在頂部時,才準備啟用拖動關閉
    if (modalScrollable.scrollTop === 0) {
      isModalDragging = true;
      modalContent.style.transition = 'none';
    }
  }, { passive: true });
  
  // 觸控移動
  modalContent.addEventListener('touchmove', (e) => {
    modalCurrentY = e.touches[0].clientY;
    const deltaY = modalCurrentY - modalStartY;
    
    // 檢查是否還在頂部
    const isAtTop = modalScrollable.scrollTop === 0;
    
    // 如果不在頂部,或者往上滑,取消拖動模式並允許正常滾動
    if (!isAtTop || deltaY < 0) {
      if (isModalDragging) {
        isModalDragging = false;
        modalContent.style.transform = '';
      }
      return; // 不阻止預設行為,允許內容滾動
    }
    
    // 只有在「頂部 + 向下拖動 + 已啟用拖動模式」時才執行關閉手勢
    if (isModalDragging && deltaY > 0) {
      e.preventDefault();
      modalContent.style.transform = `translateY(${deltaY}px)`;
    }
  }, { passive: false });
  
  // 觸控結束
  modalContent.addEventListener('touchend', () => {
    if (!isModalDragging) return;
    
    const deltaY = modalCurrentY - modalStartY;
    
    modalContent.style.transition = 'transform 0.3s ease';
    
    // 如果向下滑動超過 100px,關閉彈窗
    if (deltaY > 100) {
      modalContent.style.transform = 'translateY(100%)';
      setTimeout(() => {
        closeModal();
        modalContent.style.transform = '';
        modalContent.style.transition = '';
      }, 300);
    } else {
      // 否則回彈
      modalContent.style.transform = '';
      setTimeout(() => {
        modalContent.style.transition = '';
      }, 300);
    }
    
    isModalDragging = false;
    modalStartY = 0;
    modalCurrentY = 0;
  });
  
}



function showSuccess(message) {
  showCopyToast('✓ ' + message);
}

function showError(message) {
  showCopyToast('✗ ' + message);
}