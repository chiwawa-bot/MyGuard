// password.js - 密碼管理邏輯

// ==========================================
// Session 管理
// ==========================================

const SESSION_KEY = 'passwordAppUnlocked';
const ENCRYPTED_KEY = 'passwordAppEncryptedKey';

function isSessionValid() {
  const unlocked = sessionStorage.getItem(SESSION_KEY);
  const encryptedKey = sessionStorage.getItem(ENCRYPTED_KEY);
  return unlocked === 'true' && !!encryptedKey;
}

function setSessionUnlocked(pin) {
  sessionStorage.setItem(SESSION_KEY, 'true');
  const encrypted = CryptoJS.AES.encrypt(pin, 'pwd-unlock-key-2024').toString();
  sessionStorage.setItem(ENCRYPTED_KEY, encrypted);
  unlockKey = pin;
}

function restoreUnlockKey() {
  try {
    const encrypted = sessionStorage.getItem(ENCRYPTED_KEY);
    if (!encrypted) return null;
    
    const decrypted = CryptoJS.AES.decrypt(encrypted, 'pwd-unlock-key-2024');
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
let passwords = [];
let categories = [];
let currentCategory = null;
let editingPasswordId = null;
let sheetInitialized = false;
let expandedPasswordId = null;

// 拖曳相關
let draggedPassword = null;
let draggedCategory = null;
let longPressTimer = null;
let isDragging = false;
let lastSwapTime = 0;
let lastSwappedPair = null;

let categoryDragStartY = null;
const MOVE_THRESHOLD = 10; // 移動超過 10px 才算拖曳

// 拖曳後保存確認
let saveTimer = null;
let isSaving = false;
let dragOverElement = null;

// 刪除確認
let pendingDeleteId = null;
let pendingDeleteType = null;

// 在全域變數區塊添加（約第 50 行）
let modalSwipeInitialized = false;  // ⭐ 滑動關閉初始化標記
let modalScrollable = null;         // 可滾動容器
let modalStartY = 0;                // 拖動起始點
let modalCurrentY = 0;              // 當前觸控點
let isModalDragging = false;        // 是否正在拖動

// ==========================================
// 1. 初始化
// ==========================================

document.addEventListener('DOMContentLoaded', async () => {
  initFooter('password-btn');
  
  if (!checkSettings()) {
    return;
  }
  
  // 檢查 Session 是否有效
  if (isSessionValid()) {
    console.log('✅ Session 有效，嘗試恢復...');
    unlockKey = restoreUnlockKey();
    
    if (unlockKey) {
      console.log('✅ 成功恢復 unlockKey，直接解鎖');
      unlockApp(true);
      return;
    } else {
      console.warn('⚠️ 無法恢復 unlockKey，清除 Session');
      clearSession();
    }
  }
  
  await checkPinStatus();
});

// 在 DOMContentLoaded 的最後面添加
window.addEventListener('beforeunload', (e) => {
  if (isSaving) {
    e.preventDefault();
    e.returnValue = '資料正在保存中，確定要離開嗎？';
    return e.returnValue;
  }
});

// ==========================================
// 2. PIN 碼管理
// ==========================================

async function checkPinStatus() {
  const pinHash = localStorage.getItem('passwordPinHash');
  
  if (!pinHash) {
    document.getElementById('lockTitle').textContent = '載入中...';
    document.getElementById('lockSubtitle').textContent = '正在檢查資料';
    
    try {
      const data = await getAllData('password');
      const hasData = data && data.length > 0;
      
      if (hasData) {
        document.getElementById('lockTitle').textContent = '請輸入 PIN 碼';
        document.getElementById('lockSubtitle').textContent = '偵測到已有資料，請輸入原本的 PIN 碼';
      } else {
        document.getElementById('lockTitle').textContent = '請設定 4 位數 PIN 碼';
        document.getElementById('lockSubtitle').textContent = '首次使用，請建立您的 PIN 碼';
      }
    } catch (error) {
      console.error('檢查 PIN 狀態失敗:', error);
      document.getElementById('lockTitle').textContent = '請設定 4 位數 PIN 碼';
      document.getElementById('lockSubtitle').textContent = '首次使用，請建立您的 PIN 碼';
    }
  } else {
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
  const pinHash = localStorage.getItem('passwordPinHash');
  
  if (!pinHash) {
    console.log('🔐 第一次使用，檢查 Sheet...');
    const data = await getAllData('password');
    
    if (!data || data.length === 0) {
      console.log('✨ Sheet 無資料，設定新 PIN');
      await setupNewPin();
    } else {
      console.log('🔑 Sheet 有資料，驗證舊 PIN');
      unlockKey = currentPin;
      
      try {
        const decrypted = decryptData(data[0].encrypted);
        
        const hash = CryptoJS.SHA256(currentPin).toString();
        localStorage.setItem('passwordPinHash', hash);
        
        console.log('✅ PIN 驗證成功(從加密資料)');
        unlockApp();
      } catch (error) {
        console.error('❌ 解密失敗:', error);
        unlockKey = null;
        showPinError('PIN 碼錯誤');
        currentPin = '';
        updatePinDisplay();
      }
    }
  } else {
    console.log('🔐 已有 PIN Hash，正常驗證');
    await checkExistingPin();
  }
}

async function setupNewPin() {
  try {
    const hash = CryptoJS.SHA256(currentPin).toString();
    localStorage.setItem('passwordPinHash', hash);
    unlockKey = currentPin;
    
    try {
      await initPasswordSheet();
    } catch (error) {
      console.error('初始化工作表失敗:', error);
      showError('初始化失敗: ' + error.message);
      return;
    }
    
    console.log('✅ PIN 碼設定成功');
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
    const storedHash = localStorage.getItem('passwordPinHash');
    const inputHash = CryptoJS.SHA256(currentPin).toString();
    
    if (inputHash === storedHash) {
      unlockKey = currentPin;
      console.log('✅ PIN 驗證成功');
      unlockApp();
    } else {
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

// 輔助函數(放在文件頂部)
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function unlockApp(fromRestore = false) {
  if (!fromRestore && currentPin) {
    setSessionUnlocked(currentPin);
  }
  
  const lockScreen = document.getElementById('lockScreen');
  const mainWrapper = document.getElementById('mainWrapper');
  const addBtn = document.getElementById('addBtn');
  const lockIcon = document.querySelector('.lock-icon');
  const doorIcon = document.querySelector('.lock-icon img');
  
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
    const loadPromise = loadPasswords();
    await sleep(100);
    lockScreen.classList.add('dissolving');
    await sleep(600);
    
    lockScreen.style.display = 'none';
    mainWrapper.style.display = 'block';
    addBtn.style.display = 'block';
    mainWrapper.classList.add('entering');
    
    await sleep(400);
    mainWrapper.classList.remove('entering');
    
    await loadPromise;
    
  } catch (error) {
    console.error('解鎖動畫錯誤:', error);
    lockScreen.style.display = 'none';
    mainWrapper.style.display = 'block';
    addBtn.style.display = 'block';
    loadPasswords();
  }
}

function lockApp() {
  clearSession();
  currentPin = '';
  updatePinDisplay();
  
  const lockScreen = document.getElementById('lockScreen');
  const mainWrapper = document.getElementById('mainWrapper');
  const addBtn = document.getElementById('addBtn');
  const doorIcon = document.querySelector('.lock-icon img');
  
  // 重置動畫狀態
  lockScreen.classList.remove('dissolving');
  mainWrapper.classList.remove('entering');
  
  // 重置門圖標
  if (doorIcon) {
    doorIcon.src = '../assets/icons/door-closed.svg'; // 改回關閉的門
  }
  
  lockScreen.style.display = 'flex';
  mainWrapper.style.display = 'none';
  addBtn.style.display = 'none';
  
  document.getElementById('lockTitle').textContent = '請輸入 PIN 碼';
  document.getElementById('lockSubtitle').textContent = '';
}


// ==========================================
// 3. 初始化 Sheet
// ==========================================

async function initPasswordSheet() {
  if (sheetInitialized) {
    console.log('⚡ 工作表已初始化，跳過檢查');
    return true;
  }
  
  try {
    console.log('開始初始化密碼工作表...');
    const headers = ['id', 'encrypted', 'category', 'categoryOrder', 'order', 'updatedAt'];
    await ensureSheetExists('password', headers);
    console.log('✅ 密碼工作表初始化完成');
    
    sheetInitialized = true;
    return true;
  } catch (error) {
    console.error('❌ 初始化密碼工作表失敗:', error);
    throw error;
  }
}

// ==========================================
// 4. 載入密碼
// ==========================================

async function loadPasswords() {
  try {
    const data = await getAllData('password');
    
    if (!data || data.length === 0) {
      passwords = [];
      categories = [];
      renderCategories();
      renderPasswords();
      return;
    }
    
    // 解密密碼資料
    passwords = [];
    const categoryMap = new Map();
    
    for (const row of data) {
      try {
        if (!row.encrypted) {
          console.warn('跳過無加密資料的列:', row.id);
          continue;
        }
        
        const decrypted = decryptData(row.encrypted);
        const password = {
          id: row.id,
          ...decrypted,
          category: row.category || '未分類',
          categoryOrder: parseInt(row.categoryOrder) || 0,
          order: parseInt(row.order) || 0
        };
        
        passwords.push(password);
        
        // 收集類別資訊
        if (!categoryMap.has(password.category)) {
          categoryMap.set(password.category, password.categoryOrder);
        }
      } catch (error) {
        console.error('解密密碼失敗 (ID: ' + row.id + '):', error);
      }
    }
    
    // 整理類別列表
    categories = Array.from(categoryMap.entries())
      .map(([name, order]) => ({ name, order }))
      .sort((a, b) => a.order - b.order);
    
    // 按順序排序密碼
    passwords.sort((a, b) => a.order - b.order);
    
    console.log('✅ 載入完成:', passwords.length, '個密碼,', categories.length, '個類別');
    
    renderCategories();
    
    // 如果有類別，自動選擇第一個
    if (categories.length > 0 && !currentCategory) {
      selectCategory(categories[0].name);
    } else if (currentCategory) {
      selectCategory(currentCategory);
    } else {
      renderPasswords();
    }
    
  } catch (error) {
    console.error('載入密碼失敗:', error);
    showError('載入失敗: ' + error.message);
  }
}

// ==========================================
// 5. 渲染類別選單
// ==========================================

function renderCategories() {
  const sidebar = document.getElementById('categorySidebar');
  
  if (categories.length === 0) {
    sidebar.innerHTML = '<div class="category-empty">尚無類別</div>';
    return;
  }
  
  const wasDragging = isDragging;
  const currentDragged = draggedCategory;
  
  sidebar.innerHTML = categories.map(cat => `
    <div class="category-item ${currentCategory === cat.name ? 'active' : ''} ${wasDragging && currentDragged === cat.name ? 'dragging' : ''}" 
         id="category-${escapeId(cat.name)}"
         onclick="selectCategory('${escapeHtml(cat.name)}')">
      ${escapeHtml(cat.name)}
    </div>
  `).join('');
  
  categories.forEach(cat => {
    setupCategoryDragHandlers(cat.name);
  });
}

function selectCategory(categoryName) {
  currentCategory = categoryName;
  renderCategories();
  renderPasswords();
}

// ==========================================
// 6. 渲染密碼列表
// ==========================================

function renderPasswords() {
  const passwordList = document.getElementById('passwordList');
  
  const filteredPasswords = currentCategory 
    ? passwords.filter(p => p.category === currentCategory)
    : passwords;
  
  if (filteredPasswords.length === 0) {
    passwordList.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🔐</div>
        <div class="empty-text">${currentCategory ? '此類別尚無密碼' : '尚未新增任何密碼'}</div>
      </div>
    `;
    return;
  }
  
passwordList.innerHTML = filteredPasswords.map(pwd => `
  <div class="password-item ${expandedPasswordId === pwd.id ? 'expanded' : ''}" 
       id="password-${pwd.id}">
    <div class="password-header" onclick="togglePassword('${pwd.id}')">
      <div class="password-icon" id="icon-${pwd.id}">
        <img src="../assets/icons/${expandedPasswordId === pwd.id ? 'lock-open' : 'lock'}.svg" alt="toggle">
      </div>
      <div class="password-name">${escapeHtml(pwd.name)}</div>
      <div class="password-header-actions">
        <button class="header-action-btn" onclick="event.stopPropagation(); editPassword('${pwd.id}')">
          <img src="../assets/icons/pen-to-square.svg" alt="edit">
        </button>
        <button class="header-action-btn" onclick="event.stopPropagation(); deletePassword('${pwd.id}')">
          <img src="../assets/icons/trash-can.svg" alt="delete">
        </button>
      </div>
    </div>
      
      <div class="password-detail">
        <div class="password-detail-content">
          
          <div class="detail-row" onclick="event.stopPropagation(); copyToClipboard('${escapeHtml(pwd.account)}', '帳號')">
            <div class="detail-label">帳號</div>
            <div class="detail-value">${escapeHtml(pwd.account)}</div>
          </div>
          
          <div class="detail-row">
            <div class="detail-label">密碼</div>
            <div class="detail-value password-value password-hidden" id="pwd-value-${pwd.id}" onclick="event.stopPropagation(); copyToClipboard('${escapeHtml(pwd.password)}', '密碼')">********</div>
<div class="detail-actions">
  <button class="detail-btn" id="eye-btn-${pwd.id}" onclick="event.stopPropagation(); togglePasswordVisibility('${pwd.id}', '${escapeHtml(pwd.password)}')">
    <img src="../assets/icons/eye.svg" alt="show">
  </button>
</div>
          </div>
          
          ${pwd.notes ? `
          <div class="detail-row" onclick="event.stopPropagation(); copyToClipboard('${escapeHtml(pwd.notes)}', '備註')">
            <div class="detail-label">備註</div>
            <div class="detail-value">${escapeHtml(pwd.notes)}</div>
          </div>
          ` : ''}
          
        </div>
      </div>
    </div>
  `).join('');
  
  filteredPasswords.forEach(pwd => {
    setupPasswordDragHandlers(pwd.id);
  });
}

// ==========================================
// 7. 展開/收合密碼
// ==========================================

function togglePassword(id) {
  if (expandedPasswordId === id) {
    expandedPasswordId = null;
  } else {
    expandedPasswordId = id;
  }
  
  // 更新圖標
  const iconElement = document.getElementById(`icon-${id}`);
  if (iconElement) {
    const img = iconElement.querySelector('img');
    if (img) {
      img.src = expandedPasswordId === id ? '../assets/icons/lock-open.svg' : '../assets/icons/lock.svg';
    }
  }
  
  renderPasswords();
}

// ==========================================
// 8. 密碼顯示切換
// ==========================================

function togglePasswordVisibility(id, password) {
  const valueElement = document.getElementById(`pwd-value-${id}`);
  const eyeButton = document.getElementById(`eye-btn-${id}`);
  const eyeImg = eyeButton?.querySelector('img');
  
  if (valueElement.classList.contains('password-hidden')) {
    valueElement.textContent = password;
    valueElement.classList.remove('password-hidden');
    if (eyeImg) {
      eyeImg.src = '../assets/icons/eye-slash.svg';
    }
  } else {
    valueElement.textContent = '*******';
    valueElement.classList.add('password-hidden');
    if (eyeImg) {
      eyeImg.src = '../assets/icons/eye.svg';
    }
  }
}

// ==========================================
// 9. 加密/解密
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
// 10. 新增密碼
// ==========================================

function openAddModal() {
  editingPasswordId = null;
  document.getElementById('passwordForm').reset();
  
  updateCategorySelect();
  
  if (currentCategory) {
    document.getElementById('categorySelect').value = currentCategory;
  }
  
  document.getElementById('passwordModal').classList.add('show');

  if (!modalSwipeInitialized) {
    setupModalSwipeToClose();
    modalSwipeInitialized = true;
  }
}

function updateCategorySelect() {
  const select = document.getElementById('categorySelect');
  select.innerHTML = '<option value="">選擇類別</option>' +
    categories.map(cat => `<option value="${escapeHtml(cat.name)}">${escapeHtml(cat.name)}</option>`).join('');
}

document.getElementById('passwordForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  await savePassword();
});

async function savePassword() {
  try {
    const name = document.getElementById('nameInput').value.trim();
    const selectedCategory = document.getElementById('categorySelect').value.trim();
    const newCategory = document.getElementById('newCategoryInput').value.trim();
    const account = document.getElementById('accountInput').value.trim();
    const password = document.getElementById('passwordInput').value;
    const notes = document.getElementById('notesInput').value.trim();
    
    const category = newCategory || selectedCategory || '未分類';
    
    const passwordData = {
      name,
      account,
      password,
      notes
    };
    
    const encrypted = encryptData(passwordData);
    const now = new Date().toISOString();
    
    const isNewCategory = !categories.some(c => c.name === category);
    const categoryOrder = isNewCategory ? categories.length : 
                         categories.find(c => c.name === category)?.order || 0;
    
    if (editingPasswordId) {
      const pwd = passwords.find(p => p.id === editingPasswordId);
      const rowData = [editingPasswordId, encrypted, category, categoryOrder, pwd.order, now];
      await updateRowById('password', editingPasswordId, rowData);
      showSuccess('密碼更新成功');
    } else {
      const nextId = await getNextId('password', 'pwd');
      const order = passwords.filter(p => p.category === category).length;
      const rowData = [nextId, encrypted, category, categoryOrder, order, now];
      await appendRow('password', rowData);
      showSuccess('密碼新增成功');
    }
    
    closeModal();
    await loadPasswords();
    
    if (isNewCategory) {
      selectCategory(category);
    }
    
  } catch (error) {
    console.error('儲存密碼失敗:', error);
    showError('儲存失敗: ' + error.message);
  }
}

// ==========================================
// 11. 編輯密碼
// ==========================================

function editPassword(passwordId) {
  const pwd = passwords.find(p => p.id === passwordId);
  if (!pwd) return;
  
  editingPasswordId = passwordId;
  
  document.getElementById('nameInput').value = pwd.name;
  document.getElementById('accountInput').value = pwd.account;
  document.getElementById('passwordInput').value = pwd.password;
  document.getElementById('notesInput').value = pwd.notes || '';
  
  updateCategorySelect();
  document.getElementById('categorySelect').value = pwd.category;
  
  document.getElementById('passwordModal').classList.add('show');

  if (!modalSwipeInitialized) {
    setupModalSwipeToClose();
    modalSwipeInitialized = true;
  }
}

// ==========================================
// 12. 刪除密碼
// ==========================================

function deletePassword(passwordId) {
  pendingDeleteId = passwordId;
  pendingDeleteType = 'password';
  document.getElementById('confirmTitle').textContent = '確定要刪除這個密碼嗎？';
  document.getElementById('confirmSubtitle').textContent = '此操作無法復原';
  document.getElementById('confirmModal').classList.add('show');
}

async function deletePasswordConfirmed() {
  if (!pendingDeleteId) return;
  
  try {
    await deleteRowById('password', pendingDeleteId);
    showSuccess('密碼刪除成功');
    await loadPasswords();
  } catch (error) {
    console.error('刪除密碼失敗:', error);
    showError('刪除失敗: ' + error.message);
  }
}

// ==========================================
// 13. 刪除類別
// ==========================================

async function deleteCategory(categoryName) {
  const categoryPasswords = passwords.filter(p => p.category === categoryName);
  
  if (categoryPasswords.length === 0) {
    showSuccess('類別已刪除');
    return;
  }
  
  pendingDeleteId = categoryName;
  pendingDeleteType = 'category';
  document.getElementById('confirmTitle').textContent = '確定要刪除此類別嗎？';
  document.getElementById('confirmSubtitle').textContent = `將同時刪除 ${categoryPasswords.length} 個密碼`;
  document.getElementById('confirmModal').classList.add('show');
}

async function deleteCategoryConfirmed() {
  if (!pendingDeleteId) return;
  
  try {
    const categoryName = pendingDeleteId;
    const categoryPasswords = passwords.filter(p => p.category === categoryName);
    
    for (const pwd of categoryPasswords) {
      await deleteRowById('password', pwd.id);
    }
    
    showSuccess(`類別 "${categoryName}" 及其 ${categoryPasswords.length} 個密碼已刪除`);
    
    if (currentCategory === categoryName) {
      currentCategory = null;
    }
    
    await loadPasswords();
  } catch (error) {
    console.error('刪除類別失敗:', error);
    showError('刪除失敗: ' + error.message);
  }
}

// ==========================================
// 14. 確認操作
// ==========================================

function closeConfirm() {
  document.getElementById('confirmModal').classList.remove('show');
  pendingDeleteId = null;
  pendingDeleteType = null;
}

async function confirmAction() {
  if (pendingDeleteType === 'password') {
    await deletePasswordConfirmed();
  } else if (pendingDeleteType === 'category') {
    await deleteCategoryConfirmed();
  }
  closeConfirm();
}

// ==========================================
// 15. 密碼拖曳排序
// ==========================================

let passwordDragLastSwapTime = 0; // ✅ 新增：防止頻繁交換

function setupPasswordDragHandlers(passwordId) {
  const passwordElement = document.getElementById(`password-${passwordId}`);
  if (!passwordElement) return;
  
  const header = passwordElement.querySelector('.password-header');
  if (!header) return;
  
  // ✅ 每個密碼自己的拖曳狀態
  let localTimer = null;
  let hasMoved = false;
  let dragStartY = null;
  const MOVE_THRESHOLD = 10;
  
  header.addEventListener('touchstart', (e) => {
    if (passwordElement.classList.contains('expanded')) return;
    
    clearTimeout(localTimer);
    hasMoved = false;
    
    const touch = e.touches[0];
    dragStartY = touch.clientY;
    
    localTimer = setTimeout(() => {
      if (!hasMoved && !isDragging) {
        startDragPassword(passwordId, e);
      }
    }, 500);
  }, { passive: false });
  
  header.addEventListener('touchmove', (e) => {
    if (dragStartY === null) return;
    
    const touch = e.touches[0];
    const distance = Math.abs(touch.clientY - dragStartY);
    
    if (distance > MOVE_THRESHOLD) {
      hasMoved = true;
      clearTimeout(localTimer);
    }
  }, { passive: false });
  
  header.addEventListener('touchend', () => {
    clearTimeout(localTimer);
    dragStartY = null;
    hasMoved = false;
  });
  
  // 滑鼠事件
  header.addEventListener('mousedown', (e) => {
    if (passwordElement.classList.contains('expanded')) return;
    
    clearTimeout(localTimer);
    hasMoved = false;
    dragStartY = e.clientY;
    
    localTimer = setTimeout(() => {
      if (!hasMoved && !isDragging) {
        startDragPassword(passwordId, e);
      }
    }, 500);
  });
  
  document.addEventListener('mousemove', (e) => {
    if (dragStartY === null) return;
    const distance = Math.abs(e.clientY - dragStartY);
    if (distance > MOVE_THRESHOLD) {
      hasMoved = true;
      clearTimeout(localTimer);
    }
  });
  
  document.addEventListener('mouseup', () => {
    clearTimeout(localTimer);
    dragStartY = null;
    hasMoved = false;
  });
}

function startDragPassword(passwordId, event) {
  isDragging = true;
  draggedPassword = passwordId;
  
  const passwordElement = document.getElementById(`password-${passwordId}`);
  if (passwordElement) {
    passwordElement.classList.add('dragging');
  }
  
  if (navigator.vibrate) {
    navigator.vibrate(50);
  }
  
  console.log('🎯 開始拖曳密碼:', passwordId);
}

function handleDragPasswordMove(event) {
  if (!isDragging || !draggedPassword) return;
  
  event.preventDefault();
  
  const touch = event.touches ? event.touches[0] : event;
  const y = touch.clientY;
  
  if (dragOverElement) {
    dragOverElement.classList.remove('drag-over');
    dragOverElement = null;
  }
  
  const draggedIndex = passwords.findIndex(p => p.id === draggedPassword);
  if (draggedIndex === -1) return;
  
  const categoryPasswords = passwords.filter(p => p.category === currentCategory);
  const allPasswordElements = Array.from(document.querySelectorAll('.password-item'));
  
  let targetIndex = -1;
  
  for (let i = 0; i < allPasswordElements.length; i++) {
    const rect = allPasswordElements[i].getBoundingClientRect();
    const centerY = rect.top + rect.height / 2;
    
    if (y < centerY) {
      targetIndex = i;
      break;
    }
  }
  
  if (targetIndex === -1) {
    targetIndex = allPasswordElements.length - 1;
  }
  
  const targetElement = allPasswordElements[targetIndex];
  if (!targetElement) return;
  
  const targetId = targetElement.id.replace('password-', '');
  
  if (targetId !== draggedPassword && targetId) {
    const now = Date.now();
    if (now - passwordDragLastSwapTime > 200) { // ✅ 防抖動
      targetElement.classList.add('drag-over');
      dragOverElement = targetElement;
      
      swapPasswords(draggedPassword, targetId);
      passwordDragLastSwapTime = now;
    }
  }
}

// ✅ 新增：全域監聽器
document.addEventListener('touchmove', (e) => {
  if (isDragging && draggedPassword) {
    handleDragPasswordMove(e);
  }
}, { passive: false });

document.addEventListener('mousemove', (e) => {
  if (isDragging && draggedPassword) {
    handleDragPasswordMove(e);
  }
});

document.addEventListener('touchend', endDragPassword);
document.addEventListener('mouseup', endDragPassword);

function endDragPassword() {
  if (!isDragging || !draggedPassword) return;
  
  console.log('🛑 結束拖曳密碼:', draggedPassword);
  
  isDragging = false;
  
  const passwordElement = document.getElementById(`password-${draggedPassword}`);
  if (passwordElement) {
    passwordElement.classList.remove('dragging');
  }
  
  if (dragOverElement) {
    dragOverElement.classList.remove('drag-over');
    dragOverElement = null;
  }
  
  passwordDragLastSwapTime = 0;
  
  if (draggedPassword) {
    debouncedSavePasswordOrder();
  }
  
  draggedPassword = null;
  
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
}

async function swapPasswords(passwordId1, passwordId2) {
  const pwd1 = passwords.find(p => p.id === passwordId1);
  const pwd2 = passwords.find(p => p.id === passwordId2);
  
  if (!pwd1 || !pwd2 || pwd1.category !== pwd2.category) return;
  
  [pwd1.order, pwd2.order] = [pwd2.order, pwd1.order];
  
  passwords.sort((a, b) => {
    if (a.category !== b.category) {
      return a.categoryOrder - b.categoryOrder;
    }
    return a.order - b.order;
  });
  
  renderPasswords();
  
  requestAnimationFrame(() => {
    passwords.filter(p => p.category === currentCategory).forEach(pwd => {
      setupPasswordDragHandlers(pwd.id);
    });
    
    // ✅ 恢復拖曳視覺效果
    if (isDragging && draggedPassword) {
      const draggedElement = document.getElementById(`password-${draggedPassword}`);
      if (draggedElement) {
        draggedElement.classList.add('dragging');
      }
    }
  });
}

async function savePasswordOrder() {
  try {
    const categoryPasswords = passwords.filter(p => p.category === currentCategory);
    
    await Promise.all(
      categoryPasswords.map(pwd => {
        const encrypted = encryptData({
          name: pwd.name,
          account: pwd.account,
          password: pwd.password,
          notes: pwd.notes
        });
        const now = new Date().toISOString();
        const rowData = [pwd.id, encrypted, pwd.category, pwd.categoryOrder, pwd.order, now];
        return updateRowById('password', pwd.id, rowData);
      })
    );
  } catch (error) {
    console.error('保存密碼順序失敗:', error);
    throw error;
  }
}

// ==========================================
// 16. 類別拖曳排序
// ==========================================

function setupCategoryDragHandlers(categoryName) {
  const categoryElement = document.getElementById(`category-${escapeId(categoryName)}`);
  if (!categoryElement) return;

  // ✅ 每個 category 自己的拖曳狀態
  let localTimer = null;
  let hasMoved = false;
  let dragStartX = null;
  const MOVE_THRESHOLD = 10; // 超過這距離視為滑動，取消長按

  // 🟢 TouchStart：開始計時判斷是否長按
  categoryElement.addEventListener('touchstart', (e) => {
    clearTimeout(localTimer);
    hasMoved = false;

    const touch = e.touches[0];
    dragStartX = touch.clientY; // ✅ 改用 Y 軸（垂直排列）

    // 長按 800ms 才進入拖曳模式
    localTimer = setTimeout(() => {
      if (!hasMoved && !isDragging) {
        startDragCategory(categoryName, e);
      }
    }, 800);
  }, { passive: false });

  // 🟢 TouchMove：偵測滑動，超過閾值就取消長按
  categoryElement.addEventListener('touchmove', (e) => {
    if (dragStartX === null) return;

    const touch = e.touches[0];
    const distance = Math.abs(touch.clientY - dragStartX); // ✅ 改用 Y 軸判斷垂直移動
    if (distance > MOVE_THRESHOLD) {
      hasMoved = true;
      clearTimeout(localTimer);
    }
  }, { passive: false });

  // 🟢 TouchEnd：結束時清掉計時器、重設狀態
  categoryElement.addEventListener('touchend', () => {
    clearTimeout(localTimer);
    dragStartX = null;
    hasMoved = false;
  });

  // 🖱️ 滑鼠事件支援（同理，防誤觸＋Y軸）
  categoryElement.addEventListener('mousedown', (e) => {
    clearTimeout(localTimer);
    hasMoved = false;
    dragStartX = e.clientY; // ✅ 改用 Y 軸

    localTimer = setTimeout(() => {
      if (!hasMoved && !isDragging) {
        startDragCategory(categoryName, e);
      }
    }, 800);
  });

  document.addEventListener('mousemove', (e) => {
    if (dragStartX === null) return;
    const distance = Math.abs(e.clientY - dragStartX); // ✅ 改用 Y 軸
    if (distance > MOVE_THRESHOLD) {
      hasMoved = true;
      clearTimeout(localTimer);
    }
  });

  document.addEventListener('mouseup', () => {
    clearTimeout(localTimer);
    dragStartX = null;
    hasMoved = false;
  });
}


function startDragCategory(categoryName, event) {
  isDragging = true;
  draggedCategory = categoryName;
  
  const categoryElement = document.getElementById(`category-${escapeId(categoryName)}`);
  if (categoryElement) {
    categoryElement.classList.add('dragging');
  }
  
  if (navigator.vibrate) {
    navigator.vibrate(50);
  }
}

function handleDragCategoryMove(event) {
  if (!isDragging || !draggedCategory) return;

  event.preventDefault();
  
  const touch = event.touches ? event.touches[0] : event;
  const y = touch.clientY; // ✅ 改用 Y 軸

  if (dragOverElement) {
    dragOverElement.classList.remove('drag-over');
    dragOverElement = null;
  }

  const draggedIndex = categories.findIndex(c => c.name === draggedCategory);
  if (draggedIndex === -1) return;

  const allCategoryElements = Array.from(document.querySelectorAll('.category-item'));

  let targetIndex = -1;

  // 👉 改用 Y 軸中心點判斷觸控點在哪個分類
  for (let i = 0; i < allCategoryElements.length; i++) {
    const rect = allCategoryElements[i].getBoundingClientRect();
    const centerY = rect.top + rect.height / 2; // ✅ 改用 top + height

    // 判斷觸控點是否在當前元素上方
    if (y < centerY) {
      targetIndex = i;
      break;
    }
  }

  // 如果沒有比任何一個更靠上，代表在最後一個下方
  if (targetIndex === -1) {
    targetIndex = allCategoryElements.length - 1;
  }

  // 目標不同時才交換
  if (targetIndex !== draggedIndex && targetIndex >= 0) {
    const now = Date.now();
    if (now - lastSwapTime > 200) {
      const targetCategory = categories[targetIndex];

      if (targetCategory && targetCategory.name !== draggedCategory) {
        allCategoryElements[targetIndex].classList.add('drag-over');
        dragOverElement = allCategoryElements[targetIndex];

        swapCategories(draggedCategory, targetCategory.name);
        lastSwapTime = now;
      }
    }
  }
}

document.addEventListener('touchmove', handleDragCategoryMove, { passive: false });
document.addEventListener('mousemove', handleDragCategoryMove);

document.addEventListener('touchend', endDragCategory);
document.addEventListener('mouseup', endDragCategory);

async function endDragCategory() {
  if (!isDragging || !draggedCategory) return;
  
  isDragging = false;
  
  const categoryElement = document.getElementById(`category-${escapeId(draggedCategory)}`);
  if (categoryElement) {
    categoryElement.classList.remove('dragging');
  }
  
  if (dragOverElement) {
    dragOverElement.classList.remove('drag-over');
    dragOverElement = null;
  }
  
  lastSwapTime = 0;
  lastSwappedPair = null;
  
  if (draggedCategory) {
    debouncedSaveCategoryOrder();
  }
  
  draggedCategory = null;
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
}

async function swapCategories(categoryName1, categoryName2) {
  const cat1 = categories.find(c => c.name === categoryName1);
  const cat2 = categories.find(c => c.name === categoryName2);
  
  if (!cat1 || !cat2) return;
  
  [cat1.order, cat2.order] = [cat2.order, cat1.order];
  
  passwords.forEach(pwd => {
    if (pwd.category === categoryName1) {
      pwd.categoryOrder = cat1.order;
    } else if (pwd.category === categoryName2) {
      pwd.categoryOrder = cat2.order;
    }
  });
  
  categories.sort((a, b) => a.order - b.order);
  
  renderCategories();
  
  // 重新綁定事件，但不清除拖曳狀態
  requestAnimationFrame(() => {
    categories.forEach(cat => {
      setupCategoryDragHandlers(cat.name);
    });
    
    // 恢復拖曳視覺效果
    if (isDragging && draggedCategory) {
      const draggedElement = document.getElementById(`category-${escapeId(draggedCategory)}`);
      if (draggedElement) {
        draggedElement.classList.add('dragging');
      }
    }
  });
}

async function saveCategoryOrder() {
  try {
    await Promise.all(
      passwords.map(pwd => {
        const encrypted = encryptData({
          name: pwd.name,
          account: pwd.account,
          password: pwd.password,
          notes: pwd.notes
        });
        const now = new Date().toISOString();
        const rowData = [pwd.id, encrypted, pwd.category, pwd.categoryOrder, pwd.order, now];
        return updateRowById('password', pwd.id, rowData);
      })
    );
  } catch (error) {
    console.error('保存類別順序失敗:', error);
    throw error;
  }
}

// ==========================================
// 保存指示器
// ==========================================

function showSavingIndicator() {
  const indicator = document.getElementById('savingIndicator');
  if (indicator) {
    indicator.classList.add('show');
  }
}

function hideSavingIndicator() {
  const indicator = document.getElementById('savingIndicator');
  if (indicator) {
    indicator.classList.remove('show');
  }
}

// ==========================================
// 防抖保存
// ==========================================

function debouncedSaveCategoryOrder() {
  clearTimeout(saveTimer);
  
  // 立即顯示保存指示器
  showSavingIndicator();
  isSaving = true;
  
  saveTimer = setTimeout(async () => {
    try {
      await saveCategoryOrder();
      console.log('✅ 類別順序保存完成');
    } catch (error) {
      console.error('保存類別順序失敗:', error);
      showError('保存失敗');
    } finally {
      isSaving = false;
      hideSavingIndicator();
    }
  }, 300); // 減少延遲到 300ms
}

function debouncedSavePasswordOrder() {
  clearTimeout(saveTimer);
  
  // 立即顯示保存指示器
  showSavingIndicator();
  isSaving = true;
  
  saveTimer = setTimeout(async () => {
    try {
      await savePasswordOrder();
      console.log('✅ 密碼順序保存完成');
    } catch (error) {
      console.error('保存密碼順序失敗:', error);
      showError('保存失敗');
    } finally {
      isSaving = false;
      hideSavingIndicator();
    }
  }, 300); // 減少延遲到 300ms
}

// ==========================================
// 17. 複製功能
// ==========================================

async function copyToClipboard(text, label) {
  try {
    await navigator.clipboard.writeText(text);
    showCopyToast(`✓ 已複製${label}`);
  } catch (error) {
    console.error('複製失敗:', error);
    showCopyToast('✗ 複製失敗');
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

// ==========================================
// 18. 輔助函數
// ==========================================

function closeModal() {
  document.getElementById('passwordModal').classList.remove('show');
  document.getElementById('passwordForm').reset();
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function escapeId(text) {
  return text.replace(/[^a-zA-Z0-9]/g, '_');
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
  
  if (!settings.sheetIds || !settings.sheetIds.password) {
    showError('請先在設定頁面設定密碼 Sheet ID');
    setTimeout(() => {
      window.location.href = '../pages/settings.html';
    }, 2000);
    return false;
  }
  
  return true;
}

// ==========================================
// 彈窗滑動關閉功能
// ==========================================


function setupModalSwipeToClose() {
  const modalContent = document.querySelector('#passwordModal .modal-content');
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