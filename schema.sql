-- 
-- NISTULA UNIFIED MESSAGING PLATFORM — PostgreSQL Schema

-- TABLE ORDER (respects foreign key dependencies):
--   1. properties
--   2. guests
--   3. reservations
--   4. conversations
--   5. messages
--   6. agent_users
--
-- All primary keys use UUID instead of serial integers.
-- Reason: messages are created across multiple services and channels.
-- UUIDs can be generated at the application layer (as done in Part 1)
-- without a database roundtrip, and they never reveal record counts.
-- 


-- 
-- ENUMS
-- Defined once here so every table uses the same controlled vocabulary.
-- Adding a new channel or status means one ALTER TYPE, not hunting across tables.
-- 

CREATE TYPE source_channel AS ENUM (
    'whatsapp',
    'booking_com',
    'airbnb',
    'instagram',
    'direct'
);

CREATE TYPE message_direction AS ENUM (
    'inbound',   -- guest → Nistula
    'outbound'   -- Nistula → guest
);

CREATE TYPE send_status AS ENUM (
    'auto_sent',      -- confidence >= 0.85, sent without human review
    'agent_sent',     -- human reviewed and approved before sending
    'agent_edited',   -- human edited the AI draft before sending
    'escalated',      -- routed to a human, not yet sent
    'pending'         -- drafted but not yet actioned
);

CREATE TYPE query_type AS ENUM (
    'pre_sales_availability',
    'pre_sales_pricing',
    'post_sales_checkin',
    'special_request',
    'complaint',
    'general_enquiry'
);

CREATE TYPE reservation_status AS ENUM (
    'enquiry',
    'confirmed',
    'checked_in',
    'checked_out',
    'cancelled'
);


-- 
-- TABLE 1: properties
-- Stores each villa/property managed by Nistula.
-- Kept separate from the mock config in Part 1 so the schema can support
-- multiple properties without any code changes.
-- 

CREATE TABLE properties (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    property_code       VARCHAR(50) NOT NULL UNIQUE,
    -- e.g. "villa-b1" — matches the property_id field from the webhook payload

    name                VARCHAR(255) NOT NULL,
    location            VARCHAR(255) NOT NULL,
    bedrooms            SMALLINT NOT NULL CHECK (bedrooms > 0),
    max_guests          SMALLINT NOT NULL CHECK (max_guests > 0),

    base_rate_inr       INTEGER NOT NULL CHECK (base_rate_inr > 0),
    -- nightly rate covering up to base_rate_covers_guests guests

    base_rate_covers_guests SMALLINT NOT NULL DEFAULT 4,
    extra_guest_rate_inr    INTEGER NOT NULL DEFAULT 0,

    check_in_time       TIME NOT NULL DEFAULT '14:00:00',
    check_out_time      TIME NOT NULL DEFAULT '11:00:00',

    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for the webhook lookup by property_code
CREATE INDEX idx_properties_code ON properties (property_code);


-- 
-- TABLE 2: guests
-- One row per unique guest, regardless of which channel they contacted us from.
--
-- DESIGN DECISION — Identity resolution:
-- A guest might message on WhatsApp today and book on Airbnb tomorrow.
-- We need one record to represent them, not two.
--
-- Primary identity key: phone_number (most reliably shared in a WhatsApp-first
-- hospitality context). Email is the secondary fallback.
-- When neither matches an existing record, a new guest row is created and
-- flagged with is_duplicate_suspect = TRUE for manual review.
--
-- This avoids the bigger risk: automatically merging two different guests
-- into one record (a false positive merge is worse than a duplicate).
-- 

CREATE TABLE guests (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Core identity fields used for deduplication
    phone_number        VARCHAR(20) UNIQUE,
    -- stored in E.164 format: +919876543210
    -- UNIQUE but nullable: not every channel provides a phone number

    email               VARCHAR(255) UNIQUE,
    -- nullable: not always available from WhatsApp or Instagram

    -- Profile fields
    full_name           VARCHAR(255) NOT NULL,

    first_seen_channel  source_channel NOT NULL,
    -- records which channel this guest first contacted us from

    is_duplicate_suspect BOOLEAN NOT NULL DEFAULT FALSE,
    -- TRUE when a new guest was created but may already exist under
    -- a different contact detail. Flagged for manual agent review.

    notes               TEXT,
    -- free-text field for agent observations about this guest

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_guests_phone  ON guests (phone_number);
CREATE INDEX idx_guests_email  ON guests (email);
CREATE INDEX idx_guests_name   ON guests (full_name);


-- 
-- TABLE 3: reservations
-- One row per booking. A guest can have multiple reservations across stays.
-- Linked to both a guest and a property.
--
-- DESIGN DECISION — booking_ref:
-- The webhook payload carries a booking_ref (e.g. "NIS-2024-0891").
-- This is stored here as the external reference so messages can be
-- linked to a reservation without knowing the internal UUID.
-- 

CREATE TABLE reservations (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    booking_ref         VARCHAR(50) NOT NULL UNIQUE,
    -- human-readable reference from the webhook, e.g. NIS-2024-0891

    guest_id            UUID NOT NULL REFERENCES guests (id) ON DELETE RESTRICT,
    property_id         UUID NOT NULL REFERENCES properties (id) ON DELETE RESTRICT,

    check_in_date       DATE NOT NULL,
    check_out_date      DATE NOT NULL,
    CHECK (check_out_date > check_in_date),

    num_guests          SMALLINT NOT NULL CHECK (num_guests > 0),
    total_amount_inr    INTEGER,
    -- nullable until a quote is confirmed

    status              reservation_status NOT NULL DEFAULT 'enquiry',

    special_requests    TEXT,
    -- free text for chef bookings, airport transfers, early check-in etc.

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reservations_guest       ON reservations (guest_id);
CREATE INDEX idx_reservations_property    ON reservations (property_id);
CREATE INDEX idx_reservations_booking_ref ON reservations (booking_ref);
CREATE INDEX idx_reservations_dates       ON reservations (check_in_date, check_out_date);


-- 
-- TABLE 4: conversations
-- Groups related messages into a thread.
-- A conversation belongs to one guest and optionally one reservation.
--
-- DESIGN DECISION — why a separate conversations table?
-- Without it, there is no way to group messages into threads or know
-- when a topic started and ended. It also lets a guest have pre-sales
-- conversations (no reservation yet) and post-sales conversations
-- (linked to a specific booking) without mixing them up.
-- 

CREATE TABLE conversations (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    guest_id            UUID NOT NULL REFERENCES guests (id) ON DELETE RESTRICT,
    property_id         UUID NOT NULL REFERENCES properties (id) ON DELETE RESTRICT,

    reservation_id      UUID REFERENCES reservations (id) ON DELETE SET NULL,
    -- nullable: a pre-sales conversation has no reservation yet

    primary_channel     source_channel NOT NULL,
    -- the channel this conversation started on

    is_open             BOOLEAN NOT NULL DEFAULT TRUE,
    -- FALSE once the thread is resolved or the guest has checked out

    opened_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at           TIMESTAMPTZ,
    -- set when is_open → FALSE

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_conversations_guest        ON conversations (guest_id);
CREATE INDEX idx_conversations_reservation  ON conversations (reservation_id);
CREATE INDEX idx_conversations_open         ON conversations (is_open);


-- 
-- TABLE 5: agent_users
-- Internal Nistula team members who review and send messages.
-- Kept minimal — this is not a full auth system.
-- Included because messages need a sent_by reference for outbound tracking.
-- 

CREATE TABLE agent_users (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name           VARCHAR(255) NOT NULL,
    email               VARCHAR(255) NOT NULL UNIQUE,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- 
-- TABLE 6: messages
-- The central table. Every message — inbound or outbound, from any channel —
-- lives here. One table, one source of truth.
--
-- DESIGN DECISION — one table for all messages:
-- Separating by channel (whatsapp_messages, airbnb_messages) would mean
-- running joins across multiple tables for every conversation view, report,
-- or AI training pipeline. A single table with a `source` column keeps
-- queries simple and lets you add a new channel with zero schema changes.
--
-- DESIGN DECISION — inbound vs outbound columns:
-- Inbound messages carry AI fields (query_type, confidence score, drafted reply).
-- Outbound messages carry send tracking fields (send_status, sent_by, agent_edited).
-- Both directions share the same table. Columns that don't apply to a given
-- direction are simply NULL. This is cleaner than two separate tables because
-- a conversation is always a mix of both directions.
-- 

CREATE TABLE messages (
    id                  UUID PRIMARY KEY,
    -- generated by the application layer (Part 1 normaliser), not the DB.
    -- this is the message_id returned by the webhook.

    conversation_id     UUID NOT NULL REFERENCES conversations (id) ON DELETE RESTRICT,
    guest_id            UUID NOT NULL REFERENCES guests (id) ON DELETE RESTRICT,
    -- denormalised from conversation for faster per-guest message queries

    source              source_channel NOT NULL,
    direction           message_direction NOT NULL,
    message_text        TEXT NOT NULL,

    -- -------------------------------------------------------------------------
    -- INBOUND MESSAGE FIELDS (direction = 'inbound')
    -- Populated by the webhook pipeline. NULL for outbound messages.
    -- ------------------------------------------------------------------

    query_type          query_type,
    -- classification result from classifier.js

    ai_confidence_score NUMERIC(4, 3) CHECK (ai_confidence_score BETWEEN 0 AND 1),
    -- e.g. 0.980 — stored to 3 decimal places

    ai_action           VARCHAR(20) CHECK (ai_action IN ('auto_send', 'agent_review', 'escalate')),
    -- the action recommended by the confidence scoring system

    ai_drafted_reply    TEXT,
    -- the full reply text generated by Claude for this inbound message

    -- -------------------------------------------------------------------------
    -- OUTBOUND MESSAGE FIELDS (direction = 'outbound')
    -- Tracks the full lifecycle of a reply. NULL for inbound messages.
    -- -----------------------------------------------------------------

    send_status         send_status,
    -- how this outbound message was handled

    ai_drafted          BOOLEAN NOT NULL DEFAULT FALSE,
    -- TRUE if Claude wrote the initial draft of this outbound message

    agent_edited        BOOLEAN NOT NULL DEFAULT FALSE,
    -- TRUE if a human modified the AI draft before it was sent

    sent_by             UUID REFERENCES agent_users (id) ON DELETE SET NULL,
    -- NULL if auto_sent by the system; agent UUID if a human sent it

    sent_at             TIMESTAMPTZ,
    -- NULL until the message is actually delivered

    -- ------------------------------------------------------------------
    -- LINKING FIELDS
    -- -------------------------------------------------------------------------

    in_reply_to         UUID REFERENCES messages (id) ON DELETE SET NULL,
    -- links an outbound reply to the inbound message it responds to

    external_message_id VARCHAR(255),
    -- the message ID from the source platform (WhatsApp message ID,
    -- Airbnb thread ID, etc.) for deduplication and webhook reconciliation

    -- -------------------------------------------------------------------------
    -- TIMESTAMPS
    -- --------------------------------------------------------------------

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    -- for inbound: when we received it. for outbound: when it was created.
);

CREATE INDEX idx_messages_conversation  ON messages (conversation_id);
CREATE INDEX idx_messages_guest         ON messages (guest_id);
CREATE INDEX idx_messages_direction     ON messages (direction);
CREATE INDEX idx_messages_query_type    ON messages (query_type);
CREATE INDEX idx_messages_send_status   ON messages (send_status);
CREATE INDEX idx_messages_created_at    ON messages (created_at DESC);
CREATE INDEX idx_messages_external_id   ON messages (external_message_id);



-- HARDEST DESIGN DECISION

--
-- The hardest decision was how to identify the same guest across channels
-- (identity resolution) while keeping the schema simple.
--
-- A guest might message on WhatsApp using their phone number, then later
-- make a booking on Airbnb using their email. Without matching these to one
-- guest_id, every report, every conversation history, every AI personalisation
-- is broken — the system thinks they are two different people.
--
-- I considered three options:
--
--   Option A — Match on phone first, email second, create new record otherwise.
--   Option B — Always create a new record and merge duplicates in a background job.
--   Option C — Use a separate identity graph table to map contact points to guests.
--
-- I chose Option A with a safety flag (is_duplicate_suspect).
-- Phone number is the primary key for identity in a WhatsApp-first hospitality
-- context because it is the one identifier guests share on every channel.
-- Email is the fallback. When neither matches, a new guest record is created
-- and flagged so an agent can manually confirm and merge it if needed.
-- I rejected a fully automatic merge because a false positive — merging two
-- different guests into one record — is far more damaging than a duplicate.
-- A human confirming a merge is a one-minute task. Untangling a bad merge
-- can corrupt booking history, refund records, and AI conversation context.
--
