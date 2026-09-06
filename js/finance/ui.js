import { formatCurrency } from './helpers.js';
import { state, removeFromQueueState } from './state.js';

export function renderAccounts(accounts) {
    const totalBalance = accounts.reduce((sum, acc) => sum + (acc.account_type !== 'Lend' && parseFloat(acc.current_balance) >= 0 ? parseFloat(acc.current_balance) : 0), 0);
    const totalLend = accounts.reduce((sum, acc) => sum + (acc.account_type === 'Lend' ? parseFloat(acc.current_balance) : 0), 0);
    const totalDebt = accounts.reduce((sum, acc) => sum + (acc.account_type !== 'Lend' && parseFloat(acc.current_balance) < 0 ? Math.abs(parseFloat(acc.current_balance)) : 0), 0);

    const accountsList = document.getElementById('accounts-list');
    accountsList.innerHTML = accounts.map(acc => `
        <div class="flex justify-between items-center bg-gray-700/50 p-2 rounded">
            <span class="text-gray-300 font-medium">${acc.account_name}</span>
            <span class="font-mono ${acc.account_type !== 'Lend' ? (acc.current_balance >= 0 ? 'text-teal-400' : 'text-rose-400') : 'text-yellow-400'}">${formatCurrency(acc.current_balance)}</span>
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

    const dropdowns = document.querySelectorAll('.account-dropdown');
    dropdowns.forEach(dropdown => {
        dropdown.innerHTML = accounts.map(acc => `
            <option value="${acc.account_id}">${acc.account_name}</option>
        `).join('');
    });
}

export function renderLedger(txs) {
    const ledgerBody = document.getElementById('ledger-body');
    if (!txs || txs.length === 0) {
        ledgerBody.innerHTML = `<tr><td colspan="3" class="text-center py-4 text-gray-500">No transactions recorded yet.</td></tr>`;
        return;
    }

    ledgerBody.innerHTML = txs.map(tx => {
        let colorClass = 'text-rose-400';
        let sign = '-';
        if (tx.transaction_type === 'Income') { colorClass = 'text-emerald-400'; sign = '+'; }
        if (tx.transaction_type === 'Transfer') { colorClass = 'text-blue-400'; sign = ''; }

        const localDateDisplay = new Date(tx.transaction_date).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric'
        });

        const sourceName = tx.source_account?.account_name || 'Unknown';
        const destName = tx.dest_account?.account_name || 'Unknown';

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
                    <span class="text-emerald-400 truncate max-w-[60px]">${destName}</span>
                </span>
            `;
        }

        return `
            <tr class="hover:bg-gray-800/50">
                <td class="py-2.5 pl-1 pr-2">
                    <div class="font-medium text-gray-200 truncate" title="${tx.description || 'Uncategorized'}">
                        ${tx.description || 'Uncategorized'}
                    </div>
                    <div class="flex flex-wrap items-center gap-1.5 mt-0.5">
                        <span class="text-[10px] text-gray-400">${localDateDisplay}</span>
                        <span class="text-[10px] px-1.5 py-0.2 rounded bg-gray-700/80 text-gray-300 sm:hidden">${tx.transaction_type}</span>
                        <span class="text-[10px]">${accountBadgeHtml}</span>
                    </div>
                </td>
                <td class="py-2.5 hidden sm:table-cell">
                    <span class="px-2 py-0.5 rounded text-xs bg-gray-700 text-gray-300">${tx.transaction_type}</span>
                </td>
                <td class="py-2.5 pr-1 text-right font-mono font-semibold whitespace-nowrap ${colorClass}">
                    ${sign}${formatCurrency(tx.amount)}
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
        return;
    }

    queueContainer.classList.remove('hidden');
    queueCount.innerText = state.transactionQueue.length;

    queueList.innerHTML = [...state.transactionQueue].reverse().map((item) => {
        let colorClass = 'text-rose-400';
        let sign = '-';
        if (item.transaction_type === 'Income') { colorClass = 'text-emerald-400'; sign = '+'; }
        if (item.transaction_type === 'Transfer') { colorClass = 'text-blue-400'; sign = ''; }

        const dateFormatted = new Date(item.transaction_date).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric'
        });

        const srcName = state.accountCacheMap[item.source_account_id] || '';
        const destName = state.accountCacheMap[item.destination_account_id] || '';
        let accDisplay = srcName;
        if (item.transaction_type === 'Income') accDisplay = destName;
        if (item.transaction_type === 'Transfer') accDisplay = `${srcName} &rarr; ${destName}`;

        return `
            <div class="flex items-center justify-between bg-gray-700/60 p-2 rounded text-xs border border-gray-600/40">
                <div class="truncate pr-2">
                    <div class="font-medium text-gray-200 truncate">${item.description}</div>
                    <div class="text-[10px] text-gray-400 flex items-center gap-1.5 mt-0.5">
                        <span>${dateFormatted}</span>
                        <span class="px-1 py-0.2 bg-gray-800 rounded text-gray-300">${item.transaction_type}</span>
                        <span class="text-teal-300">${accDisplay}</span>
                    </div>
                </div>
                <div class="flex items-center space-x-2 flex-shrink-0">
                    <span class="font-mono font-semibold ${colorClass}">${sign}${formatCurrency(item.amount)}</span>
                    <button type="button" onclick="removeFromQueue(${item.id})" class="text-gray-400 hover:text-rose-400 px-1 font-bold">&times;</button>
                </div>
            </div>
        `;
    }).join('');
}