# Orange Web — мониторинг окружающей среды на Orange Pi PC

> **Быстрый старт & полное руководство по развёртыванию**


---

## 📜 О проекте

**Orange Web** — открытая платформа для гражданской науки и мобильных экспедиций, собирающая телеметрию (температура, влажность, PM2.5, CO₂ и др.) с беспроводных датчиков (LoRa / MQTT) и показывающая её в браузере в режиме реального времени. Главные цели:

<table>
<tr><th align="left">Backend</th><td>Node .js 20 LTS + Express</td></tr>
<tr><th align="left">MQTT‑брокер</th><td>Mosquitto 2.x</td></tr>
<tr><th align="left">База данных</th><td>PostgreSQL 16 (+ PostGIS опц.)</td></tr>
<tr><th align="left">Фронтенд</th><td>HTML + Vanilla JS (+ Yandex Maps API, Chart.js)</td></tr>
<tr><th align="left">Аппаратная база</th><td>Orange Pi PC (Allwinner H3) + LoRaWAN ESP32 шлюз</td></tr>
</table>

---

## ⚡️ Быстрый старт (Armbian v25.5 Noble, ARM 64/32)

```bash
# 1. Подготовка системы
sudo apt update && sudo apt upgrade -y
sudo apt install -y git build-essential curl ufw

# 2. Node.js 20  (NodeSource)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# 3. PostgreSQL 16
sudo apt install -y postgresql postgresql-contrib
sudo systemctl enable --now postgresql

# 4. Mosquitto MQTT
sudo apt install -y mosquitto mosquitto-clients
sudo systemctl enable --now mosquitto

# 5. Клонирование проекта
cd /opt && sudo git clone https://github.com/bogdannnnnnnn/orange_web.git
sudo chown -R $USER:$USER orange_web && cd orange_web

# 6. JS‑зависимости
npm ci

# 7. Конфигурация (однажды)
cp .env.example .env             # задайте свои переменные окружения!
cp config/access-codes.json.example config/access-codes.json

# 8. Инициализация базы
npm run db:init                  # создаст БД, таблицы, расширения

# 9. Запуск
npm run start:prod               # или: node index.js
```

Через пару секунд фронтенд будет доступен на `http://<IP‑платы>:4000`  (порт задаётся переменной `PORT`).

### 🤖 Автоматизация

`install.sh` в корне репозитория полностью разворачивает стек (Node + PostgreSQL + Mosquitto) и создаёт systemd‑юниты **orange_web.service** и **orange_simulator.service**. Просто:

```bash
curl -sSL https://raw.githubusercontent.com/bogdannnnnnnn/orange_web/main/install.sh | sudo bash
```

После перезагрузки всё стартует само.

### 🐳 Развёртывание в Docker (необязательный, но удобный способ)

```bash
git clone https://github.com/bogdannnnnnnn/orange_web.git && cd orange_web
cp .env.example .env             # пропишите рабочие пароли
sudo docker compose up -d        # создаст web, db, mqtt
```

> **Docker Compose** экономит время и избавляет от ручных пакетов ― полезно для CI/CD и быстрой проверки PR.

---

## 🛠️ Конфигурирование

| Файл | Назначение |
|------|------------|
| **.env** | Единая точка настройки: `DATABASE_URL`, `MQTT_URL`, `PORT`, `YANDEX_MAPS_APIKEY`, `ACCESS_CODES_PATH` |
| **.env.example** | Пример значений для переменных окружения |
| **config/access-codes.json** | Одноразовые коды авторизации. Добавляйте новые, задавая `role = admin / user`. |
| **config/access-codes.json.example** | Пример файла кодов авторизации |
| **config/mosquitto.conf** | Пример безопасной (password‑file) конфигурации брокера. |

**Совет для продакшна:** отключите `allow_anonymous true` в Mosquitto и включите TLS.

---

## 🛰️ Архитектура

```
[ Датчики ]  --LoRa-->  [ ESP32 LoRaGW ] --MQTT--> [ Mosquitto ]
                                                |
                                                v
                                         [ Node.js API ] --REST--> браузер
                                                |
                                                v
                                           [ PostgreSQL ]
```

* LoRa ⇒ MQTT : шлюз публикует данные в топик `telemetry/#`.
* Node .js подписывается, валидирует JSON, кладёт в БД.
* Фронтенд делает `GET /api/sensors`, отображает карту и графики.

---

## 🗄️ Структура репозитория

```
orange_web/
├── index.js              # главный сервер Express
├── mqttSimulator.js      # генератор тестовых данных
├── install.sh            # автоустановка (Armbian)
├── docker-compose.yml    # альтернативный запуск в контейнерах
├── public/               # фронтенд (HTML + CSS + JS)
├── config/               # *.json и примеры конфигов
└── docs/                 # схемы, баннеры, РПЗ
```

---

## 📖 API

| Метод | URI | Описание |
|-------|-----|----------|
| `GET` | `/api/sensors` | список зарегистрированных сенсоров |
| `GET` | `/api/history/:id?from=...&to=...` | временные ряды показаний |
| `POST` | `/api/sensors` | **(admin)** добавление сенсора |
| `PUT`  | `/api/sensors/:id` | **(admin)** редактирование |
| `DELETE` | `/api/sensors/:id` | **(admin)** удаление |

Ответы ― JSON. Swagger‑описание доступно на `/api/docs` после старта.

---

## 🚀 Дальнейшие улучшения

* **Мультиканальный LoRaWAN‑шлюз** — повысит пропускную способность.
* **PostGIS** — продвинутая геоаналитика прямо в БД.
* **JWT + Refresh tokens** — взамен одноразовых кодов.
* **CI / CD** — GitHub Actions (`docker build`, `armhf` multi‑arch).
* **Unit‑тесты (Vitest)** — > 80 % coverage.
* **Dark Mode** — автоматический от `prefers-color-scheme`.
* **PWA** / offline‑кэш front‑end.

---

## 🤝 Вклад

Pull‑request’ы приветствуются! Описание стиля коммитов и lint‑правил находится в `CONTRIBUTING.md`.

---

## 📜 Лицензия

GPL v3 — свободно использовать, форкать и модифицировать (с сохранением исходности).




# orange_web

Проект представляет собой систему мониторинга данных с датчиков погоды.  
Основные возможности:
- Авторизация с использованием кода доступа
- Отображение данных на интерактивной карте с помощью Яндекс.Карт API
- Просмотр данных в таблицах и графиках с использованием Chart.js
- Добавление и обновление информации о датчиках (доступно для администраторов)
- Поддержка тёмной темы

Используемые технологии:
- Express[readme (1).md](https://github.com/user-attachments/files/20722805/readme.1.md)

- PostgreSQL
- MQTT для симуляции передачи данных с датчиков
- JavaScript, HTML, CSS
