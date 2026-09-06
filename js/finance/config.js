export const SUPABASE_URL = 'https://bybkmjqmucqfudpknnie.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_Fxs4GM55_7gojCX24NQu1A_2w_w9PP2';
export const TEST_USER_ID = 1;

export const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export const palette = {
    expense: ['rgba(251, 113, 133, 0.85)', 'rgba(244, 63, 94, 0.85)', 'rgba(225, 29, 72, 0.85)', 'rgba(190, 18, 60, 0.85)'],
    income: ['rgba(52, 211, 153, 0.85)', 'rgba(16, 185, 129, 0.85)', 'rgba(5, 150, 105, 0.85)'],
    transfer: ['rgba(96, 165, 250, 0.85)', 'rgba(59, 130, 246, 0.85)', 'rgba(37, 99, 235, 0.85)']
};