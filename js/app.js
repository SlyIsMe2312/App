// 1. SUPABASE CREDENTIALS & INITIALIZATION
const SUPABASE_URL = 'https://bybkmjqmucqfudpknnie.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Fxs4GM55_7gojCX24NQu1A_2w_w9PP2';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const TEST_USER_ID = 1;

// DOM Cache Elements
const txType = document.getElementById('tx-type');
const sourceWrapper = document.getElementById('source-wrapper');
const destWrapper = document.getElementById('dest-wrapper');
const txForm = document.getElementById('tx-form');

// State Management
let currentWeekStart = getMonday(new Date());
let dailyChart = null;
let activeDates = new Set();
let hiddenDatasets = new Set();
let rawTxs = [];
let transactionQueue = [];
let accountCacheMap = {};

// Color Palette Allocation
const palette = {
    expense: ['rgba(251, 113, 133, 0.85)', 'rgba(244, 63, 94, 0.85)', 'rgba(225, 29, 72, 0.85)', 'rgba(190, 18, 60, 0.85)'],
    income: ['rgba(52, 211, 153, 0.85)', 'rgba(16, 185, 129, 0.85)', 'rgba(5, 150, 105, 0.85)'],
    transfer: ['rgba(96, 165, 250, 0.85)', 'rgba(59, 130, 246, 0.85)', 'rgba(37, 99, 235, 0.85)']
};

// Helper: Get Monday of given date (Local Time)
function getMonday(d) {
    const date = new Date(d);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(date.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    return monday;
}

// Helper: Format Local Date as YYYY-MM-DD
function formatDateISO(d) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Helper: Extract Local YYYY-MM-DD from any Date object/string
function toLocalDateStr(dateInput) {
    const d = new Date(dateInput);
    return formatDateISO(d);
}

// Helper: Currency formatting (PHP)
const formatCurrency = (amount) => {
    return '₱' + parseFloat(amount).toLocaleString('en-PH', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
};

// Form transaction type UI handler
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


// Initial boot logic
async function initApp() {
    await fetchAccounts();
    await fetchLedger();
    await fetchChartData();
}

async function fetchAccounts() {
    const { data: accounts, error } = await supabaseClient
        .from('accounts')
        .select('*')
        .eq('user_id', TEST_USER_ID)
        .order('account_id', { ascending: true }); 

    if (error) return console.error(error);

    accountCacheMap = {};
    accounts.forEach(acc => { accountCacheMap[acc.account_id] = acc.account_name; });

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

async function fetchLedger() {
    const { data: txs, error } = await supabaseClient
        .from('transactions')
        .select(`
            *,
            source_account:accounts!source_account_id(account_name),
            dest_account:accounts!destination_account_id(account_name)
        `)
        .eq('user_id', TEST_USER_ID)
        .order('transaction_date', { ascending: false });

    if (error) return console.error(error);

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

async function fetchChartData() {
    const weekDates = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date(currentWeekStart);
        d.setDate(d.getDate() + i);
        weekDates.push(formatDateISO(d));
    }

    // FIX: Convert start and end bounds to exact UTC ISO strings for Supabase query
    const startObj = new Date(weekDates[0] + 'T00:00:00');
    const endObj = new Date(weekDates[6] + 'T23:59:59.999');

    const startDateStr = startObj.toISOString();
    const endDateStr = endObj.toISOString();

    const labelEl = document.getElementById('week-range-label');
    if (labelEl) {
        labelEl.innerText = `${startObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    }

    const { data: txs, error } = await supabaseClient
        .from('transactions')
        .select('*')
        .eq('user_id', TEST_USER_ID)
        .gte('transaction_date', startDateStr)
        .lte('transaction_date', endDateStr)
        .order('transaction_date', { ascending: true });

    if (error) return console.error(error);
    rawTxs = txs || [];

    if (activeDates.size === 0) {
        weekDates.forEach(d => activeDates.add(d));
    }

    renderChartAndSidebar(weekDates);
}

function renderChartAndSidebar(weekDates) {
    const incomeByDesc = {};
    const transferByDesc = {};
    const expensesByDesc = {};
    const dailyTotals = {};

    weekDates.forEach(d => dailyTotals[d] = 0);

    // 1. Organize Transactions using Local Date Keys
    rawTxs.forEach(tx => {
        // FIX: Extract local date string instead of splitting raw UTC string
        const date = toLocalDateStr(tx.transaction_date);
        const amount = parseFloat(tx.amount);
        const type = tx.transaction_type;
        const desc = tx.description ? tx.description.trim() : (type + ' Item');

        if (type === 'Income') {
            if (!incomeByDesc[desc]) incomeByDesc[desc] = {};
            incomeByDesc[desc][date] = (incomeByDesc[desc][date] || 0) + amount;
        } else if (type === 'Transfer') {
            if (!transferByDesc[desc]) transferByDesc[desc] = {};
            transferByDesc[desc][date] = (transferByDesc[desc][date] || 0) + amount;
        } else if (type === 'Expense') {
            if (!expensesByDesc[desc]) expensesByDesc[desc] = {};
            expensesByDesc[desc][date] = (expensesByDesc[desc][date] || 0) + amount;
        }
    });

    // 2. Compute Net Daily Flow
    weekDates.forEach(date => {
        let net = 0;

        Object.keys(incomeByDesc).forEach(desc => {
            const key = `Income: ${desc}`;
            if (!hiddenDatasets.has(key)) {
                net += (incomeByDesc[desc][date] || 0);
            }
        });

        Object.keys(expensesByDesc).forEach(desc => {
            const key = `Expense: ${desc}`;
            if (!hiddenDatasets.has(key)) {
                net -= (expensesByDesc[desc][date] || 0);
            }
        });

        dailyTotals[date] = net;
    });

    // 3. Render Right Sidebar Daily Net Cards
    const datesContainer = document.getElementById('dates-list');
    if (datesContainer) {
        datesContainer.innerHTML = weekDates.map(dateStr => {
            const dateObj = new Date(dateStr + 'T00:00:00');
            const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
            const dateFormatted = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const isChecked = activeDates.has(dateStr);
            const netTotal = dailyTotals[dateStr] || 0;

            let totalColorClass = 'text-gray-500';
            let formattedValue = formatCurrency(0);

            if (netTotal > 0) {
                totalColorClass = 'text-emerald-400';
                formattedValue = '+' + formatCurrency(netTotal);
            } else if (netTotal < 0) {
                totalColorClass = 'text-rose-400';
                formattedValue = '-' + formatCurrency(Math.abs(netTotal));
            }

            return `
                <div onclick="toggleDate('${dateStr}')" 
                     class="flex justify-between items-center p-2 rounded cursor-pointer border transition-colors ${isChecked ? 'bg-gray-700/80 border-teal-500/50' : 'bg-gray-800/40 border-gray-700/50 opacity-40'}">
                    <div class="flex items-center space-x-2">
                        <input type="checkbox" ${isChecked ? 'checked' : ''} class="pointer-events-none accent-teal-500 rounded">
                        <span class="text-xs text-gray-300 font-medium">${dayName}, ${dateFormatted}</span>
                    </div>
                    <span class="font-mono text-xs ${totalColorClass}">${formattedValue}</span>
                </div>
            `;
        }).join('');
    }

    // 4. Construct Datasets
    const visibleDates = weekDates.map(d => activeDates.has(d) ? d : null);
    const datasets = [];

    // Expense Datasets
    const expenseKeys = Object.keys(expensesByDesc);
    expenseKeys.forEach((desc, idx) => {
        const fullKey = `Expense: ${desc}`;
        const color = palette.expense[idx % palette.expense.length];
        datasets.push({
            label: fullKey,
            displayLabel: desc,
            categoryType: 'Expense',
            stack: 'expense_stack',
            data: visibleDates.map(d => d ? (expensesByDesc[desc][d] || 0) : 0),
            backgroundColor: color,
            borderColor: color.replace('0.85', '1'),
            borderWidth: 1,
            borderRadius: 2,
            hidden: hiddenDatasets.has(fullKey)
        });
    });

    // Income Datasets
    const incomeKeys = Object.keys(incomeByDesc);
    incomeKeys.forEach((desc, idx) => {
        const fullKey = `Income: ${desc}`;
        const color = palette.income[idx % palette.income.length];
        datasets.push({
            label: fullKey,
            displayLabel: desc,
            categoryType: 'Income',
            stack: 'income_stack',
            data: visibleDates.map(d => d ? (incomeByDesc[desc][d] || 0) : 0),
            backgroundColor: color,
            borderColor: color.replace('0.85', '1'),
            borderWidth: 1,
            borderRadius: 2,
            hidden: hiddenDatasets.has(fullKey)
        });
    });

    // Transfer Datasets
    const transferKeys = Object.keys(transferByDesc);
    transferKeys.forEach((desc, idx) => {
        const fullKey = `Transfer: ${desc}`;
        const color = palette.transfer[idx % palette.transfer.length];
        datasets.push({
            label: fullKey,
            displayLabel: desc,
            categoryType: 'Transfer',
            stack: 'transfer_stack',
            data: visibleDates.map(d => d ? (transferByDesc[desc][d] || 0) : 0),
            backgroundColor: color,
            borderColor: color.replace('0.85', '1'),
            borderWidth: 1,
            borderRadius: 2,
            hidden: hiddenDatasets.has(fullKey)
        });
    });

    // 5. Render Master Group Toggles
    const masterContainer = document.getElementById('master-toggles-container');
    if (masterContainer) {
        let masterHtml = '';

        const groupConfigs = {
            Expense: {
                name: 'All Expenses',
                items: expenseKeys.map(k => `Expense: ${k}`),
                activeStyle: 'bg-rose-900/40 border-rose-600/50 text-rose-200',
                inactiveStyle: 'bg-rose-950/30 border-rose-900/30 opacity-40 text-gray-400',
                accentColor: 'text-rose-400',
                checkboxAccent: 'accent-rose-500'
            },
            Income: {
                name: 'All Income',
                items: incomeKeys.map(k => `Income: ${k}`),
                activeStyle: 'bg-emerald-900/40 border-emerald-600/50 text-emerald-200',
                inactiveStyle: 'bg-emerald-950/30 border-emerald-900/30 opacity-40 text-gray-400',
                accentColor: 'text-emerald-400',
                checkboxAccent: 'accent-emerald-500'
            },
            Transfer: {
                name: 'All Transfers',
                items: transferKeys.map(k => `Transfer: ${k}`),
                activeStyle: 'bg-blue-900/40 border-blue-600/50 text-blue-200',
                inactiveStyle: 'bg-blue-950/30 border-blue-900/30 opacity-40 text-gray-400',
                accentColor: 'text-blue-400',
                checkboxAccent: 'accent-blue-500'
            }
        };

        Object.keys(groupConfigs).forEach(type => {
            const config = groupConfigs[type];

            if (config.items.length >= 1) {
                const areAllHidden = config.items.every(k => hiddenDatasets.has(k));
                const jsonStr = JSON.stringify(config.items).replace(/"/g, '&quot;');
                const currentStyle = !areAllHidden ? config.activeStyle : config.inactiveStyle;

                masterHtml += `
                    <div onclick="toggleGroup(${jsonStr})" 
                         class="flex justify-between items-center p-2 rounded cursor-pointer border transition-colors ${currentStyle}">
                        <div class="flex items-center space-x-2">
                            <input type="checkbox" ${!areAllHidden ? 'checked' : ''} class="pointer-events-none ${config.checkboxAccent} rounded">
                            <span class="text-xs font-semibold">${config.name}</span>
                        </div>
                        <span class="text-[10px] uppercase font-bold ${!areAllHidden ? config.accentColor : 'text-gray-500'}">
                            ${!areAllHidden ? 'On' : 'Off'}
                        </span>
                    </div>
                `;
            }
        });

        masterContainer.innerHTML = masterHtml;
    }

    // 6. Render Individual Category Badges
    const legendsContainer = document.getElementById('expense-legends-list');
    if (legendsContainer) {
        if (datasets.length === 0) {
            legendsContainer.innerHTML = `<p class="text-xs text-gray-500 italic p-1 col-span-full">No transactions recorded this week.</p>`;
        } else {
            legendsContainer.innerHTML = datasets.reverse().map(ds => {
                const isHidden = hiddenDatasets.has(ds.label);
                return `
                    <div onclick="toggleDataset('${ds.label}')" 
                         class="flex items-center justify-between p-1.5 rounded text-xs cursor-pointer select-none border transition-colors ${isHidden ? 'bg-gray-800/30 border-transparent opacity-40' : 'bg-gray-700/40 border-gray-600/40 text-gray-200'}">
                        <div class="flex items-center space-x-2 truncate">
                            <span class="w-2.5 h-2.5 rounded-sm inline-block flex-shrink-0" style="background-color: ${ds.backgroundColor}"></span>
                            <span class="truncate" title="${ds.label}">${ds.displayLabel}</span>
                        </div>
                        <span class="text-[10px] uppercase font-bold ml-2 ${isHidden ? 'text-gray-500' : 'text-teal-400'}">${isHidden ? 'Off' : 'On'}</span>
                    </div>
                `;
            }).join('');
        }
    }

    // 7. Render Chart.js
    const ctx = document.getElementById('dailyChart').getContext('2d');
    if (dailyChart) dailyChart.destroy();

    dailyChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: weekDates.map(dateStr => {
                const d = new Date(dateStr + 'T00:00:00');
                return d.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' });
            }),
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const value = context.parsed.y;
                            if (value === 0) return null;
                            return `${context.dataset.label}: ${formatCurrency(value)}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    stacked: true,
                    grid: { color: 'rgba(75, 85, 99, 0.3)', drawBorder: false },
                    ticks: { color: '#9ca3af', font: { size: 11 } }
                },
                y: {
                    stacked: true,
                    min: 0,
                    grid: { color: 'rgba(75, 85, 99, 0.3)', drawBorder: false },
                    ticks: {
                        color: '#9ca3af',
                        callback: (value) => '₱' + value.toLocaleString()
                    }
                }
            }
        }
    });
}

// Master Group Toggle Handler
window.toggleGroup = function(keysArray) {
    const areAllHidden = keysArray.every(k => hiddenDatasets.has(k));
    if (areAllHidden) {
        keysArray.forEach(k => hiddenDatasets.delete(k));
    } else {
        keysArray.forEach(k => hiddenDatasets.add(k));
    }
    fetchChartData();
};

// Global Toggles & Navigation
window.toggleDate = function(dateStr) {
    if (activeDates.has(dateStr)) {
        activeDates.delete(dateStr);
    } else {
        activeDates.add(dateStr);
    }
    fetchChartData();
};

window.toggleDataset = function(label) {
    if (hiddenDatasets.has(label)) {
        hiddenDatasets.delete(label);
    } else {
        hiddenDatasets.add(label);
    }
    fetchChartData();
};

window.changeWeek = function(offset) {
    currentWeekStart.setDate(currentWeekStart.getDate() + (offset * 7));
    activeDates.clear();
    fetchChartData();
};

window.jumpToToday = function() {
    currentWeekStart = getMonday(new Date());
    activeDates.clear();
    fetchChartData();
};

window.jumpToDate = function(dateString) {
    if (!dateString) return;
    const selectedDate = new Date(dateString + 'T00:00:00');
    currentWeekStart = getMonday(selectedDate);
    activeDates.clear();
    fetchChartData();
};

// Form handler (Pushes item to queue)
txForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const type = txType.value;
    const amount = parseFloat(document.getElementById('tx-amount').value);
    const desc = document.getElementById('tx-desc').value.trim() || 'Uncategorized';
    const customDateVal = document.getElementById('tx-date').value;
    const srcId = parseInt(document.getElementById('tx-source').value);
    const destId = parseInt(document.getElementById('tx-dest').value);

    // Date logic: Keep selected date or fallback to current timestamp
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

    transactionQueue.push(queuedItem);
    renderQueueList();

    // Clear inputs
    document.getElementById('tx-amount').value = '';
    document.getElementById('tx-desc').value = '';
    document.getElementById('tx-date').value = '';
});

async function adjustBalance(accountId, valueDelta) {
    let { data: acc } = await supabaseClient.from('accounts').select('current_balance').eq('account_id', accountId).single();
    let finalBalance = parseFloat(acc.current_balance) + valueDelta;
    await supabaseClient.from('accounts').update({ current_balance: finalBalance }).eq('account_id', accountId);
}

// ADD THIS at the end of your JS file: Queue UI & Processing Functions

function renderQueueList() {
    const queueContainer = document.getElementById('queue-container');
    const queueList = document.getElementById('queue-list');
    const queueCount = document.getElementById('queue-count');

    if (transactionQueue.length === 0) {
        queueContainer.classList.add('hidden');
        return;
    }

    queueContainer.classList.remove('hidden');
    queueCount.innerText = transactionQueue.length;

    queueList.innerHTML = transactionQueue.reverse().map((item) => {
        let colorClass = 'text-rose-400';
        let sign = '-';
        if (item.transaction_type === 'Income') { colorClass = 'text-emerald-400'; sign = '+'; }
        if (item.transaction_type === 'Transfer') { colorClass = 'text-blue-400'; sign = ''; }

        const dateFormatted = new Date(item.transaction_date).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric'
        });

        const srcName = accountCacheMap[item.source_account_id] || '';
        const destName = accountCacheMap[item.destination_account_id] || '';
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

window.removeFromQueue = function(id) {
    transactionQueue = transactionQueue.filter(item => item.id !== id);
    renderQueueList();
};

window.clearQueue = function() {
    transactionQueue = [];
    renderQueueList();
};

window.processQueue = async function() {
    if (transactionQueue.length === 0) return;

    const btn = document.getElementById('btn-save-all');
    btn.disabled = true;
    btn.innerText = 'Saving...';

    const balanceDeltas = {};

    const payloads = transactionQueue.map(item => {
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
        const { error: txError } = await supabaseClient.from('transactions').insert(payloads);
        if (txError) throw txError;

        for (const [accIdStr, delta] of Object.entries(balanceDeltas)) {
            if (delta !== 0) {
                await adjustBalance(parseInt(accIdStr), delta);
            }
        }

        transactionQueue = [];
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

// Initial Boot
initApp();