document.addEventListener("DOMContentLoaded", () => {
    let sensors = [];
    let gateways = [];
    let myMap; // Объект Яндекс.Карты
    const fetchInterval = 2000;
  
    // Инициализация Яндекс.Карт
    ymaps.ready(initMap);
  
    function initMap() {
      myMap = new ymaps.Map("map", {
        center: [55.74624677351348, 37.6189327222528],
        zoom: 15,
        controls: []
      });
  
      // После инициализации карты загружаем данные датчиков
      fetchSensors();
      setInterval(fetchSensors, fetchInterval); // Периодически запрашиваем данные
    }
  
    // Получение данных с API
    function fetchSensors() {
      fetch('/api/sensors')
        .then(response => response.json())
        .then(data => {
          sensors = data.sensors || [];
          gateways = data.rxInfo ? data.rxInfo.map(info => ({
            latitude: info.location.latitude,
            longitude: info.location.longitude,
            name: info.gatewayId
          })) : [];
          addPlacemarks();
          populateTables();
        })
        .catch(error => console.error('Ошибка загрузки данных:', error));
    }
  
    // Добавление меток на карту
    function addPlacemarks() {
      myMap.geoObjects.removeAll();
      sensors.forEach(sensor => {
        // Отображаем данные только если включён соответствующий фильтр
        if (!document.querySelector(`.filter[value="${sensor.type}"]`).checked) {
          return;
        }
        let placemark = new ymaps.Placemark([sensor.lat, sensor.lng], {
          hintContent: sensor.name,
          balloonContent: `<strong>${sensor.name}</strong><br>ID: ${sensor.id}<br>Тип: ${getSensorTypeName(sensor.type)}<br>Данные: ${sensor.data.value} ${sensor.data.unit}`
        }, {
          preset: 'islands#icon',
          iconColor: '#0095b6'
        });
        myMap.geoObjects.add(placemark);
      });

      gateways.forEach(gateway => {
        let placemark = new ymaps.Placemark([gateway.latitude, gateway.longitude], {
          hintContent: `Шлюз: ${gateway.name}`,
          balloonContent: `<strong>Шлюз</strong><br>ID: ${gateway.name}<br>`
        }, {
          preset: 'islands#icon',
          iconColor: '#ff0000'
        });
        myMap.geoObjects.add(placemark);
      });
    }
  
    // Получение читаемого названия типа датчика
    function getSensorTypeName(type) {
      switch (type) {
        case 'airQuality': return 'Качество воздуха';
        case 'rain': return 'Дождь';
        case 'dust': return 'Количество пыли';
        default: return type;
      }
    }
  
    // Обновление таблиц – заполняем каждую таблицу данными нужного типа
    function populateTables() {
      // Очищаем таблицы
      const tbodyAir = document.querySelector('#content-airQuality tbody');
      const tbodyRain = document.querySelector('#content-rain tbody');
      const tbodyDust = document.querySelector('#content-dust tbody');
      tbodyAir.innerHTML = '';
      tbodyRain.innerHTML = '';
      tbodyDust.innerHTML = '';
  
      sensors.forEach(sensor => {
        // Отображаем данные, если включён фильтр для данного типа
        if (!document.querySelector(`.filter[value="${sensor.type}"]`).checked) {
          return;
        }
        let row = `<tr>
                     <td>${sensor.id}</td>
                     <td>${sensor.name}</td>
                     <td>${sensor.lat}</td>
                     <td>${sensor.lng}</td>
                     <td>${sensor.data.value} ${sensor.data.unit}</td>
                   </tr>`;
        switch (sensor.type) {
          case 'airQuality':
            tbodyAir.innerHTML += row;
            break;
          case 'rain':
            tbodyRain.innerHTML += row;
            break;
          case 'dust':
            tbodyDust.innerHTML += row;
            break;
        }
      });
    }
  
    // Обработчики для глобальных фильтров
    document.querySelectorAll('.filter').forEach(checkbox => {
      checkbox.addEventListener('change', () => {
        addPlacemarks();
        populateTables();
      });
    });
  
    // Обработчики для субвкладок таблиц
    document.querySelectorAll("#table-tabs a").forEach(tabLink => {
      tabLink.addEventListener("click", (e) => {
        e.preventDefault();
        // Снимаем активное состояние со всех субвкладок
        document.querySelectorAll("#table-tabs a").forEach(link => link.classList.remove("active"));
        // Помечаем выбранную вкладку как активную
        tabLink.classList.add("active");
        // Скрываем все блоки с таблицами
        document.querySelectorAll(".table-tab").forEach(content => content.style.display = "none");
        // Показываем блок, соответствующий выбранной вкладке
        const type = tabLink.getAttribute("data-type");
        document.getElementById("content-" + type).style.display = "block";
      });
    });
  
    // Обработчики для скачивания CSV для каждой таблицы
    document.querySelectorAll(".download-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const type = btn.getAttribute("data-type");
        let csvContent = "data:text/csv;charset=utf-8,";
        csvContent += "ID,Название,Широта,Долгота,Данные\n";
        sensors.forEach(sensor => {
          if (sensor.type !== type) return;
          // Если соответствующий фильтр выключен, пропускаем
          if (!document.querySelector(`.filter[value="${sensor.type}"]`).checked) return;
          let row = [
            sensor.id,
            sensor.name,
            sensor.lat,
            sensor.lng,
            `${sensor.data.value} ${sensor.data.unit}`
          ];
          csvContent += row.join(",") + "\n";
        });
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `${type}_data.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      });
    });
  
    // Переключение между основными вкладками "Карта" и "Таблица данных"
    document.getElementById('tab-map').addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById('map-section').style.display = 'block';
      document.getElementById('table-section').style.display = 'none';
      document.getElementById('tab-map').classList.add('active');
      document.getElementById('tab-table').classList.remove('active');
      if (myMap) {
        myMap.container.fitToViewport();
      }
    });
  
    document.getElementById('tab-table').addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById('map-section').style.display = 'none';
      document.getElementById('table-section').style.display = 'block';
      document.getElementById('tab-table').classList.add('active');
      document.getElementById('tab-map').classList.remove('active');
    });
});
