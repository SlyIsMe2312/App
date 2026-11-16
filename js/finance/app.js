import { supabaseClient } from './config.js';
import { state, updateAccountCache, addToQueue, updateQueuedTransaction, removeFromQueueState, clearQueueState } from './state.js';
import { formatDateISO, getMonday } from './helpers.js';
import { fetchAccountsFromDB, insertAccount, fetchLedgerFromDB, fetchChartTxsFromDB, adjustBalance, insertTransactions, updateTransactionInDB, deleteTransactionFromDB } from './api.js';
import { renderAccounts, renderLedger, renderQueueList } from './ui.js';
import { renderChartAndSidebar } from './chart.js';

// DOM Elements
const txType = document.getElementById('tx-type');
const sourceWrapper = document.getElementById('source-wrapper');
const destWrapper = document.getElementById('dest-wrapper');
const txForm = document.getElementById('tx-form');
const ledgerFilterControls = document.getElementById('ledger-filter-controls');
const ledgerDetailsSearch = document.getElementById('ledger-details-search');
const ledgerStartDate = document.getElementById('ledger-start-date');
const ledgerEndDate = document.getElementById('ledger-end-date');
const ledgerBody = document.getElementById('ledger-body');
const categoryFiltersList = document.getElementById('expense-legends-list');
const masterTogglesContainer = document.getElementById('master-toggles-container');
const queueList = document.getElementById('queue-list');
const addAccountForm = document.getElementById('add-account-form');
const editDialog = document.getElementById('edit-transaction-dialog');
const editForm = document.getElementById('edit-transaction-form');
const editType = document.getElementById('edit-tx-type');
const editSourceWrapper = document.getElementById('edit-source-wrapper');
const editDestWrapper = document.getElementById('edit-dest-wrapper');
const editSource = document.getElementById('edit-tx-source');
const editDest = document.getElementById('edit-tx-dest');
const deleteDialog = document.getElementById('delete-transaction-dialog');
const deleteDescription = document.getElementById('delete-transaction-description');
const confirmDeleteButton = document.getElementById('confirm-delete-transaction');
const authView = document.getElementById('auth-view');
const financeApp = document.getElementById('finance-app');
const authForm = document.getElementById('auth-form');
const authMessage = document.getElementById('auth-message');
const authSubmitButton = document.getElementById('auth-submit');
const authSignupButton = document.getElementById('auth-signup');
const signOutButton = document.getElementById('sign-out');
const signedInEmail = document.getElementById('signed-in-email');
const appStatus = document.getElementById('app-status');
let transactionBeingEdited = null;
let editingQueuedTransaction = false;
let transactionBeingDeleted = null;
let ledgerTransactions = [];
let dayRolloverTimer;
let authGeneration = 0;

async function initApp(generation = authGeneration) {
    const ledgerLoaded = await fetchLedger(generation);
    const accountsLoaded = await fetchAccounts(generation);
    const chartLoaded = await fetchChartData(generation);
    if (generation !== authGeneration) return;
    if (ledgerLoaded && accountsLoaded && chartLoaded) setAppStatus('');
    scheduleDayRolloverRefresh();
}

function setAuthMessage(message, isError = false) {
    authMessage.textContent = message;
    authMessage.className = `text-sm ${isError ? 'text-rose-400' : 'text-gray-300'}`;
}

function clearUserData() {
    if (editDialog.open) editDialog.close();
    if (deleteDialog.open) deleteDialog.close();
    txForm.reset();
    txType.dispatchEvent(new Event('change'));
    addAccountForm.reset();
    editForm.reset();
    updateEditAccountFields();
    authForm.reset();
    deleteDescription.textContent = '';
    state.rawTxs = [];
    clearQueueState();
    updateAccountCache([]);
    ledgerTransactions = [];
    state.hiddenDatasets.clear();
    state.activeDates.clear();
    renderAccounts([], []);
    ledgerBody.replaceChildren();
    document.getElementById('dates-list').replaceChildren();
    document.getElementById('master-toggles-container').replaceChildren();
    categoryFiltersList.replaceChildren();
    ledgerDetailsSearch.value = '';
    ledgerStartDate.value = '';
    ledgerEndDate.value = '';
    ledgerStartDate.max = '';
    ledgerEndDate.min = '';
    ledgerFilterControls.querySelectorAll('[data-ledger-filter-group="type"]').forEach(option => {
        option.checked = option.dataset.filterAll === 'true';
    });
    ledgerFilterControls.querySelectorAll('details').forEach(details => { details.open = false; });
    updateLedgerFilterLabels();
    document.getElementById('summary-total-expense').textContent = '₱0.00';
    document.getElementById('summary-total-income').textContent = '₱0.00';
    document.getElementById('summary-total-transfer').textContent = '₱0.00';
    if (state.dailyChart) {
        state.dailyChart.destroy();
        state.dailyChart = null;
    }
    renderQueueList();
}

function showSignedOut() {
    clearTimeout(dayRolloverTimer);
    authGeneration++;
    state.authUserId = null;
    clearUserData();
    authView.classList.remove('hidden');
    financeApp.classList.add('hidden');
    signedInEmail.textContent = '';
    setAppStatus('');
}

supabaseClient.auth.onAuthStateChange((event, session) => {
    const user = session?.user;
    if (!user) {
        showSignedOut();
        return;
    }

    const isNewSession = state.authUserId !== user.id;
    if (isNewSession) authGeneration++;
    const generation = authGeneration;
    if (isNewSession) {
        clearUserData();
        setAppStatus('Loading your finance data...');
    }
    state.authUserId = user.id;
    authView.classList.add('hidden');
    financeApp.classList.remove('hidden');
    signedInEmail.textContent = user.email || 'Signed in';
    setAuthMessage('');
    if (isNewSession || event === 'SIGNED_IN') {
        setTimeout(() => initApp(generation), 0);
    }
});

authForm.addEventListener('submit', async event => {
    event.preventDefault();
    authSubmitButton.disabled = true;
    authSignupButton.disabled = true;
    setAuthMessage('Signing in...');
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    try {
        const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) throw error;
    } catch (error) {
        setAuthMessage(error.message, true);
    } finally {
        authSubmitButton.disabled = false;
        authSignupButton.disabled = false;
    }
});

authSignupButton.addEventListener('click', async () => {
    authSubmitButton.disabled = true;
    authSignupButton.disabled = true;
    setAuthMessage('Creating account...');
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    try {
        if (password.length < 8) throw new Error('Use a password with at least 8 characters.');
        const { data, error } = await supabaseClient.auth.signUp({ email, password });
        if (error) throw error;
        setAuthMessage(data.session
            ? 'Account created and signed in.'
            : 'Account created. Check your email to confirm, then sign in.');
    } catch (error) {
        setAuthMessage(error.message, true);
    } finally {
        authSubmitButton.disabled = false;
        authSignupButton.disabled = false;
    }
});

signOutButton.addEventListener('click', async () => {
    if (state.transactionQueue.length && !confirm('Signing out will discard your pending transaction queue. Continue?')) return;
    signOutButton.disabled = true;
    try {
        const { error } = await supabaseClient.auth.signOut();
        if (error) throw error;
    } catch (error) {
        if (state.authUserId) setAppStatus(`Could not sign out: ${error.message}`, true);
    } finally {
        signOutButton.disabled = false;
    }
});

function setAppStatus(message, isError = false) {
    appStatus.textContent = message;
    appStatus.classList.toggle('hidden', !message);
    appStatus.classList.toggle('text-rose-300', isError);
    appStatus.classList.toggle('text-gray-300', !isError);
}

function scheduleDayRolloverRefresh() {
    clearTimeout(dayRolloverTimer);
    const now = new Date();
    const nextDay = new Date(now);
    nextDay.setHours(24, 0, 0, 0);
    dayRolloverTimer = setTimeout(() => initApp(), nextDay.getTime() - now.getTime());
}

async function fetchAccounts(generation = authGeneration) {
    if (generation !== authGeneration || !state.authUserId) return false;
    try {
        const accounts = await fetchAccountsFromDB();
        if (generation !== authGeneration) return false;
        updateAccountCache(accounts);
        renderAccounts(accounts, ledgerTransactions);
        return true;
    } catch (err) {
        if (generation !== authGeneration) return false;
        console.error(err);
        setAppStatus(`Could not load accounts: ${err.message}`, true);
        return false;
    }
}

async function fetchLedger(generation = authGeneration) {
    if (generation !== authGeneration || !state.authUserId) return false;
    try {
        const transactions = await fetchLedgerFromDB();
        if (generation !== authGeneration) return false;
        ledgerTransactions = transactions;
        renderFilteredLedger();
        return true;
    } catch (err) {
        if (generation !== authGeneration) return false;
        console.error(err);
        setAppStatus(`Could not load transactions: ${err.message}`, true);
        return false;
    }
}

function getLedgerFilterValues(group) {
    const options = [...ledgerFilterControls.querySelectorAll(`[data-ledger-filter-group="${group}"]`)];
    if (options.some(option => option.dataset.filterAll === 'true' && option.checked)) return [];
    return options
        .filter(option => option.dataset.filterAll !== 'true' && option.checked)
        .map(option => option.value);
}

function updateLedgerFilterLabels() {
    const selectedAccounts = getLedgerFilterValues('account');
    const selectedTypes = getLedgerFilterValues('type');
    document.getElementById('ledger-account-filter-label').textContent =
        selectedAccounts.length ? `${selectedAccounts.length} selected` : 'All accounts';
    document.getElementById('ledger-type-filter-label').textContent =
        selectedTypes.length ? `${selectedTypes.length} selected` : 'All types';
}

function renderFilteredLedger() {
    renderLedger(
        ledgerTransactions,
        getLedgerFilterValues('account'),
        getLedgerFilterValues('type'),
        { startDate: ledgerStartDate.value, endDate: ledgerEndDate.value },
        ledgerDetailsSearch.value
    );
    updateLedgerFilterLabels();
}

function handleLedgerFilterChange(event) {
    const changedOption = event.target;
    if (!(changedOption instanceof HTMLInputElement) || !changedOption.matches('[data-ledger-filter-group]')) return;

    const group = changedOption.dataset.ledgerFilterGroup;
    const options = [...ledgerFilterControls.querySelectorAll(`[data-ledger-filter-group="${group}"]`)];
    const allOption = options.find(option => option.dataset.filterAll === 'true');
    if (changedOption.dataset.filterAll === 'true' && changedOption.checked) {
        options.filter(option => option !== allOption).forEach(option => { option.checked = false; });
    } else if (changedOption.dataset.filterAll !== 'true') {
        if (allOption) allOption.checked = false;
        if (!options.some(option => option !== allOption && option.checked)) {
            if (allOption) allOption.checked = true;
        }
    }

    renderFilteredLedger();
}

async function fetchChartData(generation = authGeneration) {
    if (generation !== authGeneration || !state.authUserId) return false;
    const weekDates = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date(state.currentWeekStart);
        d.setDate(d.getDate() + i);
        weekDates.push(formatDateISO(d));
    }

    const startObj = new Date(weekDates[0] + 'T00:00:00');
    const endObj = new Date(weekDates[6] + 'T23:59:59.999');

    const labelEl = document.getElementById('week-range-label');
    if (labelEl) {
        labelEl.innerText = `${startObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    }

    try {
        state.rawTxs = await fetchChartTxsFromDB(startObj.toISOString(), endObj.toISOString());
        if (generation !== authGeneration) return false;
        if (state.activeDates.size === 0) {
            weekDates.forEach(d => state.activeDates.add(d));
        }
        renderChartAndSidebar(weekDates);
        return true;
    } catch (err) {
        if (generation !== authGeneration) return false;
        console.error(err);
        setAppStatus(`Could not load weekly chart: ${err.message}`, true);
        return false;
    }
}

// Global Handlers attached to Window (for HTML inline events)
window.toggleGroup = function(keysArray) {
    const areAllHidden = keysArray.every(k => state.hiddenDatasets.has(k));
    if (areAllHidden) {
        keysArray.forEach(k => state.hiddenDatasets.delete(k));
    } else {
        keysArray.forEach(k => state.hiddenDatasets.add(k));
    }
    fetchChartData();
};

window.toggleDate = function(dateStr) {
    if (state.activeDates.has(dateStr)) {
        state.activeDates.delete(dateStr);
    } else {
        state.activeDates.add(dateStr);
    }
    fetchChartData();
};

window.toggleDataset = function(label) {
    if (state.hiddenDatasets.has(label)) {
        state.hiddenDatasets.delete(label);
    } else {
        state.hiddenDatasets.add(label);
    }
    fetchChartData();
};

categoryFiltersList.addEventListener('click', event => {
    const filterButton = event.target.closest('[data-toggle-dataset]');
    if (filterButton) window.toggleDataset(filterButton.dataset.toggleDataset);
});

masterTogglesContainer.addEventListener('click', event => {
    const filterButton = event.target.closest('[data-toggle-group]');
    if (!filterButton) return;
    window.toggleGroup(JSON.parse(decodeURIComponent(filterButton.dataset.toggleGroup)));
});

window.changeWeek = function(offset) {
    state.currentWeekStart.setDate(state.currentWeekStart.getDate() + (offset * 7));
    state.activeDates.clear();
    fetchChartData();
};

window.jumpToToday = function() {
    state.currentWeekStart = getMonday(new Date());
    state.activeDates.clear();
    fetchChartData();
};

window.jumpToDate = function(dateString) {
    if (!dateString) return;
    const selectedDate = new Date(dateString + 'T00:00:00');
    state.currentWeekStart = getMonday(selectedDate);
    state.activeDates.clear();
    fetchChartData();
};

window.removeFromQueue = function(id) {
    removeFromQueueState(id);
    renderQueueList();
};

window.clearQueue = function() {
    clearQueueState();
    renderQueueList();
};

window.processQueue = async function() {
    if (state.transactionQueue.length === 0) return;

    const btn = document.getElementById('btn-save-all');
    btn.disabled = true;
    btn.innerText = 'Saving...';

    const balanceDeltas = {};
    const payloads = state.transactionQueue.map(item => {
        const { id, ...dbPayload } = item;
        if (item.transaction_type === 'Expense') {
            balanceDeltas[item.source_account_id] = (balanceDeltas[item.source_account_id] || 0) - item.amount;
        } else if (item.transaction_type === 'Income') {
            balanceDeltas[item.destination_account_id] = (balanceDeltas[item.destination_account_id] || 0) + item.amount;
        } else if (item.transaction_type === 'Transfer') {
            balanceDeltas[item.source_account_id] = (balanceDeltas[item.source_account_id] || 0) - item.amount;
            balanceDeltas[item.destination_account_id] = (balanceDeltas[item.destination_account_id] || 0) + item.amount;
        }
        return dbPayload;
    });

    try {
        await insertTransactions(payloads);
        for (const [accIdStr, delta] of Object.entries(balanceDeltas)) {
            if (delta !== 0) {
                await adjustBalance(parseInt(accIdStr), delta);
            }
        }
        clearQueueState();
        renderQueueList();
        txForm.reset();
        txType.dispatchEvent(new Event('change'));
        await initApp();
    } catch (err) {
        alert('Error processing queue: ' + err.message);
    } finally {
        btn.disabled = false;
        btn.innerText = 'Save All Transactions';
    }
};

function updateEditAccountFields() {
    const type = editType.value;
    const showSource = type === 'Expense' || type === 'Transfer';
    const showDestination = type === 'Income' || type === 'Transfer';
    editSourceWrapper.classList.toggle('hidden', !showSource);
    editDestWrapper.classList.toggle('hidden', !showDestination);
    editSource.required = showSource;
    editDest.required = showDestination;
}

function toLocalDateTimeInput(dateString) {
    const date = new Date(dateString);
    const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return offsetDate.toISOString().slice(0, 16);
}

function addTransactionImpact(deltas, transaction, multiplier) {
    const amountInCents = Math.round(Number(transaction.amount) * 100) * multiplier;
    const addDelta = (accountId, delta) => {
        if (accountId !== null && accountId !== undefined) {
            deltas[accountId] = (deltas[accountId] || 0) + delta;
        }
    };

    if (transaction.transaction_type === 'Expense') {
        addDelta(transaction.source_account_id, -amountInCents);
    } else if (transaction.transaction_type === 'Income') {
        addDelta(transaction.destination_account_id, amountInCents);
    } else if (transaction.transaction_type === 'Transfer') {
        addDelta(transaction.source_account_id, -amountInCents);
        addDelta(transaction.destination_account_id, amountInCents);
    }
}

function openTransactionEditor(transaction, isQueued = false) {
    transactionBeingEdited = transaction;
    editingQueuedTransaction = isQueued;
    editType.value = transaction.transaction_type;
    document.getElementById('edit-tx-amount').value = transaction.amount;
    document.getElementById('edit-tx-desc').value = transaction.description || '';
    document.getElementById('edit-tx-date').value = toLocalDateTimeInput(transaction.transaction_date);
    editSource.value = transaction.source_account_id ?? '';
    editDest.value = transaction.destination_account_id ?? '';
    updateEditAccountFields();
    editDialog.showModal();
}

// Event Listeners
txType.addEventListener('change', () => {
    const val = txType.value;
    if (val === 'Expense') {
        sourceWrapper.classList.remove('hidden');
        sourceWrapper.classList.add('sm:col-span-2');
        destWrapper.classList.add('hidden');
    } else if (val === 'Income') {
        sourceWrapper.classList.add('hidden');
        destWrapper.classList.remove('hidden');
        destWrapper.classList.add('sm:col-span-2');
    } else if (val === 'Transfer') {
        sourceWrapper.classList.remove('hidden');
        sourceWrapper.classList.remove('sm:col-span-2');
        destWrapper.classList.remove('hidden');
        destWrapper.classList.remove('sm:col-span-2');
    }
});

ledgerFilterControls.addEventListener('change', handleLedgerFilterChange);
ledgerStartDate.addEventListener('change', () => {
    ledgerEndDate.min = ledgerStartDate.value;
    renderFilteredLedger();
});
ledgerEndDate.addEventListener('change', () => {
    ledgerStartDate.max = ledgerEndDate.value;
    renderFilteredLedger();
});
document.getElementById('clear-ledger-dates').addEventListener('click', () => {
    ledgerStartDate.value = '';
    ledgerEndDate.value = '';
    ledgerStartDate.max = '';
    ledgerEndDate.min = '';
    renderFilteredLedger();
});

editType.addEventListener('change', updateEditAccountFields);
ledgerDetailsSearch.addEventListener('input', renderFilteredLedger);
ledgerBody.addEventListener('click', event => {
    const editButton = event.target.closest('[data-edit-transaction]');
    if (editButton) {
        const transaction = ledgerTransactions.find(tx => String(tx.transaction_id) === editButton.dataset.editTransaction);
        if (transaction) openTransactionEditor(transaction);
        return;
    }

    const deleteButton = event.target.closest('[data-delete-transaction]');
    if (deleteButton) {
        transactionBeingDeleted = ledgerTransactions.find(tx => String(tx.transaction_id) === deleteButton.dataset.deleteTransaction) || null;
        if (!transactionBeingDeleted) return;
        deleteDescription.textContent = transactionBeingDeleted.description || 'Uncategorized transaction';
        deleteDialog.showModal();
    }
});

deleteDialog.addEventListener('close', () => {
    transactionBeingDeleted = null;
});

deleteDialog.addEventListener('submit', async event => {
    if (event.submitter !== confirmDeleteButton) return;
    event.preventDefault();
    if (!transactionBeingDeleted) return;

    confirmDeleteButton.disabled = true;
    confirmDeleteButton.textContent = 'Deleting...';
    const balanceDeltas = {};
    addTransactionImpact(balanceDeltas, transactionBeingDeleted, -1);
    const appliedDeltas = [];

    try {
        for (const [accountId, deltaInCents] of Object.entries(balanceDeltas)) {
            if (deltaInCents === 0) continue;
            const delta = deltaInCents / 100;
            await adjustBalance(Number(accountId), delta);
            appliedDeltas.push([Number(accountId), delta]);
        }
        await deleteTransactionFromDB(transactionBeingDeleted.transaction_id);
        deleteDialog.close();
        await initApp();
    } catch (error) {
        const rollbackErrors = [];
        for (const [accountId, delta] of appliedDeltas.reverse()) {
            try {
                await adjustBalance(accountId, -delta);
            } catch (rollbackError) {
                rollbackErrors.push(rollbackError.message);
            }
        }
        const rollbackMessage = rollbackErrors.length
            ? ` Balance rollback also failed: ${rollbackErrors.join('; ')}`
            : '';
        alert(`Could not delete transaction: ${error.message}.${rollbackMessage}`);
    } finally {
        confirmDeleteButton.disabled = false;
        confirmDeleteButton.textContent = 'Delete Transaction';
    }
});

queueList.addEventListener('click', event => {
    const editButton = event.target.closest('[data-edit-queued-transaction]');
    if (!editButton) return;
    const transaction = state.transactionQueue.find(item => String(item.id) === editButton.dataset.editQueuedTransaction);
    if (transaction) openTransactionEditor(transaction, true);
});

document.getElementById('cancel-edit-transaction').addEventListener('click', () => editDialog.close());
document.getElementById('cancel-edit-transaction-secondary').addEventListener('click', () => editDialog.close());
editDialog.addEventListener('close', () => {
    transactionBeingEdited = null;
    editingQueuedTransaction = false;
});

editForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (!transactionBeingEdited) return;

    const type = editType.value;
    const amount = Number(document.getElementById('edit-tx-amount').value);
    const sourceId = type === 'Expense' || type === 'Transfer' ? Number(editSource.value) : null;
    const destinationId = type === 'Income' || type === 'Transfer' ? Number(editDest.value) : null;
    if (!Number.isFinite(amount) || amount <= 0) {
        alert('Enter an amount greater than zero.');
        return;
    }
    if (type === 'Transfer' && sourceId === destinationId) {
        alert('A transfer must use two different accounts.');
        return;
    }

    const transactionDate = new Date(document.getElementById('edit-tx-date').value);
    if (!Number.isFinite(transactionDate.getTime())) {
        alert('Enter a valid transaction date and time.');
        return;
    }

    const updatedTransaction = {
        transaction_type: type,
        amount,
        description: document.getElementById('edit-tx-desc').value.trim() || 'Uncategorized',
        transaction_date: transactionDate.toISOString(),
        source_account_id: sourceId,
        destination_account_id: destinationId
    };

    if (editingQueuedTransaction) {
        try {
            updateQueuedTransaction(transactionBeingEdited.id, updatedTransaction);
            renderQueueList();
            editDialog.close();
            transactionBeingEdited = null;
            editingQueuedTransaction = false;
        } catch (error) {
            alert(`Could not update queued transaction: ${error.message}`);
        }
        return;
    }

    const balanceDeltas = {};
    addTransactionImpact(balanceDeltas, transactionBeingEdited, -1);
    addTransactionImpact(balanceDeltas, updatedTransaction, 1);

    const saveButton = document.getElementById('save-edit-transaction');
    saveButton.disabled = true;
    saveButton.textContent = 'Saving...';
    const appliedDeltas = [];
    try {
        for (const [accountId, deltaInCents] of Object.entries(balanceDeltas)) {
            if (deltaInCents === 0) continue;
            const delta = deltaInCents / 100;
            await adjustBalance(Number(accountId), delta);
            appliedDeltas.push([Number(accountId), delta]);
        }
        await updateTransactionInDB(transactionBeingEdited.transaction_id, updatedTransaction);
        editDialog.close();
        transactionBeingEdited = null;
        editingQueuedTransaction = false;
        await initApp();
    } catch (error) {
        const rollbackErrors = [];
        for (const [accountId, delta] of appliedDeltas.reverse()) {
            try {
                await adjustBalance(accountId, -delta);
            } catch (rollbackError) {
                rollbackErrors.push(rollbackError.message);
            }
        }
        const rollbackMessage = rollbackErrors.length
            ? ` Balance rollback also failed: ${rollbackErrors.join('; ')}`
            : '';
        alert(`Could not save transaction changes: ${error.message}.${rollbackMessage}`);
    } finally {
        saveButton.disabled = false;
        saveButton.textContent = 'Save Changes';
    }
});

txForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const type = txType.value;
    const amount = parseFloat(document.getElementById('tx-amount').value);
    const desc = document.getElementById('tx-desc').value.trim() || 'Uncategorized';
    const customDateVal = document.getElementById('tx-date').value;
    const srcId = parseInt(document.getElementById('tx-source').value);
    const destId = parseInt(document.getElementById('tx-dest').value);

let txDateIso;
    if (customDateVal) {
        // Parse the input directly (handles both 'YYYY-MM-DD' and 'YYYY-MM-DDTHH:mm')
        const selectedDate = new Date(customDateVal);
        // Check if user provided an invalid date string
        if (isNaN(selectedDate.getTime())) {
            txDateIso = new Date().toISOString();
        } else {
            // If the date input didn't include time (e.g. standard type="date"), set current time
            if (!customDateVal.includes('T')) {
                const now = new Date();
                selectedDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
            }
            txDateIso = selectedDate.toISOString();
        }
    } else {
        txDateIso = new Date().toISOString();
    }

    const queuedItem = {
        id: Date.now() + Math.random(),
        transaction_type: type,
        amount: amount,
        description: desc,
        source_account_id: (type === 'Expense' || type === 'Transfer') ? srcId : null,
        destination_account_id: (type === 'Income' || type === 'Transfer') ? destId : null,
        transaction_date: txDateIso
    };

    addToQueue(queuedItem);
    renderQueueList();

    document.getElementById('tx-amount').value = '';
    document.getElementById('tx-desc').value = '';
    document.getElementById('tx-date').value = '';
});

document.getElementById('toggle-add-account').addEventListener('click', () => {
    addAccountForm.classList.toggle('hidden');
    if (!addAccountForm.classList.contains('hidden')) {
        document.getElementById('new-account-name').focus();
    }
});

addAccountForm.addEventListener('submit', async event => {
    event.preventDefault();
    const nameInput = document.getElementById('new-account-name');
    const typeInput = document.getElementById('new-account-type');
    const balanceInput = document.getElementById('new-account-balance');
    const accountName = nameInput.value.trim();
    const accountType = typeInput.value.trim();
    const openingBalance = Number(balanceInput.value);
    if (!accountName || !accountType || !Number.isFinite(openingBalance)) {
        alert('Enter a valid account name, type, and opening balance.');
        return;
    }

    const saveButton = document.getElementById('save-new-account');
    saveButton.disabled = true;
    saveButton.textContent = 'Saving...';
    try {
        await insertAccount({
            account_name: accountName,
            account_type: accountType,
            current_balance: openingBalance
        });
    } catch (error) {
        alert(`Could not add account: ${error.message}`);
        saveButton.disabled = false;
        saveButton.textContent = 'Save Account';
        return;
    }

    try {
        const accounts = await fetchAccountsFromDB();
        updateAccountCache(accounts);
        renderAccounts(accounts, ledgerTransactions);
        addAccountForm.reset();
        addAccountForm.classList.add('hidden');
    } catch (error) {
        alert(`The account was created, but the account list could not be refreshed: ${error.message}`);
    } finally {
        saveButton.disabled = false;
        saveButton.textContent = 'Save Account';
    }
});

// Initial Boot
initApp();