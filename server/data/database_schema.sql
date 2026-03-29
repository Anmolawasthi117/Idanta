-- ═══════════════════════════════════════════════════════════════════════════
-- Idanta — Supabase Database Schema (MVP 1.0)
-- Run this in the Supabase SQL Editor (Project → SQL Editor → New query)
-- ═══════════════════════════════════════════════════════════════════════════

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;

-- ─── 1. Users (Phone-based Auth) ──────────────────────────────────────────────
CREATE TABLE users (
    id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    name          TEXT        NOT NULL,
    phone         TEXT        UNIQUE NOT NULL,
    password_hash TEXT        NOT NULL,
    language      TEXT        DEFAULT 'hi' CHECK (language IN ('hi', 'en')),
    has_brand     BOOLEAN     DEFAULT FALSE,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 2. Brands ────────────────────────────────────────────────────────────────
CREATE TABLE brands (
    id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID        REFERENCES users(id) ON DELETE CASCADE,
    craft_id    TEXT        NOT NULL, -- e.g. 'block_print_jaipur'
    name        TEXT,
    tagline     TEXT,
    palette     JSONB,          -- {primary: '#hex', secondary: '#hex', accent: '#hex'}
    story_en    TEXT,
    story_hi    TEXT,
    logo_url    TEXT,
    banner_url  TEXT,
    kit_zip_url TEXT,
    status      TEXT        DEFAULT 'pending' CHECK (status IN ('pending','ready','failed')),
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 3. Products ──────────────────────────────────────────────────────────────
CREATE TABLE products (
    id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    brand_id          UUID        REFERENCES brands(id) ON DELETE CASCADE,
    name              TEXT        NOT NULL,
    price_mrp         NUMERIC(10,2),
    motif_used        TEXT,
    material          TEXT,
    listing_copy      TEXT,
    photos            TEXT[],     -- Array of original photo URLs
    branded_photo_url TEXT,
    hang_tag_url      TEXT,
    label_url         TEXT,
    status            TEXT        DEFAULT 'pending' CHECK (status IN ('pending','processing','ready','failed')),
    created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 4. Jobs (Frontend Polling) ───────────────────────────────────────────────
CREATE TABLE jobs (
    id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id      UUID        REFERENCES users(id),
    job_type     TEXT        NOT NULL CHECK (job_type IN ('brand_onboarding','product_assets')),
    ref_id       UUID,       -- brand_id or product_id
    status       TEXT        DEFAULT 'queued' CHECK (status IN ('queued','running','done','failed')),
    current_step TEXT,       -- Human-readable UI message e.g. "Designing Logo..."
    percent      INT         DEFAULT 0 CHECK (percent BETWEEN 0 AND 100),
    error        TEXT,       -- Artisan-friendly error message (may be in Hindi)
    updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 5. Craft Chunks (RAG Vector Store) ───────────────────────────────────────
CREATE TABLE craft_chunks (
    id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    craft_id   TEXT        NOT NULL,
    chunk_text TEXT        NOT NULL,
    embedding  vector(384)
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX idx_brands_user_id    ON brands(user_id);
CREATE INDEX idx_products_brand_id ON products(brand_id);
CREATE INDEX idx_jobs_user_id      ON jobs(user_id);
CREATE INDEX idx_jobs_ref_id       ON jobs(ref_id);
CREATE INDEX idx_craft_chunks_craft ON craft_chunks(craft_id);

-- Vector similarity search index (IVFFlat — good for up to 1M rows)
CREATE INDEX idx_craft_chunks_embedding ON craft_chunks
    USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ─── Supabase RPC for pgvector search ─────────────────────────────────────────
-- This function is called by the RAG retriever for similarity search.
CREATE OR REPLACE FUNCTION match_craft_chunks(
    query_embedding vector(384),
    match_craft_id  TEXT,
    match_count     INT DEFAULT 4
)
RETURNS TABLE (
    id         UUID,
    craft_id   TEXT,
    chunk_text TEXT,
    similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        cc.id,
        cc.craft_id,
        cc.chunk_text,
        1 - (cc.embedding <=> query_embedding) AS similarity
    FROM craft_chunks cc
    WHERE cc.craft_id = match_craft_id
    ORDER BY cc.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- Migration: additive schema changes for richer brand and product onboarding.
ALTER TABLE brands
    ADD COLUMN IF NOT EXISTS artisan_name TEXT,
    ADD COLUMN IF NOT EXISTS region TEXT,
    ADD COLUMN IF NOT EXISTS preferred_language TEXT DEFAULT 'hi',
    ADD COLUMN IF NOT EXISTS reference_images TEXT[] DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS generations_in_craft INTEGER DEFAULT 1,
    ADD COLUMN IF NOT EXISTS years_of_experience INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS primary_occasion TEXT DEFAULT 'general',
    ADD COLUMN IF NOT EXISTS target_customer TEXT DEFAULT 'local',
    ADD COLUMN IF NOT EXISTS brand_feel TEXT DEFAULT 'earthy',
    ADD COLUMN IF NOT EXISTS artisan_story TEXT,
    ADD COLUMN IF NOT EXISTS script_preference TEXT DEFAULT 'both',
    ADD COLUMN IF NOT EXISTS visual_summary TEXT,
    ADD COLUMN IF NOT EXISTS visual_motifs JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS signature_patterns JSONB DEFAULT '[]'::jsonb;

ALTER TABLE products
    ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'apparel',
    ADD COLUMN IF NOT EXISTS occasion TEXT DEFAULT 'general',
    ADD COLUMN IF NOT EXISTS time_to_make_hrs INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS description_voice TEXT,
    ADD COLUMN IF NOT EXISTS category_data JSONB DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS kit_zip_url TEXT,
    ADD COLUMN IF NOT EXISTS story_card_url TEXT,
    ADD COLUMN IF NOT EXISTS certificate_url TEXT;

-- Migration: allow targeted brand regeneration jobs in existing projects.
ALTER TABLE jobs
    DROP CONSTRAINT IF EXISTS jobs_job_type_check;

ALTER TABLE jobs
    ADD CONSTRAINT jobs_job_type_check
    CHECK (job_type IN ('brand_onboarding', 'brand_asset_regeneration', 'product_assets'));
