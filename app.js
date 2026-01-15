// Firebase SDK v9 modular imports
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js';
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  updateDoc,
  doc,
  query,
  where,
  orderBy,
  Timestamp
} from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js';

// ===================================
// Firebase設定
// ===================================
const firebaseConfig = {
  apiKey: "AIzaSyDpPhb_u_TgfVlbv9aRwBy4b7Zw83G6vPA",
  authDomain: "kakeibo-app-47a67.firebaseapp.com",
  projectId: "kakeibo-app-47a67",
  storageBucket: "kakeibo-app-47a67.firebasestorage.app",
  messagingSenderId: "808694368518",
  appId: "1:808694368518:web:0e842a3e5f91138ad37687"
};

// Firebase初期化
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ===================================
// グローバル変数
// ===================================
let debugMode = false;
let creditCards = [];
let expenses = [];
let categories = []; // Firestoreから読み込んだカテゴリリスト
let currentYearMonth = '';
let debugDate = null;

// グラフ関連
let chartPeriod = 4; // デフォルト4ヶ月
let totalChart = null;
let cardsChart = null;

// フィルター関連
let filterCardId = 'all'; // デフォルトは全て表示

// 検索関連
let searchQuery = '';
let searchFrom = null;
let searchTo = null;

// カテゴリ管理
const DEFAULT_CATEGORIES = [
  '食費', '交通費', '娯楽', '日用品', '医療費',
  '通信費', '光熱費', '住居費', '教育費', 'その他'
];

// ===================================
// ユーティリティ関数
// ===================================

// 現在の日付を取得(デバッグモード考慮)
function getCurrentDate() {
  if (debugMode && debugDate) {
    return new Date(debugDate);
  }
  return new Date();
}

// 年月を YYYY-MM 形式で取得
function getYearMonth(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

// 日付を YYYY-MM-DD 形式で取得
function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// 金額をフォーマット
function formatCurrency(amount) {
  return `¥${amount.toLocaleString('ja-JP')}`;
}

// 未使用の色を生成（既存カードと被らない）
function generateRandomColor() {
  const colors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
    '#F7DC6F', '#BB8FCE', '#85C1E2', '#F8B500', '#E74C3C',
    '#3498DB', '#2ECC71', '#E67E22', '#9B59B6', '#1ABC9C'
  ];

  // 既存カードで使用されている色を取得
  const usedColors = creditCards.map(card => card.color);

  // 未使用の色をフィルタ
  const availableColors = colors.filter(color => !usedColors.includes(color));

  // 未使用の色があればそこから選択、なければ全色から選択
  const colorPool = availableColors.length > 0 ? availableColors : colors;
  return colorPool[Math.floor(Math.random() * colorPool.length)];
}

// ===================================
// 月選択の初期化
// ===================================
function initMonthSelector() {
  const selector = document.getElementById('month-selector');
  const currentDate = getCurrentDate();
  const currentYM = getYearMonth(currentDate);

  // 過去12ヶ月分の選択肢を生成
  const months = [];
  for (let i = 0; i < 12; i++) {
    const date = new Date(currentDate);
    date.setMonth(date.getMonth() - i);
    const ym = getYearMonth(date);
    months.push({
      value: ym,
      label: `${date.getFullYear()}年${date.getMonth() + 1}月`
    });
  }

  selector.innerHTML = months.map(m =>
    `<option value="${m.value}" ${m.value === currentYM ? 'selected' : ''}>${m.label}</option>`
  ).join('');

  currentYearMonth = currentYM;

  // 月変更イベント
  selector.addEventListener('change', async (e) => {
    currentYearMonth = e.target.value;
    console.log('月を切り替えました:', currentYearMonth);
    await loadExpenses();
    updateSummary();
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

  // デフォルト日付を今日に設定
  dateInput.value = formatDate(new Date());

  // デバッグモード切替
  toggle.addEventListener('change', (e) => {
    debugMode = e.target.checked;
    if (debugMode) {
      panel.classList.add('active');
    } else {
      panel.classList.remove('active');
      debugDate = null;
      initMonthSelector();
      loadExpenses();
      updateSummary();
    }
  });

  // デバッグ日付適用
  applyBtn.addEventListener('click', () => {
    if (dateInput.value) {
      debugDate = dateInput.value;
      initMonthSelector();
      loadExpenses();
      updateSummary();
      alert(`デバッグ日付を ${debugDate} に設定しました`);
    }
  });
}

// ===================================
// クレジットカード管理
// ===================================

// カード追加
async function addCreditCard(name) {
  try {
    const color = generateRandomColor();
    const docRef = await addDoc(collection(db, 'creditCards'), {
      name: name,
      color: color,
      createdAt: Timestamp.now()
    });
    console.log('カード追加成功:', docRef.id);
    await loadCreditCards();
    return docRef.id;
  } catch (error) {
    console.error('カード追加エラー:', error);
    alert('カードの追加に失敗しました: ' + error.message);
  }
}

// カード一覧取得
async function loadCreditCards() {
  try {
    const querySnapshot = await getDocs(collection(db, 'creditCards'));
    creditCards = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    renderCreditCards();
    updateExpenseCardSelect();
    updateExpenseFilterSelect();
  } catch (error) {
    console.error('カード読み込みエラー:', error);
  }
}

// カード削除確認モーダルを開く
function deleteCreditCard(cardId) {
  const card = creditCards.find(c => c.id === cardId);
  if (!card) {
    alert('カードが見つかりません');
    return;
  }

  document.getElementById('delete-card-id').value = cardId;
  document.getElementById('delete-card-name').textContent = card.name;
  document.getElementById('delete-card-modal').style.display = 'flex';
}

// カード削除確認モーダルを閉じる
function closeDeleteCardModal() {
  document.getElementById('delete-card-modal').style.display = 'none';
}

// カードを削除（確定）
async function confirmDeleteCard() {
  const cardId = document.getElementById('delete-card-id').value;

  try {
    await deleteDoc(doc(db, 'creditCards', cardId));
    console.log('カード削除成功');
    closeDeleteCardModal();
    await loadCreditCards();
    await loadExpenses(); // 支出一覧も更新
    updateSummary();
  } catch (error) {
    console.error('カード削除エラー:', error);
    alert('カードの削除に失敗しました: ' + error.message);
  }
}

// カード一覧表示
function renderCreditCards() {
  const cardsList = document.getElementById('cards-list');
  const emptyState = document.getElementById('cards-empty');

  if (creditCards.length === 0) {
    emptyState.style.display = 'block';
    return;
  }

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

// 支出入力フォームのカード選択を更新
function updateExpenseCardSelect() {
  const select = document.getElementById('expense-card');
  const currentValue = select.value;

  select.innerHTML = '<option value="">カードを選択してください</option>' +
    creditCards.map(card =>
      `<option value="${card.id}">${card.name}</option>`
    ).join('');

  if (currentValue && creditCards.find(c => c.id === currentValue)) {
    select.value = currentValue;
  }
}

// 支出フィルター用のカード選択を更新
function updateExpenseFilterSelect() {
  const select = document.getElementById('expense-filter-card');
  const currentValue = select.value;

  select.innerHTML = '<option value="all">すべてのカード</option>' +
    creditCards.map(card =>
      `<option value="${card.id}">${card.name}</option>`
    ).join('');

  if (currentValue && (currentValue === 'all' || creditCards.find(c => c.id === currentValue))) {
    select.value = currentValue;
  }
}

// ===================================
// カテゴリ管理
// ===================================

let currentCategoryInputId = null; // 現在カテゴリを選択中の入力フィールドのID

// カテゴリをFirestoreから読み込み
async function loadCategories() {
  try {
    const querySnapshot = await getDocs(collection(db, 'categories'));
    categories = querySnapshot.docs.map(doc => ({
      id: doc.id,
      name: doc.data().name,
      createdAt: doc.data().createdAt
    }));

    // 名前でソート
    categories.sort((a, b) => a.name.localeCompare(b.name));

    console.log(`カテゴリ ${categories.length}件を読み込みました`);

    // カテゴリが1つもない場合はデフォルトカテゴリを追加
    if (categories.length === 0) {
      await initializeDefaultCategories();
    }
  } catch (error) {
    console.error('カテゴリ読み込みエラー:', error);
  }
}

// デフォルトカテゴリを初期化
async function initializeDefaultCategories() {
  console.log('デフォルトカテゴリを初期化中...');
  try {
    for (const categoryName of DEFAULT_CATEGORIES) {
      await addDoc(collection(db, 'categories'), {
        name: categoryName,
        createdAt: Timestamp.now()
      });
    }
    await loadCategories();
    console.log('デフォルトカテゴリの初期化完了');
  } catch (error) {
    console.error('デフォルトカテゴリ初期化エラー:', error);
  }
}

// カテゴリをFirestoreに追加
async function addCategoryToFirestore(categoryName) {
  try {
    const docRef = await addDoc(collection(db, 'categories'), {
      name: categoryName,
      createdAt: Timestamp.now()
    });
    console.log('カテゴリ追加成功:', docRef.id);
    await loadCategories();
    return true;
  } catch (error) {
    console.error('カテゴリ追加エラー:', error);
    return false;
  }
}

// カテゴリをFirestoreから削除
async function deleteCategoryFromFirestore(categoryId) {
  try {
    await deleteDoc(doc(db, 'categories', categoryId));
    console.log('カテゴリ削除成功:', categoryId);
    await loadCategories();
    return true;
  } catch (error) {
    console.error('カテゴリ削除エラー:', error);
    return false;
  }
}

// カテゴリモーダルを開く
function openCategoryModal(inputId) {
  currentCategoryInputId = inputId;
  renderCategoryList();
  document.getElementById('category-modal').style.display = 'flex';
  document.getElementById('category-search').value = '';
}

// カテゴリモーダルを閉じる
function closeCategoryModal() {
  document.getElementById('category-modal').style.display = 'none';
  currentCategoryInputId = null;
}

// カテゴリリストを表示
function renderCategoryList(searchQuery = '') {
  const filtered = searchQuery
    ? categories.filter(cat => cat.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : categories;

  const listContainer = document.getElementById('category-list-modal');

  if (filtered.length === 0) {
    listContainer.innerHTML = '<div class="empty-state">カテゴリが見つかりません</div>';
    return;
  }

  listContainer.innerHTML = filtered.map(category => `
    <div class="category-item">
      <span class="category-name" onclick="selectCategory('${category.name}')">${category.name}</span>
      <div class="category-actions">
        <button class="btn-icon" onclick="selectCategory('${category.name}')" title="選択">→</button>
        <button class="btn-icon btn-icon-danger" onclick="deleteCategory('${category.id}', '${category.name}')" title="削除">🗑️</button>
      </div>
    </div>
  `).join('');
}

// カテゴリを選択
function selectCategory(categoryName) {
  if (currentCategoryInputId) {
    document.getElementById(currentCategoryInputId).value = categoryName;
  }
  closeCategoryModal();
}

// カテゴリ削除確認モーダルを開く
function deleteCategory(categoryId, categoryName) {
  // イベント伝播を止める
  event.stopPropagation();

  document.getElementById('delete-category-id').value = categoryId;
  document.getElementById('delete-category-name').textContent = categoryName;
  document.getElementById('delete-category-modal').style.display = 'flex';
}

// カテゴリ削除確認モーダルを閉じる
function closeDeleteCategoryModal() {
  document.getElementById('delete-category-modal').style.display = 'none';
}

// カテゴリを削除（確定）
async function confirmDeleteCategory() {
  const categoryId = document.getElementById('delete-category-id').value;
  const categoryName = document.getElementById('delete-category-name').textContent;

  const success = await deleteCategoryFromFirestore(categoryId);
  if (success) {
    closeDeleteCategoryModal();
    renderCategoryList(document.getElementById('category-search').value);
  }
}

// 新しいカテゴリを追加
async function addNewCategory() {
  const input = document.getElementById('new-category-name');
  const categoryName = input.value.trim();

  if (!categoryName) {
    alert('カテゴリ名を入力してください');
    return;
  }

  // 既存チェック
  if (categories.some(cat => cat.name === categoryName)) {
    alert('このカテゴリは既に存在します');
    return;
  }

  const success = await addCategoryToFirestore(categoryName);
  if (success) {
    selectCategory(categoryName);
    input.value = '';
  }
}

// カテゴリ検索
document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('category-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      renderCategoryList(e.target.value);
    });
  }

  // Enter キーで新規カテゴリ追加
  const newCategoryInput = document.getElementById('new-category-name');
  if (newCategoryInput) {
    newCategoryInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addNewCategory();
      }
    });
  }
});

// ===================================
// 支出管理
// ===================================

// 支出追加
async function addExpense(cardId, amount, category, description, date) {
  try {
    const card = creditCards.find(c => c.id === cardId);
    if (!card) {
      alert('無効なカードが選択されています');
      return;
    }

    const expenseDate = new Date(date);
    const yearMonth = getYearMonth(expenseDate);

    const docRef = await addDoc(collection(db, 'expenses'), {
      cardId: cardId,
      cardName: card.name,
      amount: Number(amount),
      category: category,
      description: description,
      date: Timestamp.fromDate(expenseDate),
      yearMonth: yearMonth,
      createdAt: Timestamp.now()
    });

    console.log('支出追加成功:', docRef.id, 'yearMonth:', yearMonth);

    // 追加した月が現在表示中の月と異なる場合は、その月に切り替え
    if (yearMonth !== currentYearMonth) {
      document.getElementById('month-selector').value = yearMonth;
      currentYearMonth = yearMonth;
    }

    await loadExpenses();
  } catch (error) {
    console.error('支出追加エラー:', error);
    alert('支出の追加に失敗しました: ' + error.message);
  }
}

// 支出一覧取得
async function loadExpenses() {
  try {
    console.log('支出読み込み中... 対象月:', currentYearMonth);
    const q = query(
      collection(db, 'expenses'),
      where('yearMonth', '==', currentYearMonth),
      orderBy('date', 'desc')  // 新しい順（降順）
    );

    const querySnapshot = await getDocs(q);
    expenses = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    // 同じ日付の場合はcreatedAtで降順ソート（最新登録が上）
    expenses.sort((a, b) => {
      const dateCompare = b.date.toMillis() - a.date.toMillis();
      if (dateCompare !== 0) return dateCompare;
      return b.createdAt.toMillis() - a.createdAt.toMillis();
    });

    console.log(`支出 ${expenses.length} 件を読み込みました`);
    console.log('読み込んだexpenses:', expenses);
    renderExpenses();
    updateSummary();
    updateStatistics(); // 統計情報を更新
    updateCategoryCharts(); // カテゴリ別グラフを更新
  } catch (error) {
    console.error('支出読み込みエラー:', error);
  }
}

// 支出削除確認モーダルを開く
function deleteExpense(expenseId) {
  const expense = expenses.find(e => e.id === expenseId);
  if (!expense) {
    alert('支出が見つかりません');
    return;
  }

  const card = creditCards.find(c => c.id === expense.cardId);
  const cardName = card ? card.name : '不明';

  // 支出詳細を表示
  const details = `
    <div style="font-size: var(--font-size-sm);">
      <div style="margin-bottom: var(--spacing-xs);"><strong>日付:</strong> ${formatDate(expense.date.toDate())}</div>
      <div style="margin-bottom: var(--spacing-xs);"><strong>カード:</strong> ${cardName}</div>
      <div style="margin-bottom: var(--spacing-xs);"><strong>カテゴリ:</strong> ${expense.category}</div>
      <div style="margin-bottom: var(--spacing-xs);"><strong>金額:</strong> ${formatCurrency(expense.amount)}</div>
      ${expense.description ? `<div><strong>説明:</strong> ${expense.description}</div>` : ''}
    </div>
  `;

  document.getElementById('delete-expense-details').innerHTML = details;
  document.getElementById('delete-expense-id').value = expenseId;
  document.getElementById('delete-expense-modal').style.display = 'flex';
}

// 支出削除確認モーダルを閉じる
function closeDeleteExpenseModal() {
  document.getElementById('delete-expense-modal').style.display = 'none';
}

// 支出を削除（確定）
async function confirmDeleteExpense() {
  const expenseId = document.getElementById('delete-expense-id').value;

  try {
    await deleteDoc(doc(db, 'expenses', expenseId));
    console.log('支出削除成功:', expenseId);
    closeDeleteExpenseModal();
    await loadExpenses();
    updateSummary();
    await updateCharts();
  } catch (error) {
    console.error('支出削除エラー:', error);
    alert('支出の削除に失敗しました');
  }
}

// 支出編集モーダルを開く
function openEditModal(expenseId) {
  const expense = expenses.find(e => e.id === expenseId);
  if (!expense) return;

  // フォームに値を設定
  document.getElementById('edit-expense-id').value = expense.id;
  document.getElementById('edit-expense-card').value = expense.cardId;
  document.getElementById('edit-expense-amount').value = expense.amount;
  document.getElementById('edit-expense-category').value = expense.category;
  document.getElementById('edit-expense-date').value = formatDate(expense.date.toDate());
  document.getElementById('edit-expense-description').value = expense.description || '';

  // 編集用のカード選択肢を更新
  const editCardSelect = document.getElementById('edit-expense-card');
  editCardSelect.innerHTML = creditCards.map(card =>
    `<option value="${card.id}">${card.name}</option>`
  ).join('');
  editCardSelect.value = expense.cardId;

  // モーダルを表示
  document.getElementById('edit-modal').style.display = 'flex';
}

// 編集モーダルを閉じる
function closeEditModal() {
  document.getElementById('edit-modal').style.display = 'none';
}

// 支出を更新
async function updateExpense(e) {
  e.preventDefault();

  const expenseId = document.getElementById('edit-expense-id').value;
  const cardId = document.getElementById('edit-expense-card').value;
  const amount = document.getElementById('edit-expense-amount').value;
  const category = document.getElementById('edit-expense-category').value;
  const date = document.getElementById('edit-expense-date').value;
  const description = document.getElementById('edit-expense-description').value;

  try {
    const card = creditCards.find(c => c.id === cardId);
    if (!card) {
      alert('無効なカードが選択されています');
      return;
    }

    const expenseDate = new Date(date);
    const yearMonth = getYearMonth(expenseDate);

    await updateDoc(doc(db, 'expenses', expenseId), {
      cardId: cardId,
      cardName: card.name,
      amount: Number(amount),
      category: category,
      description: description,
      date: Timestamp.fromDate(expenseDate),
      yearMonth: yearMonth
    });

    console.log('支出更新成功:', expenseId);
    closeEditModal();
    await loadExpenses();
  } catch (error) {
    console.error('支出更新エラー:', error);
    alert('支出の更新に失敗しました: ' + error.message);
  }
}

// 支出一覧表示
function renderExpenses() {
  const tbody = document.getElementById('expenses-list');

  // フィルター適用（カードフィルター + 検索条件）
  let filteredExpenses = filterCardId === 'all'
    ? expenses
    : expenses.filter(e => e.cardId === filterCardId);

  // 検索条件の適用
  if (searchQuery) {
    filteredExpenses = filteredExpenses.filter(e =>
      (e.description && e.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (e.category && e.category.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  }

  if (searchFrom) {
    const fromDate = new Date(searchFrom);
    filteredExpenses = filteredExpenses.filter(e => e.date.toDate() >= fromDate);
  }

  if (searchTo) {
    const toDate = new Date(searchTo);
    toDate.setHours(23, 59, 59); // 終日を含める
    filteredExpenses = filteredExpenses.filter(e => e.date.toDate() <= toDate);
  }

  if (filteredExpenses.length === 0) {
    const selector = document.getElementById('month-selector');
    const selectedOption = selector.options[selector.selectedIndex];
    const monthLabel = selectedOption ? selectedOption.text : currentYearMonth;

    const filterLabel = (filterCardId !== 'all' || searchQuery || searchFrom || searchTo)
      ? '条件に一致する'
      : '';
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state">${filterLabel}${monthLabel}の支出はまだ登録されていません</td></tr>`;
    return;
  }

  tbody.innerHTML = filteredExpenses.map(expense => {
    const date = expense.date.toDate();
    const dateStr = formatDate(date);
    const card = creditCards.find(c => c.id === expense.cardId);
    const cardColor = card ? card.color : '#999';

    return `
      <tr>
        <td data-label="日付">${dateStr}</td>
        <td data-label="カード">
          <span class="card-badge" style="display: inline-flex;">
            <span class="card-color-dot" style="background-color: ${cardColor};"></span>
            <span>${expense.cardName}</span>
          </span>
        </td>
        <td data-label="カテゴリ">${expense.category}</td>
        <td data-label="説明">${expense.description || '-'}</td>
        <td data-label="金額" class="amount">${formatCurrency(expense.amount)}</td>
        <td data-label="操作">
          <button class="btn btn-warning btn-sm" onclick="openEditModal('${expense.id}')">編集</button>
          <button class="btn btn-danger btn-sm" onclick="deleteExpense('${expense.id}')">削除</button>
        </td>
      </tr>
    `;
  }).join('');
}

// 検索を適用
function applySearch() {
  searchQuery = document.getElementById('search-query').value.trim();
  searchFrom = document.getElementById('search-from').value;
  searchTo = document.getElementById('search-to').value;
  renderExpenses();
}

// 検索をクリア
function clearSearch() {
  searchQuery = '';
  searchFrom = null;
  searchTo = null;
  document.getElementById('search-query').value = '';
  document.getElementById('search-from').value = '';
  document.getElementById('search-to').value = '';
  renderExpenses();
}

// ===================================
// 統計情報
// ===================================

// 統計情報を更新
async function updateStatistics() {
  try {
    // DOM要素の存在チェック
    const statCurrentMonth = document.getElementById('stat-current-month');
    if (!statCurrentMonth) {
      console.log('統計情報のDOM要素が見つかりません');
      return;
    }

    // 過去6ヶ月のデータを取得
    const monthlyData = await getMonthlyData(6);

    // 今月の支出
    const currentMonthTotal = expenses.reduce((sum, expense) => sum + expense.amount, 0);

    // 月平均（四捨五入して整数表示）
    const avgMonthly = monthlyData.totals.length > 0
      ? Math.round(monthlyData.totals.reduce((a, b) => a + b, 0) / monthlyData.totals.length)
      : 0;

    // 前月比の計算
    let monthComparison = '-';
    let comparisonClass = '';
    if (monthlyData.totals.length >= 2) {
      const currentMonth = monthlyData.totals[monthlyData.totals.length - 1]; // 最新の月
      const lastMonth = monthlyData.totals[monthlyData.totals.length - 2]; // 1つ前の月

      if (lastMonth > 0) {
        const diff = currentMonth - lastMonth;
        const percentage = (diff / lastMonth * 100).toFixed(1);
        const arrow = diff > 0 ? '↑' : '↓';
        monthComparison = `${arrow} ${Math.abs(parseFloat(percentage))}% `;
        comparisonClass = diff > 0 ? 'positive' : 'negative';
      } else if (currentMonth > 0) {
        // 前月が0で今月が0より大きい場合
        monthComparison = '↑ 100%以上';
        comparisonClass = 'positive';
      }
    }

    // カテゴリ別集計
    const categoryTotals = {};
    expenses.forEach(expense => {
      if (expense.category) {
        categoryTotals[expense.category] = (categoryTotals[expense.category] || 0) + expense.amount;
      }
    });

    // 最多カテゴリ
    let topCategory = '-';
    if (Object.keys(categoryTotals).length > 0) {
      topCategory = Object.keys(categoryTotals)
        .reduce((a, b) => categoryTotals[a] > categoryTotals[b] ? a : b);
    }

    // 表示更新
    document.getElementById('stat-current-month').textContent = formatCurrency(currentMonthTotal);
    document.getElementById('stat-avg-monthly').textContent = formatCurrency(avgMonthly);

    const comparisonElement = document.getElementById('stat-month-comparison');
    comparisonElement.textContent = monthComparison;
    comparisonElement.className = 'stat-value stat-comparison ' + comparisonClass;

    document.getElementById('stat-top-category').textContent = topCategory;

    console.log('統計情報を更新しました');
  } catch (error) {
    console.error('統計情報更新エラー:', error);
  }
}

// ===================================
// 集計
// ===================================
function updateSummary() {
  console.log('サマリー更新中... expenses件数:', expenses.length);

  // クレカ別集計
  const cardTotals = {};
  creditCards.forEach(card => {
    cardTotals[card.id] = {
      name: card.name,
      color: card.color,
      amount: 0
    };
  });

  expenses.forEach(expense => {
    if (cardTotals[expense.cardId]) {
      cardTotals[expense.cardId].amount += expense.amount;
    }
  });

  // 総合計
  const totalAmount = expenses.reduce((sum, expense) => sum + expense.amount, 0);
  console.log('総合計:', totalAmount);

  // 総合計表示
  document.getElementById('total-amount').textContent = formatCurrency(totalAmount);

  // クレカ別サマリー表示
  const cardSummaries = document.getElementById('card-summaries');
  cardSummaries.innerHTML = Object.values(cardTotals)
    .filter(card => card.amount > 0)
    .map(card => `
      <div class="summary-card">
        <div class="summary-label">
          <span class="card-color-dot" style="background-color: ${card.color};"></span>
          <span>${card.name}</span>
        </div>
        <div class="summary-amount">${formatCurrency(card.amount)}</div>
      </div>
    `).join('');

  console.log('サマリー更新完了');
}

// ===================================
// グラフ機能
// ===================================

// 月別集計データ取得
async function getMonthlyData(months) {
  const currentDate = getCurrentDate();
  const monthsData = [];

  // 指定月数分の月リストを生成
  for (let i = months - 1; i >= 0; i--) {
    const date = new Date(currentDate);
    date.setMonth(date.getMonth() - i);
    const ym = getYearMonth(date);
    monthsData.push({
      yearMonth: ym,
      label: `${date.getFullYear()}年${date.getMonth() + 1} 月`,
      total: 0,
      cards: {}
    });
  }

  // 各月のデータを取得
  for (const monthData of monthsData) {
    try {
      const q = query(
        collection(db, 'expenses'),
        where('yearMonth', '==', monthData.yearMonth)
      );

      const querySnapshot = await getDocs(q);
      const monthExpenses = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // 総合計を計算
      monthData.total = monthExpenses.reduce((sum, expense) => sum + expense.amount, 0);

      // クレカ別集計
      creditCards.forEach(card => {
        monthData.cards[card.id] = monthExpenses
          .filter(expense => expense.cardId === card.id)
          .reduce((sum, expense) => sum + expense.amount, 0);
      });
    } catch (error) {
      console.error(`${monthData.yearMonth} のデータ取得エラー: `, error);
    }
  }

  return {
    labels: monthsData.map(m => m.label),
    totals: monthsData.map(m => m.total),
    cards: monthsData.reduce((acc, m) => {
      Object.keys(m.cards).forEach(cardId => {
        if (!acc[cardId]) acc[cardId] = [];
        acc[cardId].push(m.cards[cardId]);
      });
      return acc;
    }, {})
  };
}

// 総合計グラフ描画
function renderTotalChart(data) {
  const ctx = document.getElementById('total-chart').getContext('2d');

  if (totalChart) {
    totalChart.destroy();
  }

  totalChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.labels,
      datasets: [{
        label: '総支出',
        data: data.totals,
        borderColor: 'rgb(102, 126, 234)',
        backgroundColor: 'rgba(102, 126, 234, 0.1)',
        borderWidth: 3,
        tension: 0.4,
        fill: true,
        pointRadius: 5,
        pointHoverRadius: 7,
        pointBackgroundColor: 'rgb(102, 126, 234)',
        pointBorderColor: '#fff',
        pointBorderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          padding: 12,
          titleColor: '#fff',
          bodyColor: '#fff',
          callbacks: {
            label: (context) => '総支出: ' + formatCurrency(context.parsed.y)
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            color: '#b4b8d1',
            callback: value => '￥' + value.toLocaleString()
          },
          grid: {
            color: 'rgba(255, 255, 255, 0.05)'
          }
        },
        x: {
          ticks: {
            color: '#b4b8d1'
          },
          grid: {
            color: 'rgba(255, 255, 255, 0.05)'
          }
        }
      }
    }
  });
}

// クレカ別グラフ描画
function renderCardsChart(data) {
  const ctx = document.getElementById('cards-chart').getContext('2d');

  if (cardsChart) {
    cardsChart.destroy();
  }

  // 各クレカのデータセットを作成
  const datasets = creditCards.map(card => ({
    label: card.name,
    data: data.cards[card.id] || [],
    borderColor: card.color,
    backgroundColor: card.color + '33',
    borderWidth: 2,
    tension: 0.4,
    pointRadius: 4,
    pointHoverRadius: 6,
    pointBackgroundColor: card.color,
    pointBorderColor: '#fff',
    pointBorderWidth: 2
  }));

  cardsChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.labels,
      datasets: datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          display: true,
          labels: {
            color: '#b4b8d1',
            usePointStyle: true,
            padding: 15
          }
        },
        tooltip: {
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          padding: 12,
          titleColor: '#fff',
          bodyColor: '#fff',
          callbacks: {
            label: (context) => context.dataset.label + ': ' + formatCurrency(context.parsed.y)
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            color: '#b4b8d1',
            callback: value => '￥' + value.toLocaleString()
          },
          grid: {
            color: 'rgba(255, 255, 255, 0.05)'
          }
        },
        x: {
          ticks: {
            color: '#b4b8d1'
          },
          grid: {
            color: 'rgba(255, 255, 255, 0.05)'
          }
        }
      }
    }
  });
}

// グラフ更新
async function updateCharts() {
  console.log('グラフ更新中... 期間:', chartPeriod, 'ヶ月');
  const data = await getMonthlyData(chartPeriod);
  renderTotalChart(data);
  renderCardsChart(data);
}

// ===================================
// カテゴリ別グラフ
// ===================================

let categoryPieChart = null;
let categoryBarChart = null;

// カテゴリ別データを取得
function getCategoryData() {
  const categoryTotals = {};

  expenses.forEach(expense => {
    if (expense.category) {
      categoryTotals[expense.category] = (categoryTotals[expense.category] || 0) + expense.amount;
    }
  });

  return categoryTotals;
}

// カテゴリ別の色を生成（カテゴリ名に基づいて一貫した色を返す）
function getCategoryColors(categories) {
  const baseColors = [
    '#667eea', // パープル
    '#34d399', // グリーン
    '#f59e0b', // オレンジ
    '#ef4444', // レッド
    '#3b82f6', // ブルー
    '#ec4899', // ピンク
    '#10b981', // エメラルド
    '#f97316', // オレンジ
    '#8b5cf6', // バイオレット
    '#06b6d4'  // シアン
  ];

  // カテゴリ名をソートしてインデックスを決定（一貫性を保つため）
  const allCategories = [...new Set(categories)].sort();
  const colorMap = {};
  allCategories.forEach((cat, index) => {
    colorMap[cat] = baseColors[index % baseColors.length];
  });

  // 入力されたカテゴリ順で色を返す
  return categories.map(cat => colorMap[cat]);
}

// カテゴリ別円グラフを描画
function renderCategoryPieChart() {
  const ctx = document.getElementById('category-pie-chart');
  if (!ctx) return;

  const categoryData = getCategoryData();
  const categories = Object.keys(categoryData);
  const amounts = Object.values(categoryData);

  if (categoryPieChart) {
    categoryPieChart.destroy();
  }

  if (categories.length === 0) {
    ctx.getContext('2d').clearRect(0, 0, ctx.width, ctx.height);
    return;
  }

  categoryPieChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: categories,
      datasets: [{
        data: amounts,
        backgroundColor: getCategoryColors(categories),
        borderWidth: 2,
        borderColor: '#1a1f3a'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: '#cbd5e1',
            padding: 15,
            font: { size: 12 }
          }
        },
        tooltip: {
          callbacks: {
            label: function (context) {
              const label = context.label || '';
              const value = formatCurrency(context.parsed);
              const total = context.dataset.data.reduce((a, b) => a + b, 0);
              const percentage = ((context.parsed / total) * 100).toFixed(1);
              return `${label}: ${value} (${percentage}%)`;
            }
          }
        }
      }
    }
  });
}

// カテゴリ別棒グラフを描画
function renderCategoryBarChart() {
  const ctx = document.getElementById('category-bar-chart');
  if (!ctx) return;

  const categoryData = getCategoryData();
  const categories = Object.keys(categoryData).sort((a, b) => categoryData[b] - categoryData[a]);
  const amounts = categories.map(cat => categoryData[cat]);

  if (categoryBarChart) {
    categoryBarChart.destroy();
  }

  if (categories.length === 0) {
    ctx.getContext('2d').clearRect(0, 0, ctx.width, ctx.height);
    return;
  }

  categoryBarChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: categories,
      datasets: [{
        label: '支出額',
        data: amounts,
        backgroundColor: getCategoryColors(categories),
        borderWidth: 0,
        borderRadius: 8
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function (context) {
              return `支出額: ${formatCurrency(context.parsed.y)} `;
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            color: '#cbd5e1',
            callback: function (value) {
              return '¥' + value.toLocaleString();
            }
          },
          grid: { color: 'rgba(255, 255, 255, 0.05)' }
        },
        x: {
          ticks: { color: '#cbd5e1' },
          grid: { display: false }
        }
      }
    }
  });
}

// カテゴリ別グラフを更新
function updateCategoryCharts() {
  // DOM要素の存在チェック
  if (!document.getElementById('category-pie-chart') || !document.getElementById('category-bar-chart')) {
    console.log('カテゴリグラフのDOM要素が見つかりません');
    return;
  }

  renderCategoryPieChart();
  renderCategoryBarChart();
  console.log('カテゴリ別グラフを更新しました');
}

// ===================================
// イベントハンドラー
// ===================================

// カード追加フォーム
document.getElementById('add-card-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nameInput = document.getElementById('card-name');
  const name = nameInput.value.trim();

  if (name) {
    await addCreditCard(name);
    nameInput.value = '';
  }
});

// 支出追加フォーム
document.getElementById('add-expense-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const cardId = document.getElementById('expense-card').value;
  const amount = document.getElementById('expense-amount').value;
  const category = document.getElementById('expense-category').value;
  const description = document.getElementById('expense-description').value;
  const date = document.getElementById('expense-date').value;

  if (cardId && amount && category && date) {
    await addExpense(cardId, amount, category, description, date);

    // フォームリセット
    document.getElementById('expense-amount').value = '';
    document.getElementById('expense-category').value = '';
    document.getElementById('expense-description').value = '';
  }
});

// グローバル関数として公開(HTML内のonclick属性から呼び出せるように)
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

// 支出編集フォーム
document.getElementById('edit-expense-form').addEventListener('submit', updateExpense);

// グラフ期間選択
document.getElementById('chart-period').addEventListener('change', async (e) => {
  chartPeriod = parseInt(e.target.value);
  console.log('グラフ期間変更:', chartPeriod, 'ヶ月');
  await updateCharts();
});

// 支出フィルター
document.getElementById('expense-filter-card').addEventListener('change', (e) => {
  filterCardId = e.target.value;
  console.log('フィルター変更:', filterCardId);
  renderExpenses();
});

// ===================================
// 初期化
// ===================================
async function init() {
  try {
    // 支出日付のデフォルトを今日に設定
    document.getElementById('expense-date').value = formatDate(getCurrentDate());

    // 各機能の初期化
    initMonthSelector();
    initDebugMode();

    // データ読み込み
    await loadCategories(); // カテゴリを最初に読み込む
    await loadCreditCards();
    await loadExpenses();
    updateSummary();

    // グラフ初期化
    await updateCharts();

    console.log('アプリ初期化完了');
  } catch (error) {
    console.error('初期化エラー:', error);
    alert('アプリの初期化に失敗しました。Firebase設定を確認してください。');
  }
}

// アプリ起動
init();
