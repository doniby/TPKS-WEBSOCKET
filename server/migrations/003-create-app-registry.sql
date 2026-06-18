-- Migration: Create WS_APP_REGISTRY table for WebSocket app authentication
-- Description: Stores registered application identities (name, secret, allowed channels)
-- Compatible with Oracle 11g
--
-- NOTE: This table was originally created out-of-band in production without a
-- sequence/trigger, which made INSERTs from POST /api/apps fail with
-- ORA-01400 (cannot insert NULL into APP_ID). This migration documents the
-- canonical schema. For an existing table missing the auto-increment, run only
-- the CREATE SEQUENCE + CREATE TRIGGER sections (see README note below).

-- Sequence for primary key (Oracle 11g doesn't support IDENTITY)
CREATE SEQUENCE WS_APP_REGISTRY_SEQ
  START WITH 1
  INCREMENT BY 1
  NOCACHE
  NOCYCLE;

-- Table
CREATE TABLE WS_APP_REGISTRY (
  APP_ID            NUMBER PRIMARY KEY,
  APP_NAME          VARCHAR2(100) NOT NULL UNIQUE,
  APP_SECRET        VARCHAR2(128) NOT NULL,        -- 64-char hex secret (room to spare)
  APP_CHANNELS      VARCHAR2(2000),                -- comma-separated channels; NULL = all
  DESCRIPTION       VARCHAR2(500),
  IS_ACTIVE         NUMBER(1) DEFAULT 1 CHECK (IS_ACTIVE IN (0,1)),
  LAST_CONNECTED_AT TIMESTAMP,
  CREATED_AT        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UPDATED_AT        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Auto-increment trigger (Oracle 11g way)
-- Note: Remove the trailing / if using DBeaver or other GUI tools
CREATE OR REPLACE TRIGGER WS_APP_REGISTRY_TRG
BEFORE INSERT ON WS_APP_REGISTRY
FOR EACH ROW
BEGIN
  IF :NEW.APP_ID IS NULL THEN
    SELECT WS_APP_REGISTRY_SEQ.NEXTVAL INTO :NEW.APP_ID FROM DUAL;
  END IF;
END;

-- Index on active apps for faster lookups
CREATE INDEX IDX_WS_APP_REGISTRY_ACTIVE ON WS_APP_REGISTRY(IS_ACTIVE);

COMMIT;

-- Verification
SELECT APP_ID, APP_NAME, IS_ACTIVE FROM WS_APP_REGISTRY ORDER BY APP_ID;
