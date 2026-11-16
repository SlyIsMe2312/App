-- Run once in Supabase SQL Editor after creating and confirming your Auth user.
-- Replace the email below with the email for the Auth user that should own
-- the existing public.users row 1 and all accounts/transactions with user_id 1.

ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS auth_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.accounts
    ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.transactions
    ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS accounts_owner_id_idx ON public.accounts(owner_id);
CREATE INDEX IF NOT EXISTS transactions_owner_id_idx ON public.transactions(owner_id);

DO $$
DECLARE
    owner_uuid uuid;
BEGIN
    SELECT id INTO owner_uuid
    FROM auth.users
    WHERE lower(email) = lower('REPLACE_WITH_AUTH_EMAIL');

    IF owner_uuid IS NULL THEN
        RAISE EXCEPTION 'No Supabase Auth user found. Replace REPLACE_WITH_AUTH_EMAIL with a confirmed Auth user email.';
    END IF;

    UPDATE public.users
    SET auth_user_id = owner_uuid
    WHERE user_id = 1;

    UPDATE public.accounts
    SET owner_id = owner_uuid
    WHERE user_id = 1;

    UPDATE public.transactions
    SET owner_id = owner_uuid
    WHERE user_id = 1;
END;
$$;

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
    existing_policy record;
BEGIN
    FOR existing_policy IN
        SELECT schemaname, tablename, policyname
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename IN ('users', 'accounts', 'transactions')
    LOOP
        EXECUTE format(
            'DROP POLICY %I ON %I.%I',
            existing_policy.policyname,
            existing_policy.schemaname,
            existing_policy.tablename
        );
    END LOOP;
END;
$$;

REVOKE ALL ON public.users, public.accounts, public.transactions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.users TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.accounts, public.transactions TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.accounts_account_id_seq, public.transactions_transaction_id_seq TO authenticated;

CREATE POLICY users_read_own_profile
    ON public.users FOR SELECT TO authenticated
    USING (auth_user_id = (SELECT auth.uid()));

CREATE POLICY accounts_manage_own
    ON public.accounts FOR ALL TO authenticated
    USING (owner_id = (SELECT auth.uid()))
    WITH CHECK (owner_id = (SELECT auth.uid()));

CREATE POLICY transactions_manage_own
    ON public.transactions FOR ALL TO authenticated
    USING (owner_id = (SELECT auth.uid()))
    WITH CHECK (owner_id = (SELECT auth.uid()));

CREATE OR REPLACE FUNCTION public.finance_validate_transaction_accounts()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF NEW.source_account_id IS NOT NULL AND NOT EXISTS (
        SELECT 1
        FROM public.accounts
        WHERE account_id = NEW.source_account_id
          AND owner_id = NEW.owner_id
    ) THEN
        RAISE EXCEPTION 'Source account must belong to the transaction owner.'
            USING ERRCODE = '23514';
    END IF;

    IF NEW.destination_account_id IS NOT NULL AND NOT EXISTS (
        SELECT 1
        FROM public.accounts
        WHERE account_id = NEW.destination_account_id
          AND owner_id = NEW.owner_id
    ) THEN
        RAISE EXCEPTION 'Destination account must belong to the transaction owner.'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS finance_validate_transaction_accounts ON public.transactions;
CREATE TRIGGER finance_validate_transaction_accounts
    BEFORE INSERT OR UPDATE OF source_account_id, destination_account_id, owner_id
    ON public.transactions
    FOR EACH ROW
    EXECUTE FUNCTION public.finance_validate_transaction_accounts();
