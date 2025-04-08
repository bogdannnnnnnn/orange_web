const mqtt = require('mqtt');

const brokerUrl = 'mqtt://192.168.1.202';
const client = mqtt.connect(brokerUrl);

const generateRandomId = () => Array.from({length: 16}, () => 
  Math.floor(Math.random() * 16).toString(16)
).join('');

const sensorConfigs = {
  airQuality: { id: generateRandomId(), min: 30, max: 40, interval: 10000 },
  dust: { id: generateRandomId(), min: 50, max: 150, interval: 12000 },
  rain: { id: generateRandomId(), min: 0, max: 25, interval: 15000 }
};

console.log('Connecting to broker:', brokerUrl);
console.log('Using sensor IDs:', sensorConfigs);

client.on('connect', () => {
  console.log('Successfully connected to the MQTT broker');
  const topic = 'mqtt/sensorData';

  Object.entries(sensorConfigs).forEach(([type, config]) => {
    setInterval(() => {
      const value = Math.floor(Math.random() * (config.max - config.min + 1)) + config.min;
      const message = JSON.stringify({ id: config.id, value });
      client.publish(topic, message);
      console.log(`${type} message sent:`, message);
    }, config.interval);
  });
});

client.on('error', (err) => {
  console.error('MQTT client error:', err);
});