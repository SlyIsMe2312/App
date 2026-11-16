import { escapeHtml, formatCurrency, toLocalDateStr } from './helpers.js';
import { state, removeFromQueueState } from './state.js';

export function renderAccounts(accounts, transactions = []) {
    const today = toLocalDateStr(new Date());
    const futureEffects = new Map();
    const addFutureEffect = (accountId, amount) => {
        if (accountId === null || accountId === undefined) return;
        futureEffects.set(accountId, (futureEffects.get(accountId) || 0) + amount);
    };

    transactions.forEach(tx => {
        if (toLocalDateStr(tx.transaction_date) <= today) return;
        const amount = Number(tx.amount);
        if (tx.transaction_type === 'Expense') {
            addFutureEffect(tx.source_account_id, -amount);
        } else if (tx.transaction_type === 'Income') {
            addFutureEffect(tx.destination_account_id, amount);
        } else if (tx.transaction_type === 'Transfer') {
            addFutureEffect(tx.source_account_id, -amount);
            addFutureEffect(tx.destination_account_id, amount);
        }
    });

    const displayedAccounts = accounts.map(account => ({
        ...account,
        current_balance: Number(account.current_balance) - (futureEffects.get(account.account_id) || 0)
    }));
    const totalBalance = displayedAccounts.reduce((sum, acc) => sum + (acc.account_type !== 'Lend' && acc.current_balance >= 0 ? acc.current_balance : 0), 0);
    const totalLend = displayedAccounts.reduce((sum, acc) => sum + (acc.account_type === 'Lend' ? acc.current_balance : 0), 0);
    const totalDebt = displayedAccounts.reduce((sum, acc) => sum + (acc.account_type !== 'Lend' && acc.current_balance < 0 ? Math.abs(acc.current_balance) : 0), 0);

    const accountsList = document.getElementById('accounts-list');
    accountsList.innerHTML = displayedAccounts.map(acc => `
        <div class="flex justify-between items-center bg-gray-700/50 p-2 rounded">
            <span class="text-gray-300 font-medium">${escapeHtml(acc.account_name)}</span>
            <span class="font-mono ${acc.account_type !== 'Lend' ? (acc.current_balance >= 0 ? 'text-teal-400' : 'text-orange-400') : 'text-yellow-400'}">${formatCurrency(acc.current_balance)}</span>
        </div>
    `).join('') + `
        <div class="flex justify-between items-center bg-teal-900/30 p-3 rounded border border-teal-500/50 mt-2">
            <span class="text-gray-200 font-bold">Total Net</span>
            <span class="font-mono text-teal-300 font-bold text-lg">${formatCurrency(totalBalance)}</span>
        </div>
        <div class="flex justify-between items-center bg-yellow-900/30 p-3 rounded border border-yellow-500/50 mt-2">
            <span class="text-gray-200 font-bold">Total Lend</span>
            <span class="font-mono text-yellow-300 font-bold text-lg">${formatCurrency(totalLend)}</span>
        </div>
        <div class="flex justify-between items-center bg-orange-900/30 p-3 rounded border border-orange-500/50 mt-2">
            <span class="text-gray-200 font-bold">Total Debt</span>
            <span class="font-mono text-orange-300 font-bold text-lg">${formatCurrency(totalDebt)}</span>
        </div>
    `;

    const dropdowns = document.querySelectorAll('.account-dropdown, .edit-account-dropdown');
    dropdowns.forEach(dropdown => {
        const selectedAccountId = dropdown.value;
        dropdown.innerHTML = accounts.map(acc => `
            <option value="${escapeHtml(acc.account_id)}">${escapeHtml(acc.account_name)}</option>
        `).join('');
        if (accounts.some(acc => String(acc.account_id) === selectedAccountId)) {
            dropdown.value = selectedAccountId;
        }
    });

    const accountOptions = document.getElementById('ledger-account-options');
    if (accountOptions) {
        const previousAll = accountOptions.querySelector('[data-filter-all="true"]')?.checked ?? true;
        const previousSelection = new Set(
            [...accountOptions.querySelectorAll('input[data-ledger-filter-group="account"]:checked:not([data-filter-all="true"])')].map(input => input.value)
        );
        const validSelection = accounts
            .map(account => String(account.account_id))
            .filter(accountId => previousSelection.has(accountId));
        const allAccountsSelected = accounts.length > 0 && validSelection.length === accounts.length;
        const selectAllAccounts = previousAll || validSelection.length === 0 || allAccountsSelected;
        accountOptions.replaceChildren();

        const addOption = (labelText, value, isAll = false) => {
            const label = document.createElement('label');
            label.className = 'flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-gray-200 hover:bg-gray-700';
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.dataset.ledgerFilterGroup = 'account';
            if (isAll) {
                input.dataset.filterAll = 'true';
                input.checked = selectAllAccounts;
            } else {
                input.value = String(value);
                input.checked = !selectAllAccounts && previousSelection.has(String(value));
            }
            label.append(input, document.createTextNode(labelText));
            accountOptions.append(label);
        };

        addOption('All accounts', null, true);
        accounts.forEach(account => addOption(account.account_name, account.account_id));
    }
}

export function renderLedger(txs = [], accountIds = [], transactionTypes = [], dateRange = {}, detailsSearch = '') {
    const ledgerBody = document.getElementById('ledger-body');
    const transactions = txs || [];
    const searchTerm = detailsSearch.trim().toLocaleLowerCase();
    const filteredTxs = transactions.filter(tx => {
        const matchesAccount = accountIds.length === 0 ||
            accountIds.some(accountId =>
                String(tx.source_account_id) === accountId ||
                String(tx.destination_account_id) === accountId);
        const matchesType = transactionTypes.length === 0 || transactionTypes.includes(tx.transaction_type);
        const transactionDate = toLocalDateStr(tx.transaction_date);
        const matchesStartDate = !dateRange.startDate || transactionDate >= dateRange.startDate;
        const matchesEndDate = !dateRange.endDate || transactionDate <= dateRange.endDate;
        const matchesDetails = !searchTerm || (tx.description || '').toLocaleLowerCase().includes(searchTerm);
        return matchesAccount && matchesType && matchesStartDate && matchesEndDate && matchesDetails;
    });

    if (!filteredTxs || filteredTxs.length === 0) {
        const emptyMessage = transactions.length && (
            accountIds.length ||
            transactionTypes.length ||
            dateRange.startDate ||
            dateRange.endDate ||
            searchTerm
        )
            ? 'No transactions match the selected filters.'
            : 'No transactions recorded yet.';
        ledgerBody.innerHTML = `<tr><td colspan="4" class="text-center py-4 text-gray-500">${emptyMessage}</td></tr>`;
        return;
    }

    ledgerBody.innerHTML = filteredTxs.map(tx => {
        const isFuturePromise = toLocalDateStr(tx.transaction_date) > toLocalDateStr(new Date());
        let colorClass = 'text-rose-400';
        let colorDestination = 'text-emerald-400';
        let sign = '-';
        if (tx.transaction_type === 'Income') { colorClass = 'text-emerald-400'; sign = '+'; }
        if (tx.transaction_type === 'Transfer') { colorClass = 'text-blue-400'; sign = ''; }
        if (tx.dest_account?.account_type === 'Lend') { colorDestination = 'text-yellow-400'; }
        

        const transactionDate = new Date(tx.transaction_date);
        const localDateDisplay = transactionDate.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric'
        });
        const localTimeDisplay = transactionDate.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit'
        });

        const sourceName = escapeHtml(tx.source_account?.account_name || 'Unknown');
        const destName = escapeHtml(tx.dest_account?.account_name || 'Unknown');
        

        let accountBadgeHtml = '';
        if (tx.transaction_type === 'Expense') {
            accountBadgeHtml = `<span class="text-[11px] text-rose-400">${sourceName}</span>`;
        } else if (tx.transaction_type === 'Income') {
            accountBadgeHtml = `<span class="text-[11px] text-emerald-400">${destName}</span>`;
        } else if (tx.transaction_type === 'Transfer') {
            accountBadgeHtml = `
                <span class="text-[11px] text-gray-400 inline-flex items-center gap-1">
                    <span class="text-rose-400 truncate max-w-[60px]">${sourceName}</span>
                    &rarr;
                    <span class="${colorDestination} truncate max-w-[60px]">${destName}</span>
                </span>
            `;
        }

        return `
            <tr class="hover:bg-gray-800/50 ${isFuturePromise ? 'opacity-50 grayscale' : ''}">
                <td class="py-2.5 pl-1 pr-2">
                    <div class="font-medium text-gray-200 truncate" title="${escapeHtml(tx.description || 'Uncategorized')}">
                        ${escapeHtml(tx.description || 'Uncategorized')}
                    </div>
                    <div class="flex flex-wrap items-center gap-1.5 mt-0.5">
                        <span class="text-[10px] text-gray-400">${localDateDisplay}, ${localTimeDisplay}</span>
                        ${isFuturePromise ? '<span class="text-[10px] rounded bg-gray-700 px-1.5 py-0.5 text-gray-400">Planned</span>' : ''}
                        <span class="text-[10px] px-1.5 py-0.2 rounded bg-gray-700/80 text-gray-300 sm:hidden">${tx.transaction_type}</span>
                        <span class="text-[10px]">${accountBadgeHtml}</span>
                    </div>
                </td>
                <td class="py-2.5 hidden sm:table-cell">
                    <span class="px-2 py-0.5 rounded text-xs bg-gray-700 text-gray-300">${escapeHtml(tx.transaction_type)}</span>
                </td>
                <td class="py-2.5 pr-1 text-right font-mono font-semibold whitespace-nowrap ${colorClass}">
                    ${sign}${formatCurrency(tx.amount)}
                </td>
                <td class="py-2.5 pr-1 align-middle">
                    <div class="flex items-center justify-end gap-1">
                        <button type="button" data-edit-transaction="${tx.transaction_id}" class="rounded bg-gray-700 px-2 py-1 text-[10px] text-gray-300 hover:bg-teal-700 hover:text-white" aria-label="Edit transaction">
                            Edit
                        </button>
                        <button type="button" data-delete-transaction="${tx.transaction_id}" class="rounded bg-gray-700 px-2 py-1 text-[10px] text-gray-300 hover:bg-rose-700 hover:text-white" aria-label="Delete transaction">
                            Delete
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

export function renderQueueList() {
    const queueContainer = document.getElementById('queue-container');
    const queueList = document.getElementById('queue-list');
    const queueCount = document.getElementById('queue-count');

    if (state.transactionQueue.length === 0) {
        queueContainer.classList.add('hidden');
        queueList.replaceChildren();
        return;
    }

    queueContainer.classList.remove('hidden');
    queueCount.innerText = state.transactionQueue.length;

    queueList.innerHTML = [...state.transactionQueue].reverse().map((item) => {
        let colorClass = 'text-rose-400';
        let sign = '-';
        if (item.transaction_type === 'Income') { colorClass = 'text-green-400'; sign = '+'; }
        if (item.transaction_type === 'Transfer') { colorClass = 'text-blue-400'; sign = ''; }

        const transactionDate = new Date(item.transaction_date);
        const dateFormatted = transactionDate.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric'
        });
        const timeFormatted = transactionDate.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit'
        });

        const srcName = escapeHtml(state.accountCacheMap[item.source_account_id] || '');
        const destName = escapeHtml(state.accountCacheMap[item.destination_account_id] || '');
        let accDisplay = srcName;
        if (item.transaction_type === 'Expense') accDisplay = `<span class="text-[11px] text-rose-400">${srcName}</span>`;
        if (item.transaction_type === 'Income') accDisplay = `<span class="text-[11px] text-green-400">${destName}</span>`;
        if (item.transaction_type === 'Transfer') accDisplay = `
                <span class="text-[11px] text-gray-400 inline-flex items-center gap-1">
                    <span class="text-rose-400 truncate max-w-[60px]">${srcName}</span>
                    &rarr;
                    <span class="text-green-400 truncate max-w-[60px]">${destName}</span
                </span>
            `;

        return `
            <div class="flex items-center justify-between bg-gray-700/60 p-2 rounded text-xs border border-gray-600/40">
                <div class="truncate pr-2">
                    <div class="font-medium text-gray-200 truncate">${escapeHtml(item.description)}</div>
                    <div class="text-[10px] text-gray-400 flex items-center gap-1.5 mt-0.5">
                        <span>${dateFormatted}, ${timeFormatted}</span>
                        <span class="px-1 py-0.2 bg-gray-800 rounded text-gray-300">${item.transaction_type}</span>
                        <span class="text-teal-300">${accDisplay}</span>
                    </div>
                </div>
                <div class="flex items-center space-x-2 flex-shrink-0">
                    <span class="font-mono font-semibold ${colorClass}">${sign}${formatCurrency(item.amount)}</span>
                    <button type="button" data-edit-queued-transaction="${item.id}" class="text-gray-400 hover:text-teal-300 px-1" aria-label="Edit queued transaction">Edit</button>
                    <button type="button" onclick="removeFromQueue(${item.id})" class="text-gray-400 hover:text-rose-400 px-1 font-bold">&times;</button>
                </div>
            </div>
        `;
    }).join('');
}