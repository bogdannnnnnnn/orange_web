const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get("/", (req, res) => {
    res.sendFile(path.resolve('./public/index.html'));
});

const pool = new Pool({
    user: 'app_user',
    host: '172.18.10.144',
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
    console.log('Данные датчиков обновлены:', sensors);

    try {
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

const PORT = 4000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
