import { supabaseClient } from './config.js';
import { state } from './state.js';

function getOwnerId() {
    if (!state.authUserId) throw new Error('You must be signed in to access finance data.');
    return state.authUserId;
}

export async function fetchAccountsFromDB() {
    const { data, error } = await supabaseClient
        .from('accounts')
        .select('*')
        .eq('owner_id', getOwnerId())
        .order('account_id', { ascending: true });

    if (error) throw error;
    return data;
}

export async function insertAccount(account) {
    const { data, error } = await supabaseClient
        .from('accounts')
        .insert({
            owner_id: getOwnerId(),
            account_name: account.account_name,
            account_type: account.account_type,
            current_balance: account.current_balance
        })
        .select('account_id')
        .single();

    if (error) throw error;
    return data;
}

export async function fetchLedgerFromDB() {
    const { data, error } = await supabaseClient
        .from('transactions')
        .select(`
            *,
            source_account:accounts!source_account_id(account_name, account_type),
            dest_account:accounts!destination_account_id(account_name, account_type)
        `)
        .eq('owner_id', getOwnerId())
        .order('transaction_date', { ascending: false });

    if (error) throw error;
    return data;
}

export async function fetchChartTxsFromDB(startDateStr, endDateStr) {
    const { data, error } = await supabaseClient
        .from('transactions')
        .select('*')
        .eq('owner_id', getOwnerId())
        .gte('transaction_date', startDateStr)
        .lte('transaction_date', endDateStr)
        .order('transaction_date', { ascending: true });

    if (error) throw error;
    return data || [];
}

export async function adjustBalance(accountId, valueDelta) {
    const { data: acc, error: fetchError } = await supabaseClient
        .from('accounts')
        .select('current_balance')
        .eq('account_id', accountId)
        .eq('owner_id', getOwnerId())
        .single();

    if (fetchError) throw fetchError;
    const finalBalance = parseFloat(acc.current_balance) + valueDelta;
    const { data: updatedAccount, error: updateError } = await supabaseClient
        .from('accounts')
        .update({ current_balance: finalBalance })
        .eq('account_id', accountId)
        .eq('owner_id', getOwnerId())
        .select('account_id')
        .maybeSingle();
    if (updateError) throw updateError;
    if (!updatedAccount) throw new Error(`Account ${accountId} was not updated.`);
}

export async function insertTransactions(payloads) {
    const ownerId = getOwnerId();
    const { error } = await supabaseClient
        .from('transactions')
        .insert(payloads.map(payload => ({ ...payload, owner_id: ownerId })));
    if (error) throw error;
}

export async function updateTransactionInDB(transactionId, payload) {
    const { data, error } = await supabaseClient
        .from('transactions')
        .update(payload)
        .eq('transaction_id', transactionId)
        .eq('owner_id', getOwnerId())
        .select('transaction_id')
        .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error('Transaction was not found or could not be updated.');
}

export async function deleteTransactionFromDB(transactionId) {
    const { data, error } = await supabaseClient
        .from('transactions')
        .delete()
        .eq('transaction_id', transactionId)
        .eq('owner_id', getOwnerId())
        .select('transaction_id')
        .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error('Transaction was not found or could not be deleted.');
}