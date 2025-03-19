const mqtt = require('mqtt');

const brokerUrl = 'mqtt://192.168.137.10';
const client = mqtt.connect(brokerUrl);

console.log('Connecting to Mossad servers:', brokerUrl);
client.on('connect', () => {
    console.log('Successfully connected to the MQTT broker');

    const topic = 'mqtt/airQuality';

    setInterval(() => {
        const airQuality = Math.floor(Math.random() * 11) + 30;
        const message = JSON.stringify({ id: '2e621554e543f762', value: airQuality });
        client.publish(topic, message, (err) => {
            if (!err) {
                console.log(`AirQuality message sent: ${message}`);
            } else {
                console.error('Error sending airQuality message:', err);
            }
        });
    }, 30000);
});

client.on('error', (err) => {
    console.error('MQTT client error:', err);
});