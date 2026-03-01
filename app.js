// Firebase SDK v9 modular imports
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js';
import {
  getFirestore, collection, addDoc, getDocs, deleteDoc, doc, updateDoc,
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
    updateBudgetSettingUI();
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
      alert(`デバッグ日付を ${debugDate} に設定しました`);
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
    alert('カードの追加に失敗しました: ' + error.message);
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
  if (!card) { alert('カードが見つかりません'); return; }
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
    alert('カードの削除に失敗しました: ' + error.message);
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
  const select = document.getElementById('fixed-expense-card');
  if (!select) return;
  const val = select.value;
  select.innerHTML = '<option value="">カードを選択</option>' +
    creditCards.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  if (val && creditCards.find(c => c.id === val)) select.value = val;
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
  if (!name) { alert('カテゴリ名を入力してください'); return; }
  if (categories.some(c => c.name === name)) { alert('このカテゴリは既に存在します'); return; }
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
    // 1. 当月レコードを検索
    const q = query(collection(db, 'budgets'), where('yearMonth', '==', yearMonth));
    const snap = await getDocs(q);
    if (!snap.empty) {
      const d = snap.docs[0];
      return { id: d.id, amount: d.data().amount, inherited: false };
    }
    // 2. 過去最新を検索
    const allSnap = await getDocs(query(collection(db, 'budgets'), orderBy('yearMonth', 'desc')));
    for (const d of allSnap.docs) {
      if (d.data().yearMonth < yearMonth) {
        return { id: null, amount: d.data().amount, inherited: true };
      }
    }
    return { id: null, amount: null, inherited: false };
  } catch (error) { console.error('予算取得エラー:', error); return { id: null, amount: null, inherited: false }; }
}

async function saveBudget(yearMonth, amount) {
  try {
    const q = query(collection(db, 'budgets'), where('yearMonth', '==', yearMonth));
    const snap = await getDocs(q);
    if (!snap.empty) {
      await updateDoc(doc(db, 'budgets', snap.docs[0].id), { amount: Number(amount), updatedAt: Timestamp.now() });
    } else {
      await addDoc(collection(db, 'budgets'), { yearMonth, amount: Number(amount), createdAt: Timestamp.now(), updatedAt: Timestamp.now() });
    }
    await loadBudgetForCurrentMonth();
  } catch (error) { console.error('予算保存エラー:', error); alert('予算の保存に失敗しました'); }
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
  const barVariable = document.getElementById('budget-bar-variable');
  const fixedAmt = document.getElementById('budget-fixed-amount');
  const variableAmt = document.getElementById('budget-variable-amount');
  const remaining = document.getElementById('budget-remaining');

  const fixedTotal = getFixedExpensesTotal();
  const variableTotal = expenses.reduce((sum, e) => sum + e.amount, 0);
  const totalSpent = fixedTotal + variableTotal;

  if (!currentBudget || currentBudget.amount === null) {
    display.textContent = '未設定';
    inheritedLabel.style.display = 'none';
    barFixed.style.width = '0%';
    barVariable.style.width = '0%';
    fixedAmt.textContent = formatCurrency(fixedTotal);
    variableAmt.textContent = formatCurrency(variableTotal);
    remaining.textContent = '残り: -';
    return;
  }

  const budget = currentBudget.amount;
  display.textContent = formatCurrency(budget);
  inheritedLabel.style.display = currentBudget.inherited ? 'inline' : 'none';

  const fixedPct = Math.min((fixedTotal / budget) * 100, 100);
  const variablePct = Math.min((variableTotal / budget) * 100, 100 - fixedPct);
  const totalPct = (totalSpent / budget) * 100;

  barFixed.style.width = fixedPct + '%';
  barVariable.style.width = variablePct + '%';

  // 色変更
  let colorClass = 'green';
  if (totalPct > 100) colorClass = 'red';
  else if (totalPct > 80) colorClass = 'orange';
  else if (totalPct > 50) colorClass = 'yellow';
  barVariable.className = 'budget-bar-variable budget-color-' + colorClass;

  fixedAmt.textContent = formatCurrency(fixedTotal);
  variableAmt.textContent = formatCurrency(variableTotal);

  const rem = budget - totalSpent;
  if (rem >= 0) {
    remaining.textContent = `残り: ${formatCurrency(rem)}`;
    remaining.className = 'budget-detail-item budget-remaining';
  } else {
    remaining.textContent = `超過: ${formatCurrency(Math.abs(rem))}`;
    remaining.className = 'budget-detail-item budget-remaining budget-over';
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
    renderFixedExpenses();
  } catch (error) { console.error('定額消費読み込みエラー:', error); }
}

async function addFixedExpense(data) {
  try {
    await addDoc(collection(db, 'fixedExpenses'), { ...data, isActive: true, createdAt: Timestamp.now() });
    await loadFixedExpenses();
  } catch (error) { console.error('定額消費追加エラー:', error); alert('追加に失敗しました'); }
}

async function toggleFixedExpense(id) {
  const item = fixedExpenses.find(f => f.id === id);
  if (!item) return;
  try {
    await updateDoc(doc(db, 'fixedExpenses', id), { isActive: !item.isActive });
    await loadFixedExpenses();
    renderBudgetStatus();
    updateSummary();
  } catch (error) { console.error('定額消費更新エラー:', error); }
}

function deleteFixedExpenseConfirm(id) {
  const item = fixedExpenses.find(f => f.id === id);
  if (!item) return;
  document.getElementById('delete-fixed-expense-id').value = id;
  document.getElementById('delete-fixed-expense-name').textContent = item.name;
  document.getElementById('delete-fixed-expense-modal').style.display = 'flex';
}
function closeDeleteFixedExpenseModal() { document.getElementById('delete-fixed-expense-modal').style.display = 'none'; }

async function confirmDeleteFixedExpense() {
  const id = document.getElementById('delete-fixed-expense-id').value;
  try {
    await deleteDoc(doc(db, 'fixedExpenses', id));
    closeDeleteFixedExpenseModal();
    await loadFixedExpenses();
    renderBudgetStatus();
    updateSummary();
  } catch (error) { console.error('定額消費削除エラー:', error); alert('削除に失敗しました'); }
}

function getFixedExpensesTotal() {
  return fixedExpenses.filter(f => f.isActive).reduce((sum, f) => sum + f.amount, 0);
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
  } catch (error) { console.error('定額消費金額更新エラー:', error); alert('更新に失敗しました'); }
}

function renderFixedExpenses() {
  const container = document.getElementById('fixed-expenses-list');
  const empty = document.getElementById('fixed-expenses-empty');
  if (fixedExpenses.length === 0) { empty.style.display = 'block'; container.innerHTML = empty.outerHTML; return; }
  empty.style.display = 'none';
  container.innerHTML = fixedExpenses.map(f => `
    <div class="fixed-expense-item ${f.isActive ? '' : 'inactive'}">
      <div class="fixed-expense-info">
        <span class="fixed-expense-name">${f.name}</span>
        <span class="fixed-expense-amount" id="fixed-amount-${f.id}" onclick="editFixedExpenseAmount('${f.id}')" title="クリックで金額を編集">${formatCurrency(f.amount)}</span>
        <span class="fixed-expense-category">${f.category}</span>
      </div>
      <div class="fixed-expense-actions">
        <label class="toggle-switch toggle-sm">
          <input type="checkbox" ${f.isActive ? 'checked' : ''} onchange="toggleFixedExpense('${f.id}')">
          <span class="toggle-slider"></span>
        </label>
        <button class="btn btn-danger btn-sm" onclick="deleteFixedExpenseConfirm('${f.id}')">削除</button>
      </div>
    </div>
  `).join('') + '<div class="empty-state" id="fixed-expenses-empty" style="display:none;">定額消費はまだ登録されていません</div>';
}

// ===================================
// 支出管理
// ===================================
async function addExpense(cardId, amount, category, description, date) {
  try {
    const card = creditCards.find(c => c.id === cardId);
    if (!card) { alert('無効なカードが選択されています'); return; }
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
  } catch (error) { console.error('支出追加エラー:', error); alert('支出の追加に失敗しました: ' + error.message); }
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
  if (!expense) { alert('支出が見つかりません'); return; }
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
  } catch (error) { console.error('支出削除エラー:', error); alert('支出の削除に失敗しました'); }
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
  if (!card) { alert('無効なカードが選択されています'); return; }
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
  } catch (error) { console.error('支出更新エラー:', error); alert('支出の更新に失敗しました: ' + error.message); }
}

function renderExpenses() {
  const tbody = document.getElementById('expenses-list');
  let filtered = filterCardId === 'all' ? expenses : expenses.filter(e => e.cardId === filterCardId);
  if (searchQuery) filtered = filtered.filter(e =>
    (e.description && e.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (e.category && e.category.toLowerCase().includes(searchQuery.toLowerCase())));
  if (searchFrom) { const d = new Date(searchFrom); filtered = filtered.filter(e => e.date.toDate() >= d); }
  if (searchTo) { const d = new Date(searchTo); d.setHours(23, 59, 59); filtered = filtered.filter(e => e.date.toDate() <= d); }

  if (filtered.length === 0) {
    const sel = document.getElementById('month-selector');
    const label = sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].text : currentYearMonth;
    const fl = (filterCardId !== 'all' || searchQuery || searchFrom || searchTo) ? '条件に一致する' : '';
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state">${fl}${label}の支出はまだ登録されていません</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(expense => {
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
    const currentMonthTotal = expenses.reduce((sum, e) => sum + e.amount, 0);
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

  const variableTotal = expenses.reduce((sum, e) => sum + e.amount, 0);
  const fixedTotal = getFixedExpensesTotal();
  const totalAmount = fixedTotal + variableTotal;

  document.getElementById('total-amount').textContent = formatCurrency(totalAmount);
  document.getElementById('fixed-total').textContent = formatCurrency(fixedTotal);
  document.getElementById('variable-total').textContent = formatCurrency(variableTotal);

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
  if (selectedMonths.length === 0) { alert('エクスポートする月を選択してください'); return; }

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
    alert('エクスポートが完了しました');
  } catch (error) { console.error('エクスポートエラー:', error); alert('エクスポートに失敗しました'); }
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
  if (!amount || Number(amount) <= 0) { alert('有効な予算額を入力してください'); return; }
  await saveBudget(currentYearMonth, amount);
  alert('予算を保存しました');
});

document.getElementById('add-fixed-expense-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('fixed-expense-name').value.trim();
  const amount = document.getElementById('fixed-expense-amount').value;
  const cardId = document.getElementById('fixed-expense-card').value;
  const category = document.getElementById('fixed-expense-category').value;
  if (!name || !amount || !cardId || !category) { alert('すべての項目を入力してください'); return; }
  const card = creditCards.find(c => c.id === cardId);
  await addFixedExpense({ name, amount: Number(amount), cardId, cardName: card ? card.name : '', category });
  document.getElementById('fixed-expense-name').value = '';
  document.getElementById('fixed-expense-amount').value = '';
  document.getElementById('fixed-expense-card').value = '';
  document.getElementById('fixed-expense-category').value = '';
  renderBudgetStatus();
  updateSummary();
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
window.toggleFixedExpense = toggleFixedExpense;
window.deleteFixedExpenseConfirm = deleteFixedExpenseConfirm;
window.closeDeleteFixedExpenseModal = closeDeleteFixedExpenseModal;
window.confirmDeleteFixedExpense = confirmDeleteFixedExpense;
window.editFixedExpenseAmount = editFixedExpenseAmount;
window.saveFixedExpenseAmount = saveFixedExpenseAmount;
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
    await loadExpenses();
    await loadBudgetForCurrentMonth();
    initExportMonths();
    await updateCharts();
    console.log('アプリ初期化完了');
  } catch (error) {
    console.error('初期化エラー:', error);
    alert('アプリの初期化に失敗しました。Firebase設定を確認してください。');
  }
}

init();
