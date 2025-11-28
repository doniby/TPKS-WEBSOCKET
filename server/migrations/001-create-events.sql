-- Migration: Create WS_EVENTS table for dynamic event management
-- Description: Stores configurable events with SQL queries and execution intervals
-- Compatible with Oracle 11g

-- Create sequence for primary key (Oracle 11g doesn't support IDENTITY)
CREATE SEQUENCE WS_EVENTS_SEQ
  START WITH 1
  INCREMENT BY 1
  NOCACHE
  NOCYCLE;

-- Create table
CREATE TABLE WS_EVENTS (
  EVENT_ID NUMBER PRIMARY KEY,
  EVENT_NAME VARCHAR2(100) NOT NULL UNIQUE,
  SQL_QUERY CLOB NOT NULL,
  INTERVAL_SECONDS NUMBER NOT NULL CHECK (INTERVAL_SECONDS >= 1),
  IS_ACTIVE NUMBER(1) DEFAULT 1 CHECK (IS_ACTIVE IN (0,1)),
  LAST_EXECUTION_TIME NUMBER, -- milliseconds
  LAST_EXECUTION_STATUS VARCHAR2(20), -- 'success', 'error', 'timeout'
  LAST_EXECUTION_TIMESTAMP TIMESTAMP,
  CREATED_AT TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UPDATED_AT TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create trigger for auto-increment (Oracle 11g way)
-- Note: Remove the / if using DBeaver or other GUI tools
CREATE OR REPLACE TRIGGER WS_EVENTS_TRG
BEFORE INSERT ON WS_EVENTS
FOR EACH ROW
BEGIN
  IF :NEW.EVENT_ID IS NULL THEN
    SELECT WS_EVENTS_SEQ.NEXTVAL INTO :NEW.EVENT_ID FROM DUAL;
  END IF;
END;

-- Create index on active events for faster queries
CREATE INDEX IDX_WS_EVENTS_ACTIVE ON WS_EVENTS(IS_ACTIVE);

-- Seed initial event: Vessel Alongside
INSERT INTO WS_EVENTS (EVENT_NAME, SQL_QUERY, INTERVAL_SECONDS) VALUES (
  'Vessel Alongside',
  'SELECT
    B.VES_NAME AS name,
    A.VES_ID AS id,
    TRIM(B.BERTH_NO) AS berthNo,
    TO_CHAR(B.ACT_BERTH_TS, ''dd/mm/yyyy hh24:mi'') AS berthTime,
    TO_CHAR(B.EST_DEP_TS, ''dd/mm/yyyy hh24:mi'') AS etd,
    NVL(A.BSH_BWT, 0) AS bshBwt,
    NVL(A.BCH_BWT, 0) AS bchBwt,
    NVL(A.BSH_BT, 0) AS bshBt,
    NVL(A.BCH_ET, 0) AS bchEt,
    NVL(va.dischargePercent, 0) AS dischargePercent,
    NVL(va.loadPercent, 0) AS loadPercent,
    va.crane_004,
    va.crane_005,
    va.crane_006,
    va.crane_007,
    va.crane_008,
    va.crane_009,
    va.crane_HM1,
    va.crane_HM2,
    va.PLAN_DISCH,
    va.REAL_DISCH,
    va.PLAN_LOAD,
    va.REAL_LOAD
FROM
    VES_ALONGSIDE1 va
JOIN
    VESSEL_DETAILS B ON va.ID = B.VES_ID
LEFT JOIN
    DASHBOARD_PERFORMANCE_REALTIME A ON va.ID = A.VES_ID
ORDER BY
    B.BERTH_FR_METRE',
  5
);

COMMIT;

-- Verification query
SELECT EVENT_NAME, INTERVAL_SECONDS, IS_ACTIVE FROM WS_EVENTS;
