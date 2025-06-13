const { Client } = require('pg');

async function main() {
  const adminClient = new Client({
    user: 'postgres',
    host: 'localhost',
    password: '',
    port: 5432,
    database: 'postgres'
  });

  await adminClient.connect();

  await adminClient.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'app_user') THEN
        CREATE ROLE app_user LOGIN PASSWORD 'user';
      END IF;
    END
    $$;
  `);

  await adminClient.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT FROM pg_database WHERE datname = 'sensor_db') THEN
        CREATE DATABASE sensor_db OWNER app_user;
      END IF;
    END
    $$;
  `);

  await adminClient.end();

  const userClient = new Client({
    user: 'app_user',
    host: 'localhost',
    password: 'user',
    port: 5432,
    database: 'sensor_db'
  });

  await userClient.connect();

  // Таблица sensors
  await userClient.query(`
    CREATE TABLE IF NOT EXISTS sensors (
      id VARCHAR(64) PRIMARY KEY,
      type VARCHAR(32) NOT NULL,
      name VARCHAR(128) NOT NULL,
      lat DOUBLE PRECISION NOT NULL,
      lng DOUBLE PRECISION NOT NULL
    );
  `);

  // Таблица sensor_history
  await userClient.query(`
    CREATE TABLE IF NOT EXISTS sensor_history (
      id SERIAL PRIMARY KEY,
      sensor_id VARCHAR(64) REFERENCES sensors(id) ON DELETE CASCADE,
      time TIMESTAMP NOT NULL,
      data TEXT NOT NULL
    );
  `);

  await userClient.end();

  console.log('Пользователь, база данных и таблицы успешно созданы!');
}

main().catch(err => {
  console.error('Ошибка инициализации базы данных:', err);
  process.exit(1);
});
