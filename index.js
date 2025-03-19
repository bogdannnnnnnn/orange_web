const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const mqtt = require('mqtt');
const readline = require('readline');
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get("/", (req, res) => {
    res.sendFile(path.resolve('./public/index.html'));
});

const pool = new Pool({
    user: 'app_user',
    host: 'localhost',
    database: 'sensor_db',
    password: 'user',
    port: 5432,
});

let sensors = {};
let rxInfo = [];
let gatewayLocation;

function getRandomCoordinate(base, range) {
    return base + (Math.random() - 0.5) * range;
}

function getUnitByType(type) {
    switch (type) {
        case 'rain':
            return 'мм';
        case 'airQuality':
            return 'AQI';
        default:
            return '';
    }
}

app.post("/data", async (req, res) => {
    const sensorData = req.body;
    if (sensorData.data) {
        sensorData.data = Buffer.from(sensorData.data, 'base64').toString('utf-8');
    }
    // Skip if data is null
    if (!sensorData.data) {
        return res.sendStatus(200);
    }
    const sensorId = sensorData.deviceInfo.devEui;
    if (!sensors[sensorId]) {
        sensors[sensorId] = {
            deviceInfo: sensorData.deviceInfo,
            history: [],
        };
    }
    const sensorEntry = {
        time: sensorData.time,
        data: sensorData.data
    };
    sensors[sensorId].history.push(sensorEntry);
    rxInfo = sensorData.rxInfo || [];
    if (rxInfo.length > 0) {
        gatewayLocation = {
            lat: rxInfo[0].location.latitude,
            lng: rxInfo[0].location.longitude
        };
        if (!sensors[sensorId].lat || !sensors[sensorId].lng) {
            sensors[sensorId].lat = getRandomCoordinate(gatewayLocation.lat, 0.01);
            sensors[sensorId].lng = getRandomCoordinate(gatewayLocation.lng, 0.01);
        }
    }
    console.log('Данные датчиков обновлены!');

    try {
        // Skip database insert if data is null
        if (sensorData.data !== null && sensorData.data !== undefined) {
            await pool.query(`
                INSERT INTO sensors (id, type, name, lat, lng, data, unit)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                ON CONFLICT (id) DO UPDATE SET
                    type = EXCLUDED.type,
                    name = EXCLUDED.name,
                    lat = EXCLUDED.lat,
                    lng = EXCLUDED.lng,
                    data = EXCLUDED.data,
                    unit = EXCLUDED.unit
            `, [
                sensorId,
                sensorData.deviceInfo.tags.type,
                sensorData.deviceInfo.deviceName,
                sensors[sensorId].lat,
                sensors[sensorId].lng,
                sensorData.data,
                getUnitByType(sensorData.deviceInfo.tags.type)
            ]);

            await pool.query(`
                INSERT INTO sensor_history (sensor_id, time, data)
                VALUES ($1, $2, $3)
            `, [
                sensorId,
                sensorEntry.time,
                sensorEntry.data
            ]);
        }

        res.sendStatus(200);
    } catch (error) {
        console.error('Ошибка сохранения данных в базу данных:', error);
        res.sendStatus(500);
    }
});

app.get("/api/sensors", async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM sensors');
        const historyResult = await pool.query('SELECT * FROM sensor_history');
        const historyMap = historyResult.rows.reduce((acc, row) => {
            if (!acc[row.sensor_id]) {
                acc[row.sensor_id] = [];
            }
            acc[row.sensor_id].push({ time: row.time, data: row.data });
            return acc;
        }, {});
        const sen = result.rows.map(row => ({
            id: row.id,
            type: row.type,
            name: row.name,
            lat: row.lat,
            lng: row.lng,
            data: { value: row.data, unit: row.unit },
            history: historyMap[row.id] || []
        }));
        res.json({ sensors: sen, rxInfo: rxInfo });
    } catch (error) {
        console.error('Ошибка получения данных из базы данных:', error);
        res.sendStatus(500);
    }
});

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

async function clearTables() {
    try {
        await pool.query('TRUNCATE sensors, sensor_history');
        console.log('Таблицы успешно очищены');
    } catch (error) {
        console.error('Ошибка при очистке таблиц:', error);
    }
}

let mqttClient; // Объявляем переменную в глобальной области

function startServer() {
    rl.question('Хотите очистить таблицы перед запуском? (y/n): ', async (answer) => {
        if (answer.toLowerCase() === 'y') {
            await clearTables();
        }
        
        // Инициализируем MQTT после ответа на вопрос
        mqttClient = mqtt.connect('mqtt://192.168.137.10');

        mqttClient.on('connect', () => {
            console.log('Connected to MQTT broker');
            mqttClient.subscribe('mqtt/airQuality', (err) => {
                if (err) {
                    console.error('Error subscribing to mqtt/airQuality:', err);
                    return;
                }
                console.log('Subscribed to mqtt/airQuality');
            });
        });

        mqttClient.on('message', async (topic, message) => {
            if (topic === 'mqtt/airQuality') {
                try {
                    const data = JSON.parse(message.toString());
                    console.log('Received air quality data:', data);

                    // Skip if value is null
                    if (data.value === null || data.value === undefined) {
                        return;
                    }

                    // Сохраняем данные в БД
                    await pool.query(`
                        INSERT INTO sensors (id, type, name, data, unit)
                        VALUES ($1, $2, $3, $4, $5)
                        ON CONFLICT (id) DO UPDATE SET
                            data = EXCLUDED.data
                    `, [
                        data.id,
                        'airQuality',
                        'Air Quality Sensor MQTT',
                        data.value.toString(),
                        'AQI'
                    ]);

                    await pool.query(`
                        INSERT INTO sensor_history (sensor_id, time, data)
                        VALUES ($1, $2, $3)
                    `, [
                        data.id,
                        new Date().toISOString(),
                        data.value.toString()
                    ]);

                } catch (error) {
                    console.error('Error processing MQTT message:', error);
                }
            }
        });

        app.listen(PORT, () => {
            console.log(`Server is running on port ${PORT}`);
        });
        
        rl.close();
    });
}

startServer();

process.on('SIGINT', () => {
    rl.close();
    mqttClient.end();
    pool.end();
    process.exit();
});

const PORT = 4000;
