const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const mqtt = require('mqtt');
const readline = require('readline');
const fs = require('fs');
const app = express();

const ip = 'localhost';
const PORT = 4000;

const accessCodes = JSON.parse(fs.readFileSync(path.join(__dirname, 'config', 'access-codes.json'), 'utf8'));

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get("/", (req, res) => {
    res.sendFile(path.resolve('./public/index.html'));
});

const pool = new Pool({
    user: 'app_user',
    host: ip,
    database: 'sensor_db',
    password: 'user',
    port: 5432,
});

let knownSensorIds = [];

async function sensorExists(id) {
    const result = await pool.query('SELECT EXISTS(SELECT 1 FROM sensors WHERE id = $1)', [id]);
    return result.rows[0].exists;
}



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
        const result = await pool.query('SELECT id, type, name, lat, lng FROM sensors');
        
        const latestDataQuery = `
            SELECT DISTINCT ON (sensor_id) 
                sensor_id, 
                data, 
                time 
            FROM sensor_history 
            ORDER BY sensor_id, time DESC
        `;
        const latestData = await pool.query(latestDataQuery);
        
        const historyResult = await pool.query('SELECT sensor_id, time, data FROM sensor_history');
        
        const historyMap = historyResult.rows.reduce((acc, row) => {
            if (!acc[row.sensor_id]) {
                acc[row.sensor_id] = [];
            }
            acc[row.sensor_id].push({ time: row.time, data: row.data });
            return acc;
        }, {});

        const latestDataMap = latestData.rows.reduce((acc, row) => {
            acc[row.sensor_id] = row;
            return acc;
        }, {});

        const sensors = result.rows.map(row => ({
            id: row.id,
            type: row.type,
            name: row.name,
            lat: row.lat,
            lng: row.lng,
            data: latestDataMap[row.id] ? {
                value: latestDataMap[row.id].data
            } : null,
            history: historyMap[row.id] || []
        }));

        res.json({ sensors });
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

function checkAdminRole(req, res, next) {
    const role = req.headers['user-role'];
    if (role !== 'admin') {
        return res.status(403).json({ error: 'Access denied' });
    }
    next();
}

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

app.post("/api/sensor", checkAdminRole, async (req, res) => {
    try {
        const { id, type, name, lat, lng } = req.body;
        await pool.query(`
            INSERT INTO sensors (id, type, name, lat, lng)
            VALUES ($1, $2, $3, $4, $5)
        `, [id, type, name, lat, lng]);
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

let mqttClient;

function startServer() {
    rl.question('Хотите очистить таблицы перед запуском? (y/n): ', async (answer) => {
        if (answer.toLowerCase() === 'y') {
            await clearTables();
        }
        
        mqttClient = mqtt.connect(`mqtt://${ip}:1883`);

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
            if (topic !== 'mqtt/sensorData') return;

            try {
                const data = JSON.parse(message.toString());
                console.log('Получены данные с датчика:', data);

                if (data.id && !knownSensorIds.includes(data.id)) {
                    knownSensorIds.push(data.id);
                }

                await handleSensorData(data);
            } catch (error) {
                console.error('Ошибка обработки MQTT сообщения:', error);
            }
        });

        app.listen(PORT, () => {
            console.log(`Сервер запущен на порту ${PORT}`);
        });
        
        rl.close();
    });
}

async function handleSensorData(data) {
    if (!data.id || !await sensorExists(data.id)) {
        return;
    }

    const typeResult = await pool.query('SELECT type FROM sensors WHERE id = $1', [data.id]);
    const sensorType = typeResult.rows[0]?.type;
    
    const sensorData = sensorType === 'environmental' 
        ? parseEnvironmentalData(data.value)
        : data.value.toString();

    await pool.query(
        'INSERT INTO sensor_history (sensor_id, time, data) VALUES ($1, $2, $3)', 
        [data.id, new Date().toUTCString(), sensorData]
    );
}

function parseEnvironmentalData(value) {
    const [, pm25, pm10, temp, humidity, pressure] = value.split(',');
    return JSON.stringify({
        pm25: parseFloat(pm25),
        pm10: parseFloat(pm10),
        temperature: parseFloat(temp),
        humidity: parseFloat(humidity),
        pressure: parseFloat(pressure)
    });
}

startServer();

process.on('SIGINT', () => {
    rl.close();
    mqttClient.end();
    pool.end();
    process.exit();
});
