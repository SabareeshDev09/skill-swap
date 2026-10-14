-- SkillSwap Database Schema Migration
-- Compatible with Supabase PostgreSQL (Run in Supabase Dashboard -> SQL Editor)

-- Enable pgvector extension (for AI semantic matching)
CREATE EXTENSION IF NOT EXISTS vector;

-- 1. Profiles & Core Identity
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    avatar_url TEXT,
    bio TEXT,
    languages TEXT[] NOT NULL DEFAULT '{"English"}',
    timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    availability JSONB NOT NULL DEFAULT '{}'::jsonb,
    city TEXT,
    country TEXT DEFAULT 'IN',
    phone_number TEXT UNIQUE,
    phone_verified BOOLEAN DEFAULT FALSE,
    is_onboarded BOOLEAN DEFAULT FALSE,
    age_confirmed BOOLEAN DEFAULT FALSE,
    is_accepting_requests BOOLEAN DEFAULT TRUE,
    strikes_count INT DEFAULT 0,
    reputation_score NUMERIC(3,2) DEFAULT 5.00,
    is_admin BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Skill Taxonomy
CREATE TABLE IF NOT EXISTS public.skill_taxonomy (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category TEXT NOT NULL,
    name TEXT NOT NULL UNIQUE,
    synonyms TEXT[],
    min_hourly_rate INT NOT NULL DEFAULT 20,
    max_hourly_rate INT NOT NULL DEFAULT 1000,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS skill_taxonomy_lower_name_unique_idx
    ON public.skill_taxonomy (lower(name));

-- 3. User Teaching & Learning Skills
CREATE TABLE IF NOT EXISTS public.user_skills_teach (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    skill_id UUID NOT NULL REFERENCES public.skill_taxonomy(id),
    level TEXT CHECK (level IN ('beginner', 'intermediate', 'advanced', 'expert')),
    years_experience NUMERIC(3,1) DEFAULT 1,
    hourly_rate INT NOT NULL, -- Tokens/hr
    allowed_durations INT[] DEFAULT '{30, 45, 60, 90}',
    is_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.user_skills_learn (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    skill_id UUID NOT NULL REFERENCES public.skill_taxonomy(id),
    target_level TEXT CHECK (target_level IN ('beginner', 'intermediate', 'advanced', 'expert')),
    goal TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS user_skills_teach_user_skill_unique_idx
    ON public.user_skills_teach (user_id, skill_id);
CREATE UNIQUE INDEX IF NOT EXISTS user_skills_learn_user_skill_unique_idx
    ON public.user_skills_learn (user_id, skill_id);

CREATE OR REPLACE FUNCTION public.replace_user_skills(
    p_user_id UUID,
    p_teach_names TEXT[],
    p_learn_names TEXT[],
    p_no_teach BOOLEAN,
    p_teach_level TEXT,
    p_hourly_rate INT,
    p_experience_years NUMERIC,
    p_allowed_durations INT[],
    p_learn_level TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
    IF COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role') IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.skill_taxonomy (name, category, min_hourly_rate, max_hourly_rate)
    SELECT names.skill_name, 'Other', 20, 1000
    FROM (
        SELECT DISTINCT ON (lower(clean_name)) clean_name AS skill_name
        FROM (
            SELECT regexp_replace(btrim(skill_name), '[[:space:]]+', ' ', 'g') AS clean_name
            FROM unnest(
                COALESCE(p_teach_names, ARRAY[]::TEXT[]) || COALESCE(p_learn_names, ARRAY[]::TEXT[])
            ) AS requested(skill_name)
        ) AS cleaned
        WHERE clean_name <> ''
        ORDER BY lower(clean_name), clean_name
    ) AS names
    ON CONFLICT (lower(name)) DO NOTHING;

    DELETE FROM public.user_skills_teach WHERE user_id = p_user_id;
    DELETE FROM public.user_skills_learn WHERE user_id = p_user_id;

    IF NOT p_no_teach THEN
        INSERT INTO public.user_skills_teach (
            user_id, skill_id, level, years_experience, hourly_rate, allowed_durations
        )
        SELECT DISTINCT ON (taxonomy.id)
            p_user_id,
            taxonomy.id,
            p_teach_level,
            COALESCE(p_experience_years, 1),
            COALESCE(p_hourly_rate, taxonomy.min_hourly_rate),
            COALESCE(NULLIF(p_allowed_durations, ARRAY[]::INT[]), ARRAY[30, 45, 60, 90])
        FROM unnest(COALESCE(p_teach_names, ARRAY[]::TEXT[])) AS requested(skill_name)
        JOIN public.skill_taxonomy AS taxonomy
            ON lower(taxonomy.name) = lower(regexp_replace(btrim(requested.skill_name), '[[:space:]]+', ' ', 'g'))
        ORDER BY taxonomy.id;
    END IF;

    INSERT INTO public.user_skills_learn (user_id, skill_id, target_level, goal)
    SELECT DISTINCT ON (taxonomy.id)
        p_user_id,
        taxonomy.id,
        p_learn_level,
        'Looking to learn ' || taxonomy.name
    FROM unnest(COALESCE(p_learn_names, ARRAY[]::TEXT[])) AS requested(skill_name)
    JOIN public.skill_taxonomy AS taxonomy
        ON lower(taxonomy.name) = lower(regexp_replace(btrim(requested.skill_name), '[[:space:]]+', ' ', 'g'))
    ORDER BY taxonomy.id;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_user_skills(UUID, TEXT[], TEXT[], BOOLEAN, TEXT, INT, NUMERIC, INT[], TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_user_skills(UUID, TEXT[], TEXT[], BOOLEAN, TEXT, INT, NUMERIC, INT[], TEXT)
    TO service_role;

-- 4. Wallets & Double-Entry Ledger (paise precision: 1 token = 100 paise)
CREATE TABLE IF NOT EXISTS public.wallets (
    user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    available_paise BIGINT NOT NULL DEFAULT 0 CHECK (available_paise >= 0),
    held_paise BIGINT NOT NULL DEFAULT 0 CHECK (held_paise >= 0),
    lifetime_earned_paise BIGINT NOT NULL DEFAULT 0,
    lifetime_spent_paise BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ledger_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference_id TEXT NOT NULL,
    transaction_type TEXT NOT NULL CHECK (transaction_type IN ('PURCHASE', 'HOLD', 'RELEASE', 'REFUND', 'FEE', 'ADJUSTMENT')),
    source_wallet_id UUID REFERENCES public.wallets(user_id) ON DELETE CASCADE,
    dest_wallet_id UUID REFERENCES public.wallets(user_id) ON DELETE CASCADE,
    amount_paise BIGINT NOT NULL,
    idempotency_key TEXT UNIQUE NOT NULL,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Offers & Sessions
CREATE TABLE IF NOT EXISTS public.offers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type TEXT NOT NULL CHECK (type IN ('DIRECT', 'SWAP')),
    proposer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    recipient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'CANCELLED', 'COMPLETED')),
    swap_factor NUMERIC(3,2) DEFAULT 0.30,
    quote_snapshot JSONB NOT NULL,
    message TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    offer_id UUID NOT NULL REFERENCES public.offers(id) ON DELETE CASCADE,
    leg_index INT NOT NULL,
    teacher_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    learner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    skill_id UUID REFERENCES public.skill_taxonomy(id) ON DELETE SET NULL,
    skill_name TEXT NOT NULL DEFAULT 'Skill',
    duration_minutes INT NOT NULL,
    list_price_tokens INT NOT NULL,
    charged_tokens INT NOT NULL,
    platform_fee_tokens NUMERIC(6,2) NOT NULL,
    teacher_payout_tokens NUMERIC(6,2) NOT NULL,
    scheduled_start TIMESTAMPTZ,
    scheduled_end TIMESTAMPTZ,
    meet_link TEXT,
    status TEXT NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED', 'PENDING_CONFIRMATION', 'SETTLED', 'DISPUTED', 'CANCELLED')),
    teacher_confirmed BOOLEAN DEFAULT FALSE,
    learner_confirmed BOOLEAN DEFAULT FALSE,
    dispute_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Temporary Chat Threads & Messages
CREATE TABLE IF NOT EXISTS public.chat_threads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    offer_id UUID NOT NULL UNIQUE REFERENCES public.offers(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'READ_ONLY', 'ARCHIVED')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id UUID NOT NULL REFERENCES public.chat_threads(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    message_type TEXT NOT NULL DEFAULT 'TEXT' CHECK (message_type IN ('TEXT', 'PROPOSE_TIME', 'TIME_CONFIRMED', 'SYSTEM_ALERT')),
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Atomic Escrow Token Hold Stored Procedure
CREATE OR REPLACE FUNCTION hold_tokens_for_offer(
    p_user_id UUID,
    p_amount_paise BIGINT,
    p_idempotency_key TEXT,
    p_offer_id TEXT
) RETURNS VOID AS $$
DECLARE
    v_available BIGINT;
BEGIN
    SELECT available_paise INTO v_available FROM public.wallets WHERE user_id = p_user_id FOR UPDATE;
    IF v_available < p_amount_paise THEN
        RAISE EXCEPTION 'INSUFFICIENT_FUNDS';
    END IF;

    UPDATE public.wallets 
    SET available_paise = available_paise - p_amount_paise,
        held_paise = held_paise + p_amount_paise,
        updated_at = NOW()
    WHERE user_id = p_user_id;

    INSERT INTO public.ledger_transactions (reference_id, transaction_type, source_wallet_id, amount_paise, idempotency_key)
    VALUES (p_offer_id, 'HOLD', p_user_id, p_amount_paise, p_idempotency_key);
END;
$$ LANGUAGE plpgsql;

-- Seed initial skill taxonomy
INSERT INTO public.skill_taxonomy (name, category, min_hourly_rate, max_hourly_rate) VALUES
('Python Programming', 'Software & Tech', 30, 150),
('Rust & Systems Design', 'Software & Tech', 50, 200),
('UI/UX Design (Figma)', 'Design & Creative', 25, 120),
('Advanced Excel & VBA', 'Business & Finance', 20, 90),
('Acoustic Guitar', 'Music & Arts', 20, 80),
('Conversational Spanish', 'Languages', 25, 100),
('Public Speaking & Pitching', 'Personal Growth', 35, 140),
('Financial Modeling', 'Business & Finance', 40, 180)
ON CONFLICT (name) DO NOTHING;

-- 8. Row Level Security (RLS) Setup
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skill_taxonomy ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_skills_teach ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_skills_learn ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Profiles: Public can view, users update own
CREATE POLICY "Public profiles are viewable by everyone" ON public.profiles
    FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

-- Skill Taxonomy & User Teach/Learn Skills
CREATE POLICY "Public skill taxonomy viewable" ON public.skill_taxonomy
    FOR SELECT USING (true);
CREATE POLICY "Public user teach skills viewable" ON public.user_skills_teach
    FOR SELECT USING (true);
CREATE POLICY "Users can manage own teach skills" ON public.user_skills_teach
    FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Public user learn skills viewable" ON public.user_skills_learn
    FOR SELECT USING (true);
CREATE POLICY "Users can manage own learn skills" ON public.user_skills_learn
    FOR ALL USING (auth.uid() = user_id);

-- Wallets: Users view own wallet
CREATE POLICY "Users can view own wallet" ON public.wallets
    FOR SELECT USING (auth.uid() = user_id);

-- Ledger: Users view their own transactions
CREATE POLICY "Users can view own ledger entries" ON public.ledger_transactions
    FOR SELECT USING (auth.uid() = source_wallet_id OR auth.uid() = dest_wallet_id);

-- Offers: Proposer and recipient can view and interact
CREATE POLICY "Parties can view their offers" ON public.offers
    FOR SELECT USING (auth.uid() = proposer_id OR auth.uid() = recipient_id);
CREATE POLICY "Users can create offers" ON public.offers
    FOR INSERT WITH CHECK (auth.uid() = proposer_id);
CREATE POLICY "Parties can update offers" ON public.offers
    FOR UPDATE USING (auth.uid() = proposer_id OR auth.uid() = recipient_id);

-- Sessions: Participants can view and update
CREATE POLICY "Participants can view sessions" ON public.sessions
    FOR SELECT USING (auth.uid() = teacher_id OR auth.uid() = learner_id);
CREATE POLICY "Participants can update sessions" ON public.sessions
    FOR UPDATE USING (auth.uid() = teacher_id OR auth.uid() = learner_id);

-- Chat Threads & Messages
CREATE POLICY "Offer parties can view chat threads" ON public.chat_threads
    FOR SELECT USING (true);
CREATE POLICY "Thread participants can view messages" ON public.chat_messages
    FOR SELECT USING (true);
CREATE POLICY "Users can send messages" ON public.chat_messages
    FOR INSERT WITH CHECK (auth.uid() = sender_id);

-- 9. Reviews & Reputation System (PRD §7.10)
CREATE TABLE IF NOT EXISTS public.reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
    reviewer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    reviewee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
    feedback TEXT,
    tags TEXT[],
    is_revealed BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can view revealed reviews" ON public.reviews
    FOR SELECT USING (is_revealed = true);
CREATE POLICY "Users can create reviews for their sessions" ON public.reviews
    FOR INSERT WITH CHECK (auth.uid() = reviewer_id);
