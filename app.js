// Firebase SDK v9 modular imports
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js';
import {
  getFirestore, collection, addDoc, getDocs, getDoc, setDoc, deleteDoc, doc, updateDoc,
  query, where, orderBy, Timestamp
} from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: "AIzaSyDpPhb_u_TgfVlbv9aRwBy4b7Zw83G6vPA",
  authDomain: "kakeibo-app-47a67.firebaseapp.com",
  projectId: "kakeibo-app-47a67",
  storageBucket: "kakeibo-app-47a67.firebasestorage.app",
  messagingSenderId: "808694368518",
  appId: "1:808694368518:web:0e842a3e5f91138ad37687"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ===================================
// グローバル変数
// ===================================
let debugMode = false;
let creditCards = [];
let expenses = [];
let categories = [];
let fixedExpenses = [];
let fixedExpenseSkips = [];
let variableRecurring = [];
let variableRecurringEntries = [];
let variableRecurringSkips = [];
let currentBudget = null;
let currentYearMonth = '';
let debugDate = null;
let chartPeriod = 4;
let totalChart = null;
let cardsChart = null;
let filterCardId = 'all';
let searchQuery = '';
let searchFrom = null;
let searchTo = null;
let categoryPieChart = null;
let categoryBarChart = null;

// トースト通知
function showToast(message, isError = false) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = 'toast' + (isError ? ' error' : '');
  toast.classList.add('show');
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => toast.classList.remove('show'), 2500);
}

const DEFAULT_CATEGORIES = [
  '食費', '交通費', '娯楽', '日用品', '医療費',
  '通信費', '光熱費', '住居費', '教育費', 'その他'
];

// ===================================
// ユーティリティ関数
// ===================================
function getCurrentDate() {
  if (debugMode && debugDate) return new Date(debugDate);
  return new Date();
}

function getYearMonth(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function formatDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatCurrency(amount) {
  return `¥${amount.toLocaleString('ja-JP')}`;
}

function generateRandomColor() {
  const colors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
    '#F7DC6F', '#BB8FCE', '#85C1E2', '#F8B500', '#E74C3C',
    '#3498DB', '#2ECC71', '#E67E22', '#9B59B6', '#1ABC9C'
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

// ===================================
// タブ管理
// ===================================
function initTabs() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');
  const savedTab = localStorage.getItem('kakeibo-active-tab') || 'dashboard';

  function switchTab(tabId) {
    tabBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tabId));
    tabContents.forEach(content => content.classList.toggle('active', content.id === `tab-${tabId}`));
    localStorage.setItem('kakeibo-active-tab', tabId);

    // 分析タブに切り替えた時はグラフを再描画
    if (tabId === 'analysis') {
      setTimeout(() => { updateCharts(); updateCategoryCharts(); }, 100);
    }
  }

  tabBtns.forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));
  switchTab(savedTab);
}

// ===================================
// 月選択の初期化
// ===================================
function initMonthSelector() {
  const selector = document.getElementById('month-selector');
  const currentDate = getCurrentDate();
  const currentYM = getYearMonth(currentDate);

  const months = [];
  for (let i = 0; i < 12; i++) {
    const date = new Date(currentDate);
    date.setMonth(date.getMonth() - i);
    months.push({ value: getYearMonth(date), label: `${date.getFullYear()}年${date.getMonth() + 1}月` });
  }

  selector.innerHTML = months.map(m =>
    `<option value="${m.value}" ${m.value === currentYM ? 'selected' : ''}>${m.label}</option>`
  ).join('');

  currentYearMonth = currentYM;

  selector.addEventListener('change', async (e) => {
    currentYearMonth = e.target.value;
    await loadExpenses();
    await loadBudgetForCurrentMonth();
    renderVariableRecurringInput();
    renderFixedExpenses();
  });
}

// ===================================
// デバッグモード
// ===================================
function initDebugMode() {
  const toggle = document.getElementById('debug-toggle');
  const panel = document.getElementById('debug-panel');
  const dateInput = document.getElementById('debug-date');
  const applyBtn = document.getElementById('apply-debug-date');

  dateInput.value = formatDate(new Date());

  toggle.addEventListener('change', (e) => {
    debugMode = e.target.checked;
    if (debugMode) {
      panel.classList.add('active');
    } else {
      panel.classList.remove('active');
      debugDate = null;
      initMonthSelector();
      loadExpenses();
    }
  });

  applyBtn.addEventListener('click', () => {
    if (dateInput.value) {
      debugDate = dateInput.value;
      initMonthSelector();
      loadExpenses();
      showToast(`デバッグ日付を ${debugDate} に設定しました`);
    }
  });
}

// ===================================
// クレジットカード管理
// ===================================
async function addCreditCard(name) {
  try {
    const docRef = await addDoc(collection(db, 'creditCards'), {
      name, color: generateRandomColor(), createdAt: Timestamp.now()
    });
    await loadCreditCards();
    return docRef.id;
  } catch (error) {
    console.error('カード追加エラー:', error);
    showToast('カード追加に失敗しました', true);
  }
}

async function loadCreditCards() {
  try {
    const snap = await getDocs(collection(db, 'creditCards'));
    creditCards = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderCreditCards();
    updateExpenseCardSelect();
    updateExpenseFilterSelect();
    updateFixedExpenseCardSelect();
  } catch (error) { console.error('カード読み込みエラー:', error); }
}

function deleteCreditCard(cardId) {
  const card = creditCards.find(c => c.id === cardId);
  if (!card) { showToast('カードが見つかりません', true); return; }
  document.getElementById('delete-card-id').value = cardId;
  document.getElementById('delete-card-name').textContent = card.name;
  document.getElementById('delete-card-modal').style.display = 'flex';
}

function closeDeleteCardModal() { document.getElementById('delete-card-modal').style.display = 'none'; }

async function confirmDeleteCard() {
  const cardId = document.getElementById('delete-card-id').value;
  try {
    await deleteDoc(doc(db, 'creditCards', cardId));
    closeDeleteCardModal();
    await loadCreditCards();
    await loadExpenses();
  } catch (error) {
    console.error('カード削除エラー:', error);
    showToast('カード削除に失敗しました', true);
  }
}

function renderCreditCards() {
  const cardsList = document.getElementById('cards-list');
  const emptyState = document.getElementById('cards-empty');
  if (creditCards.length === 0) { emptyState.style.display = 'block'; return; }
  emptyState.style.display = 'none';
  const cardsHTML = creditCards.map(card => `
    <div class="card-badge">
      <span class="card-color-dot" style="background-color: ${card.color};"></span>
      <span>${card.name}</span>
      <button class="card-badge-delete" onclick="deleteCreditCard('${card.id}')">×</button>
    </div>
  `).join('');
  cardsList.innerHTML = cardsHTML + cardsList.querySelector('.empty-state').outerHTML;
}

function updateExpenseCardSelect() {
  const select = document.getElementById('expense-card');
  const val = select.value;
  select.innerHTML = '<option value="">カードを選択してください</option>' +
    creditCards.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  if (val && creditCards.find(c => c.id === val)) select.value = val;
}

function updateExpenseFilterSelect() {
  const select = document.getElementById('expense-filter-card');
  const val = select.value;
  select.innerHTML = '<option value="all">すべてのカード</option>' +
    creditCards.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  if (val && (val === 'all' || creditCards.find(c => c.id === val))) select.value = val;
}

function updateFixedExpenseCardSelect() {
  ['fixed-expense-card', 'vr-card'].forEach(selectId => {
    const select = document.getElementById(selectId);
    if (!select) return;
    const val = select.value;
    select.innerHTML = '<option value="">カードを選択</option>' +
      creditCards.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    if (val && creditCards.find(c => c.id === val)) select.value = val;
  });
}

// ===================================
// カテゴリ管理
// ===================================
let currentCategoryInputId = null;

async function loadCategories() {
  try {
    const snap = await getDocs(collection(db, 'categories'));
    categories = snap.docs.map(d => ({ id: d.id, name: d.data().name, createdAt: d.data().createdAt }));
    categories.sort((a, b) => a.name.localeCompare(b.name));
    if (categories.length === 0) await initializeDefaultCategories();
  } catch (error) { console.error('カテゴリ読み込みエラー:', error); }
}

async function initializeDefaultCategories() {
  for (const name of DEFAULT_CATEGORIES) {
    await addDoc(collection(db, 'categories'), { name, createdAt: Timestamp.now() });
  }
  await loadCategories();
}

async function addCategoryToFirestore(categoryName) {
  try {
    await addDoc(collection(db, 'categories'), { name: categoryName, createdAt: Timestamp.now() });
    await loadCategories();
    return true;
  } catch (error) { console.error('カテゴリ追加エラー:', error); return false; }
}

async function deleteCategoryFromFirestore(categoryId) {
  try {
    await deleteDoc(doc(db, 'categories', categoryId));
    await loadCategories();
    return true;
  } catch (error) { console.error('カテゴリ削除エラー:', error); return false; }
}

function openCategoryModal(inputId) {
  currentCategoryInputId = inputId;
  renderCategoryList();
  document.getElementById('category-modal').style.display = 'flex';
  document.getElementById('category-search').value = '';
}

function closeCategoryModal() {
  document.getElementById('category-modal').style.display = 'none';
  currentCategoryInputId = null;
}

function renderCategoryList(sq = '') {
  const filtered = sq ? categories.filter(c => c.name.toLowerCase().includes(sq.toLowerCase())) : categories;
  const el = document.getElementById('category-list-modal');
  if (filtered.length === 0) { el.innerHTML = '<div class="empty-state">カテゴリが見つかりません</div>'; return; }
  el.innerHTML = filtered.map(c => `
    <div class="category-item">
      <span class="category-name" onclick="selectCategory('${c.name}')">${c.name}</span>
      <div class="category-actions">
        <button class="btn-icon" onclick="selectCategory('${c.name}')" title="選択">→</button>
        <button class="btn-icon btn-icon-danger" onclick="deleteCategory('${c.id}', '${c.name}')" title="削除"><span class="material-symbols-outlined" style="font-size:inherit">delete</span></button>
      </div>
    </div>
  `).join('');
}

function selectCategory(name) {
  if (currentCategoryInputId) document.getElementById(currentCategoryInputId).value = name;
  closeCategoryModal();
}

function deleteCategory(id, name) {
  event.stopPropagation();
  document.getElementById('delete-category-id').value = id;
  document.getElementById('delete-category-name').textContent = name;
  document.getElementById('delete-category-modal').style.display = 'flex';
}

function closeDeleteCategoryModal() { document.getElementById('delete-category-modal').style.display = 'none'; }

async function confirmDeleteCategory() {
  const id = document.getElementById('delete-category-id').value;
  if (await deleteCategoryFromFirestore(id)) {
    closeDeleteCategoryModal();
    renderCategoryList(document.getElementById('category-search').value);
  }
}

async function addNewCategory() {
  const input = document.getElementById('new-category-name');
  const name = input.value.trim();
  if (!name) { showToast('カテゴリ名を入力してください', true); return; }
  if (categories.some(c => c.name === name)) { showToast('このカテゴリは既に存在します', true); return; }
  if (await addCategoryToFirestore(name)) { selectCategory(name); input.value = ''; }
}

document.addEventListener('DOMContentLoaded', () => {
  const si = document.getElementById('category-search');
  if (si) si.addEventListener('input', (e) => renderCategoryList(e.target.value));
  const ni = document.getElementById('new-category-name');
  if (ni) ni.addEventListener('keypress', (e) => { if (e.key === 'Enter') { e.preventDefault(); addNewCategory(); } });
});

// ===================================
// 予算管理
// ===================================
async function getEffectiveBudget(yearMonth) {
  try {
    // 1. 当月のドキュメントを直接取得（yearMonthをドキュメントIDとして使用）
    const docRef = doc(db, 'budgets', yearMonth);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return { id: docSnap.id, amount: docSnap.data().amount, inherited: false };
    }
    // 2. 全budgetドキュメントを取得し、クライアント側で直近過去月を探す
    const allSnap = await getDocs(collection(db, 'budgets'));
    const allBudgets = [];
    allSnap.forEach(d => allBudgets.push({ id: d.id, ...d.data() }));
    // yearMonth（= ドキュメントID）で降順ソート
    allBudgets.sort((a, b) => b.id.localeCompare(a.id));
    for (const b of allBudgets) {
      if (b.id < yearMonth) {
        return { id: null, amount: b.amount, inherited: true };
      }
    }
    return { id: null, amount: null, inherited: false };
  } catch (error) { console.error('予算取得エラー:', error); return { id: null, amount: null, inherited: false }; }
}

async function saveBudget(yearMonth, amount) {
  try {
    // yearMonthをドキュメントIDとして使用 → 同月の重複を完全防止
    const docRef = doc(db, 'budgets', yearMonth);
    await setDoc(docRef, { amount: Number(amount), yearMonth, updatedAt: Timestamp.now() }, { merge: true });
    await loadBudgetForCurrentMonth();
  } catch (error) { console.error('予算保存エラー:', error); showToast('予算の保存に失敗しました', true); }
}

async function loadBudgetForCurrentMonth() {
  currentBudget = await getEffectiveBudget(currentYearMonth);
  renderBudgetStatus();
  updateBudgetSettingUI();
}

function renderBudgetStatus() {
  const display = document.getElementById('budget-amount-display');
  const inheritedLabel = document.getElementById('budget-inherited-label');
  const barFixed = document.getElementById('budget-bar-fixed');
  const barVr = document.getElementById('budget-bar-vr');
  const barVariable = document.getElementById('budget-bar-variable');
  const remaining = document.getElementById('budget-remaining');

  const fixedTotal = getFixedExpensesTotal();
  const vrTotal = getVariableRecurringTotal();
  const variableTotal = expenses.reduce((sum, e) => sum + e.amount, 0);
  const totalSpent = fixedTotal + vrTotal + variableTotal;

  if (!currentBudget || currentBudget.amount === null) {
    display.textContent = '未設定';
    inheritedLabel.style.display = 'none';
    barFixed.style.width = '0%';
    barVr.style.width = '0%';
    barVariable.style.width = '0%';
    remaining.textContent = '残り: -';
    remaining.className = 'budget-remaining-text';
    return;
  }

  const budget = currentBudget.amount;
  display.textContent = formatCurrency(budget);
  inheritedLabel.style.display = currentBudget.inherited ? 'inline' : 'none';

  const fixedPct = Math.min((fixedTotal / budget) * 100, 100);
  const vrPct = Math.min((vrTotal / budget) * 100, 100 - fixedPct);
  const variablePct = Math.min((variableTotal / budget) * 100, 100 - fixedPct - vrPct);
  const totalPct = (totalSpent / budget) * 100;

  barFixed.style.width = fixedPct + '%';
  barVr.style.width = vrPct + '%';
  barVariable.style.width = variablePct + '%';

  let colorClass = 'green';
  if (totalPct > 100) colorClass = 'red';
  else if (totalPct > 80) colorClass = 'orange';
  else if (totalPct > 50) colorClass = 'yellow';
  barVariable.className = 'budget-bar-variable budget-color-' + colorClass;

  const rem = budget - totalSpent;
  if (rem >= 0) {
    remaining.textContent = `残り: ${formatCurrency(rem)}`;
    remaining.className = 'budget-remaining-text';
  } else {
    remaining.textContent = `超過: ${formatCurrency(Math.abs(rem))}`;
    remaining.className = 'budget-remaining-text budget-over';
  }
}

function updateBudgetSettingUI() {
  const [y, m] = currentYearMonth.split('-');
  document.getElementById('budget-setting-month').textContent = `${y}年${parseInt(m)}月`;
  const input = document.getElementById('budget-amount-input');
  const inherited = document.getElementById('budget-setting-inherited');
  if (currentBudget && currentBudget.amount !== null) {
    input.value = currentBudget.amount;
    input.placeholder = currentBudget.amount;
    inherited.style.display = currentBudget.inherited ? 'inline' : 'none';
  } else {
    input.value = '';
    input.placeholder = '例: 150000';
    inherited.style.display = 'none';
  }
}

// ===================================
// 定額消費枠
// ===================================
async function loadFixedExpenses() {
  try {
    const snap = await getDocs(collection(db, 'fixedExpenses'));
    fixedExpenses = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    await loadFixedExpenseSkips();
    renderFixedExpenses();
    renderExpenses();
    updateSummary();
    renderBudgetStatus();
    updateStatistics();
  } catch (error) { console.error('定額消費読み込みエラー:', error); }
}

async function loadFixedExpenseSkips() {
  try {
    const snap = await getDocs(collection(db, 'fixedExpenseSkips'));
    fixedExpenseSkips = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (error) { console.error('スキップ読み込みエラー:', error); fixedExpenseSkips = []; }
}

async function addFixedExpense(data) {
  try {
    await addDoc(collection(db, 'fixedExpenses'), {
      ...data,
      startMonth: currentYearMonth,
      endMonth: null,
      createdAt: Timestamp.now()
    });
    await loadFixedExpenses();
    showToast('定額消費を追加しました');
  } catch (error) { console.error('定額消費追加エラー:', error); showToast('追加に失敗しました', true); }
}

// 指定月に適用される定額消費を返す
function getFixedExpensesForMonth(yearMonth) {
  return fixedExpenses.filter(f => {
    const start = f.startMonth || '2000-01';
    if (start > yearMonth) return false;
    if (f.endMonth && f.endMonth <= yearMonth) return false;
    const isSkipped = fixedExpenseSkips.some(
      s => s.fixedExpenseId === f.id && s.yearMonth === yearMonth
    );
    return !isSkipped;
  });
}

function getFixedExpensesTotal() {
  return getFixedExpensesForMonth(currentYearMonth).reduce((sum, f) => sum + f.amount, 0);
}

// 項目の終了（endMonthを設定、物理削除しない）
function endFixedExpenseConfirm(id) {
  const item = fixedExpenses.find(f => f.id === id);
  if (!item) return;
  document.getElementById('delete-fixed-expense-id').value = id;
  document.getElementById('delete-fixed-expense-name').textContent = item.name;
  document.getElementById('delete-fixed-expense-modal').style.display = 'flex';
}
function closeDeleteFixedExpenseModal() { document.getElementById('delete-fixed-expense-modal').style.display = 'none'; }

async function confirmEndFixedExpense() {
  const id = document.getElementById('delete-fixed-expense-id').value;
  try {
    await updateDoc(doc(db, 'fixedExpenses', id), { endMonth: currentYearMonth });
    closeDeleteFixedExpenseModal();
    await loadFixedExpenses();
    renderBudgetStatus();
    updateSummary();
    const [y, m] = currentYearMonth.split('-');
    showToast(`${y}年${parseInt(m)}月以降は計上されません`);
  } catch (error) { console.error('定額消費終了エラー:', error); showToast('更新に失敗しました', true); }
}

// 月別スキップのトグル
async function skipFixedExpenseForMonth(id, yearMonth) {
  const skipId = `${id}_${yearMonth}`;
  const existing = fixedExpenseSkips.find(s => s.id === skipId);
  try {
    if (existing) {
      await deleteDoc(doc(db, 'fixedExpenseSkips', skipId));
    } else {
      await setDoc(doc(db, 'fixedExpenseSkips', skipId), { fixedExpenseId: id, yearMonth });
    }
    await loadFixedExpenseSkips();
    renderFixedExpenses();
    renderExpenses();
    renderBudgetStatus();
    updateSummary();
    updateStatistics();
  } catch (error) { console.error('スキップ更新エラー:', error); showToast('更新に失敗しました', true); }
}

function editFixedExpenseAmount(id) {
  const item = fixedExpenses.find(f => f.id === id);
  if (!item) return;
  const el = document.getElementById(`fixed-amount-${id}`);
  el.innerHTML = `<input type="number" class="form-input fixed-expense-edit-input" value="${item.amount}" min="0"
    onkeydown="if(event.key==='Enter'){event.preventDefault();saveFixedExpenseAmount('${id}',this.value)}"
    onblur="saveFixedExpenseAmount('${id}',this.value)" autofocus>`;
  el.querySelector('input').focus();
}

async function saveFixedExpenseAmount(id, value) {
  const amount = Number(value);
  if (!amount || amount <= 0) { renderFixedExpenses(); return; }
  try {
    await updateDoc(doc(db, 'fixedExpenses', id), { amount });
    await loadFixedExpenses();
    renderBudgetStatus();
    updateSummary();
  } catch (error) { console.error('定額消費金額更新エラー:', error); showToast('更新に失敗しました', true); }
}

function renderFixedExpenses() {
  const container = document.getElementById('fixed-expenses-list');
  if (!container) return;
  const visibleItems = fixedExpenses.filter(f => {
    const start = f.startMonth || '2000-01';
    if (start > currentYearMonth) return false;
    if (f.endMonth && f.endMonth <= currentYearMonth) return false;
    return true;
  });
  if (visibleItems.length === 0) {
    container.innerHTML = '<div class="empty-state">定額消費はまだ登録されていません</div>';
    return;
  }
  container.innerHTML = visibleItems.map(f => {
    const isEnded = !!f.endMonth;
    const isSkipped = fixedExpenseSkips.some(s => s.fixedExpenseId === f.id && s.yearMonth === currentYearMonth);
    const startLabel = f.startMonth ? `${f.startMonth.split('-')[0]}年${parseInt(f.startMonth.split('-')[1])}月〜` : '';
    const endLabel = f.endMonth ? `${f.endMonth.split('-')[0]}年${parseInt(f.endMonth.split('-')[1])}月に終了済み（この月では計上）` : '';
    if (isEnded) {
      return `<div class="fixed-expense-item ended">
        <div class="fixed-expense-info"><span class="fixed-expense-name">${f.name}</span><span class="fixed-expense-amount">${formatCurrency(f.amount)}</span><span class="fixed-expense-category">${f.category}</span></div>
        <div class="fixed-expense-actions"><span class="fixed-expense-ended-label">${endLabel}</span></div>
      </div>`;
    }
    return `<div class="fixed-expense-item ${isSkipped ? 'skipped' : ''}">
      <div class="fixed-expense-info">
        <span class="fixed-expense-name">${f.name}</span>
        <span class="fixed-expense-amount" id="fixed-amount-${f.id}" onclick="editFixedExpenseAmount('${f.id}')" title="クリックで金額を編集">${formatCurrency(f.amount)}</span>
        <span class="fixed-expense-category">${f.category}</span>
        ${startLabel ? `<span class="fixed-expense-start">${startLabel}</span>` : ''}
      </div>
      <div class="fixed-expense-actions">
        <label class="fixed-expense-skip" title="この月だけスキップ">
          <input type="checkbox" ${isSkipped ? 'checked' : ''} onchange="skipFixedExpenseForMonth('${f.id}','${currentYearMonth}')">
          <span class="skip-label">スキップ</span>
        </label>
        <button class="btn btn-warning btn-sm" onclick="endFixedExpenseConfirm('${f.id}')">終了</button>
      </div>
    </div>`;
  }).join('');
}

// ===================================
// 定期変動費
// ===================================
async function loadVariableRecurring() {
  try {
    const snap = await getDocs(collection(db, 'variableRecurring'));
    variableRecurring = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    await loadVariableRecurringEntries();
    await loadVariableRecurringSkips();
    renderVariableRecurring();
    renderVariableRecurringInput();
    renderExpenses();
    updateSummary();
    renderBudgetStatus();
    updateStatistics();
  } catch (error) { console.error('定期変動費読み込みエラー:', error); }
}
async function loadVariableRecurringEntries() {
  try {
    const snap = await getDocs(collection(db, 'variableRecurringEntries'));
    variableRecurringEntries = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (error) { console.error('定期変動費入力読み込みエラー:', error); variableRecurringEntries = []; }
}
async function loadVariableRecurringSkips() {
  try {
    const snap = await getDocs(collection(db, 'variableRecurringSkips'));
    variableRecurringSkips = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (error) { console.error('定期変動費スキップ読み込みエラー:', error); variableRecurringSkips = []; }
}
async function skipVariableRecurringForMonth(id, yearMonth) {
  const skipId = `${id}_${yearMonth}`;
  const existing = variableRecurringSkips.find(s => s.variableRecurringId === id && s.yearMonth === yearMonth);
  try {
    if (existing) {
      await deleteDoc(doc(db, 'variableRecurringSkips', skipId));
    } else {
      await setDoc(doc(db, 'variableRecurringSkips', skipId), { variableRecurringId: id, yearMonth });
    }
    await loadVariableRecurringSkips();
    renderVariableRecurringInput();
    renderExpenses();
    updateSummary();
    renderBudgetStatus();
    updateStatistics();
  } catch (error) { console.error('定期変動費スキップ更新エラー:', error); showToast('更新に失敗しました', true); }
}
async function addVariableRecurring(data) {
  try {
    await addDoc(collection(db, 'variableRecurring'), { ...data, startMonth: currentYearMonth, endMonth: null, createdAt: Timestamp.now() });
    await loadVariableRecurring();
    showToast('定期変動費を追加しました');
  } catch (error) { console.error('定期変動費追加エラー:', error); showToast('追加に失敗しました', true); }
}
function endVariableRecurringConfirm(id) {
  const item = variableRecurring.find(v => v.id === id);
  if (!item) return;
  if (confirm(`「${item.name}」を終了しますか？`)) endVariableRecurring(id);
}
async function endVariableRecurring(id) {
  try {
    await updateDoc(doc(db, 'variableRecurring', id), { endMonth: currentYearMonth });
    await loadVariableRecurring(); renderBudgetStatus(); updateSummary();
    showToast('終了しました');
  } catch (error) { console.error('定期変動費終了エラー:', error); showToast('更新に失敗しました', true); }
}
async function saveVariableRecurringEntry(vrId, yearMonth, value) {
  const amount = value === '' || value === null || value === undefined ? 0 : Number(value);
  if (isNaN(amount) || amount < 0) return;
  try {
    await setDoc(doc(db, 'variableRecurringEntries', `${vrId}_${yearMonth}`), { variableRecurringId: vrId, yearMonth, amount });
    await loadVariableRecurringEntries();
    renderVariableRecurringInput(); renderExpenses(); updateSummary(); renderBudgetStatus(); updateStatistics();
    showToast('保存しました');
  } catch (error) { console.error('定期変動費入力エラー:', error); showToast('保存に失敗しました', true); }
}
function getVariableRecurringForMonth(yearMonth) {
  return variableRecurring.filter(v => {
    const start = v.startMonth || '2000-01';
    if (start > yearMonth) return false;
    if (v.endMonth && v.endMonth <= yearMonth) return false;
    const isSkipped = variableRecurringSkips.some(
      s => s.variableRecurringId === v.id && s.yearMonth === yearMonth
    );
    return !isSkipped;
  });
}
function getVariableRecurringTotal() {
  const forMonth = getVariableRecurringForMonth(currentYearMonth);
  let total = 0;
  forMonth.forEach(v => {
    const entry = variableRecurringEntries.find(e => e.variableRecurringId === v.id && e.yearMonth === currentYearMonth);
    if (entry) total += entry.amount;
  });
  return total;
}
function renderVariableRecurring() {
  const container = document.getElementById('variable-recurring-list');
  if (!container) return;
  const activeItems = variableRecurring.filter(v => !v.endMonth && (v.startMonth || '2000-01') <= currentYearMonth);
  if (activeItems.length === 0) { container.innerHTML = '<div class="empty-state">定期変動費はまだ登録されていません</div>'; return; }
  container.innerHTML = activeItems.map(v => `<div class="fixed-expense-item">
    <div class="fixed-expense-info"><span class="fixed-expense-name">${v.name}</span><span class="fixed-expense-category">${v.category}</span></div>
    <div class="fixed-expense-actions"><button class="btn btn-warning btn-sm" onclick="endVariableRecurringConfirm('${v.id}')">終了</button></div>
  </div>`).join('');
}
function renderVariableRecurringInput() {
  const container = document.getElementById('variable-recurring-input');
  if (!container) return;
  // スキップされていない＋期間内の全項目を表示
  const allForMonth = variableRecurring.filter(v => {
    const start = v.startMonth || '2000-01';
    if (start > currentYearMonth) return false;
    if (v.endMonth && v.endMonth <= currentYearMonth) return false;
    return true;
  });
  if (allForMonth.length === 0) { container.innerHTML = ''; return; }
  container.innerHTML = allForMonth.map(v => {
    const isSkipped = variableRecurringSkips.some(
      s => s.variableRecurringId === v.id && s.yearMonth === currentYearMonth
    );
    if (isSkipped) {
      return `<div class="vr-input-item" style="opacity:0.5;">
        <span class="vr-input-name">${v.name}</span>
        <label class="fixed-expense-skip" title="この月だけスキップ">
          <input type="checkbox" checked onchange="skipVariableRecurringForMonth('${v.id}','${currentYearMonth}')">
          <span class="skip-label">スキップ</span>
        </label>
        <span class="fixed-expense-ended-label">スキップ中</span>
      </div>`;
    }
    const entry = variableRecurringEntries.find(e => e.variableRecurringId === v.id && e.yearMonth === currentYearMonth);
    const hasValue = entry && entry.amount > 0;
    return `<div class="vr-input-item ${hasValue ? '' : 'vr-unpaid'}">
      <span class="vr-input-name">${v.name}</span>
      <div class="vr-input-field">
        <input type="number" class="form-input vr-amount-input" placeholder="金額を入力" value="${hasValue ? entry.amount : ''}" min="0"
          onkeydown="if(event.key==='Enter'){event.preventDefault();saveVariableRecurringEntry('${v.id}','${currentYearMonth}',this.value)}" id="vr-input-${v.id}">
        <button class="btn btn-primary btn-sm" onclick="saveVariableRecurringEntry('${v.id}','${currentYearMonth}',document.getElementById('vr-input-${v.id}').value)">保存</button>
      </div>
      <label class="fixed-expense-skip" title="この月だけスキップ">
        <input type="checkbox" onchange="skipVariableRecurringForMonth('${v.id}','${currentYearMonth}')">
        <span class="skip-label">スキップ</span>
      </label>
      ${!hasValue ? '<span class="vr-warning"><span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">warning</span> 未入力</span>' : '<span class="vr-entered"><span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">check_circle</span> 入力済み</span>'}
    </div>`;
  }).join('');
}

// ===================================
// 支出管理
// ===================================
async function addExpense(cardId, amount, category, description, date) {
  try {
    const card = creditCards.find(c => c.id === cardId);
    if (!card) { showToast('無効なカードが選択されています', true); return; }
    const expenseDate = new Date(date);
    const yearMonth = getYearMonth(expenseDate);
    await addDoc(collection(db, 'expenses'), {
      cardId, cardName: card.name, amount: Number(amount), category, description,
      date: Timestamp.fromDate(expenseDate), yearMonth, createdAt: Timestamp.now()
    });
    if (yearMonth !== currentYearMonth) {
      document.getElementById('month-selector').value = yearMonth;
      currentYearMonth = yearMonth;
    }
    await loadExpenses();
  } catch (error) { console.error('支出追加エラー:', error); showToast('支出の追加に失敗しました', true); }
}

async function loadExpenses() {
  try {
    const q = query(collection(db, 'expenses'), where('yearMonth', '==', currentYearMonth), orderBy('date', 'desc'));
    const snap = await getDocs(q);
    expenses = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    expenses.sort((a, b) => {
      const dc = b.date.toMillis() - a.date.toMillis();
      return dc !== 0 ? dc : b.createdAt.toMillis() - a.createdAt.toMillis();
    });
    renderExpenses();
    updateSummary();
    updateStatistics();
    updateCategoryCharts();
    await updateCharts();
    renderBudgetStatus();
  } catch (error) { console.error('支出読み込みエラー:', error); }
}

function deleteExpense(expenseId) {
  const expense = expenses.find(e => e.id === expenseId);
  if (!expense) { showToast('支出が見つかりません', true); return; }
  const card = creditCards.find(c => c.id === expense.cardId);
  const details = `
    <div style="font-size: var(--font-size-sm);">
      <div style="margin-bottom: var(--spacing-xs);"><strong>日付:</strong> ${formatDate(expense.date.toDate())}</div>
      <div style="margin-bottom: var(--spacing-xs);"><strong>カード:</strong> ${card ? card.name : '不明'}</div>
      <div style="margin-bottom: var(--spacing-xs);"><strong>カテゴリ:</strong> ${expense.category}</div>
      <div style="margin-bottom: var(--spacing-xs);"><strong>金額:</strong> ${formatCurrency(expense.amount)}</div>
      ${expense.description ? `<div><strong>説明:</strong> ${expense.description}</div>` : ''}
    </div>`;
  document.getElementById('delete-expense-details').innerHTML = details;
  document.getElementById('delete-expense-id').value = expenseId;
  document.getElementById('delete-expense-modal').style.display = 'flex';
}

function closeDeleteExpenseModal() { document.getElementById('delete-expense-modal').style.display = 'none'; }

async function confirmDeleteExpense() {
  try {
    await deleteDoc(doc(db, 'expenses', document.getElementById('delete-expense-id').value));
    closeDeleteExpenseModal();
    await loadExpenses();
  } catch (error) { console.error('支出削除エラー:', error); showToast('支出の削除に失敗しました', true); }
}

function openEditModal(expenseId) {
  const expense = expenses.find(e => e.id === expenseId);
  if (!expense) return;
  document.getElementById('edit-expense-id').value = expense.id;
  document.getElementById('edit-expense-amount').value = expense.amount;
  document.getElementById('edit-expense-category').value = expense.category;
  document.getElementById('edit-expense-date').value = formatDate(expense.date.toDate());
  document.getElementById('edit-expense-description').value = expense.description || '';
  const editCardSelect = document.getElementById('edit-expense-card');
  editCardSelect.innerHTML = creditCards.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  editCardSelect.value = expense.cardId;
  document.getElementById('edit-modal').style.display = 'flex';
}

function closeEditModal() { document.getElementById('edit-modal').style.display = 'none'; }

async function updateExpense(e) {
  e.preventDefault();
  const expenseId = document.getElementById('edit-expense-id').value;
  const cardId = document.getElementById('edit-expense-card').value;
  const card = creditCards.find(c => c.id === cardId);
  if (!card) { showToast('無効なカードが選択されています', true); return; }
  const expenseDate = new Date(document.getElementById('edit-expense-date').value);
  try {
    await updateDoc(doc(db, 'expenses', expenseId), {
      cardId, cardName: card.name, amount: Number(document.getElementById('edit-expense-amount').value),
      category: document.getElementById('edit-expense-category').value,
      description: document.getElementById('edit-expense-description').value,
      date: Timestamp.fromDate(expenseDate), yearMonth: getYearMonth(expenseDate)
    });
    closeEditModal();
    await loadExpenses();
  } catch (error) { console.error('支出更新エラー:', error); showToast('支出の更新に失敗しました', true); }
}

function renderExpenses() {
  const tbody = document.getElementById('expenses-list');
  let filtered = filterCardId === 'all' ? expenses : expenses.filter(e => e.cardId === filterCardId);
  filtered = filtered.sort((a, b) => b.date.toDate() - a.date.toDate());
  if (searchQuery) filtered = filtered.filter(e =>
    (e.description && e.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (e.category && e.category.toLowerCase().includes(searchQuery.toLowerCase())));
  if (searchFrom) { const d = new Date(searchFrom); filtered = filtered.filter(e => e.date.toDate() >= d); }
  if (searchTo) { const d = new Date(searchTo); d.setHours(23, 59, 59); filtered = filtered.filter(e => e.date.toDate() <= d); }

  const noSearch = !searchQuery && !searchFrom && !searchTo;
  // 定額消費の行
  const fixedForMonth = noSearch ? getFixedExpensesForMonth(currentYearMonth) : [];
  const fixedRows = fixedForMonth.map(f => {
    const card = creditCards.find(c => c.id === f.cardId);
    return `<tr class="fixed-expense-row">
      <td data-label="日付"><span class="expense-badge badge-fixed">定額</span></td>
      <td data-label="カード"><span class="card-badge" style="display:inline-flex;"><span class="card-color-dot" style="background-color:${card ? card.color : '#999'};"></span><span>${card ? card.name : '-'}</span></span></td>
      <td data-label="カテゴリ">${f.category}</td>
      <td data-label="説明">${f.name}</td>
      <td data-label="金額" class="amount">${formatCurrency(f.amount)}</td>
      <td data-label="操作"><span class="expense-badge badge-fixed">自動</span></td>
    </tr>`;
  }).join('');
  // 定期変動費の行
  const vrForMonth = noSearch ? getVariableRecurringForMonth(currentYearMonth) : [];
  const vrRows = vrForMonth.map(v => {
    const entry = variableRecurringEntries.find(e => e.variableRecurringId === v.id && e.yearMonth === currentYearMonth);
    if (!entry) return '';
    const card = creditCards.find(c => c.id === v.cardId);
    return `<tr class="fixed-expense-row">
      <td data-label="日付"><span class="expense-badge badge-variable">変動</span></td>
      <td data-label="カード"><span class="card-badge" style="display:inline-flex;"><span class="card-color-dot" style="background-color:${card ? card.color : '#999'};"></span><span>${card ? card.name : '-'}</span></span></td>
      <td data-label="カテゴリ">${v.category}</td>
      <td data-label="説明">${v.name}</td>
      <td data-label="金額" class="amount">${formatCurrency(entry.amount)}</td>
      <td data-label="操作"><span class="expense-badge badge-variable">手入力</span></td>
    </tr>`;
  }).filter(r => r).join('');

  if (filtered.length === 0 && !fixedRows && !vrRows) {
    const sel = document.getElementById('month-selector');
    const label = sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].text : currentYearMonth;
    const fl = (filterCardId !== 'all' || searchQuery || searchFrom || searchTo) ? '条件に一致する' : '';
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state">${fl}${label}の支出はまだ登録されていません</td></tr>`;
    return;
  }
  const expenseRows = filtered.map(expense => {
    const card = creditCards.find(c => c.id === expense.cardId);
    return `<tr>
      <td data-label="日付">${formatDate(expense.date.toDate())}</td>
      <td data-label="カード"><span class="card-badge" style="display:inline-flex;"><span class="card-color-dot" style="background-color:${card ? card.color : '#999'};"></span><span>${expense.cardName}</span></span></td>
      <td data-label="カテゴリ">${expense.category}</td>
      <td data-label="説明">${expense.description || '-'}</td>
      <td data-label="金額" class="amount">${formatCurrency(expense.amount)}</td>
      <td data-label="操作"><button class="btn btn-warning btn-sm" onclick="openEditModal('${expense.id}')">編集</button> <button class="btn btn-danger btn-sm" onclick="deleteExpense('${expense.id}')">削除</button></td>
    </tr>`;
  }).join('');
  tbody.innerHTML = fixedRows + vrRows + expenseRows;
}

function applySearch() {
  searchQuery = document.getElementById('search-query').value.trim();
  searchFrom = document.getElementById('search-from').value;
  searchTo = document.getElementById('search-to').value;
  renderExpenses();
}

function clearSearch() {
  searchQuery = ''; searchFrom = null; searchTo = null;
  document.getElementById('search-query').value = '';
  document.getElementById('search-from').value = '';
  document.getElementById('search-to').value = '';
  renderExpenses();
}

// ===================================
// 統計情報
// ===================================
async function updateStatistics() {
  try {
    const statCurrentMonth = document.getElementById('stat-current-month');
    if (!statCurrentMonth) return;

    // currentYearMonthを基準にデータ取得（バグ修正: getCurrentDate()ではなく選択中の月を基準に）
    const monthlyData = await getMonthlyData(6, currentYearMonth);
    const currentMonthTotal = expenses.reduce((sum, e) => sum + e.amount, 0) + getFixedExpensesTotal() + getVariableRecurringTotal();
    const avgMonthly = monthlyData.totals.length > 0
      ? Math.round(monthlyData.totals.reduce((a, b) => a + b, 0) / monthlyData.totals.length) : 0;

    let monthComparison = '-';
    let comparisonClass = '';
    if (monthlyData.totals.length >= 2) {
      const curr = monthlyData.totals[monthlyData.totals.length - 1];
      const prev = monthlyData.totals[monthlyData.totals.length - 2];
      if (prev > 0) {
        const diff = curr - prev;
        const pct = (diff / prev * 100).toFixed(1);
        monthComparison = `${diff > 0 ? '↑' : '↓'} ${Math.abs(parseFloat(pct))}%`;
        comparisonClass = diff > 0 ? 'positive' : 'negative';
      } else if (curr > 0) { monthComparison = '↑ 100%以上'; comparisonClass = 'positive'; }
    }

    const categoryTotals = {};
    expenses.forEach(e => { if (e.category) categoryTotals[e.category] = (categoryTotals[e.category] || 0) + e.amount; });
    getFixedExpensesForMonth(currentYearMonth).forEach(f => { if (f.category) categoryTotals[f.category] = (categoryTotals[f.category] || 0) + f.amount; });
    getVariableRecurringForMonth(currentYearMonth).forEach(v => {
      const entry = variableRecurringEntries.find(e => e.variableRecurringId === v.id && e.yearMonth === currentYearMonth);
      if (entry && v.category) categoryTotals[v.category] = (categoryTotals[v.category] || 0) + entry.amount;
    });
    const topCategory = Object.keys(categoryTotals).length > 0
      ? Object.keys(categoryTotals).reduce((a, b) => categoryTotals[a] > categoryTotals[b] ? a : b) : '-';

    statCurrentMonth.textContent = formatCurrency(currentMonthTotal);
    document.getElementById('stat-avg-monthly').textContent = formatCurrency(avgMonthly);
    const compEl = document.getElementById('stat-month-comparison');
    compEl.textContent = monthComparison;
    compEl.className = 'stat-value stat-comparison ' + comparisonClass;
    document.getElementById('stat-top-category').textContent = topCategory;
  } catch (error) { console.error('統計情報更新エラー:', error); }
}

// ===================================
// 集計
// ===================================
function updateSummary() {
  const cardTotals = {};
  creditCards.forEach(c => { cardTotals[c.id] = { name: c.name, color: c.color, amount: 0 }; });
  expenses.forEach(e => { if (cardTotals[e.cardId]) cardTotals[e.cardId].amount += e.amount; });

  const expenseTotal = expenses.reduce((sum, e) => sum + e.amount, 0);
  const fixedTotal = getFixedExpensesTotal();
  const vrTotal = getVariableRecurringTotal();
  const totalAmount = fixedTotal + vrTotal + expenseTotal;

  document.getElementById('total-amount').textContent = formatCurrency(totalAmount);
  document.getElementById('fixed-total').textContent = formatCurrency(fixedTotal);
  const vrTotalEl = document.getElementById('vr-total');
  if (vrTotalEl) vrTotalEl.textContent = formatCurrency(vrTotal);
  document.getElementById('variable-total').textContent = formatCurrency(expenseTotal);

  const cardSummaries = document.getElementById('card-summaries');
  cardSummaries.innerHTML = Object.values(cardTotals).filter(c => c.amount > 0).map(c => `
    <div class="summary-card">
      <div class="summary-label"><span class="card-color-dot" style="background-color:${c.color};"></span><span>${c.name}</span></div>
      <div class="summary-amount">${formatCurrency(c.amount)}</div>
    </div>`).join('');
}

// ===================================
// グラフ機能
// ===================================
async function getMonthlyData(months, baseYearMonth) {
  // バグ修正: baseYearMonthを基準に月リストを生成
  const base = baseYearMonth || currentYearMonth;
  const [by, bm] = base.split('-').map(Number);
  const baseDate = new Date(by, bm - 1, 1);
  const monthsData = [];

  for (let i = months - 1; i >= 0; i--) {
    const date = new Date(baseDate);
    date.setMonth(date.getMonth() - i);
    monthsData.push({
      yearMonth: getYearMonth(date),
      label: `${date.getFullYear()}年${date.getMonth() + 1}月`,
      total: 0, cards: {}
    });
  }

  for (const md of monthsData) {
    try {
      const q = query(collection(db, 'expenses'), where('yearMonth', '==', md.yearMonth));
      const snap = await getDocs(q);
      const me = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      md.total = me.reduce((s, e) => s + e.amount, 0);
      // 定額消費を加算
      const fixedForYM = getFixedExpensesForMonth(md.yearMonth);
      md.total += fixedForYM.reduce((s, f) => s + f.amount, 0);
      // 定期変動費を加算
      getVariableRecurringForMonth(md.yearMonth).forEach(v => {
        const entry = variableRecurringEntries.find(e => e.variableRecurringId === v.id && e.yearMonth === md.yearMonth);
        if (entry) md.total += entry.amount;
      });
      creditCards.forEach(c => { md.cards[c.id] = me.filter(e => e.cardId === c.id).reduce((s, e) => s + e.amount, 0); });
    } catch (error) { console.error(`${md.yearMonth} 取得エラー:`, error); }
  }

  return {
    labels: monthsData.map(m => m.label),
    totals: monthsData.map(m => m.total),
    cards: monthsData.reduce((acc, m) => {
      Object.keys(m.cards).forEach(id => { if (!acc[id]) acc[id] = []; acc[id].push(m.cards[id]); });
      return acc;
    }, {})
  };
}

function renderTotalChart(data) {
  const ctx = document.getElementById('total-chart');
  if (!ctx) return;
  if (totalChart) totalChart.destroy();
  totalChart = new Chart(ctx, {
    type: 'line',
    data: { labels: data.labels, datasets: [{ label: '総合計', data: data.totals, borderColor: '#667eea', backgroundColor: 'rgba(102, 126, 234, 0.1)', fill: true, tension: 0.4, pointRadius: 4, pointBackgroundColor: '#667eea' }] },
    options: { responsive: true, plugins: { legend: { labels: { color: '#b4b8d1' } }, tooltip: { callbacks: { label: (ctx) => formatCurrency(ctx.raw) } } }, scales: { x: { ticks: { color: '#6b7280' }, grid: { color: 'rgba(255,255,255,0.05)' } }, y: { ticks: { color: '#6b7280', callback: v => formatCurrency(v) }, grid: { color: 'rgba(255,255,255,0.05)' } } } }
  });
}

function renderCardsChart(data) {
  const ctx = document.getElementById('cards-chart');
  if (!ctx) return;
  if (cardsChart) cardsChart.destroy();
  const datasets = creditCards.map(c => ({
    label: c.name, data: data.cards[c.id] || [], backgroundColor: c.color + '80', borderColor: c.color, borderWidth: 1
  }));
  cardsChart = new Chart(ctx, {
    type: 'bar',
    data: { labels: data.labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          labels: {
            color: '#b4b8d1',
            boxWidth: 12,
            padding: 10,
            font: { size: 11 },
            // カード名が長い場合は省略
            generateLabels: (chart) => {
              const original = Chart.defaults.plugins.legend.labels.generateLabels(chart);
              return original.map(label => ({
                ...label,
                text: label.text.length > 10 ? label.text.slice(0, 10) + '…' : label.text
              }));
            }
          },
          position: 'bottom'
        },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${formatCurrency(ctx.raw)}`
          }
        }
      },
      scales: {
        x: {
          stacked: true,
          ticks: {
            color: '#6b7280',
            maxRotation: 45,
            minRotation: 0,
            autoSkip: false,
            font: { size: 11 }
          },
          grid: { color: 'rgba(255,255,255,0.05)' }
        },
        y: {
          stacked: true,
          ticks: {
            color: '#6b7280',
            callback: v => {
              // スマホでは短縮表示（例: ¥150k）
              if (v >= 10000) return `¥${Math.round(v / 1000)}k`;
              return formatCurrency(v);
            },
            font: { size: 11 }
          },
          grid: { color: 'rgba(255,255,255,0.05)' }
        }
      }
    }
  });
}

async function updateCharts() {
  const data = await getMonthlyData(chartPeriod, currentYearMonth);
  renderTotalChart(data);
  renderCardsChart(data);
}

// ===================================
// カテゴリ別グラフ
// ===================================
function getCategoryData() {
  const totals = {};
  expenses.forEach(e => { if (e.category) totals[e.category] = (totals[e.category] || 0) + e.amount; });
  getFixedExpensesForMonth(currentYearMonth).forEach(f => { if (f.category) totals[f.category] = (totals[f.category] || 0) + f.amount; });
  getVariableRecurringForMonth(currentYearMonth).forEach(v => {
    const entry = variableRecurringEntries.find(e => e.variableRecurringId === v.id && e.yearMonth === currentYearMonth);
    if (entry && v.category) totals[v.category] = (totals[v.category] || 0) + entry.amount;
  });
  return Object.entries(totals).sort((a, b) => b[1] - a[1]);
}

function getCategoryColors(count) {
  const base = ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40', '#FF6384', '#C9CBCF', '#7BC8A4', '#E7E9ED'];
  const colors = [];
  for (let i = 0; i < count; i++) colors.push(base[i % base.length]);
  return colors;
}

function renderCategoryPieChart() {
  const ctx = document.getElementById('category-pie-chart');
  if (!ctx) return;
  if (categoryPieChart) categoryPieChart.destroy();
  const data = getCategoryData();
  if (data.length === 0) { categoryPieChart = null; return; }
  const colors = getCategoryColors(data.length);
  categoryPieChart = new Chart(ctx, {
    type: 'doughnut',
    data: { labels: data.map(d => d[0]), datasets: [{ data: data.map(d => d[1]), backgroundColor: colors, borderWidth: 0 }] },
    options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { color: '#b4b8d1', padding: 15 } }, tooltip: { callbacks: { label: (ctx) => { const total = ctx.dataset.data.reduce((a, b) => a + b, 0); return `${ctx.label}: ${formatCurrency(ctx.raw)} (${(ctx.raw / total * 100).toFixed(1)}%)`; } } } } }
  });
}

function renderCategoryBarChart() {
  const ctx = document.getElementById('category-bar-chart');
  if (!ctx) return;
  if (categoryBarChart) categoryBarChart.destroy();
  const data = getCategoryData();
  if (data.length === 0) { categoryBarChart = null; return; }
  const colors = getCategoryColors(data.length);
  categoryBarChart = new Chart(ctx, {
    type: 'bar',
    data: { labels: data.map(d => d[0]), datasets: [{ label: '支出額', data: data.map(d => d[1]), backgroundColor: colors.map(c => c + '80'), borderColor: colors, borderWidth: 1 }] },
    options: { indexAxis: 'y', responsive: true, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => formatCurrency(ctx.raw) } } }, scales: { x: { ticks: { color: '#6b7280', callback: v => formatCurrency(v) }, grid: { color: 'rgba(255,255,255,0.05)' } }, y: { ticks: { color: '#b4b8d1' }, grid: { color: 'rgba(255,255,255,0.05)' } } } }
  });
}

function updateCategoryCharts() { renderCategoryPieChart(); renderCategoryBarChart(); }

// ===================================
// JSONエクスポート
// ===================================
function initExportMonths() {
  const container = document.getElementById('export-months');
  if (!container) return;
  const currentDate = getCurrentDate();
  const months = [];
  for (let i = 0; i < 12; i++) {
    const date = new Date(currentDate);
    date.setMonth(date.getMonth() - i);
    months.push({ value: getYearMonth(date), label: `${date.getFullYear()}年${date.getMonth() + 1}月` });
  }
  container.innerHTML = months.map(m =>
    `<label class="export-month-label"><input type="checkbox" value="${m.value}" class="export-month-cb" ${m.value === currentYearMonth ? 'checked' : ''}> ${m.label}</label>`
  ).join('');
}

function selectAllExportMonths() {
  document.querySelectorAll('.export-month-cb').forEach(cb => cb.checked = true);
}
function deselectAllExportMonths() {
  document.querySelectorAll('.export-month-cb').forEach(cb => cb.checked = false);
}

async function exportToJSON() {
  const selectedMonths = Array.from(document.querySelectorAll('.export-month-cb:checked')).map(cb => cb.value);
  if (selectedMonths.length === 0) { showToast('エクスポートする月を選択してください', true); return; }

  try {
    selectedMonths.sort();
    const exportData = {
      exportDate: new Date().toISOString(),
      version: '1.0',
      months: selectedMonths,
      creditCards: creditCards.map(c => ({ id: c.id, name: c.name, color: c.color })),
      categories: categories.map(c => ({ id: c.id, name: c.name })),
      fixedExpenses: fixedExpenses.map(f => ({ id: f.id, name: f.name, amount: f.amount, cardName: f.cardName, category: f.category, isActive: f.isActive })),
      data: {}
    };

    for (const ym of selectedMonths) {
      const q = query(collection(db, 'expenses'), where('yearMonth', '==', ym), orderBy('date', 'desc'));
      const snap = await getDocs(q);
      const monthExpenses = snap.docs.map(d => {
        const data = d.data();
        return { id: d.id, cardId: data.cardId, cardName: data.cardName, amount: data.amount, category: data.category, description: data.description, date: data.date.toDate().toISOString(), yearMonth: data.yearMonth };
      });
      const budget = await getEffectiveBudget(ym);
      exportData.data[ym] = { budget: budget.amount !== null ? { amount: budget.amount, inherited: budget.inherited } : null, expenses: monthExpenses };
    }

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = selectedMonths.length === 1 ? `kakeibo_${selectedMonths[0]}.json` : `kakeibo_${selectedMonths[0]}_${selectedMonths[selectedMonths.length - 1]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('エクスポートが完了しました');
  } catch (error) { console.error('エクスポートエラー:', error); showToast('エクスポートに失敗しました', true); }
}

// ===================================
// イベントハンドラー
// ===================================
document.getElementById('add-card-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = document.getElementById('card-name');
  const name = input.value.trim();
  if (name) { await addCreditCard(name); input.value = ''; }
});

document.getElementById('add-expense-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const cardId = document.getElementById('expense-card').value;
  const amount = document.getElementById('expense-amount').value;
  const category = document.getElementById('expense-category').value;
  const description = document.getElementById('expense-description').value;
  const date = document.getElementById('expense-date').value;
  if (cardId && amount && category && date) {
    await addExpense(cardId, amount, category, description, date);
    document.getElementById('expense-amount').value = '';
    document.getElementById('expense-category').value = '';
    document.getElementById('expense-description').value = '';
  }
});

document.getElementById('edit-expense-form').addEventListener('submit', updateExpense);

document.getElementById('chart-period').addEventListener('change', async (e) => {
  chartPeriod = parseInt(e.target.value);
  await updateCharts();
});

document.getElementById('expense-filter-card').addEventListener('change', (e) => {
  filterCardId = e.target.value;
  renderExpenses();
});

document.getElementById('save-budget-btn').addEventListener('click', async () => {
  const amount = document.getElementById('budget-amount-input').value;
  if (!amount || Number(amount) <= 0) { showToast('有効な予算額を入力してください', true); return; }
  const [y, m] = currentYearMonth.split('-');
  await saveBudget(currentYearMonth, amount);
  showToast(`${y}年${parseInt(m)}月の予算を保存しました`);
});

document.getElementById('add-fixed-expense-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('fixed-expense-name').value.trim();
  const amount = document.getElementById('fixed-expense-amount').value;
  const cardId = document.getElementById('fixed-expense-card').value;
  const category = document.getElementById('fixed-expense-category').value;
  if (!name || !amount || !cardId || !category) { showToast('すべての項目を入力してください', true); return; }
  const card = creditCards.find(c => c.id === cardId);
  await addFixedExpense({ name, amount: Number(amount), cardId, cardName: card ? card.name : '', category });
  document.getElementById('fixed-expense-name').value = '';
  document.getElementById('fixed-expense-amount').value = '';
  document.getElementById('fixed-expense-card').value = '';
  document.getElementById('fixed-expense-category').value = '';
  renderBudgetStatus();
  updateSummary();
});

document.getElementById('add-variable-recurring-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('vr-name').value.trim();
  const cardId = document.getElementById('vr-card').value;
  const category = document.getElementById('vr-category').value;
  if (!name || !cardId || !category) { showToast('すべての項目を入力してください', true); return; }
  await addVariableRecurring({ name, cardId, category });
  document.getElementById('vr-name').value = '';
  document.getElementById('vr-card').value = '';
  document.getElementById('vr-category').value = '';
});

// グローバル関数公開
window.deleteCreditCard = deleteCreditCard;
window.closeDeleteCardModal = closeDeleteCardModal;
window.confirmDeleteCard = confirmDeleteCard;
window.deleteExpense = deleteExpense;
window.closeDeleteExpenseModal = closeDeleteExpenseModal;
window.confirmDeleteExpense = confirmDeleteExpense;
window.openEditModal = openEditModal;
window.closeEditModal = closeEditModal;
window.openCategoryModal = openCategoryModal;
window.closeCategoryModal = closeCategoryModal;
window.selectCategory = selectCategory;
window.addNewCategory = addNewCategory;
window.deleteCategory = deleteCategory;
window.closeDeleteCategoryModal = closeDeleteCategoryModal;
window.confirmDeleteCategory = confirmDeleteCategory;
window.applySearch = applySearch;
window.clearSearch = clearSearch;
window.endFixedExpenseConfirm = endFixedExpenseConfirm;
window.closeDeleteFixedExpenseModal = closeDeleteFixedExpenseModal;
window.confirmEndFixedExpense = confirmEndFixedExpense;
window.skipFixedExpenseForMonth = skipFixedExpenseForMonth;
window.editFixedExpenseAmount = editFixedExpenseAmount;
window.saveFixedExpenseAmount = saveFixedExpenseAmount;
window.addVariableRecurring = addVariableRecurring;
window.endVariableRecurringConfirm = endVariableRecurringConfirm;
window.saveVariableRecurringEntry = saveVariableRecurringEntry;
window.skipVariableRecurringForMonth = skipVariableRecurringForMonth;
window.exportToJSON = exportToJSON;
window.selectAllExportMonths = selectAllExportMonths;
window.deselectAllExportMonths = deselectAllExportMonths;

// ===================================
// 初期化
// ===================================
async function init() {
  try {
    document.getElementById('expense-date').value = formatDate(getCurrentDate());
    initTabs();
    initMonthSelector();
    initDebugMode();
    await loadCategories();
    await loadCreditCards();
    await loadFixedExpenses();
    await loadVariableRecurring();
    await loadExpenses();
    await loadBudgetForCurrentMonth();
    initExportMonths();
    await updateCharts();
    console.log('アプリ初期化完了');
  } catch (error) {
    console.error('初期化エラー:', error);
    showToast('アプリの初期化に失敗しました', true);
  }
}

init();
