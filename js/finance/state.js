import { getMonday } from './helpers.js';

export const state = {
    currentWeekStart: getMonday(new Date()),
    dailyChart: null,
    activeDates: new Set(),
    hiddenDatasets: new Set(),
    rawTxs: [],
    transactionQueue: [],
    accountCacheMap: {}
};

export function updateAccountCache(accounts) {
    state.accountCacheMap = {};
    accounts.forEach(acc => {
        state.accountCacheMap[acc.account_id] = acc.account_name;
    });
}

export function addToQueue(item) {
    state.transactionQueue.push(item);
}

export function removeFromQueueState(id) {
    state.transactionQueue = state.transactionQueue.filter(item => item.id !== id);
}

export function clearQueueState() {
    state.transactionQueue = [];
}