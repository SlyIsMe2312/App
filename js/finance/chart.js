import { palette } from './config.js';
import { state } from './state.js';
import { toLocalDateStr, formatCurrency } from './helpers.js';

const COLLAPSIBLE_DAILY_TRANSACTION_GROUPS = false;

function getDailyDatasetKey(type, description, date) {
    return encodeURIComponent(JSON.stringify([type, description, date])).replace(/'/g, '%27');
}

export function renderChartAndSidebar(weekDates) {
    const incomeByDesc = {};
    const transferByDesc = {};
    const expensesByDesc = {};
    const dailyTotals = {};

    weekDates.forEach(d => dailyTotals[d] = 0);

    state.rawTxs.forEach(tx => {
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

    let totalExpense = 0;
    let totalIncome = 0;
    let totalTransfer = 0;

    weekDates.forEach(date => {
        let net = 0;
        
        // Calculate Income
        Object.keys(incomeByDesc).forEach(desc => {
            if (!state.hiddenDatasets.has(getDailyDatasetKey('Income', desc, date))) {
                const amt = incomeByDesc[desc][date] || 0;
                net += amt;
                if (state.activeDates.has(date)) totalIncome += amt;
            }
        });

        // Calculate Expenses
        Object.keys(expensesByDesc).forEach(desc => {
            if (!state.hiddenDatasets.has(getDailyDatasetKey('Expense', desc, date))) {
                const amt = expensesByDesc[desc][date] || 0;
                net -= amt;
                if (state.activeDates.has(date)) totalExpense += amt;
            }
        });

        // Calculate Transfers
        Object.keys(transferByDesc).forEach(desc => {
            if (!state.hiddenDatasets.has(getDailyDatasetKey('Transfer', desc, date))) {
                const amt = transferByDesc[desc][date] || 0;
                if (state.activeDates.has(date)) totalTransfer += amt;
            }
        });

        dailyTotals[date] = net;
    });

    const expEl = document.getElementById('summary-total-expense');
    const incEl = document.getElementById('summary-total-income');
    const trsEl = document.getElementById('summary-total-transfer');

    if (expEl) expEl.innerText = formatCurrency(totalExpense);
    if (incEl) incEl.innerText = formatCurrency(totalIncome);
    if (trsEl) trsEl.innerText = formatCurrency(totalTransfer);

    const datesContainer = document.getElementById('dates-list');
    if (datesContainer) {
        datesContainer.innerHTML = weekDates.map(dateStr => {
            const dateObj = new Date(dateStr + 'T00:00:00');
            const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
            const dateFormatted = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const isChecked = state.activeDates.has(dateStr);
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

    const visibleDates = weekDates.map(d => state.activeDates.has(d) ? d : null);
    const datasets = [];

    const expenseKeys = Object.keys(expensesByDesc);
    expenseKeys.forEach((desc, idx) => {
        const fullKey = `Expense: ${desc}`;
        const color = palette.expense[idx % palette.expense.length];
        datasets.push({
            label: fullKey,
            displayLabel: desc,
            categoryType: 'Expense',
            stack: 'expense_stack',
            data: visibleDates.map(d => d && !state.hiddenDatasets.has(getDailyDatasetKey('Expense', desc, d))
                ? (expensesByDesc[desc][d] ?? null)
                : null),
            backgroundColor: color,
            borderColor: color.replace('0.85', '1'),
            borderWidth: 1,
            borderRadius: 2,
            skipNull: true,
            hidden: false
        });
    });

    const incomeKeys = Object.keys(incomeByDesc);
    incomeKeys.forEach((desc, idx) => {
        const fullKey = `Income: ${desc}`;
        const color = palette.income[idx % palette.income.length];
        datasets.push({
            label: fullKey,
            displayLabel: desc,
            categoryType: 'Income',
            stack: 'income_stack',
            data: visibleDates.map(d => d && !state.hiddenDatasets.has(getDailyDatasetKey('Income', desc, d))
                ? (incomeByDesc[desc][d] ?? null)
                : null),
            backgroundColor: color,
            borderColor: color.replace('0.85', '1'),
            borderWidth: 1,
            borderRadius: 2,
            skipNull: true,
            hidden: false
        });
    });

    const transferKeys = Object.keys(transferByDesc);
    transferKeys.forEach((desc, idx) => {
        const fullKey = `Transfer: ${desc}`;
        const color = palette.transfer[idx % palette.transfer.length];
        datasets.push({
            label: fullKey,
            displayLabel: desc,
            categoryType: 'Transfer',
            stack: 'transfer_stack',
            data: visibleDates.map(d => d && !state.hiddenDatasets.has(getDailyDatasetKey('Transfer', desc, d))
                ? (transferByDesc[desc][d] ?? null)
                : null),
            backgroundColor: color,
            borderColor: color.replace('0.85', '1'),
            borderWidth: 1,
            borderRadius: 2,
            skipNull: true,
            hidden: false
        });
    });

    const masterContainer = document.getElementById('master-toggles-container');
    if (masterContainer) {
        let masterHtml = '';
        const groupConfigs = {
            Expense: { name: 'All Expenses', items: expenseKeys.flatMap(desc => Object.keys(expensesByDesc[desc]).map(date => getDailyDatasetKey('Expense', desc, date))), activeStyle: 'bg-rose-900/40 border-rose-600/50 text-rose-200', inactiveStyle: 'bg-rose-950/30 border-rose-900/30 opacity-40 text-gray-400', accentColor: 'text-rose-400', checkboxAccent: 'accent-rose-500' },
            Income: { name: 'All Income', items: incomeKeys.flatMap(desc => Object.keys(incomeByDesc[desc]).map(date => getDailyDatasetKey('Income', desc, date))), activeStyle: 'bg-emerald-900/40 border-emerald-600/50 text-emerald-200', inactiveStyle: 'bg-emerald-950/30 border-emerald-900/30 opacity-40 text-gray-400', accentColor: 'text-emerald-400', checkboxAccent: 'accent-emerald-500' },
            Transfer: { name: 'All Transfers', items: transferKeys.flatMap(desc => Object.keys(transferByDesc[desc]).map(date => getDailyDatasetKey('Transfer', desc, date))), activeStyle: 'bg-blue-900/40 border-blue-600/50 text-blue-200', inactiveStyle: 'bg-blue-950/30 border-blue-900/30 opacity-40 text-gray-400', accentColor: 'text-blue-400', checkboxAccent: 'accent-blue-500' }
        };

        Object.keys(groupConfigs).forEach(type => {
            const config = groupConfigs[type];
            if (config.items.length >= 1) {
                const areAllHidden = config.items.every(k => state.hiddenDatasets.has(k));
                const encodedItems = encodeURIComponent(JSON.stringify(config.items));
                const currentStyle = !areAllHidden ? config.activeStyle : config.inactiveStyle;

                masterHtml += `
                    <button type="button" data-toggle-group="${encodedItems}"
                         class="flex justify-between items-center p-2 rounded cursor-pointer border transition-colors ${currentStyle}">
                        <div class="flex items-center space-x-2">
                            <input type="checkbox" ${!areAllHidden ? 'checked' : ''} class="pointer-events-none ${config.checkboxAccent} rounded">
                            <span class="text-xs font-semibold">${config.name}</span>
                        </div>
                        <span class="text-[10px] uppercase font-bold ${!areAllHidden ? config.accentColor : 'text-gray-500'}">
                            ${!areAllHidden ? 'On' : 'Off'}
                        </span>
                    </button>
                `;
            }
        });
        masterContainer.innerHTML = masterHtml;
    }

    const legendsContainer = document.getElementById('expense-legends-list');
    if (legendsContainer) {
        const categoryByTypeAndDescription = {
            Expense: expensesByDesc,
            Income: incomeByDesc,
            Transfer: transferByDesc
        };
        const categoriesByDay = weekDates.map(date => ({
            date,
            categories: datasets.filter(dataset => Object.hasOwn(categoryByTypeAndDescription[dataset.categoryType][dataset.displayLabel], date))
        })).filter(day => day.categories.length > 0);

        if (categoriesByDay.length === 0) {
            legendsContainer.innerHTML = `<p class="text-xs text-gray-500 italic p-1 col-span-full">No transactions recorded this week.</p>`;
        } else {
            legendsContainer.innerHTML = categoriesByDay.map(({ date, categories }) => {
                const dateObj = new Date(`${date}T00:00:00`);
                const dayLabel = dateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
                const transactionCount = state.rawTxs.filter(tx => toLocalDateStr(tx.transaction_date) === date).length;
                const categoryControls = [...categories].reverse().map(dataset => {
                    const key = getDailyDatasetKey(dataset.categoryType, dataset.displayLabel, date);
                    const isHidden = state.hiddenDatasets.has(key);
                    const label = `${dataset.categoryType}: ${dataset.displayLabel}`;
                    const safeLabel = label.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
                    return `
                        <button type="button" data-toggle-dataset="${key}"
                             class="flex items-center justify-between p-1.5 rounded text-xs cursor-pointer select-none border transition-colors ${isHidden ? 'bg-gray-800/30 border-transparent opacity-40' : 'bg-gray-700/40 border-gray-600/40 text-gray-200'}">
                            <span class="flex items-center space-x-2 truncate">
                                <span class="w-2.5 h-2.5 rounded-sm inline-block flex-shrink-0" style="background-color: ${dataset.backgroundColor}"></span>
                                <span class="truncate" title="${safeLabel}">${safeLabel}</span>
                            </span>
                            <span class="text-[10px] uppercase font-bold ml-2 ${isHidden ? 'text-gray-500' : 'text-teal-400'}">${isHidden ? 'Off' : 'On'}</span>
                        </button>
                    `;
                }).join('');
                const heading = `${dayLabel} <span class="font-normal text-gray-500">(${transactionCount} transactions)</span>`;
                const controls = `<div class="mt-2 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">${categoryControls}</div>`;
                if (COLLAPSIBLE_DAILY_TRANSACTION_GROUPS) {
                    return `
                        <details open class="col-span-full rounded border border-gray-700/50 bg-gray-800/30 p-2">
                            <summary class="cursor-pointer text-xs font-semibold text-gray-300">${heading}</summary>
                            ${controls}
                        </details>
                    `;
                }

                return `
                    <section class="col-span-full rounded border border-gray-700/50 bg-gray-800/30 p-2">
                        <h3 class="text-xs font-semibold text-gray-300">${heading}</h3>
                        ${controls}
                    </section>
                `;
            }).join('');
        }
    }

    const ctx = document.getElementById('dailyChart').getContext('2d');
    if (state.dailyChart) state.dailyChart.destroy();

    state.dailyChart = new Chart(ctx, {
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
                x: { stacked: true, grid: { color: 'rgba(75, 85, 99, 0.3)', drawBorder: false }, ticks: { color: '#9ca3af', font: { size: 11 } } },
                y: { stacked: true, min: 0, grid: { color: 'rgba(75, 85, 99, 0.3)', drawBorder: false }, ticks: { color: '#9ca3af', callback: (value) => '₱' + value.toLocaleString() } }
            }
        }
    });
}