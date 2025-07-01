export const UPSERT_LOG_SQL = `
  INSERT INTO logs (email, last_time, online)
  VALUES (?, ?, ?)
  ON CONFLICT(email) DO UPDATE SET
    last_time = excluded.last_time,
    online = excluded.online;
`;


export const SELECT_ALL_LOGS = `
  SELECT * FROM logs ORDER BY last_time DESC;
`;

export const CREATE_LOGS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS logs (
    email      TEXT PRIMARY KEY,
    last_time  INTEGER NOT NULL,
	online     BOOLEAN NOT NULL
  );
`;

export const SET_OFFLINE_SQL = `
  UPDATE logs SET online = 0
  WHERE email = ?;
`;

export const SELECT_BY_EMAILS = (emails: string[]) => `
  SELECT * FROM logs
  WHERE email IN (${emails.map(() => '?').join(', ')})
  ORDER BY last_time DESC
`;

