const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const mqtt = require('mqtt');
const readline = require('readline');
const fs = require('fs');
const app = express();

const accessCodes = JSON.parse(fs.readFileSync(path.join(__dirname, 'config', 'access-codes.json'), 'utf8'));

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
let knownSensorIds = [];

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
            return 'мг/м3';
    }
}

async function sensorExists(id) {
    const result = await pool.query('SELECT EXISTS(SELECT 1 FROM sensors WHERE id = $1)', [id]);
    return result.rows[0].exists;
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

    // Add ID to known sensors if not exists
    if (!knownSensorIds.includes(sensorId)) {
        knownSensorIds.push(sensorId);
    }

    try {
        // Check if sensor exists before processing data
        const exists = await sensorExists(sensorId);
        if (!exists) {
            console.log('Датчик не добавлен в систему:', sensorId);
            return res.sendStatus(200);
        }

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
                    INSERT INTO sensors (id, data)
                    VALUES ($1, $2)
                    ON CONFLICT (id) DO UPDATE SET
                        data = EXCLUDED.data
                `, [
                    sensorId,
                    sensorData.data,
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
    } catch (error) {
        console.error('Ошибка проверки существования датчика:', error);
        res.sendStatus(500);
    }
});

app.post("/api/verify-code", (req, res) => {
    const { code } = req.body;
    const validCode = accessCodes.codes.find(c => c.code === code);
    if (validCode) {
        res.json({ valid: true, role: validCode.role });
    } else {
        res.json({ valid: false });
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

app.get("/api/sensor-ids", async (req, res) => {
    try {
        const result = await pool.query('SELECT id FROM sensors');
        res.json(result.rows.map(row => row.id));
    } catch (error) {
        console.error('Ошибка получения ID датчиков:', error);
        res.sendStatus(500);
    }
});

app.get("/api/sensor/:id", async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM sensors WHERE id = $1', [req.params.id]);
        if (result.rows.length > 0) {
            res.json(result.rows[0]);
        } else {
            res.status(404).json({ error: 'Sensor not found' });
        }
    } catch (error) {
        console.error('Ошибка получения данных датчика:', error);
        res.sendStatus(500);
    }
});

// Add role check middleware
function checkAdminRole(req, res, next) {
    const role = req.headers['user-role'];
    if (role !== 'admin') {
        return res.status(403).json({ error: 'Access denied' });
    }
    next();
}

// Add role check to sensor management endpoints
app.post("/api/sensor/:id", checkAdminRole, async (req, res) => {
    try {
        const { type, name, lat, lng } = req.body;
        await pool.query(`
            UPDATE sensors 
            SET type = $1, name = $2, lat = $3, lng = $4
            WHERE id = $5
        `, [type, name, lat, lng, req.params.id]);
        res.sendStatus(200);
    } catch (error) {
        console.error('Ошибка обновления датчика:', error);
        res.sendStatus(500);
    }
});

// Add role check to sensor management endpoints
app.post("/api/sensor", checkAdminRole, async (req, res) => {
    try {
        const { id, type, name, lat, lng } = req.body;
        await pool.query(`
            INSERT INTO sensors (id, type, name, lat, lng, unit)
            VALUES ($1, $2, $3, $4, $5, $6)
        `, [id, type, name, lat, lng, getUnitByType(type)]);
        res.sendStatus(200);
    } catch (error) {
        console.error('Ошибка добавления датчика:', error);
        res.sendStatus(500);
    }
});

app.get("/api/available-sensor-ids", (req, res) => {
    res.json(knownSensorIds);
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
            console.log('Подключено к MQTT брокеру');
            mqttClient.subscribe('mqtt/sensorData', (err) => {
                if (err) {
                    console.error('Ошибка подписки на mqtt/sensorData:', err);
                    return;
                }
                console.log('Подписка на mqtt/sensorData выполнена');
            });
        });

        mqttClient.on('message', async (topic, message) => {
            if (topic === 'mqtt/sensorData') {
                try {
                    const data = JSON.parse(message.toString());
                    console.log('Получены данные с датчика:', data);

                    // Add ID to known sensors if not exists
                    if (data.id && !knownSensorIds.includes(data.id)) {
                        knownSensorIds.push(data.id);
                    }

                    // Skip if value is null or sensor doesn't exist
                    if (data.value === null || data.value === undefined) {
                        return;
                    }

                    const exists = await sensorExists(data.id);
                    if (!exists) {
                        console.log('MQTT датчик не добавлен в систему:', data.id);
                        return;
                    }

                    await pool.query(`
                        UPDATE sensors 
                        SET data = $1
                        WHERE id = $2
                    `, [
                        data.value.toString(),
                        data.id
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
                    console.error('Ошибка обработки MQTT сообщения:', error);
                }
            }
        });

        app.listen(PORT, () => {
            console.log(`Сервер запущен на порту ${PORT}`);
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
