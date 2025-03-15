document.addEventListener("DOMContentLoaded", () => {
  // Логика авторизации
  const VALID_CODE = "1234";
  const loginBtn = document.getElementById("login-btn");
  const loginCodeInput = document.getElementById("login-code");
  const toggleCodeBtn = document.getElementById("toggle-code-visibility");

  loginBtn.addEventListener("click", function () {
    const code = loginCodeInput.value.trim();
    if (code === VALID_CODE) {
      document.getElementById("login-section").style.display = "none";
      document.getElementById("main-ui").style.display = "block";
      ymaps.ready(initMap);
    } else {
      document.getElementById("login-error").textContent =
        "Неверный код. Попробуйте снова.";
    }
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
    darkModeToggle.textContent = isDarkMode ? "Light Mode" : "Dark Mode";
  });

  // Переменные для работы с датчиками и картой
  let sensors = [];
  let gateways = [];
  let myMap;
  const fetchInterval = 2000;

  function initMap() {
    myMap = new ymaps.Map("map", {
      center: [55.74624677351348, 37.6189327222528],
      zoom: 15,
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

  function populateTables() {
    const tbodyAir = document.querySelector("#content-airQuality tbody");
    const tbodyRain = document.querySelector("#content-rain tbody");
    const tbodyDust = document.querySelector("#content-dust tbody");
    tbodyAir.innerHTML = "";
    tbodyRain.innerHTML = "";
    tbodyDust.innerHTML = "";

    sensors.forEach((sensor) => {
      sensor.history.slice().reverse().forEach((entry) => {
        let historyRow = `<tr>
                            <td>${sensor.id}</td>
                            <td>${sensor.name}</td>
                            <td>${sensor.lat}</td>
                            <td>${sensor.lng}</td>
                            <td>${entry.time}</td>
                            <td>${entry.data} ${sensor.data.unit}</td>
                          </tr>`;
        switch (sensor.type) {
          case "airQuality":
            tbodyAir.innerHTML += historyRow;
            break;
          case "rain":
            tbodyRain.innerHTML += historyRow;
            break;
          case "dust":
            tbodyDust.innerHTML += historyRow;
            break;
        }
      });
    });
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
    document.getElementById("map-section").style.display = "none";
    document.getElementById("table-section").style.display = "none";
    document.getElementById("add-sensor-section").style.display = "block";
    document.getElementById("tab-add-sensor").classList.add("active");
    document.getElementById("tab-map").classList.remove("active");
    document.getElementById("tab-table").classList.remove("active");
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
});
