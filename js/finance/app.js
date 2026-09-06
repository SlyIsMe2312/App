import { TEST_USER_ID } from './config.js';
import { state, updateAccountCache, addToQueue, removeFromQueueState, clearQueueState } from './state.js';
import { formatDateISO, getMonday } from './helpers.js';
import { fetchAccountsFromDB, fetchLedgerFromDB, fetchChartTxsFromDB, adjustBalance, insertTransactions } from './api.js';
import { renderAccounts, renderLedger, renderQueueList } from './ui.js';
import { renderChartAndSidebar } from './chart.js';

// DOM Elements
const txType = document.getElementById('tx-type');
const sourceWrapper = document.getElementById('source-wrapper');
const destWrapper = document.getElementById('dest-wrapper');
const txForm = document.getElementById('tx-form');

async function initApp() {
    await fetchAccounts();
    await fetchLedger();
    await fetchChartData();
}

async function fetchAccounts() {
    try {
        const accounts = await fetchAccountsFromDB();
        updateAccountCache(accounts);
        renderAccounts(accounts);
    } catch (err) {
        console.error(err);
    }
}

async function fetchLedger() {
    try {
        const txs = await fetchLedgerFromDB();
        renderLedger(txs);
    } catch (err) {
        console.error(err);
    }
}

async function fetchChartData() {
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
        if (state.activeDates.size === 0) {
            weekDates.forEach(d => state.activeDates.add(d));
        }
        renderChartAndSidebar(weekDates);
    } catch (err) {
        console.error(err);
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
        const now = new Date();
        const selectedDate = new Date(customDateVal + 'T00:00:00');
        selectedDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
        txDateIso = selectedDate.toISOString();
    } else {
        txDateIso = new Date().toISOString();
    }

    const queuedItem = {
        id: Date.now() + Math.random(),
        user_id: TEST_USER_ID,
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

// Initial Boot
initApp();