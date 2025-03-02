const express = require('express');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get("/", (req, res) => {
    res.sendFile(path.resolve('./public/index.html'));
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

app.post("/data", (req, res) => {
    const sensorData = req.body;
    if (sensorData.data) {
        sensorData.data = Buffer.from(sensorData.data, 'base64').toString('utf-8');
    }
    const sensorId = sensorData.deviceInfo.devEui;
    if (!sensors[sensorId]) {
        sensors[sensorId] = {
            deviceInfo: sensorData.deviceInfo,
            history: [],
            lat: gatewayLocation && !isNaN(gatewayLocation.lat) ? getRandomCoordinate(gatewayLocation.lat, 0.01) : null,
            lng: gatewayLocation && !isNaN(gatewayLocation.lng) ? getRandomCoordinate(gatewayLocation.lng, 0.01) : null
        };
    }
    sensors[sensorId].history.push({
        time: sensorData.time,
        data: sensorData.data
    });
    rxInfo = sensorData.rxInfo || [];
    if (rxInfo.length > 0) {
        gatewayLocation = {
            lat: rxInfo[0].location.latitude,
            lng: rxInfo[0].location.longitude
        };
    }
    console.log('Данные датчиков обновлены:', sensors);
    res.sendStatus(200);
});

app.get("/api/sensors", (req, res) => {
    const sen = Object.keys(sensors).map(sensorId => {
        const sensor = sensors[sensorId];
        const latestData = sensor.history[sensor.history.length - 1];
        const unit = getUnitByType(sensor.deviceInfo.tags.type);
        let lat = sensor.lat;
        let lng = sensor.lng;
        if (lat === null || lng === null) {
            lat = gatewayLocation && !isNaN(gatewayLocation.lat) ? getRandomCoordinate(gatewayLocation.lat, 0.01) : 'N/A';
            lng = gatewayLocation && !isNaN(gatewayLocation.lng) ? getRandomCoordinate(gatewayLocation.lng, 0.01) : 'N/A';
            sensor.lat = lat;
            sensor.lng = lng;
        }
        return {
            id: sensor.deviceInfo.devEui,
            type: sensor.deviceInfo.tags.type,
            name: sensor.deviceInfo.deviceName,
            lat: lat,
            lng: lng,
            data: { value: latestData.data, unit: unit }
        };
    });
    res.json({ sensors: sen, rxInfo: rxInfo });
});

const PORT = 4000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
