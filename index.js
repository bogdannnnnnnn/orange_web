const express = require('express');
const path = require('path');
const app = express();

// Middleware для работы с JSON
app.use(express.json());

// Обслуживание статических файлов из папки public
app.use(express.static(path.join(__dirname, 'public')));

// Основной маршрут для загрузки index.html
app.get("/", (req, res) => {
    res.sendFile(path.resolve('./public/index.html'));
});

// API для получения тестовых данных датчиков
app.get("/api/sensors", (req, res) => {
    const sensors = [
        {
            id: 1,
            type: "airQuality",
            name: "Датчик качества воздуха 1",
            lat: 55.7558,
            lng: 37.6176,
            data: { value: 42, unit: "AQI" }
        },
        {
            id: 2,
            type: "rain",
            name: "Датчик дождя 1",
            lat: 55.7600,
            lng: 37.6200,
            data: { value: 10, unit: "мм" }
        },
        {
            id: 3,
            type: "dust",
            name: "Датчик количества пыли 1",
            lat: 55.7500,
            lng: 37.6300,
            data: { value: 100, unit: "шт" }
        }
        // Можно добавить дополнительные тестовые датчики
    ];
    res.json(sensors);
});

const PORT = 4000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
