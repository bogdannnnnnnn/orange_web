document.addEventListener("DOMContentLoaded", () => {
  let userRole = null; // Add this at the top

  // Add session restore function
  function restoreSession() {
    const savedCode = localStorage.getItem('accessCode');
    if (savedCode) {
      fetch("/api/verify-code", {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code: savedCode })
      })
      .then(response => response.json())
      .then(data => {
        if (data.valid) {
          userRole = data.role;
          document.getElementById("login-section").style.display = "none";
          document.getElementById("main-ui").style.display = "block";
          
          if (userRole === 'user') {
            document.getElementById("tab-add-sensor").style.display = "none";
          }
          
          ymaps.ready(initMap);
        } else {
          localStorage.removeItem('accessCode');
          document.getElementById("login-section").style.display = "flex";
        }
      })
      .catch(error => {
        console.error('Ошибка восстановления сессии:', error);
        localStorage.removeItem('accessCode');
        document.getElementById("login-section").style.display = "flex";
      });
    } else {
      document.getElementById("login-section").style.display = "flex";
    }
  }

  // Call restore session on page load
  restoreSession();

  const loginBtn = document.getElementById("login-btn");
  const loginCodeInput = document.getElementById("login-code");
  const toggleCodeBtn = document.getElementById("toggle-code-visibility");

  loginBtn.addEventListener("click", function () {
    const code = loginCodeInput.value.trim();
    
    fetch("/api/verify-code", {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ code })
    })
    .then(response => response.json())
    .then(data => {
      if (data.valid) {
        userRole = data.role; // Store the role
        localStorage.setItem('accessCode', code); // Save code to localStorage
        document.getElementById("login-section").style.display = "none";
        document.getElementById("main-ui").style.display = "block";
        
        // Hide "Add sensor" tab for users
        if (userRole === 'user') {
          document.getElementById("tab-add-sensor").style.display = "none";
        }
        
        ymaps.ready(initMap);
      } else {
        document.getElementById("login-error").textContent = 
          "Неверный код. Попробуйте снова.";
      }
    })
    .catch(error => {
      console.error('Ошибка проверки кода:', error);
      document.getElementById("login-error").textContent = 
        "Ошибка проверки кода. Попробуйте позже.";
    });
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

  // Переключатель тем (Dark/Light Mode)
  const darkModeToggle = document.getElementById("dark-mode-toggle");
  let isDarkMode = false;
  darkModeToggle.addEventListener("click", function () {
    isDarkMode = !isDarkMode;
    document.body.classList.toggle("dark-mode", isDarkMode);
    darkModeToggle.textContent = isDarkMode ? "Светлая тема" : "Тёмная тема";
  });

  // Переменные для работы с датчиками и картой
  let sensors = [];
  let gateways = [];
  let myMap;
  const fetchInterval = 2000;

  function initMap() {
    myMap = new ymaps.Map("map", {
      center: [0, 0],
      zoom: 2,
      controls: [],
    });
    fetchSensors();
    setInterval(fetchSensors, fetchInterval);
  }

  function fetchSensors() {
    fetch("/api/sensors")
      .then((response) => response.json())
      .then((data) => {
        sensors = data.sensors || [];
        gateways = data.rxInfo
          ? data.rxInfo.map((info) => ({
              latitude: info.location.latitude,
              longitude: info.location.longitude,
              name: info.gatewayId,
            }))
          : [];
        addPlacemarks();
        populateTables();
      })
      .catch((error) => console.error("Ошибка загрузки данных:", error));
  }

  function addPlacemarks() {
    myMap.geoObjects.removeAll();
    sensors.forEach((sensor) => {
      // Если фильтр для данного типа датчика выключен, пропускаем его
      if (!document.querySelector(`.filter[value="${sensor.type}"]`).checked)
        return;
      let placemark = new ymaps.Placemark(
        [sensor.lat, sensor.lng],
        {
          hintContent: sensor.name,
          balloonContent: `<strong>${sensor.name}</strong><br>ID: ${sensor.id}<br>Тип: ${getSensorTypeName(
            sensor.type
          )}<br>Данные: ${sensor.data.value} ${sensor.data.unit}`,
        },
        {
          preset: "islands#icon",
          iconColor: "#0095b6",
        }
      );
      myMap.geoObjects.add(placemark);
    });
    gateways.forEach((gateway) => {
      let placemark = new ymaps.Placemark(
        [gateway.latitude, gateway.longitude],
        {
          hintContent: `Шлюз: ${gateway.name}`,
          balloonContent: `<strong>Шлюз</strong><br>ID: ${gateway.name}<br>`,
        },
        {
          preset: "islands#icon",
          iconColor: "#ff0000",
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
      default:
        return type;
    }
  }

  function formatDateTime(isoString) {
    const date = new Date(isoString);
    const options = {
      year: 'numeric',
      month: '2-digit',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZone: 'Europe/Moscow'
    };
    return new Intl.DateTimeFormat('ru-RU', options).format(date);
  }

  function populateTables() {
    const tbodyAir = document.querySelector("#content-airQuality tbody");
    const tbodyRain = document.querySelector("#content-rain tbody");
    const tbodyDust = document.querySelector("#content-dust tbody");
    tbodyAir.innerHTML = "";
    tbodyRain.innerHTML = "";
    tbodyDust.innerHTML = "";

    // Create object to store all entries by type
    const entriesByType = {
      airQuality: [],
      rain: [],
      dust: []
    };

    // Collect all entries
    sensors.forEach((sensor) => {
      sensor.history.forEach((entry) => {
        if (entry.data !== null && entry.data !== undefined) {
          const tableEntry = {
            id: sensor.id,
            name: sensor.name,
            lat: sensor.lat,
            lng: sensor.lng,
            time: new Date(entry.time),
            data: entry.data,
            unit: sensor.data.unit,
            type: sensor.type
          };
          entriesByType[sensor.type].push(tableEntry);
        }
      });
    });

    // Sort entries by time (newest first)
    Object.values(entriesByType).forEach(entries => {
      entries.sort((a, b) => b.time - a.time);
    });

    // Populate tables with sorted data
    entriesByType.airQuality.forEach(entry => {
      tbodyAir.innerHTML += createTableRow(entry);
    });

    entriesByType.rain.forEach(entry => {
      tbodyRain.innerHTML += createTableRow(entry);
    });

    entriesByType.dust.forEach(entry => {
      tbodyDust.innerHTML += createTableRow(entry);
    });
  }

  function createTableRow(entry) {
    return `<tr>
      <td>${entry.id}</td>
      <td>${entry.name}</td>
      <td>${entry.lat}</td>
      <td>${entry.lng}</td>
      <td>${formatDateTime(entry.time)}</td>
      <td>${entry.data} ${entry.unit}</td>
    </tr>`;
  }

  // Обработчики для глобальных фильтров
  document.querySelectorAll(".filter").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      addPlacemarks();
      populateTables();
    });
  });

  // Переключение между основными вкладками
  document.getElementById("tab-map").addEventListener("click", (e) => {
    e.preventDefault();
    document.getElementById("map-section").style.display = "block";
    document.getElementById("table-section").style.display = "none";
    document.getElementById("add-sensor-section").style.display = "none";
    document.getElementById("tab-map").classList.add("active");
    document.getElementById("tab-table").classList.remove("active");
    document.getElementById("tab-add-sensor").classList.remove("active");
  });

  document.getElementById("tab-table").addEventListener("click", (e) => {
    e.preventDefault();
    document.getElementById("map-section").style.display = "none";
    document.getElementById("table-section").style.display = "block";
    document.getElementById("add-sensor-section").style.display = "none";
    document.getElementById("tab-table").classList.add("active");
    document.getElementById("tab-map").classList.remove("active");
    document.getElementById("tab-add-sensor").classList.remove("active");
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
    populateSensorIds(); // Add this line
  });

  // Новая логика переключения субвкладок (таблиц с данными датчиков)
  document.querySelectorAll("#table-tabs ul li a").forEach((tab) => {
    tab.addEventListener("click", (e) => {
      e.preventDefault();
      // Убираем класс active у всех субвкладок
      document.querySelectorAll("#table-tabs ul li a").forEach((t) =>
        t.classList.remove("active")
      );
      // Скрываем все блоки с таблицами
      document.querySelectorAll(".table-tab").forEach(
        (content) => (content.style.display = "none")
      );
      // Добавляем active для нажатой вкладки и отображаем соответствующий контент
      tab.classList.add("active");
      const type = tab.getAttribute("data-type");
      document.getElementById("content-" + type).style.display = "block";
    });
  });

  // Replace existing populateSensorIds function
  function populateSensorIds() {
    // First get registered sensors
    fetch("/api/sensor-ids")
        .then(response => response.json())
        .then(registeredIds => {
            // Then get available sensors
            fetch("/api/available-sensor-ids")
                .then(response => response.json())
                .then(availableIds => {
                    const sensorIdSelect = document.getElementById("sensor-id");
                    // Clear existing options except the first one
                    while (sensorIdSelect.options.length > 1) {
                        sensorIdSelect.remove(1);
                    }

                    // Add registered sensors first with a special marker
                    registeredIds.forEach(id => {
                        const option = new Option(`${id} (Зарегистрирован)`, id);
                        option.className = 'registered-sensor';
                        sensorIdSelect.add(option);
                    });

                    // Add available but unregistered sensors
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

  // Add these functions after populateSensorIds()
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

  // Add event listener for sensor ID selection
  document.getElementById("sensor-id").addEventListener("change", function(e) {
    if (e.target.value) {
      populateSensorForm(e.target.value);
    }
  });

  // Remove duplicate form submission handler and update the existing one
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

    // Common headers for both requests
    const headers = {
      'Content-Type': 'application/json',
      'user-role': userRole // Add user role to headers
    };

    // Clear error message
    document.getElementById("new-sensor-error").textContent = "";

    // Validate required fields
    if (!formData.type || !formData.name) {
      document.getElementById("new-sensor-error").textContent = "Заполните все обязательные поля";
      return;
    }

    // Determine if this is a new sensor or update
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
          // Clear form after successful submission
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

    let csvContent = "ID,Название,Широта,Долгота,Время,Данные,Единицы измерения\n";

    sensorData.forEach(sensor => {
      sensor.history.forEach(entry => {
        if (entry.data !== null && entry.data !== undefined) {
          csvContent += `${sensor.id},${sensor.name},${sensor.lat},${sensor.lng},${formatDateTime(entry.time)},${entry.data},${sensor.data.unit}\n`;
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

  // Add event listeners for download buttons
  document.querySelectorAll('.download-btn').forEach(button => {
    button.addEventListener('click', (e) => {
      const type = e.target.getAttribute('data-type');
      downloadCSV(type);
    });
  });

  // Add logout functionality
  document.getElementById("logout-btn").addEventListener("click", function() {
    userRole = null;
    localStorage.removeItem('accessCode'); // Remove saved code
    document.getElementById("main-ui").style.display = "none";
    document.getElementById("login-section").style.display = "flex";
    document.getElementById("login-code").value = "";
    // Reset any form data
    if (document.getElementById("new-sensor-form")) {
      document.getElementById("new-sensor-form").reset();
    }
  });

  // Add function to handle tab visibility
  function updateTabVisibility(role) {
    const addSensorTab = document.getElementById("tab-add-sensor");
    if (role === 'admin') {
      addSensorTab.style.display = ''; // Show tab
    } else {
      addSensorTab.style.display = 'none'; // Hide tab
    }
  }

  // Modify restore session function
  function restoreSession() {
    const savedCode = localStorage.getItem('accessCode');
    if (savedCode) {
      fetch("/api/verify-code", {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code: savedCode })
      })
      .then(response => response.json())
      .then(data => {
        if (data.valid) {
          userRole = data.role;
          document.getElementById("login-section").style.display = "none";
          document.getElementById("main-ui").style.display = "block";
          updateTabVisibility(userRole);
          ymaps.ready(initMap);
        } else {
          localStorage.removeItem('accessCode');
          document.getElementById("login-section").style.display = "flex";
        }
      })
      .catch(error => {
        console.error('Ошибка восстановления сессии:', error);
        localStorage.removeItem('accessCode');
        document.getElementById("login-section").style.display = "flex";
      });
    } else {
      document.getElementById("login-section").style.display = "flex";
    }
  }

  // Modify login button handler
  loginBtn.addEventListener("click", function () {
    const code = loginCodeInput.value.trim();
    
    fetch("/api/verify-code", {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ code })
    })
    .then(response => response.json())
    .then(data => {
      if (data.valid) {
        userRole = data.role;
        localStorage.setItem('accessCode', code);
        document.getElementById("login-section").style.display = "none";
        document.getElementById("main-ui").style.display = "block";
        updateTabVisibility(userRole);
        ymaps.ready(initMap);
      } else {
        document.getElementById("login-error").textContent = 
          "Неверный код. Попробуйте снова.";
      }
    })
    .catch(error => {
      console.error('Ошибка проверки кода:', error);
      document.getElementById("login-error").textContent = 
        "Ошибка проверки кода. Попробуйте позже.";
    });
  });
});
