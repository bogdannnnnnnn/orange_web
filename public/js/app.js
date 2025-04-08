document.addEventListener("DOMContentLoaded", () => {
  let userRole = null;
  let updateInterval = null;

  function restoreSession() {
    const savedCode = localStorage.getItem('accessCode');
    if (!savedCode) {
      document.getElementById("login-section").style.display = "flex";
      return;
    }

    verifyCode(savedCode);
  }

  function verifyCode(code) {
    fetch("/api/verify-code", {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    })
    .then(response => response.json())
    .then(data => {
      if (data.valid) {
        initializeUI(data.role, code);
      } else {
        handleInvalidCode();
      }
    })
    .catch(error => handleError(error));
  }

  function initializeUI(role, code) {
    userRole = role;
    localStorage.setItem('accessCode', code);
    document.getElementById("login-section").style.display = "none";
    document.getElementById("main-ui").style.display = "block";
    document.getElementById("tab-add-sensor").style.display = role === 'user' ? "none" : "";
    ymaps.ready(initMap);
    
    // Запускаем интервал обновления
    updateInterval = setInterval(fetchSensors, 2000);
  }

  function handleInvalidCode() {
    localStorage.removeItem('accessCode');
    document.getElementById("login-section").style.display = "flex";
    document.getElementById("login-error").textContent = "Неверный код. Попробуйте снова.";
  }

  function handleError(error) {
    console.error('Ошибка:', error);
    localStorage.removeItem('accessCode');
    document.getElementById("login-section").style.display = "flex";
    document.getElementById("login-error").textContent = "Ошибка проверки кода. Попробуйте позже.";
  }

  restoreSession();

  const loginBtn = document.getElementById("login-btn");
  const loginCodeInput = document.getElementById("login-code");
  const toggleCodeBtn = document.getElementById("toggle-code-visibility");

  loginBtn.addEventListener("click", function () {
    const code = loginCodeInput.value.trim();
    verifyCode(code);
  });

  loginCodeInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      loginBtn.click();
    }
  });

  toggleCodeBtn.addEventListener("click", function () {
    if (loginCodeInput.type === "password") {
      loginCodeInput.type = "text";
      toggleCodeBtn.textContent = "Скрыть";
    } else {
      loginCodeInput.type = "password";
      toggleCodeBtn.textContent = "Показать";
    }
  });

  const darkModeToggle = document.getElementById("dark-mode-toggle");
  let isDarkMode = false;
  darkModeToggle.addEventListener("click", function () {
    isDarkMode = !isDarkMode;
    document.body.classList.toggle("dark-mode", isDarkMode);
    darkModeToggle.textContent = isDarkMode ? "Светлая тема" : "Тёмная тема";
  });

  let sensors = [];
  let myMap;
  const fetchInterval = 2000;

  function initMap() {
    myMap = new ymaps.Map("map", {
      center: [0, 0],
      zoom: 2,
      controls: [],
    });
    fetchSensors();
  }

  function fetchSensors() {
    fetch("/api/sensors")
      .then((response) => response.json())
      .then((data) => {
        sensors = data.sensors || [];
        addPlacemarks();
        populateTables();
        if (document.getElementById("charts-section").style.display === "block") {
          updateChart();
        }
      })
      .catch((error) => console.error("Ошибка загрузки данных:", error));
  }

  function addPlacemarks() {
    myMap.geoObjects.removeAll();
    sensors.forEach((sensor) => {
      if (!document.querySelector(`.filter[value="${sensor.type}"]`).checked)
        return;
      let placemark = new ymaps.Placemark(
        [sensor.lat, sensor.lng],
        {
          hintContent: sensor.name,
          balloonContent: `<strong>${sensor.name}</strong><br>ID: ${sensor.id}<br>Тип: ${getSensorTypeName(sensor.type)}`,
        },
        {
          preset: "islands#icon",
          iconColor: "#0095b6",
        }
      );
      myMap.geoObjects.add(placemark);
    });
  }

  function getSensorTypeName(type) {
    switch (type) {
      case "airQuality":
        return "Качество воздуха";
      case "rain":
        return "Дождь";
      case "dust":
        return "Количество пыли";
      case "environmental":
        return "Окружающая среда";
      default:
        return type;
    }
  }

  function formatDateTime(isoString) {
    const date = new Date(isoString);
    const options = {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZone: 'Europe/Moscow'
    };
    return new Intl.DateTimeFormat('ru-RU', options)
      .format(date)
      .replace(',', '');
  }

  function populateTables() {
    const tables = {
        airQuality: document.querySelector("#content-airQuality tbody"),
        rain: document.querySelector("#content-rain tbody"),
        dust: document.querySelector("#content-dust tbody"),
        environmental: document.querySelector("#content-environmental tbody")
    };

    Object.keys(tables).forEach(type => {
        if (tables[type]) tables[type].innerHTML = "";
    });

    const entriesByType = sensors.reduce((acc, sensor) => {
        if (!sensor.history || !sensor.history.length) return acc;
        
        acc[sensor.type] = acc[sensor.type] || [];
        sensor.history.forEach(entry => {
            acc[sensor.type].push({
                id: sensor.id,
                name: sensor.name,
                lat: sensor.lat,
                lng: sensor.lng,
                time: entry.time,
                data: entry.data,
                type: sensor.type
            });
        });
        return acc;
    }, {});

    Object.entries(entriesByType).forEach(([type, entries]) => {
        if (tables[type]) {
            entries
                .sort((a, b) => new Date(b.time) - new Date(a.time))
                .forEach(entry => {
                    tables[type].innerHTML += createTableRow(entry);
                });
        }
    });
}

  function createTableRow(entry) {
    if (entry.type === 'environmental') {
        let data;
        try {
            data = typeof entry.data === 'string' ? JSON.parse(entry.data) : entry.data;
        } catch (e) {
            console.error('Error parsing environmental data:', e);
            return '';
        }

        const environmentalData = {
            pm25: data.pm25 || 0,
            pm10: data.pm10 || 0,
            temperature: data.temperature || 0,
            humidity: data.humidity || 0,
            pressure: data.pressure || 0
        };

        return `<tr>
            <td>${entry.id}</td>
            <td>${entry.name}</td>
            <td>${entry.lat}</td>
            <td>${entry.lng}</td>
            <td>${formatDateTime(entry.time)}</td>
            <td>${environmentalData.pm25}</td>
            <td>${environmentalData.pm10}</td>
            <td>${environmentalData.temperature}</td>
            <td>${environmentalData.humidity}</td>
            <td>${environmentalData.pressure}</td>
        </tr>`;
    } else {
        return `<tr>
            <td>${entry.id}</td>
            <td>${entry.name}</td>
            <td>${entry.lat}</td>
            <td>${entry.lng}</td>
            <td>${formatDateTime(entry.time)}</td>
            <td>${entry.data}</td>
        </tr>`;
    }
}

  document.querySelectorAll(".filter").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      addPlacemarks();
      populateTables();
    });
  });

  document.getElementById("tab-map").addEventListener("click", (e) => {
    e.preventDefault();
    document.getElementById("map-section").style.display = "block";
    document.getElementById("table-section").style.display = "none";
    document.getElementById("add-sensor-section").style.display = "none";
    document.getElementById("charts-section").style.display = "none";
  
    document.getElementById("tab-map").classList.add("active");
    document.getElementById("tab-table").classList.remove("active");
    document.getElementById("tab-add-sensor").classList.remove("active");
    document.getElementById("tab-charts").classList.remove("active");
  });
  

  document.getElementById("tab-table").addEventListener("click", (e) => {
    e.preventDefault();
    document.getElementById("map-section").style.display = "none";
    document.getElementById("table-section").style.display = "block";
    document.getElementById("add-sensor-section").style.display = "none";
    document.getElementById("charts-section").style.display = "none";
  
    document.getElementById("tab-table").classList.add("active");
    document.getElementById("tab-map").classList.remove("active");
    document.getElementById("tab-add-sensor").classList.remove("active");
    document.getElementById("tab-charts").classList.remove("active");
  });
  
  document.getElementById("tab-add-sensor").addEventListener("click", (e) => {
    e.preventDefault();
    if (userRole === 'user') {
      alert('У вас нет доступа к этой функции');
      return;
    }
    document.getElementById("map-section").style.display = "none";
    document.getElementById("table-section").style.display = "none";
    document.getElementById("add-sensor-section").style.display = "block";
    document.getElementById("charts-section").style.display = "none";
  
    document.getElementById("tab-add-sensor").classList.add("active");
    document.getElementById("tab-map").classList.remove("active");
    document.getElementById("tab-table").classList.remove("active");
    document.getElementById("tab-charts").classList.remove("active");
  });
  
  document.getElementById("tab-charts").addEventListener("click", (e) => {
    e.preventDefault();
    document.getElementById("map-section").style.display = "none";
    document.getElementById("table-section").style.display = "none";
    document.getElementById("add-sensor-section").style.display = "none";
    document.getElementById("charts-section").style.display = "block";
  
    document.getElementById("tab-charts").classList.add("active");
    document.getElementById("tab-map").classList.remove("active");
    document.getElementById("tab-table").classList.remove("active");
    document.getElementById("tab-add-sensor").classList.remove("active");
  
    if (!sensorChart) {
      initChart();
    }
    updateChart();
  });
  
  document.getElementById("tab-add-sensor").addEventListener("click", (e) => {
    e.preventDefault();
    if (userRole === 'user') {
      alert('У вас нет доступа к этой функции');
      return;
    }
    document.getElementById("map-section").style.display = "none";
    document.getElementById("table-section").style.display = "none";
    document.getElementById("add-sensor-section").style.display = "block";
    document.getElementById("tab-add-sensor").classList.add("active");
    document.getElementById("tab-map").classList.remove("active");
    document.getElementById("tab-table").classList.remove("active");
    populateSensorIds();
  });

  document.querySelectorAll("#table-tabs ul li a").forEach((tab) => {
    tab.addEventListener("click", (e) => {
      e.preventDefault();
      document.querySelectorAll("#table-tabs ul li a").forEach((t) =>
        t.classList.remove("active")
      );
      document.querySelectorAll(".table-tab").forEach(
        (content) => (content.style.display = "none")
      );
      tab.classList.add("active");
      const type = tab.getAttribute("data-type");
      document.getElementById("content-" + type).style.display = "block";
    });
  });

  function populateSensorIds() {
    fetch("/api/sensor-ids")
        .then(response => response.json())
        .then(registeredIds => {
            fetch("/api/available-sensor-ids")
                .then(response => response.json())
                .then(availableIds => {
                    const sensorIdSelect = document.getElementById("sensor-id");
                    while (sensorIdSelect.options.length > 1) {
                        sensorIdSelect.remove(1);
                    }

                    registeredIds.forEach(id => {
                        const option = new Option(`${id} (Зарегистрирован)`, id);
                        option.className = 'registered-sensor';
                        sensorIdSelect.add(option);
                    });

                    availableIds
                        .filter(id => !registeredIds.includes(id))
                        .forEach(id => {
                            const option = new Option(`${id} (Не зарегистрирован)`, id);
                            option.className = 'unregistered-sensor';
                            sensorIdSelect.add(option);
                        });
                });
        })
        .catch(error => console.error("Ошибка загрузки ID датчиков:", error));
  }

  function populateSensorForm(sensorId) {
    fetch(`/api/sensor/${sensorId}`)
      .then(response => response.json())
      .then(sensor => {
        document.getElementById("sensor-type").value = sensor.type || '';
        document.getElementById("sensor-lat").value = sensor.lat || '';
        document.getElementById("sensor-lng").value = sensor.lng || '';
        document.getElementById("sensor-name").value = sensor.name || '';
      })
      .catch(error => console.error("Ошибка загрузки данных датчика:", error));
  }

  document.getElementById("sensor-id").addEventListener("change", function(e) {
    if (e.target.value) {
      populateSensorForm(e.target.value);
    }
  });

  document.getElementById("new-sensor-form").addEventListener("submit", function(e) {
    e.preventDefault();
    const sensorId = document.getElementById("sensor-id").value;
    let isNewSensor = true;
    
    const formData = {
      id: sensorId,
      type: document.getElementById("sensor-type").value,
      name: document.getElementById("sensor-name").value,
      lat: parseFloat(document.getElementById("sensor-lat").value),
      lng: parseFloat(document.getElementById("sensor-lng").value)
    };

    const headers = {
      'Content-Type': 'application/json',
      'user-role': userRole
    };

    document.getElementById("new-sensor-error").textContent = "";

    if (!formData.type || !formData.name) {
      document.getElementById("new-sensor-error").textContent = "Заполните все обязательные поля";
      return;
    }

    fetch(`/api/sensor/${sensorId}`)
      .then(response => {
        isNewSensor = response.status === 404;
        if (isNewSensor) {
          return fetch('/api/sensor', {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(formData)
          });
        } else {
          return fetch(`/api/sensor/${sensorId}`, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(formData)
          });
        }
      })
      .then(response => {
        if (response.ok) {
          alert("Датчик успешно " + (isNewSensor ? "добавлен" : "обновлен") + "!");
          fetchSensors();
          if (isNewSensor) {
            document.getElementById("new-sensor-form").reset();
          }
        } else if (response.status === 403) {
          throw new Error('Отказано в доступе. Недостаточно прав.');
        } else {
          throw new Error('Ошибка при ' + (isNewSensor ? "добавлении" : "обновлении") + ' датчика');
        }
      })
      .catch(error => {
        console.error('Ошибка:', error);
        document.getElementById("new-sensor-error").textContent = error.message;
      });
  });

  function downloadCSV(type) {
    const sensorData = sensors.filter(sensor => sensor.type === type);
    if (sensorData.length === 0) {
      alert("Нет данных для скачивания");
      return;
    }
    let header = "";
    if (type === "environmental") {
      header = "ID,Название,Широта,Долгота,Время,PM2.5 мкг/м³,PM10 мкг/м³,Температура °C,Влажность %,Давление mmHg\n";
    } else {
      header = "ID,Название,Широта,Долгота,Время,Данные\n";
    }
    let csvContent = header;
    sensorData.forEach(sensor => {
      sensor.history.forEach(entry => {
        if (entry.data !== null && entry.data !== undefined) {
          const time = formatDateTime(entry.time);
          let rowData = "";
          if (type === "environmental") {
            let data;
            try {
              data = typeof entry.data === 'string' ? JSON.parse(entry.data) : entry.data;
            } catch (e) {
              console.error('Error parsing environmental data for CSV:', e);
              data = { pm25: 0, pm10: 0, temperature: 0, humidity: 0, pressure: 0 };
            }
            rowData = `${sensor.id},${sensor.name},${sensor.lat},${sensor.lng},${time},${data.pm25 || 0},${data.pm10 || 0},${data.temperature || 0},${data.humidity || 0},${data.pressure || 0}\n`;
          } else {
            rowData = `${sensor.id},${sensor.name},${sensor.lat},${sensor.lng},${time},${entry.data}\n`;
          }
          csvContent += rowData;
        }
      });
    });
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `sensors_${type}_${formatDateTime(new Date())}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  document.querySelectorAll('.download-btn').forEach(button => {
    button.addEventListener('click', (e) => {
      const type = e.target.getAttribute('data-type');
      downloadCSV(type);
    });
  });

  document.getElementById("logout-btn").addEventListener("click", function() {
    userRole = null;
    localStorage.removeItem('accessCode');
    document.getElementById("main-ui").style.display = "none";
    document.getElementById("login-section").style.display = "flex";
    document.getElementById("login-code").value = "";
    if (document.getElementById("new-sensor-form")) {
      document.getElementById("new-sensor-form").reset();
    }
    
    if (updateInterval) {
      clearInterval(updateInterval);
      updateInterval = null;
    }
  });

  function updateTabVisibility(role) {
    const addSensorTab = document.getElementById("tab-add-sensor");
    if (role === 'admin') {
      addSensorTab.style.display = '';
    } else {
      addSensorTab.style.display = 'none';
    }
  }

  let sensorChart = null;
  let sensorColors = {}; // NEW: store fixed colors for sensors
  let chartHiddenStates = {}; // NEW: global variable to store chart filters state
  document.getElementById("tab-charts").addEventListener("click", (e) => {
    e.preventDefault();
    document.getElementById("map-section").style.display = "none";
    document.getElementById("table-section").style.display = "none";
    document.getElementById("add-sensor-section").style.display = "none";
    document.getElementById("charts-section").style.display = "block";
    
    document.getElementById("tab-map").classList.remove("active");
    document.getElementById("tab-table").classList.remove("active");
    document.getElementById("tab-add-sensor").classList.remove("active");
    document.getElementById("tab-charts").classList.add("active");
    
    if (!sensorChart) {
      initChart();
    }
    updateChart();
  });

  function initChart() {
    const ctx = document.getElementById('sensorChart').getContext('2d');
    sensorChart = new Chart(ctx, {
      type: 'line',
      data: {
        datasets: []
      },
      options: {
        animation: false, // Отключаем анимацию
        responsive: true,
        scales: {
          x: {
            type: 'time',
            time: {
              tooltipFormat: 'dd.MM.yyyy HH:mm:ss',
              displayFormats: {
                millisecond: 'HH:mm:ss',
                second: 'HH:mm:ss',
                minute: 'HH:mm',
                hour: 'HH:mm'
              }
            },
            title: {
              display: true,
              text: 'Время'
            }
          },
          y: {
            title: {
              display: true,
              text: 'Значение'
            }
          }
        },
        plugins: {
          legend: {
            display: true,
            onClick: (e, legendItem, legend) => {
              const index = legendItem.datasetIndex;
              const meta = sensorChart.getDatasetMeta(index);
              meta.hidden = meta.hidden === null ? !sensorChart.data.datasets[index].hidden : null;
              sensorChart.update();
            }
          }
        }
      }
    });
  }

  function updateChart() {
    if (!sensorChart) return;
    
    sensorChart.data.datasets = [];
    
    sensors.forEach(sensor => {
      if (sensor.history && sensor.history.length > 0) {
        if (sensor.type === 'environmental') {
          const parameters = ['pm25', 'pm10', 'temperature', 'humidity', 'pressure'];
          const colors = {
            pm25: '#FF6384',
            pm10: '#36A2EB',
            temperature: '#FFCE56',
            humidity: '#4BC0C0',
            pressure: '#9966FF'
          };
          
          parameters.forEach(param => {
            const dataPoints = sensor.history
              .map(entry => {
                let data = typeof entry.data === 'string' ? JSON.parse(entry.data) : entry.data;
                return {
                  x: new Date(entry.time),
                  y: data[param]
                };
              })
              .sort((a, b) => a.x - b.x);
  
            sensorChart.data.datasets.push({
              label: `${sensor.name} - ${getParameterName(param)}`,
              data: dataPoints,
              fill: false,
              borderColor: colors[param],
              tension: 0.1,
              hidden: chartHiddenStates.hasOwnProperty(`${sensor.name} - ${getParameterName(param)}`) 
                        ? chartHiddenStates[`${sensor.name} - ${getParameterName(param)}`] 
                        : false
            });
          });
        } else {
          const dataPoints = sensor.history
            .map(entry => ({
              x: new Date(entry.time),
              y: parseFloat(entry.data)
            }))
            .sort((a, b) => a.x - b.x);
          
          // NEW: Use fixed color for each sensor
          if (!sensorColors[sensor.name]) {
            sensorColors[sensor.name] = getRandomColor();
          }
          const fixedColor = sensorColors[sensor.name];
  
          sensorChart.data.datasets.push({
            label: sensor.name,
            data: dataPoints,
            fill: false,
            borderColor: fixedColor, // use stored color
            tension: 0.1,
            hidden: chartHiddenStates.hasOwnProperty(sensor.name) ? chartHiddenStates[sensor.name] : false
          });
        }
      }
    });
    
    sensorChart.update();
    populateChartControls();
  }

  function getParameterName(param) {
    const names = {
      pm25: 'PM2.5 (мкг/м³)',
      pm10: 'PM10 (мкг/м³)',
      temperature: 'Температура (°C)',
      humidity: 'Влажность (%)',
      pressure: 'Давление (mmHg)'
    };
    return names[param] || param;
  }

  function getRandomColor() {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) {
      color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
  }

  function populateChartControls() {
    const controlsContainer = document.getElementById('chart-controls');
    controlsContainer.innerHTML = '';

    const wrapper = document.createElement('div');
    wrapper.className = 'chart-controls-wrapper';
    wrapper.style.display = 'flex';
    wrapper.style.flexDirection = 'column'; // arrange groups vertically

    // Группируем датасеты для environmental по названию датчика
    const groups = {};
    sensorChart.data.datasets.forEach((dataset, index) => {
      const parts = dataset.label.split(' - ');
      if (parts.length === 2) {
        const sensorName = parts[0];
        if (!groups[sensorName]) groups[sensorName] = [];
        groups[sensorName].push({ index, label: parts[1] });
      } else {
        // Для остальных датчиков создаем кнопку напрямую
        const btn = document.createElement('button');
        btn.textContent = dataset.label;
        btn.className = 'chart-toggle-btn';
        btn.style.opacity = dataset.hidden ? 0.5 : 1;
        btn.onclick = () => {
          const meta = sensorChart.getDatasetMeta(index);
          dataset.hidden = !dataset.hidden;
          chartHiddenStates[dataset.label] = dataset.hidden;
          meta.hidden = dataset.hidden;
          sensorChart.update();
          btn.style.opacity = dataset.hidden ? 0.5 : 1;
        };
        wrapper.appendChild(btn);
      }
    });

    // Создаем групповое отображение для environmental датчиков
    for (const sensorName in groups) {
      const groupContainer = document.createElement('div');
      groupContainer.className = 'chart-group';
      groupContainer.style.display = 'block';
      groupContainer.style.marginBottom = '10px';
      
      const groupTitle = document.createElement('span');
      groupTitle.textContent = sensorName;
      groupTitle.style.fontWeight = 'bold';
      groupContainer.appendChild(groupTitle);
      
      const subContainer = document.createElement('div');
      subContainer.style.marginLeft = '20px';
      subContainer.style.display = 'block';
      groups[sensorName].forEach(item => {
        const ds = sensorChart.data.datasets[item.index];
        const btn = document.createElement('button');
        btn.textContent = item.label;
        btn.className = 'chart-toggle-btn';
        btn.style.opacity = ds.hidden ? 0.5 : 1;
        btn.onclick = () => {
          const meta = sensorChart.getDatasetMeta(item.index);
          ds.hidden = !ds.hidden;
          chartHiddenStates[ds.label] = ds.hidden;
          meta.hidden = ds.hidden;
          sensorChart.update();
          btn.style.opacity = ds.hidden ? 0.5 : 1;
        };
        subContainer.appendChild(btn);
      });
      groupContainer.appendChild(subContainer);
      wrapper.appendChild(groupContainer);
    }
    
    controlsContainer.appendChild(wrapper);
  }

  if (document.getElementById("charts-section").style.display !== "none" && sensorChart) {
    updateChart();
  }

  function renderChart() {
    const datasets = sensors.map(sensor => {
      let dataPoints = [];
      if (sensor.history && sensor.history.length) {
        dataPoints = sensor.history
          .map(entry => ({ x: new Date(entry.time), y: parseFloat(entry.data) }))
          .sort((a, b) => a.x - b.x);
      }
      return {
        label: sensor.name || sensor.id,
        data: dataPoints,
        fill: false,
        borderColor: getRandomColor(),
        tension: 0.1,
        hidden: false
      };
    });
    const ctx = document.getElementById('sensorChart').getContext('2d');
    if (sensorChart) {
      sensorChart.data.datasets = datasets;
      sensorChart.update();
    } else {
      sensorChart = new Chart(ctx, {
        type: 'line',
        data: { datasets },
        options: {
          responsive: true,
          plugins: {
            legend: {
              display: true,
              onClick: (e, legendItem) => {
                const index = legendItem.datasetIndex;
                const meta = sensorChart.getDatasetMeta(index);
                meta.hidden = meta.hidden === null ? !dataset.hidden : null;
                sensorChart.update();
                updateChartControls();
              }
            }
          },
          scales: {
            x: {
              type: 'time',
              time: { tooltipFormat: 'dd.MM.yyyy HH:mm:ss' },
              title: { display: true, text: 'Время' }
            },
            y: {
              title: { display: true, text: 'Значение' }
            }
          }
        }
      });
    }
    updateChartControls();
  }

  function updateChartControls() {
    const controlsContainer = document.getElementById('chart-controls');
    controlsContainer.innerHTML = '';
    sensorChart.data.datasets.forEach((dataset, index) => {
      const btn = document.createElement('button');
      btn.textContent = dataset.label;
      btn.style.marginRight = '5px';
      btn.onclick = () => {
        const meta = sensorChart.getDatasetMeta(index);
        meta.hidden = meta.hidden === null ? !dataset.hidden : null;
        sensorChart.update();
        btn.style.opacity = meta.hidden ? 0.5 : 1;
      };
      controlsContainer.appendChild(btn);
    });
  }
});
