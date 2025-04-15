const mqtt = require('mqtt');

const brokerUrl = 'mqtt://192.168.1.202';
const client = mqtt.connect(brokerUrl);

const generateRandomId = () => Array.from({length: 16}, () => 
  Math.floor(Math.random() * 16).toString(16)
).join('');

const sensorConfigs = {
  airQuality: { id: generateRandomId(), min: 30, max: 40, interval: 10000 },
  dust: { id: generateRandomId(), min: 50, max: 150, interval: 12000 },
  rain: { id: generateRandomId(), min: 0, max: 25, interval: 15000 },
  environmental: { 
    id: "00:15:5D:BA:1E:76", 
    interval: 15000, 
    generateData: () => {
      const date = "00:00:00";
      const pm25 = (Math.random() * (15 - 10) + 10).toFixed(2);
      const pm10 = (Math.random() * (20 - 14) + 14).toFixed(2);
      const temperature = (Math.random() * (25 - 23) + 23).toFixed(2);
      const humidity = (Math.random() * (35 - 30) + 30).toFixed(2);
      const pressure = (Math.random() * (755 - 750) + 750).toFixed(2);
      return `${date},${pm25},${pm10},${temperature},${humidity},${pressure}`;
    }
  }
};

console.log('Connecting to broker:', brokerUrl);
console.log('Using sensor IDs:', sensorConfigs);

client.on('connect', () => {
  console.log('Successfully connected to the MQTT broker');
  const topic = 'mqtt/sensorData';

  Object.entries(sensorConfigs).forEach(([type, config]) => {
    setInterval(() => {
      const value = config.generateData 
        ? config.generateData() 
        : Math.floor(Math.random() * (config.max - config.min + 1)) + config.min;
      const message = JSON.stringify({ id: config.id, value });
      client.publish(topic, message);
      console.log(`${type} message sent:`, message);
    }, config.interval);
  });
});

client.on('error', (err) => {
  console.error('MQTT client error:', err);
});