INSERT INTO rooms (name, code)
VALUES ('Main', 'local')
ON CONFLICT(code) DO UPDATE SET name = excluded.name;
