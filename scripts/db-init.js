const { Client } = require('pg');

const client = new Client({
    user: 'app_user',
    host: 'localhost',
    database: 'sensor_db',
    password: 'user',
    port: 5432,
});

const sql = `
CREATE TABLE IF NOT EXISTS sensors (
    id TEXT PRIMARY KEY,
    type TEXT,
    name TEXT,
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION
);
CREATE TABLE IF NOT EXISTS sensor_history (
    sensor_id TEXT REFERENCES sensors(id) ON DELETE CASCADE,
    time TIMESTAMP,
    data TEXT,
    PRIMARY KEY (sensor_id, time)
);
`;

async function init() {
    try {
        await client.connect();
        await client.query(sql);
        console.log('Database initialized');
    } catch (err) {
        console.error('Failed to initialize database:', err);
    } finally {
        await client.end();
    }
}

init();
