import { supabaseClient, TEST_USER_ID } from './config.js';

export async function fetchAccountsFromDB() {
    const { data, error } = await supabaseClient
        .from('accounts')
        .select('*')
        .eq('user_id', TEST_USER_ID)
        .order('account_id', { ascending: true });

    if (error) throw error;
    return data;
}

export async function fetchLedgerFromDB() {
    const { data, error } = await supabaseClient
        .from('transactions')
        .select(`
            *,
            source_account:accounts!source_account_id(account_name),
            dest_account:accounts!destination_account_id(account_name)
        `)
        .eq('user_id', TEST_USER_ID)
        .order('transaction_date', { ascending: false });

    if (error) throw error;
    return data;
}

export async function fetchChartTxsFromDB(startDateStr, endDateStr) {
    const { data, error } = await supabaseClient
        .from('transactions')
        .select('*')
        .eq('user_id', TEST_USER_ID)
        .gte('transaction_date', startDateStr)
        .lte('transaction_date', endDateStr)
        .order('transaction_date', { ascending: true });

    if (error) throw error;
    return data || [];
}

export async function adjustBalance(accountId, valueDelta) {
    let { data: acc } = await supabaseClient
        .from('accounts')
        .select('current_balance')
        .eq('account_id', accountId)
        .single();
        
    let finalBalance = parseFloat(acc.current_balance) + valueDelta;
    await supabaseClient
        .from('accounts')
        .update({ current_balance: finalBalance })
        .eq('account_id', accountId);
}

export async function insertTransactions(payloads) {
    const { error } = await supabaseClient.from('transactions').insert(payloads);
    if (error) throw error;
}