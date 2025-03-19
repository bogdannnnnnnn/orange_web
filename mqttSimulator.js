const mqtt = require('mqtt');

const brokerUrl = 'mqtt://192.168.137.10';
const client = mqtt.connect(brokerUrl);

function generateRandomId() {
    return Array.from({length: 16}, () => 
        Math.floor(Math.random() * 16).toString(16)
    ).join('');
}

// Create IDs for three different sensors
const sensorIds = {
    airQuality: generateRandomId(),
    dust: generateRandomId(),
    rain: generateRandomId()
};

console.log('Connecting to Mossad servers:', brokerUrl);
client.on('connect', () => {
    console.log('Successfully connected to the MQTT broker');
    console.log('Using sensor IDs:', sensorIds);

    const topic = 'mqtt/sensorData';

    // Air Quality Sensor (30-40 AQI)
    setInterval(() => {
        const airQuality = Math.floor(Math.random() * 11) + 30;
        const message = JSON.stringify({ 
            id: sensorIds.airQuality,
            value: airQuality 
        });
        client.publish(topic, message);
        console.log(`AirQuality message sent: ${message}`);
    }, 10000);

    // Dust Sensor (50-150 мг/м3)
    setInterval(() => {
        const dustLevel = Math.floor(Math.random() * 101) + 50;
        const message = JSON.stringify({ 
            id: sensorIds.dust,
            value: dustLevel
        });
        client.publish(topic, message);
        console.log(`Dust message sent: ${message}`);
    }, 12000);

    // Rain Sensor (0-25 мм)
    setInterval(() => {
        const rainfall = Math.floor(Math.random() * 26);
        const message = JSON.stringify({ 
            id: sensorIds.rain,
            value: rainfall
        });
        client.publish(topic, message);
        console.log(`Rain message sent: ${message}`);
    }, 15000);
});

client.on('error', (err) => {
    console.error('MQTT client error:', err);
});