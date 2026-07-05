if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/points-calculator/sw.js')
    .then(() => console.log('Service Worker Registered in index.html'))
    .catch(error => console.log('Service Worker Registration Failed in index.html:', error));
}

/* ---------- Tab Navigation ---------- */

function toggleSettingsMenu() {
  const drawer = document.getElementById('settingsDrawer');
  const btn = document.getElementById('hamburgerBtn');
  const isOpen = drawer.classList.contains('open');
  drawer.classList.toggle('open', !isOpen);
  btn.classList.toggle('active', !isOpen);
}

function switchTab(tabName, direction) {
  document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.remove('active', 'slide-from-left'));
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));

  const panel = document.getElementById('tabPanel-' + tabName);
  panel.classList.add('active');

  // Slide from left when going back (swiping right), from right when going forward
  if (direction === 'right') panel.classList.add('slide-from-left');

  document.getElementById('tabBtn-' + tabName).classList.add('active');

  // Close settings drawer when switching tabs
  document.getElementById('settingsDrawer').classList.remove('open');
  document.getElementById('hamburgerBtn').classList.remove('active');

  if (tabName === 'history') renderHistory();
}

function openCalculatorHelp() {
  document.getElementById('calculatorHelpModal').classList.add('modal-visible');
}

function closeCalculatorHelp(event) {
  if (event && event.target.id !== 'calculatorHelpModal') return;
  document.getElementById('calculatorHelpModal').classList.remove('modal-visible');
}

/* ---------- Confirm Modal ---------- */

let confirmResolver = null;

function showConfirm(message, options = {}) {
  document.getElementById('confirmTitle').innerText = options.title || 'Confirm';
  document.getElementById('confirmMessage').innerText = message;

  const okBtn = document.getElementById('confirmOkBtn');
  okBtn.innerText = options.confirmText || 'Confirm';
  okBtn.classList.toggle('confirm-danger-btn', !!options.danger);

  document.getElementById('confirmModal').classList.add('modal-visible');

  return new Promise((resolve) => { confirmResolver = resolve; });
}

function resolveConfirm(result) {
  document.getElementById('confirmModal').classList.remove('modal-visible');
  if (confirmResolver) {
    const resolve = confirmResolver;
    confirmResolver = null;
    resolve(result);
  }
}

function confirmBackdrop(event) {
  if (event.target.id === 'confirmModal') resolveConfirm(false);
}

/* ---------- Firebase setup ---------- */
const firebaseConfig = {
  apiKey: "AIzaSyDHdqTZVy3q56ZfzygZunPscViqA1utlzQ",
  authDomain: "points-calculator-c1eef.firebaseapp.com",
  projectId: "points-calculator-c1eef",
  storageBucket: "points-calculator-c1eef.firebasestorage.app",
  messagingSenderId: "874686198370",
  appId: "1:874686198370:web:9f65c29e9198f5ab72973b"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

let lastCalculatedPoints = null;
let favoriteHeartActive = false;
let selectedMeal = null;
let syncCode = null;
let unsubscribeSync = null;
let isApplyingRemote = false;
let saveTimeout = null;
let syncTimeout = null;

/* ---------- Daily Allowance Calculator ---------- */

function calcDailyAllowance() {
  // Weight in lbs
  const weightLbs = parseFloat(document.getElementById('acWeight').value);
  if (!weightLbs || weightLbs <= 0) { hideAcResult(); return; }

  // Height in inches (ft + in)
  const ft = parseFloat(document.getElementById('acHeightFt').value) || 0;
  const inches = parseFloat(document.getElementById('acHeightIn').value) || 0;
  const totalInches = (ft * 12) + inches;
  if (totalInches <= 0) { hideAcResult(); return; }

  const age = parseInt(document.getElementById('acAge').value);
  if (!age || age < 17) { hideAcResult(); return; }

  const gender = document.getElementById('acGender').value;
  if (!gender) { hideAcResult(); return; }

  const activity = document.getElementById('acActivity').value;
  if (activity === '') { hideAcResult(); return; }

  // Formula
  let points = gender === 'male' ? 8 : 2;

  if (age <= 26) points += 4;
  else if (age <= 37) points += 3;
  else if (age <= 47) points += 2;
  else if (age <= 57) points += 1;

  points += Math.floor(weightLbs / 10);

  if (totalInches >= 70) points += 2;
  else if (totalInches >= 60) points += 1;

  points += parseInt(activity);

  points = Math.max(18, Math.min(44, points));

  document.getElementById('acResultValue').textContent = points;
  document.getElementById('acResult').style.display = 'flex';
}

function hideAcResult() {
  document.getElementById('acResult').style.display = 'none';
}

function applyCalculatedAllowance() {
  const val = document.getElementById('acResultValue').textContent;
  if (!val || val === '—') return;
  localStorage.setItem('wwDailyAllowance', val);
  updateDailyDisplay();
  saveToCloud();
  toggleSettingsMenu();
  switchTab('journal');
  showToast('Daily allowance set to ' + val + ' pts');
}

/* ---------- Calculator ---------- */

function calculatePoints() {
  const calories = parseFloat(document.getElementById('calories').value) || 0;
  const fat = parseFloat(document.getElementById('fat').value) || 0;
  const fiber = parseFloat(document.getElementById('fiber').value) || 0;

  const cappedFiber = Math.min(fiber, 4);
  const points = Math.round((calories / 50) + (fat / 12) - (cappedFiber / 5));

  lastCalculatedPoints = points;
  const pointsInput = document.getElementById('calcPoints');
  pointsInput.value = points;
  resetFavoriteHeart();

  pointsInput.classList.remove('pulse-glow');
  // Force a reflow so the animation restarts even if triggered repeatedly
  void pointsInput.offsetWidth;
  pointsInput.classList.add('pulse-glow');
}

function selectMeal(meal) {
  selectedMeal = meal || null;
}

function clearFields() {
  document.getElementById('foodName').value = '';
  document.getElementById('calories').value = '';
  document.getElementById('fat').value = '';
  document.getElementById('fiber').value = '';
  document.getElementById('calcPoints').value = '';
  document.getElementById('mealSelect').value = '';
  lastCalculatedPoints = null;
  favoriteHeartActive = false;
  document.getElementById('favoriteHeart').classList.remove('heart-active');
  selectedMeal = null;
}

function resetFavoriteHeart() {
  favoriteHeartActive = false;
  document.getElementById('favoriteHeart').classList.remove('heart-active');
}

function showToast(message) {
  const toast = document.getElementById('toastMessage');
  toast.innerText = message;
  toast.classList.add('toast-visible');

  clearTimeout(toast.hideTimeout);
  toast.hideTimeout = setTimeout(() => {
    toast.classList.remove('toast-visible');
  }, 1600);
}

/* ---------- Food Journal ---------- */

function checkNewDay() {
  const today = new Date().toDateString();
  const storedDate = localStorage.getItem('wwDailyDate');
  if (storedDate !== today) {
    if (storedDate) archiveToday();
    localStorage.setItem('wwFoodJournal', '[]');
    localStorage.setItem('wwDailyDate', today);
  }
}

function getJournal() {
  return JSON.parse(localStorage.getItem('wwFoodJournal') || '[]');
}

let editingJournalIndex = null;

function setJournal(journal) {
  localStorage.setItem('wwFoodJournal', JSON.stringify(journal));
}

function updateDailyDisplay() {
  const allowance = parseFloat(localStorage.getItem('wwDailyAllowance')) || 0;
  const journal = getJournal();
  const used = journal.reduce((sum, item) => sum + item.points, 0);
  const remaining = allowance - used;

  document.getElementById('allowanceDisplay').innerText = allowance || '—';
  document.getElementById('usedToday').innerText = used;

  const remainingEl = document.getElementById('remainingToday');
  remainingEl.innerText = remaining;
  remainingEl.className = remaining >= 0 ? 'remaining-ok' : 'remaining-over';

  const bannerEl = document.getElementById('remainingBanner');
  bannerEl.innerText = allowance ? remaining : '—';
  bannerEl.className = allowance ? (remaining >= 0 ? 'remaining-ok' : 'remaining-over') : '';
}

function addToJournal() {
  const pointsInput = document.getElementById('calcPoints');
  const points = parseFloat(pointsInput.value);

  if (isNaN(points)) {
    showToast('Enter or calculate points first.');
    return;
  }
  if (!selectedMeal) {
    showToast('Pick a meal category first.');
    return;
  }

  const nameInput = document.getElementById('foodName');
  const name = nameInput.value.trim() || 'Food';

  const journal = getJournal();
  journal.unshift({ name: name, points: points, meal: selectedMeal });
  setJournal(journal);

  renderJournal();
  updateDailyDisplay();
  showToast('Added to ' + selectedMeal.toLowerCase());
  clearFields();
  saveToCloud();
}

/* ---------- Favorite Heart ---------- */

function toggleFavoriteHeart() {
  const name = document.getElementById('foodName').value.trim();
  const points = parseFloat(document.getElementById('calcPoints').value);

  if (!name) {
    showToast('Enter a name for this food.');
    return;
  }
  if (isNaN(points)) {
    showToast('Enter or calculate points first.');
    return;
  }

  const foods = getSavedFoods();
  const alreadySaved = foods.some(food => food.name === name && food.points === points);

  if (!alreadySaved) {
    foods.push({ name: name, points: points });
    setSavedFoods(foods);
    renderSavedFoods();
    saveToCloud();
  }

  resetFavoriteHeart();
  showToast('Added to Favorites');
}

function deleteJournalEntry(index) {
  const journal = getJournal();
  journal.splice(index, 1);
  setJournal(journal);
  renderJournal();
  updateDailyDisplay();
  saveToCloud();
}

function editJournalEntry(index) {
  editingJournalIndex = index;
  renderJournal();
}

function cancelJournalEdit() {
  editingJournalIndex = null;
  renderJournal();
}

function saveJournalEdit(index) {
  const nameInput = document.getElementById('editName-' + index);
  const pointsInput = document.getElementById('editPoints-' + index);

  const name = nameInput.value.trim();
  const points = parseFloat(pointsInput.value);

  if (!name) {
    showToast('Food name cannot be empty.');
    return;
  }
  if (isNaN(points)) {
    showToast('Enter a valid points value.');
    return;
  }

  const journal = getJournal();
  journal[index] = { name: name, points: points, meal: journal[index].meal || 'Uncategorized' };
  setJournal(journal);

  editingJournalIndex = null;
  renderJournal();
  updateDailyDisplay();
  saveToCloud();
}

function archiveToday() {
  const journal = getJournal();
  if (journal.length === 0) return;

  // Use the date the journal was started, not today's date
  const journalDate = localStorage.getItem('wwDailyDate') || new Date().toDateString();
  const history = getHistory();

  history[journalDate] = journal;

  // Trim to last 30 days
  const keys = Object.keys(history).sort((a, b) => new Date(b) - new Date(a));
  if (keys.length > 30) {
    keys.slice(30).forEach(k => delete history[k]);
  }

  localStorage.setItem('wwHistory', JSON.stringify(history));
}

function getHistory() {
  return JSON.parse(localStorage.getItem('wwHistory') || '{}');
}

async function resetDay() {
  const ok = await showConfirm(
    "Clear today's food journal and start fresh? Today's entries will be saved to History.",
    { title: 'Reset Day', confirmText: 'Reset Day', danger: true }
  );
  if (!ok) return;

  archiveToday();
  setJournal([]);
  localStorage.setItem('wwDailyDate', new Date().toDateString());
  renderJournal();
  updateDailyDisplay();
  renderHistory();
  saveToCloud();
}

function renderHistory() {
  const history = getHistory();
  const container = document.getElementById('historyList');
  const emptyMsg = document.getElementById('noHistory');
  container.innerHTML = '';

  const keys = Object.keys(history).sort((a, b) => new Date(b) - new Date(a));

  if (keys.length === 0) {
    emptyMsg.style.display = 'block';
    return;
  }
  emptyMsg.style.display = 'none';

  keys.forEach(dateStr => {
    const journal = history[dateStr];
    const totalPts = journal.reduce((sum, f) => sum + f.points, 0);

    // Format date nicely
    const d = new Date(dateStr);
    const formatted = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

    // Group by meal
    const meals = {};
    journal.forEach(item => {
      const meal = item.meal || 'Uncategorized';
      if (!meals[meal]) meals[meal] = [];
      meals[meal].push(item);
    });

    const dayEl = document.createElement('div');
    dayEl.className = 'history-day';

    const header = document.createElement('button');
    header.type = 'button';
    header.className = 'history-day-header';
    header.setAttribute('aria-expanded', 'false');

    const dateSpan = document.createElement('span');
    dateSpan.className = 'history-day-date';
    dateSpan.textContent = formatted;

    const summarySpan = document.createElement('span');
    summarySpan.className = 'history-day-summary';
    summarySpan.textContent = `${totalPts} pts`;

    const chevron = document.createElement('span');
    chevron.className = 'history-day-chevron';
    chevron.textContent = '▼';
    chevron.setAttribute('aria-hidden', 'true');

    header.append(dateSpan, summarySpan, chevron);

    const body = document.createElement('div');
    body.className = 'history-day-body';

    const mealOrder = ['Breakfast', 'Lunch', 'Dinner', 'Snack', 'Uncategorized'];
    mealOrder.forEach(meal => {
      if (!meals[meal]) return;
      const mealPts = meals[meal].reduce((sum, f) => sum + f.points, 0);

      const mealHeader = document.createElement('div');
      mealHeader.className = 'history-meal-header journal-meal-header meal-' + meal.toLowerCase();

      const mealNameSpan = document.createElement('span');
      mealNameSpan.textContent = meal;
      const mealPtsSpan = document.createElement('span');
      mealPtsSpan.textContent = `${mealPts} pts`;
      mealHeader.append(mealNameSpan, mealPtsSpan);
      body.appendChild(mealHeader);

      meals[meal].forEach(food => {
        const foodEl = document.createElement('div');
        foodEl.className = 'history-food-item';

        const foodNameSpan = document.createElement('span');
        foodNameSpan.className = 'history-food-name';
        foodNameSpan.textContent = food.name;

        const foodPtsSpan = document.createElement('span');
        foodPtsSpan.className = 'history-food-pts';
        foodPtsSpan.textContent = `${food.points} pts`;

        foodEl.append(foodNameSpan, foodPtsSpan);
        body.appendChild(foodEl);
      });
    });

    header.onclick = () => {
      const isOpen = body.classList.contains('open');
      body.classList.toggle('open', !isOpen);
      chevron.classList.toggle('open', !isOpen);
      header.setAttribute('aria-expanded', String(!isOpen));
    };

    dayEl.appendChild(header);
    dayEl.appendChild(body);
    container.appendChild(dayEl);
  });
}

function renderJournal() {
  const journal = getJournal();
  const container = document.getElementById('journalList');
  const emptyMessage = document.getElementById('noJournalItems');
  const journalBox = container.closest('.journal-box');

  container.innerHTML = '';

  if (journal.length === 0) {
    emptyMessage.style.display = 'block';
    journalBox.style.border = 'none';
    journalBox.style.padding = '0';
    return;
  }
  emptyMessage.style.display = 'none';
  journalBox.style.border = 'none';
  journalBox.style.padding = '0';

  const mealOrder = ['Breakfast', 'Lunch', 'Dinner', 'Snack', 'Uncategorized'];

  mealOrder.forEach(meal => {
    const entries = journal
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => (item.meal || 'Uncategorized') === meal);

    if (entries.length === 0) return;

    const subtotal = entries.reduce((sum, { item }) => sum + item.points, 0);

    const group = document.createElement('div');
    group.className = 'journal-meal-group';

    const header = document.createElement('div');
    const mealClass = meal === 'Uncategorized' ? '' : ` meal-${meal.toLowerCase()}`;
    header.className = 'journal-meal-header' + mealClass;
    header.innerHTML = `<span>${meal}</span><span>${subtotal} pts</span>`;

    const body = document.createElement('div');
    body.className = 'journal-meal-body';

    entries.forEach(({ item, index }) => {
      if (editingJournalIndex === index) {
        const editRow = document.createElement('div');
        editRow.className = 'edit-row';

        const inputsRow = document.createElement('div');
        inputsRow.className = 'edit-row-inputs';

        const nameInput = document.createElement('input');
        nameInput.className = 'edit-name-input';
        nameInput.id = 'editName-' + index;
        nameInput.type = 'text';
        nameInput.value = item.name;

        const pointsInput = document.createElement('input');
        pointsInput.className = 'edit-points-input';
        pointsInput.id = 'editPoints-' + index;
        pointsInput.type = 'number';
        pointsInput.value = item.points;

        inputsRow.appendChild(nameInput);
        inputsRow.appendChild(pointsInput);

        const actionsRow = document.createElement('div');
        actionsRow.className = 'edit-row-actions';

        const saveBtn = document.createElement('button');
        saveBtn.className = 'save-edit-btn';
        saveBtn.innerText = 'Save';
        saveBtn.onclick = () => saveJournalEdit(index);

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'cancel-edit-btn';
        cancelBtn.innerText = 'Cancel';
        cancelBtn.onclick = () => cancelJournalEdit();

        actionsRow.appendChild(saveBtn);
        actionsRow.appendChild(cancelBtn);
        editRow.appendChild(inputsRow);
        editRow.appendChild(actionsRow);
        body.appendChild(editRow);
        return;
      }

      const row = document.createElement('div');
      row.className = 'journal-row';

      const info = document.createElement('div');
      info.className = 'food-info';
      info.style.minWidth = '0';
      info.style.flex = '1';

      const nameEl = document.createElement('span');
      nameEl.className = 'food-name';
      nameEl.innerText = item.name;
      nameEl.style.display = 'block';
      nameEl.style.overflow = 'hidden';
      nameEl.style.textOverflow = 'ellipsis';
      nameEl.style.whiteSpace = 'nowrap';

      const pointsEl = document.createElement('span');
      pointsEl.className = 'food-points';
      pointsEl.innerText = `${item.points} pts`;

      info.appendChild(nameEl);
      info.appendChild(pointsEl);

      const actions = document.createElement('div');
      actions.className = 'food-actions';
      actions.style.display = 'flex';
      actions.style.flexShrink = '0';
      actions.style.gap = '6px';

      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'edit-food-btn';
      editBtn.innerText = 'Edit';
      editBtn.setAttribute('aria-label', `Edit ${item.name}`);
      editBtn.onclick = () => editJournalEntry(index);

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'delete-food-btn';
      deleteBtn.innerText = 'Delete';
      deleteBtn.setAttribute('aria-label', `Delete ${item.name}`);
      deleteBtn.onclick = () => deleteJournalEntry(index);

      actions.appendChild(editBtn);
      actions.appendChild(deleteBtn);
      row.appendChild(info);
      row.appendChild(actions);
      body.appendChild(row);
    });

    group.appendChild(header);
    group.appendChild(body);
    container.appendChild(group);
  });
}



document.getElementById('foodName').addEventListener('input', resetFavoriteHeart);
document.getElementById('calcPoints').addEventListener('input', resetFavoriteHeart);

/* ---------- Saved Foods (favorites) ---------- */

let choosingMealForSavedFoodIndex = null;
const mealCategories = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];

function getSavedFoods() {
  const foods = JSON.parse(localStorage.getItem('wwSavedFoods') || '[]');
  return foods.sort((a, b) => a.name.localeCompare(b.name));
}

function setSavedFoods(foods) {
  foods.sort((a, b) => a.name.localeCompare(b.name));
  localStorage.setItem('wwSavedFoods', JSON.stringify(foods));
}

function askSavedFoodMeal(index) {
  choosingMealForSavedFoodIndex = index;
  renderSavedFoods();
}

function cancelSavedFoodMealChoice() {
  choosingMealForSavedFoodIndex = null;
  renderSavedFoods();
}

function addSavedFood(index, meal) {
  const foods = getSavedFoods();
  const food = foods[index];
  if (!food) return;

  const journal = getJournal();
  journal.unshift({ name: food.name, points: food.points, meal: meal });
  setJournal(journal);

  choosingMealForSavedFoodIndex = null;
  renderJournal();
  renderSavedFoods();
  updateDailyDisplay();
  showToast(`Added to ${meal.toLowerCase()}`);
  saveToCloud();
}

function deleteSavedFood(index) {
  const foods = getSavedFoods();
  foods.splice(index, 1);
  setSavedFoods(foods);
  choosingMealForSavedFoodIndex = null;
  renderSavedFoods();
  saveToCloud();
}

function renderSavedFoods() {
  const foods = getSavedFoods();
  const container = document.getElementById('savedFoodsList');
  const emptyMessage = document.getElementById('noSavedFoods');

  container.innerHTML = '';

  if (foods.length === 0) {
    emptyMessage.style.display = 'block';
    return;
  }
  emptyMessage.style.display = 'none';

  foods.forEach((food, index) => {
    const item = document.createElement('div');
    item.className = 'food-list-item';

    const info = document.createElement('div');
    info.className = 'food-info';

    const nameEl = document.createElement('span');
    nameEl.className = 'food-name';
    nameEl.innerText = food.name;

    const pointsEl = document.createElement('span');
    pointsEl.className = 'food-points';
    pointsEl.innerText = `${food.points} pts`;

    info.appendChild(nameEl);
    info.appendChild(pointsEl);

    const actions = document.createElement('div');
    actions.className = 'food-actions';

    const addBtn = document.createElement('button');
    addBtn.className = 'add-food-btn';
    addBtn.innerText = 'Add';
    addBtn.onclick = () => askSavedFoodMeal(index);

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-food-btn';
    deleteBtn.innerText = 'Delete';
    deleteBtn.onclick = () => deleteSavedFood(index);

    actions.appendChild(addBtn);
    actions.appendChild(deleteBtn);

    item.appendChild(info);
    item.appendChild(actions);
    container.appendChild(item);

    if (choosingMealForSavedFoodIndex === index) {
      const mealPicker = document.createElement('div');
      mealPicker.className = 'favorite-meal-picker';

      const pickerTitle = document.createElement('div');
      pickerTitle.className = 'favorite-meal-picker-title';
      pickerTitle.innerText = `Add ${food.name} to which meal?`;
      mealPicker.appendChild(pickerTitle);

      mealCategories.forEach(meal => {
        const mealBtn = document.createElement('button');
        mealBtn.className = 'add-food-btn';
        mealBtn.innerText = meal;
        mealBtn.onclick = () => addSavedFood(index, meal);
        mealPicker.appendChild(mealBtn);
      });

      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'favorite-meal-cancel-btn';
      cancelBtn.innerText = 'Cancel';
      cancelBtn.onclick = cancelSavedFoodMealChoice;
      mealPicker.appendChild(cancelBtn);

      container.appendChild(mealPicker);
    }
  });
}

/* ---------- Cross-Device Sync ---------- */

function generateSyncCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // avoids ambiguous chars like 0/O, 1/I
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function getLocalState() {
  return {
    allowance: localStorage.getItem('wwDailyAllowance') || '',
    dailyDate: localStorage.getItem('wwDailyDate') || '',
    foodJournal: getJournal(),
    savedFoods: getSavedFoods(),
    history: getHistory()
  };
}

function applyRemoteState(state) {
  isApplyingRemote = true;

  if (state.allowance !== undefined) {
    localStorage.setItem('wwDailyAllowance', state.allowance);
  }
  if (state.dailyDate !== undefined) {
    localStorage.setItem('wwDailyDate', state.dailyDate);
  }
  if (state.foodJournal !== undefined) {
    setJournal(state.foodJournal);
    editingJournalIndex = null;
  }
  if (state.savedFoods !== undefined) {
    setSavedFoods(state.savedFoods);
  }
  if (state.history !== undefined) {
    localStorage.setItem('wwHistory', JSON.stringify(state.history));
  }

  checkNewDay();
  updateDailyDisplay();
  renderJournal();
  renderSavedFoods();
  renderHistory();

  isApplyingRemote = false;
}

function setSyncStatus(text) {
  const el = document.getElementById('syncStatus');
  if (el) el.innerText = text;
}

function startSync(code) {
  if (unsubscribeSync) {
    unsubscribeSync();
    unsubscribeSync = null;
  }

  clearTimeout(syncTimeout);
  if (navigator.onLine) {
    setSyncStatus('Connecting\u2026');
    // If the first snapshot never arrives, assume we're offline.
    syncTimeout = setTimeout(() => {
      setSyncStatus('Offline \u2014 changes saved on this device');
    }, 8000);
  } else {
    setSyncStatus('Offline \u2014 changes saved on this device');
  }

  const docRef = db.collection('syncData').doc(code);

  unsubscribeSync = docRef.onSnapshot(
    (doc) => {
      clearTimeout(syncTimeout);
      if (doc.exists) {
        applyRemoteState(doc.data());
      } else {
        docRef.set(getLocalState()).catch((err) => console.error('Initial sync save failed', err));
      }
      setSyncStatus('Synced \u2713');
    },
    (error) => {
      clearTimeout(syncTimeout);
      setSyncStatus(navigator.onLine ? 'Sync error \u2014 tap Connect to retry' : 'Offline \u2014 changes saved on this device');
      console.error('Sync error:', error);
    }
  );
}

window.addEventListener('offline', () => {
  setSyncStatus('Offline \u2014 changes saved on this device');
});

window.addEventListener('online', () => {
  if (syncCode) {
    setSyncStatus('Reconnecting\u2026');
    startSync(syncCode);
  }
});

function saveToCloud() {
  if (isApplyingRemote || !syncCode) return;

  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    const state = getLocalState();
    const stateJson = JSON.stringify(state);

    // Firestore has a 1MB document limit — if we're close, trim oldest history
    if (stateJson.length > 900000) {
      const keys = Object.keys(state.history).sort((a, b) => new Date(b) - new Date(a));
      while (JSON.stringify(state).length > 900000 && keys.length > 0) {
        delete state.history[keys.pop()];
      }
    }

    db.collection('syncData').doc(syncCode).set(state)
      .catch((err) => {
        console.error('Sync save failed', err);
        showToast('Sync failed — check connection.');
      });
  }, 500);
}

async function connectSyncCode() {
  const input = document.getElementById('syncCodeInput');
  const newCode = input.value.trim().toUpperCase();

  if (!newCode) {
    showToast('Enter a sync code.');
    return;
  }
  if (newCode === syncCode) {
    showToast('That is already your current sync code.');
    return;
  }

  const ok = await showConfirm(
    "Connecting will replace this device's data with the data from that sync code. Continue?",
    { title: 'Connect Device', confirmText: 'Connect', danger: true }
  );
  if (!ok) return;

  syncCode = newCode;
  localStorage.setItem('wwSyncCode', syncCode);
  document.getElementById('syncCodeDisplay').innerText = syncCode;
  setSyncStatus('Connecting\u2026');
  input.value = '';

  startSync(syncCode);
}

function copySyncCode() {
  if (!syncCode) return;
  navigator.clipboard.writeText(syncCode).then(() => {
    const status = document.getElementById('syncStatus');
    const previous = status.innerText;
    status.innerText = 'Copied!';
    setTimeout(() => { status.innerText = previous; }, 1500);
  });
}

/* ---------- Swipe Navigation ---------- */

const tabOrder = ['calculator', 'journal', 'favorites', 'history'];

function getCurrentTabIndex() {
  return tabOrder.findIndex(tab =>
    document.getElementById('tabPanel-' + tab).classList.contains('active')
  );
}

(function initSwipe() {
  let touchStartX = 0;
  let touchStartY = 0;

  document.addEventListener('touchstart', (e) => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }, { passive: true });

  document.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;

    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;

    const current = getCurrentTabIndex();
    if (dx < 0) {
      if (current < tabOrder.length - 1) switchTab(tabOrder[current + 1], 'left');
    } else {
      if (current > 0) switchTab(tabOrder[current - 1], 'right');
    }
  }, { passive: true });
})();

/* ---------- Init ---------- */

checkNewDay();

updateDailyDisplay();
renderJournal();
renderSavedFoods();
renderHistory();

syncCode = localStorage.getItem('wwSyncCode');
if (!syncCode) {
  syncCode = generateSyncCode();
  localStorage.setItem('wwSyncCode', syncCode);
}
document.getElementById('syncCodeDisplay').innerText = syncCode;
startSync(syncCode);
