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

// Color Palette Allocation
const palette = {
    expense: ['rgba(251, 113, 133, 0.85)', 'rgba(244, 63, 94, 0.85)', 'rgba(225, 29, 72, 0.85)', 'rgba(190, 18, 60, 0.85)'],
    income: ['rgba(52, 211, 153, 0.85)', 'rgba(16, 185, 129, 0.85)', 'rgba(5, 150, 105, 0.85)'],
    transfer: ['rgba(96, 165, 250, 0.85)', 'rgba(59, 130, 246, 0.85)', 'rgba(37, 99, 235, 0.85)']
};

// Helper: Get Monday of given date
function getMonday(d) {
    const date = new Date(d);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(date.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    return monday;
}

// Helper: Format Date as YYYY-MM-DD
function formatDateISO(d) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
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
        destWrapper.classList.add('hidden');
    } else if (val === 'Income') {
        sourceWrapper.classList.add('hidden');
        destWrapper.classList.remove('hidden');
    } else if (val === 'Transfer') {
        sourceWrapper.classList.remove('hidden');
        destWrapper.classList.remove('hidden');
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
        .eq('user_id', TEST_USER_ID);

    if (error) return console.error(error);

    const totalBalance = accounts.reduce((sum, acc) => sum + (parseFloat(acc.current_balance) >= 0 ? parseFloat(acc.current_balance) : 0), 0);

    const accountsList = document.getElementById('accounts-list');
    accountsList.innerHTML = accounts.reverse().map(acc => `
        <div class="flex justify-between items-center bg-gray-700/50 p-2 rounded">
            <span class="text-gray-300 font-medium">${acc.account_name}</span>
            <span class="font-mono ${acc.current_balance >= 0 ? 'text-teal-400' : 'text-rose-400'}">${formatCurrency(acc.current_balance)}</span>
        </div>
    `).join('') + `
        <div class="flex justify-between items-center bg-teal-900/30 p-3 rounded border border-teal-500/50 mt-2">
            <span class="text-gray-200 font-bold">Total Net</span>
            <span class="font-mono text-teal-300 font-bold text-lg">${formatCurrency(totalBalance)}</span>
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
        .select('*')
        .eq('user_id', TEST_USER_ID)
        .order('transaction_date', { ascending: false });

    if (error) return console.error(error);

    const ledgerBody = document.getElementById('ledger-body');
    if (txs.length === 0) {
        ledgerBody.innerHTML = `<tr><td colspan="3" class="text-center py-4 text-gray-500">No transactions recorded yet.</td></tr>`;
        return;
    }

    ledgerBody.innerHTML = txs.map(tx => {
        let colorClass = 'text-rose-400';
        let sign = '-';
        if (tx.transaction_type === 'Income') { colorClass = 'text-emerald-400'; sign = '+'; }
        if (tx.transaction_type === 'Transfer') { colorClass = 'text-blue-400'; sign = ''; }

        return `
            <tr class="hover:bg-gray-800/50">
                <td class="py-3">
                    <div class="font-medium text-gray-200">${tx.description || 'Uncategorized'}</div>
                    <div class="text-xs text-gray-500">${String(tx.transaction_date).split('T')[0]}</div>
                </td>
                <td class="py-3">
                    <span class="px-2 py-0.5 rounded text-xs bg-gray-700 text-gray-300">${tx.transaction_type}</span>
                </td>
                <td class="py-3 pr-3 text-right font-mono ${colorClass}">
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

    const startDateStr = `${weekDates[0]}T00:00:00.000`;
    const endDateStr = `${weekDates[6]}T23:59:59.999`;

    const labelEl = document.getElementById('week-range-label');
    if (labelEl) {
        const startObj = new Date(weekDates[0] + 'T00:00:00');
        const endObj = new Date(weekDates[6] + 'T00:00:00');
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

    // 1. Organize Transactions into Detailed Sub-Categories
    rawTxs.forEach(tx => {
        const date = String(tx.transaction_date).split('T')[0];
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

    // 2. Compute Net Daily Flow Dynamically Based On Active Categories
    weekDates.forEach(date => {
        let net = 0;

        // Add Active Income Items
        Object.keys(incomeByDesc).forEach(desc => {
            const key = `Income: ${desc}`;
            if (!hiddenDatasets.has(key)) {
                net += (incomeByDesc[desc][date] || 0);
            }
        });

        // Subtract Active Expense Items
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

// 5. Render Master Group Toggles ("All Income", "All Expenses", "All Transfers")
    const masterContainer = document.getElementById('master-toggles-container');
    if (masterContainer) {
        let masterHtml = '';

        // Distinct color styling configurations for each group
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

// Handle Form Submission
txForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const type = txType.value;
    const amount = parseFloat(document.getElementById('tx-amount').value);
    const desc = document.getElementById('tx-desc').value;
    const srcId = parseInt(document.getElementById('tx-source').value);
    const destId = parseInt(document.getElementById('tx-dest').value);

    const payload = {
        user_id: TEST_USER_ID,
        transaction_type: type,
        amount: amount,
        description: desc,
        source_account_id: (type === 'Expense' || type === 'Transfer') ? srcId : null,
        destination_account_id: (type === 'Income' || type === 'Transfer') ? destId : null
    };

    const { error: txError } = await supabaseClient.from('transactions').insert([payload]);
    if (txError) return alert('Transaction error: ' + txError.message);

    if (type === 'Expense') {
        await adjustBalance(srcId, -amount);
    } else if (type === 'Income') {
        await adjustBalance(destId, amount);
    } else if (type === 'Transfer') {
        await adjustBalance(srcId, -amount);
        await adjustBalance(destId, amount);
    }

    txForm.reset();
    txType.dispatchEvent(new Event('change'));
    initApp();
});

async function adjustBalance(accountId, valueDelta) {
    let { data: acc } = await supabaseClient.from('accounts').select('current_balance').eq('account_id', accountId).single();
    let finalBalance = parseFloat(acc.current_balance) + valueDelta;
    await supabaseClient.from('accounts').update({ current_balance: finalBalance }).eq('account_id', accountId);
}

// Initial Boot
initApp();