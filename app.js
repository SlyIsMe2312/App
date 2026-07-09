// 1. CONFIGURE YOUR SUPABASE CREDENTIALS HERE
const SUPABASE_URL = 'https://bybkmjqmucqfudpknnie.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Fxs4GM55_7gojCX24NQu1A_2w_w9PP2';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const TEST_USER_ID = 1; // Maps to our seeded test user

// DOM Cache elements
const txType = document.getElementById('tx-type');
const sourceWrapper = document.getElementById('source-wrapper');
const destWrapper = document.getElementById('dest-wrapper');
const txForm = document.getElementById('tx-form');

// Toggle form logic adaptively based on transaction type selection
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

// Initialize Core View Engine
async function initApp() {
    await fetchAccounts();
    await fetchLedger();
}

// Fetch & Populate Account Dashboards
async function fetchAccounts() {
    const { data: accounts, error } = await supabaseClient
        .from('accounts')
        .select('*')
        .eq('user_id', TEST_USER_ID);

    if (error) return console.error(error);

    // Populate Balances UI
    const accountsList = document.getElementById('accounts-list');
    accountsList.innerHTML = accounts.map(acc => `
        <div class="flex justify-between items-center bg-gray-700/50 p-2 rounded">
            <span class="text-gray-300 font-medium">${acc.account_name}</span>
            <span class="font-mono text-teal-400">₱${parseFloat(acc.current_balance).toFixed(2)}</span>
        </div>
    `).join('');

    // Populate Form Dropdowns reusably
    const dropdowns = document.querySelectorAll('.account-dropdown');
    dropdowns.forEach(dropdown => {
        dropdown.innerHTML = accounts.map(acc => `
            <option value="${acc.account_id}">${acc.account_name}</option>
        `).join('');
    });
}

// Fetch & Reuse List Rows for Ledger History
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
        // Determine color indicators reusably
        let colorClass = 'text-red-400';
        let sign = '-';
        if (tx.transaction_type === 'Income') { colorClass = 'text-green-400'; sign = '+'; }
        if (tx.transaction_type === 'Transfer') { colorClass = 'text-gray-400'; sign = ''; }

        return `
            <tr class="hover:bg-gray-800/50">
                <td class="py-3">
                    <div class="font-medium text-gray-200">${tx.description || 'No description'}</div>
                    <div class="text-xs text-gray-500">${new Date(tx.transaction_date).toLocaleDateString()}</div>
                </td>
                <td class="py-3">
                    <span class="px-2 py-0.5 rounded text-xs bg-gray-700 text-gray-300">${tx.transaction_type}</span>
                </td>
                <td class="py-3 text-right font-mono ${colorClass}">
                    ${sign}₱${parseFloat(tx.amount).toFixed(2)}
                </td>
            </tr>
        `;
    }).join('');
}

// Handle Form Submission and Dynamic Mathematical Adjustments
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

    // 1. Log transaction to ledger
    const { error: txError } = await supabaseClient.from('transactions').insert([payload]);
    if (txError) return alert('Transaction error: ' + txError.message);

    // 2. Perform raw math operations depending on types to alter Account balances
    if (type === 'Expense') {
        await adjustBalance(srcId, -amount);
    } else if (type === 'Income') {
        await adjustBalance(destId, amount);
    } else if (type === 'Transfer') {
        await adjustBalance(srcId, -amount);
        await adjustBalance(destId, amount);
    }

    // Reset form UI and re-fetch dashboards smoothly without page reload
    txForm.reset();
    txType.dispatchEvent(new Event('change'));
    initApp();
});

// Small reusable helper to update table structural account properties on the fly
async function adjustBalance(accountId, valueDelta) {
    // Get original balance
    let { data: acc } = await supabaseClient.from('accounts').select('current_balance').eq('account_id', accountId).single();
    let finalBalance = parseFloat(acc.current_balance) + valueDelta;
    
    // Save updated balance
    await supabaseClient.from('accounts').update({ current_balance: finalBalance }).eq('account_id', accountId);
}

// Run on Initial Load
initApp();