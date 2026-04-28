import { RADIUS } from './const.js'

// Проверяем, что это Capacitor (Android-приложение)
if (window.Capacitor?.isNativePlatform?.()) {
  const { StatusBar } = window.Capacitor.Plugins;
  StatusBar.setOverlaysWebView({ overlay: true });
  document.body.classList.add("capacitor-app");
}

const map = L.map('map', { preferCanvas: true }).setView([60.024828, 30.338195], 9)
window.mapInstance = map
document.getElementById('msg').innerHTML = 'Загружаю точки...'
let historyMarkers = []
let archivePoints = []
let buttonsContainer
let historyLines = {}
let litePoints = 0
let hardPoints = 0
let mediumPoints = 0
let atvPoints = 0
let elsePoints = 0
let noInstall = 0

const StartButton = L.Control.extend({
  options: {
    position: 'topright'
  },

  onAdd: function () {
    const container = L.DomUtil.create('div', 'start-button')
    container.innerHTML = '🚀 Играть'

    container.onclick = function () {
      window.open('https://t.me/liteoffroad_bot', '_blank')
    }

    return container
  }
})

map.addControl(new StartButton())

// OSM — базовый слой с кешированием в IndexedDB
const OSM = L.tileLayer.offline('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  opacity: 1
}).addTo(map)

// Автокеширование: при загрузке тайла сохраняем его в IndexedDB
OSM.on('tileload', async function (e) {
  const z = e.coords.z
  if (z < 8 || z > 16) return  // не кешируем слишком общие и слишком детальные уровни

  const key = this._getStorageKey(e.coords)
  const url = this.getTileUrl(e.coords)

  try {
    if (await LeafletOffline.hasTile(key)) return  // уже есть — пропускаем

    // fetch() берёт тайл из HTTP-кеша браузера (уже загружен <img>) — сети нет
    const blob = await LeafletOffline.downloadTile(url)
    await LeafletOffline.saveTile({
      key,
      url,
      z,
      x: e.coords.x,
      y: e.coords.y,
      urlTemplate: this._url,
      createdAt: Date.now()
    }, blob)
  } catch { /* нет сети или IDB недоступен — игнорируем */ }
})

// Google — overlay с opacity
const googleSat = L.tileLayer(
  'https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
  {
    subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
    opacity: 0
  }
).addTo(map)

// opacity control
const opacityControl = L.control.opacity(
  { 'Схема/Спутник': googleSat },
  {
    collapsed: false,
    position: 'bottomleft'
  }
).addTo(map)

opacityControl.getContainer().classList.add('glass-control')

const sliderContainer = opacityControl.getContainer()
const slider = sliderContainer.querySelector('input[type="range"]')

let isDragging = false

function updateSliderByPointer(e) {
  const rect = slider.getBoundingClientRect()
  const x = e.clientX - rect.left
  const percent = Math.max(0, Math.min(1, x / rect.width))
  slider.value = percent * 100
  slider.dispatchEvent(new Event('input', { bubbles: true }))
}

// старт
sliderContainer.addEventListener('pointerdown', (e) => {
  isDragging = true
  sliderContainer.setPointerCapture(e.pointerId)
  updateSliderByPointer(e)
})

// движение
sliderContainer.addEventListener('pointermove', (e) => {
  if (!isDragging) return
  updateSliderByPointer(e)
})

// конец
function stopDrag(e) {
  isDragging = false
  try {
    sliderContainer.releasePointerCapture(e.pointerId)
  } catch (err) {}
}

sliderContainer.addEventListener('pointerup', stopDrag)
sliderContainer.addEventListener('pointercancel', stopDrag)
sliderContainer.addEventListener('pointerleave', stopDrag)

//layer Controls
// const baseLayers = {
//   'OpenStreetMap': OSM,
//   'Google maps': googleSat
// }

// L.control.layers(baseLayers).addTo(map)

const locateControl = L.control.locate({
  position: 'topright', // Расположение кнопки на карте
  flyTo: true,
  keepCurrentZoomLevel: true,
  setView: true,        // Автоматическое центрирование карты
  drawCircle: true,     // Отображение ореола точности
  follow: true,         // Автоматическое слежение за пользователем
  locateOptions: {      // Опции геолокации
    enableHighAccuracy: true, // Максимальная точность
    watch: true,             // Включает слежение
    maximumAge: 0            // Минимальная задержка обновления
  }
}).addTo(map)

async function startLocate() {
  // если это мобильное приложение (Capacitor)
  if (window.Capacitor) {
    try {
      const { Geolocation } = await import('@capacitor/geolocation');
      await Geolocation.requestPermissions();
    } catch (e) {
      console.error('Не удалось получить разрешение геолокации', e);
    }
  }

  // запускаем стандартный Leaflet locate
  locateControl.start();
}

map.whenReady(startLocate);

// Храним всё по chatId
const userMarkers = new Map()

// Иконка синей стрелки
const arrowIcon = L.icon({
  iconUrl: '/img/arrow-blue.svg',
  iconSize: [40, 40],
  iconAnchor: [20, 20]
})
// Иконка серой стрелки
const arrowIconGray = L.icon({
  iconUrl: '/img/arrow-gray.svg',
  iconSize: [40, 40],
  iconAnchor: [20, 20]
})

function createNameLabel(name) {
  return L.divIcon({
    className: 'user-name-label',
    html: `<span class="user-name-text">${name}</span>`,
    iconSize: [120, 20],
    iconAnchor: [60, 36]
  })
}

async function updateOtherUsers () {
  try {
    const res = await fetch('https://point-map.ru/locations')
    const locations = await res.json()

    const activeIds = new Set(locations.map(l => l.chatId))
    const now = Date.now()

    locations.forEach(loc => {
      const {
        chatId,
        name,
        latitude,
        longitude,
        timestamp,
        heading,
        accuracy,
        speed,
        expiresAt
      } = loc

      if (!latitude || !longitude) return

      const latlng = [latitude, longitude]
      const timeStr = new Date(timestamp).toLocaleTimeString('ru-RU')

      const t = getRemainingLiveTime(expiresAt)
      let liveStr = ''

      if (t?.type === 'remaining') {
        liveStr = t.hours > 0
          ? `Осталось: ${t.hours} ч ${t.mins} мин`
          : `Осталось: ${t.mins} мин`
      } else if (t?.type === 'expired') {
        liveStr = `Трансляция завершилась`
      } else if (t?.type === 'infinite') {
        liveStr = `Бессрочная трансляция`
      }

      const popupText = `
        <b>${name}</b><br>
        Обновлено: ${timeStr}<br>
        Точность: ${accuracy ? accuracy + ' м' : '—'}<br>
        Скорость: ${speed ? speed.toFixed(1) + ' км/ч' : '—'}<br>
        ${liveStr}<br>
        <span style="font-size:10px;color:#777">id: ${chatId}</span>
      `

      const ageMin = (now - new Date(timestamp).getTime()) / 60000

      /* ===== ЕСЛИ УЖЕ ЕСТЬ ===== */
      if (userMarkers.has(chatId)) {
        const data = userMarkers.get(chatId)

        data.marker.setLatLng(latlng)
        data.label.setLatLng(latlng)
        data.label.setIcon(createNameLabel(name))
        data.marker.setPopupContent(popupText)
        data.timestamp = timestamp

        // цвет по возрасту
        data.marker.setIcon(ageMin > 20 ? arrowIconGray : arrowIcon)

        if (data.circle) {
          data.circle.setLatLng(latlng)
          if (accuracy) data.circle.setRadius(accuracy)
        }

        return
      }

      /* ===== НЕ СОЗДАЁМ СЛИШКОМ СТАРЫЕ ===== */
      if (ageMin > 60) return

      /* ===== СОЗДАЁМ ===== */
      const marker = L.marker(latlng, {
        icon: ageMin > 20 ? arrowIconGray : arrowIcon,
        rotationAngle: heading ?? 0,
        rotationOrigin: 'center center'
      }).addTo(map)

      const label = L.marker(latlng, {
        icon: createNameLabel(name),
        interactive: false
      }).addTo(map)

      marker.bindPopup(popupText)

      let circle = null
      if (accuracy) {
        circle = L.circle(latlng, {
          radius: accuracy,
          color: '#136AEC',
          fillColor: '#136AEC',
          fillOpacity: 0.15,
          weight: 2
        }).addTo(map)
      }

      userMarkers.set(chatId, { marker, label, circle, timestamp })
    })

    /* ===== УДАЛЯЕМ СТАРЫХ ===== */
    userMarkers.forEach((obj, chatId) => {
      const ageMin = (now - new Date(obj.timestamp).getTime()) / 60000

      if (ageMin > 60 || !activeIds.has(chatId)) {
        map.removeLayer(obj.marker)
        map.removeLayer(obj.label)
        if (obj.circle) map.removeLayer(obj.circle)
        userMarkers.delete(chatId)
        return
      }

      obj.marker.setIcon(ageMin > 20 ? arrowIconGray : arrowIcon)
    })

  } catch (err) {
    console.error('Ошибка обновления локаций:', err)
  }
}

// старт
updateOtherUsers()
setInterval(updateOtherUsers, 10000)

function getRemainingLiveTime (expiresAt) {

  // 1) нет срока — точно бессрочно
  if (!expiresAt) {
    return { type: 'infinite' }
  }

  const exp = new Date(expiresAt).getTime()
  const now = Date.now()

  const diffMs = exp - now

  // 2) если дата в прошлом — всё
  if (diffMs <= 0) {
    return { type: 'expired' }
  }

  // 3) если больше года — считаем бессрочным
  const YEAR_MS = 365 * 24 * 60 * 60 * 1000
  if (diffMs > YEAR_MS) {
    return { type: 'infinite' }
  }

  // 4) обычная live-гео
  const totalMin = Math.floor(diffMs / 1000 / 60)
  const hours = Math.floor(totalMin / 60)
  const mins = totalMin % 60

  return {
    type: 'remaining',
    hours,
    mins,
    totalMin
  }
}

// Создание кнопок в нижнем левом углу
const ButtonsControl = L.Control.extend({
  options: {
    position: 'bottomleft'
  },

  onAdd: function (map) {
    buttonsContainer = L.DomUtil.create('div', 'glass-control')

    const showButton = L.DomUtil.create('button', 'glass-button', buttonsContainer)
    showButton.innerHTML = 'Показать историю'
    showButton.id = 'showButton'
    L.DomEvent.on(showButton, 'click', getHistoryPoints)

    return buttonsContainer
  }
})
// Создаем попап для отображения списка точек на руках
const noInstallPopup = L.popup()

// Добавление кнопок на карту
map.addControl(new ButtonsControl())

const gpxLayer = new L.GPX('./lib/v1.gpx', {
  async: true,
  polyline_options: { color: 'red', weight: 3, opacity: 0.9 },
  marker_options: {
    startIconUrl: '',
    endIconUrl: '',
    wptIconUrls: {}
  },
  get_marker: function () { return null }
}).addTo(map)

// отображение доп зоны
// new L.GPX('./lib/север.gpx', {
//   async: true,
//   polyline_options: { color: 'green', weight: 3, opacity: 1 },
//   marker_options: {
//     startIconUrl: '',
//     endIconUrl: '',
//     wptIconUrls: {}
//   },
//   get_marker: function () { return null }
// }).addTo(map)

// Функция переключения кнопок
function toggleButtons () {
  const showButton = document.getElementById('showButton')
  const clearButton = document.getElementById('clearButton')

  if (historyMarkers.length > 0) {
    showButton.style.display = 'none'
    clearButton.style.display = 'inline-block'
  } else {
    showButton.style.display = 'inline-block'
    clearButton.style.display = 'none'
    document.querySelectorAll('#downloadHistoryGPX').forEach(button => button.remove())
  }
}

let firstPoint = null
let secondPoint = null
let line = null
let distanceLabel = null
let measuringMode = false // Флаг включения режима линейки

// Кнопка для включения/выключения режима измерения
const measureControl = L.control({ position: 'topleft' })
measureControl.onAdd = function (map) {
  const button = L.DomUtil.create('div', 'leaflet-control-measure')
  button.innerHTML = '📐'

  // Предотвращаем всплытие клика на карту
  L.DomEvent.on(button, 'click', function (e) {
    L.DomEvent.stopPropagation(e) // Останавливаем всплытие события
    measuringMode = !measuringMode
    button.classList.toggle('active', measuringMode)
    resetMeasurement() // Сбрасываем измерения при переключении режима
  })

  return button
}
measureControl.addTo(map)

window.addEventListener('load', function () {
  // Получаем параметры из URL после успешной авторизации
  const urlParams = new URLSearchParams(window.location.search)

  if (urlParams.has('id')) {
    console.log('urlParams', urlParams)
    const userId = urlParams.get('id')
    const firstName = urlParams.get('first_name')
    const lastName = urlParams.get('last_name')
    const username = urlParams.get('username')

    // ✅ Выводим в консоль (можно отправить на сервер)
    console.log(`✅ Авторизован: ${firstName} ${lastName} (@${username})`)

    // ✅ Можно показать приветствие на сайте
    document.getElementById('auth-container').innerHTML = `
            <p>Привет, ${firstName}!</p>
            <button id="logout">Выйти</button>
        `

    // Добавляем кнопку "Выйти"
    document.getElementById('logout').addEventListener('click', () => {
      window.location.href = '/'
    })
  }
})

// Функция обработки кликов
function handleMeasurement (e) {
  if (!measuringMode) return

  if (!firstPoint) {
    // Первый клик – рисуем первую точку (маленький кружок)
    firstPoint = L.circleMarker(e.latlng, { radius: 4, color: 'black' }).addTo(map)
  } else if (!secondPoint) {
    // Второй клик – рисуем вторую точку и соединяем пунктирной линией
    secondPoint = L.circleMarker(e.latlng, { radius: 4, color: 'black' }).addTo(map)
    line = L.polyline([firstPoint.getLatLng(), secondPoint.getLatLng()], {
      color: 'black',
      dashArray: '8, 5'
    }).addTo(map)

    let distance = map.distance(firstPoint.getLatLng(), secondPoint.getLatLng()) / 1000 // в км

    // Добавляем текст с расстоянием
    distanceLabel = L.divIcon({
      className: 'distance-label',
      html: distance.toFixed(2) + ' км',
      iconSize: [60, 20]
    })

    L.marker(line.getCenter(), { icon: distanceLabel }).addTo(map)
  } else {
    resetMeasurement()
  }
}

// Обрабатываем клики по всей карте (основная линейка)
map.on('click', handleMeasurement)

// Функция обработки кликов по маркерам
function addMeasurementToMarker (marker) {
  marker.on('click', function (e) {
    handleMeasurement(e) // Добавляем точку линейки
    setTimeout(() => e.target.openPopup(), 10) // Открываем попап с небольшой задержкой
  })
}

// Навешиваем обработчики на уже существующие маркеры
map.eachLayer(layer => {
  if (layer instanceof L.Marker) {
    addMeasurementToMarker(layer)
  }
})

// Если маркеры добавляются динамически, подписываемся на их появление
map.on('layeradd', function (e) {
  if (e.layer instanceof L.Marker) {
    addMeasurementToMarker(e.layer)
  }
})

// Функция сброса измерений линейки
function resetMeasurement () {
  if (firstPoint) map.removeLayer(firstPoint)
  if (secondPoint) map.removeLayer(secondPoint)
  if (line) map.removeLayer(line)
  if (distanceLabel) map.eachLayer(layer => {
    if (layer instanceof L.Marker && layer.options.icon === distanceLabel) {
      map.removeLayer(layer)
    }
  })

  firstPoint = secondPoint = line = distanceLabel = null
}

const serviceMarker = new L.Marker.SVGMarker([59.991278, 30.444749], {
  iconOptions: {
    color: 'rgb(200,116,6)',
    circleText: '🛠',
    circleRatio: 0.75,
    fontSize: 14
    // iconSize: L.point(28,40)
  }
})

serviceMarker.addTo(map)

const popupContent = `
  <div style="display: flex; align-items: flex-start;">
    <div style="flex: 1; padding-right: 10px;">
      <b>Клубный сервис Точка 4х4</b><br>
      Если у Вас сломалась машина, Вы можете обратиться к нам в клубный внедорожный сервис 🚩Точка 4х4🚩<br>
      Шафировский пр., 10А, бокс 12-9.<br>
      Есть возможность выехать на место поломки. <br>
      Телефон для связи: <a href="tel:+79006356625">+79006356625</a>
    </div>
    <img src="../img/service.png" alt="Точка 4х4" style="width:50px;">
  </div>
`

serviceMarker.bindPopup(popupContent)

// ✅ Кнопка поиска 🔍 (поиск по координатам)
const searchControl = L.control({ position: 'topleft' })
searchControl.onAdd = function (map) {
  const button = L.DomUtil.create('div', 'leaflet-control-measure')
  button.innerHTML = '🔍'

  L.DomEvent.on(button, 'click', function (e) {
    L.DomEvent.stopPropagation(e)

    const input = prompt('Введите координаты:', '')
    if (!input) return // Если нажали "Отмена", ничего не делать

    const coodinates = parseCoordinates(input)
    if (!coodinates) {
      alert('Ошибка: не удалось распознать формат координат')
      return
    }
    const [lat, lng] = coodinates.split(',').map(coord => parseFloat(coord.trim()))

    if (isNaN(lat) || isNaN(lng)) {
      alert('Ошибка: введите координаты в формате \'55.751244, 37.618423\'')
      return
    }

    // Добавляем маркер на карту
    const marker = L.marker([lat, lng]).addTo(map).bindPopup(`${lat}, ${lng}`).openPopup()
    map.setView([lat, lng], 13) // Центрируем карту
  })

  return button
}
searchControl.addTo(map)

// элемент для крестика
const crosshair = document.createElement('div')
crosshair.className = 'map-crosshair'
document.body.appendChild(crosshair)

// элемент для отображения координат
const coordDisplay = document.createElement('div')
coordDisplay.className = 'coord-display'
document.body.appendChild(coordDisplay)

// Функция обновления координат
function updateCoordinates () {
  const center = map.getCenter()
  const coordsText = `${center.lat.toFixed(6)}, ${center.lng.toFixed(6)}`
  coordDisplay.innerText = `${coordsText}`
  coordDisplay.setAttribute('data-coords', coordsText)
}

// Обработчик клика для копирования координат
coordDisplay.addEventListener('click', function () {
  const coords = coordDisplay.getAttribute('data-coords')
  navigator.clipboard.writeText(coords).then(() => {
    coordDisplay.innerText = `✅ Скопировано!`
    setTimeout(updateCoordinates, 1000) // Вернуть координаты через 1 сек.
  }).catch(err => console.error('Ошибка копирования:', err))
})

//Обновляем координаты при движении карты
map.on('move', updateCoordinates)
updateCoordinates()

function openFullSizeImage (imageUrl) {
  const modal = document.createElement('div')
  modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);display:flex;justify-content:center;align-items:center;z-index:9999'
  const img = document.createElement('img')
  img.src = imageUrl
  img.style.cssText = 'max-width:90%;max-height:90%;cursor:pointer'
  img.addEventListener('click', () => document.body.removeChild(modal))
  modal.appendChild(img)
  document.body.appendChild(modal)
}

const markers = []
const markersByType = { Лайт: [], Медиум: [], Хард: [], Atv: [], else: [] }
const LS_KEY = 'liteoffroad_layers'

await fetch('https://point-map.ru/points')
  .then(response => {
    if (!response.ok) {
      throw new Error('Network response was not ok ' + response.statusText)
    }
    return response.json()
  })
  .then(data => {
    let pointsArray = []
    let circles = {}
    showNoInstallPopup(data)
    data.sort((a, b) => {
      // Извлекаем число из имени (после слова "Точка")
      const numberA = parseInt(a.point.split(' ')[1], 10)
      const numberB = parseInt(b.point.split(' ')[1], 10)

      // Сортировка по возрастанию
      return numberA - numberB
    })

    for (const point of data) {
      if (['точку украли', 'тестовая', 'Новая точка, еще не устанавливалась'].includes(point.comment)) {
        continue
      }

      if (!point.install) {
        noInstall += 1
        continue
      }

      if (point.coordinates === ',') {
        continue
      }

      const rawCoordinates = point.coordinates.split(',')
      const lat = parseFloat(rawCoordinates[0])
      const lon = parseFloat(rawCoordinates[1])
      if (isNaN(lat) || isNaN(lon)) continue // Проверка на корректность координат

      const name = point.point
      const rating = point.rating
      const circleText = `<div style="text-align: center; margin-top: -3.8em">
               <strong>${name.split(' ')[1]}</strong><br>
               <span style="font-size: 8px; color: #686868;">${rating}</span>
             </div>`
      const comment = point.comment
      const installTime = point.takeTimestamp
      const rang = point.rang || ''

      pointsArray.push({ lat, lon, name, comment, rating })

      const marker = new L.Marker.SVGMarker([lat, lon], {
        iconOptions: {
          color: setRangColor(point.rang),
          circleText: circleText,
          circleRatio: 0.65,
          fontSize: 10,
          fontWeight: 800
        }
      })

      marker.addTo(map)
      markers.push(marker)

      if (point.photo) {
        marker.once('mouseover', () => {
          new Image().src = `https://point-map.ru/photo/telegram/${point.photo}`
        })
      }

      if (rang === 'Лайт') {
        litePoints += 1
      } else if (rang === 'Хард') {
        hardPoints += 1
      } else if (rang === 'Медиум') {
        mediumPoints += 1
      } else if (rang === 'Atv') {
        atvPoints += 1
      } else {
        elsePoints += 1
      }

      const typeKey = ['Лайт', 'Хард', 'Медиум', 'Atv'].includes(rang) ? rang : 'else'
      markersByType[typeKey].push(marker)

      const popupContent = `
  <b>${getRang(rang)} ${name}</b><br>

  Координаты:
  <span id="copy-coords" class="popup-link">
    ${lat}, ${lon}
  </span><br>

  Рейтинг точки: ${rating}<br>
  Точку установил: ${point.installed}<br>
  <div class="popup-time">
  Установлена:
  <span class="popup-date">
    ${formatDateDDMMYYYY(installTime)}
  </span>
  ·
  ${formatDaysHoursSince(installTime)} назад
</div>

  ${point.comment ? `
    <div class="popup-comment">
      ${point.comment}
    </div>
  ` : ''}

  <div class="popup-actions-grid">

  <button class="popup-btn one-gpx-download"
    data-lat="${lat}"
    data-lon="${lon}"
    data-name="${name}"
    data-comment="${comment}">
    ⬇️ GPX
  </button>

  <button class="popup-btn load-history"
    data-name="${name}">
    История
  </button>

</div>

${point.channelLink ? `
  <a href="${point.channelLink}" target="_blank"
     class="popup-btn popup-btn-link popup-btn-full">
    💬 Обсудить точку
  </a>
` : ''}

  <label class="circle-toggle popup-toggle">
    <input type="checkbox" class="show-circle"
      data-lat="${lat}" data-lon="${lon}">
    Показать зону ${RADIUS} метров
  </label>

<div class="popup-image-wrapper">
<div class="spinner"></div>
  <img
  class="popup-image"
  id="popup-photo"
  data-src="https://point-map.ru/photo/telegram/${point.photo}"
  alt="Фото точки">
</div>
`

      marker.bindPopup(popupContent)

      marker.on('popupopen', function (e) {
        const popupEl = e.popup._contentNode

        // popupEl сохраняется между открытиями, но его innerHTML сбрасывается Leaflet —
        // дочерние элементы пересоздаются, поэтому слушатели на них вешаем каждый раз заново

        setTimeout(() => {
          const key = `${lat},${lon}`

          // --- чекбокс (пересоздаётся) ---
          const checkbox = popupEl.querySelector('.show-circle')
          if (checkbox) {
            checkbox.checked = !!circles[key]
            checkbox.addEventListener('change', function () {
              if (checkbox.checked) {
                if (!circles[key]) {
                  circles[key] = L.circle([lat, lon], {
                    radius: RADIUS,
                    color: 'green',
                    fillColor: 'blue',
                    fillOpacity: 0.1
                  }).addTo(map)
                }
              } else {
                if (circles[key]) {
                  map.removeLayer(circles[key])
                  delete circles[key]
                }
              }
            })
          }

          // --- кнопка истории (пересоздаётся) ---
          const historyBtn = popupEl.querySelector('.load-history')
          if (historyBtn) {
            historyBtn.addEventListener('click', async function () {
              await loadPointHistory(this.dataset.name, marker)
            })
          }

          // --- фото (пересоздаётся): если уже в кеше браузера — скрываем спиннер сразу ---
          const img = popupEl.querySelector('.popup-image')
          const spinner = popupEl.querySelector('.spinner')
          if (img && spinner) {
            img.src = img.dataset.src
            if (img.complete && img.naturalWidth > 0) {
              spinner.style.display = 'none'
              img.style.display = 'block'
            } else {
              img.onload = () => { spinner.style.display = 'none'; img.style.display = 'block' }
              img.onerror = () => { spinner.style.display = 'none'; img.style.display = 'block' }
            }
          }

          // --- клик на фото и копирование координат: вешаем только один раз на popupEl ---
          if (popupEl.dataset.listenersAttached) return
          popupEl.dataset.listenersAttached = '1'

          popupEl.addEventListener('click', function (event) {
            if (event.target && event.target.id === 'popup-photo') {
              openFullSizeImage(event.target.src)
            }
          })

          document.addEventListener('click', function copyHandler (event) {
            if (event.target && event.target.id === 'copy-coords') {
              const button = event.target
              const originalText = button.innerText
              navigator.clipboard.writeText(`${lat}, ${lon}`).then(() => {
                button.innerHTML = `<span style="color: green; font-weight: bold;">✅ Скопировано!</span>`
                setTimeout(() => { button.innerText = originalText }, 1000)
              }).catch(err => console.error('Ошибка копирования:', err))
              document.removeEventListener('click', copyHandler)
            }
          })
        }, 100)
      })

    }
    const pointId = getQueryParam('id')
    const pointType = getQueryParam('type')
    const point = getQueryParam('point')

    if (pointId) {
      if (pointType === 'install' && point) {
        fetch(`https://point-map.ru/points/?point=${pointId}`)
          .then(res => res.json())
          .then(data => {
            // ✅ проверка структуры
            console.log('data', data)
            const point = Array.isArray(data) ? data[0] : data
            if (!point || !point.coordinates) {
              console.warn('Точка не найдена или нет координат', data)
              return
            }

            const raw = point.coordinates.split(',')
            const lat = parseFloat(raw[0])
            const lon = parseFloat(raw[1])

            if (isNaN(lat) || isNaN(lon)) {
              console.warn('Некорректные координаты', point.coordinates)
              return
            }

            map.setView([lat, lon], 10)
          })
          .catch(err => console.error('Ошибка загрузки точки install:', err))
      } else if (pointType === 'take') {
        fetch(`https://point-map.ru/pointsHistory/?id=${pointId}`)
          .then(response => response.json())
          .then(historyPoint => {
            const point = historyPoint[0]
            const circleText = `<div style="text-align: center; margin-top: -3.8em">
               <strong>${point.point.split(' ')[1]}</strong><br>
               <span style="font-size: 8px; color: #686868;">${point.rating}</span>
             </div>`
            const rawCoordinates = point.coordinates.split(',')
            const lat = parseFloat(rawCoordinates[0])
            const lon = parseFloat(rawCoordinates[1])
            const marker = new L.Marker.SVGMarker([lat, lon], {
              iconOptions: {
                color: 'rgb(0,0,0)',
                circleText,
                circleRatio: 0.65,
                fontSize: 10,
                fontWeight: 800
              }
            })

            marker.addTo(map)
            map.setView([lat, lon], 10)

            const popupContent = `
        <b>${point.point}</b><br>
        Координаты: ${lat}, ${lon}<br>
        Рейтинг точки: ${point.rating}<br>
        Точку взял: ${point.installed}<br>
        ${point.comment}
      `
            marker.bindPopup(popupContent)
          })
          .catch(err => console.error('Ошибка загрузки точки:', err))
      }
    }

    // addGPXControl(pointsArray, 'actual')
    document.getElementById('msg').innerHTML = ''

    const infoDiv = document.createElement('div')
    infoDiv.id = 'points-info'
    infoDiv.innerHTML = `
  <div id="layers-header">Слои <span id="layers-arrow">▾</span></div>
  <div id="layers-body">
    <label class="layer-row">
      <input type="checkbox" id="toggle-gpx" checked>
      <span class="type-label">Зона игры</span>
    </label>
    <hr class="layer-divider">
    <label class="layer-row layer-master">
      <input type="checkbox" id="toggle-all-points" checked>
      <span class="type-label">Все точки</span>
    </label>
    <div id="type-toggles">
      <div class="layer-row layer-type">
        <input type="checkbox" class="toggle-type" data-type="Лайт" checked>
        <span class="type-label">🟢 Лайт</span>
        <span class="type-count" id="lite-count">${litePoints}</span>
      </div>
      <div class="layer-row layer-type">
        <input type="checkbox" class="toggle-type" data-type="Медиум" checked>
        <span class="type-label">🔵 Ни то ни се</span>
        <span class="type-count" id="medium-count">${mediumPoints}</span>
      </div>
      <div class="layer-row layer-type">
        <input type="checkbox" class="toggle-type" data-type="Хард" checked>
        <span class="type-label">🔴 Хард</span>
        <span class="type-count" id="hard-count">${hardPoints}</span>
      </div>
      <div class="layer-row layer-type">
        <input type="checkbox" class="toggle-type" data-type="Atv" checked>
        <span class="type-label">🟠 ATV</span>
        <span class="type-count" id="atv-count">${atvPoints}</span>
      </div>
    </div>
    <hr class="layer-divider">
    <div id="noInstall">На руках: <span id="noInstall-count">${noInstall}</span></div>
  </div>
`
    document.getElementById('map-controls-right').appendChild(infoDiv)

    // свернуть / развернуть панель
    document.getElementById('layers-header').addEventListener('click', () => {
      const body = document.getElementById('layers-body')
      const arrow = document.getElementById('layers-arrow')
      const collapsed = body.style.display === 'none'
      body.style.display = collapsed ? '' : 'none'
      arrow.textContent = collapsed ? '▾' : '▸'
      saveLayerState()
    })

    // зона игры
    document.getElementById('toggle-gpx').addEventListener('change', function () {
      this.checked ? gpxLayer.addTo(map) : map.removeLayer(gpxLayer)
      saveLayerState()
    })

    // все точки — включает все ранги
    document.getElementById('toggle-all-points').addEventListener('change', function () {
      const allOn = this.checked
      this.indeterminate = false
      document.querySelectorAll('.toggle-type').forEach(cb => { cb.checked = allOn })
      for (const [type, mkrs] of Object.entries(markersByType)) {
        mkrs.forEach(m => allOn ? m.addTo(map) : map.removeLayer(m))
      }
      saveLayerState()
    })

    // отдельный тип точек — синхронизирует мастер-чекбокс
    document.querySelectorAll('.toggle-type').forEach(cb => {
      cb.addEventListener('change', function () {
        const type = this.dataset.type
        ;(markersByType[type] || []).forEach(m => this.checked ? m.addTo(map) : map.removeLayer(m))
        syncMasterCheckbox()
        saveLayerState()
      })
    })

    // клик по строке типа (div) — переключает чекбокс внутри
    document.getElementById('type-toggles').addEventListener('click', function (e) {
      if (e.target.classList.contains('toggle-type')) return
      const row = e.target.closest('.layer-type')
      if (row) row.querySelector('.toggle-type').click()
    })

    // восстанавливаем состояние из localStorage
    const savedState = loadLayerState()
    if (savedState) {
      if (savedState.collapsed) {
        document.getElementById('layers-body').style.display = 'none'
        document.getElementById('layers-arrow').textContent = '▸'
      }
      if (savedState.gpx === false) {
        document.getElementById('toggle-gpx').checked = false
        map.removeLayer(gpxLayer)
      }
      if (savedState.types) {
        for (const [type, visible] of Object.entries(savedState.types)) {
          const typeCb = document.querySelector(`.toggle-type[data-type="${type}"]`)
          if (typeCb && !visible) {
            typeCb.checked = false
            ;(markersByType[type] || []).forEach(m => map.removeLayer(m))
          }
        }
      }
      syncMasterCheckbox()
    }

    // клик на "На руках"
    document.getElementById('noInstall').addEventListener('click', function () {
      const rect = this.getBoundingClientRect()
      const clickPoint = map.containerPointToLatLng([
        rect.left + rect.width / 2 - 130,
        rect.top - 70
      ])
      showNoInstallPopup(data.filter(point => !point.install))
      noInstallPopup.setLatLng(clickPoint).openOn(map)
    })

    // Делегирование событий для кнопки "Скачать GPX"
    document.addEventListener('click', function (event) {
      if (event.target.classList.contains('one-gpx-download')) {
        const lat = event.target.dataset.lat
        const lon = event.target.dataset.lon
        const name = event.target.dataset.name
        const comment = event.target.dataset.comment

        downloadOnePointGPX(lat, lon, name, comment)
      }
    })

  })
  .catch(error => {
    console.error('There was a problem with the fetch operation:', error)
    document.getElementById('msg').innerHTML = 'Ошибка. Попробуйте обновить страницу.'
  })

// Получаю параметры из урла
function getQueryParam (param) {
  const urlParams = new URLSearchParams(window.location.search)
  return urlParams.get(param)
}

// Функция для отображения попапа с точками на руках
function showNoInstallPopup (points) {
  let popupContent = '<div><b>Точки на руках, когда и кем взяты</b></div>'

  points.forEach(point => {
    const timeStr = formatDaysHoursSince(point.takeTimestamp)

    popupContent += `
      <div>
        ${point.point} — 
        ${timeStr} назад, Взял: ${point.installed}
      </div>
    `
  })

  noInstallPopup.setContent(popupContent)
}

function getRang (rang) {
  if (rang === 'Медиум') {
    return 'Ни то ни сё'
  } else {
    return rang
  }
}

/**
 * Загружает историю указанной точки и строит линию на карте
 */
async function loadPointHistory (pointName, marker) {
  try {
    let circles = {}
    let latlngs = []
    const response = await fetch(`https://point-map.ru/pointsHistory?name=${encodeURIComponent(pointName)}`)
    if (!response.ok) {
      throw new Error(`Ошибка загрузки истории: ${response.statusText}`)
    }
    const historyData = await response.json()

    if (!historyData || historyData.length === 0) {
      alert('История этой точки отсутствует.')
      return
    }

    for (const point of historyData) {
      if (/^(точку украли|тестовая|тест)$/i.test(point.comment)) {
        continue
      }
      if (point.point === 'Точка 88') {
        continue
      }
      const coordinatesField = /^(\d\d\.\d{4,}, \d\d\.\d{4,})$/i.test(point.coordinates)
      if (!coordinatesField) {
        continue
      }
      const rawCoorditares = point.coordinates.split(',')
      const lat = parseFloat(rawCoorditares[0])
      const lon = parseFloat(rawCoorditares[1])

      if (isNaN(lat) || isNaN(lon)) continue
      if (!isNaN(lat) && !isNaN(lon)) {
        latlngs.push([lat, lon])
      }

      const name = point.point
      const comment = point.comment
      const circleText = name.split(' ')[1]

      archivePoints.push({ lat, lon, name, comment })
      const marker = new L.Marker.SVGMarker([lat, lon], {
        iconOptions: {
          color: 'rgb(0,0,0)',
          circleText: circleText,
          circleRatio: 0.65,
          fontSize: 10,
          fontWeight: 800
        }
      })
      historyMarkers.push(marker)

      marker.addTo(map)
      markers.push(marker)

      if (point.install) {
        continue
      }

      const label = `
    <b>${name}<br>${rawCoorditares}<br>
    Рейтинг точки: ${point.rating}<br>
    Точку взял: ${point.installed}</b><br>
    ${point.comment}<br>
    <button class="one-gpx-download" data-lat="${lat}" data-lon="${lon}" data-name="${name}" data-comment="${point.comment}">
        Скачать GPX файл этой точки
    </button><br>
    <label class="circle-toggle">
      <input type="checkbox" class="show-circle" data-lat="${lat}" data-lon="${lon}">
      Показать зону ${RADIUS} метров
    </label>`
      const popup = marker.bindPopup(label)
      // popup.addTo(map)
      marker.on('popupopen', function (e) {
        setTimeout(() => {
          const popupEl = e.popup._contentNode
          if (!popupEl) return

          const checkbox = popupEl.querySelector('.show-circle')
          if (!checkbox) return

          const key = `${lat},${lon}`
          checkbox.checked = !!circles[key]

          checkbox.addEventListener('change', function () {
            if (checkbox.checked) {
              if (!circles[key]) {
                circles[key] = L.circle([lat, lon], {
                  radius: 5000,
                  color: 'green',
                  fillColor: 'blue',
                  fillOpacity: 0.1
                }).addTo(map)
              }
            } else {
              if (circles[key]) {
                map.removeLayer(circles[key])
                delete circles[key]
              }
            }
          })
        }, 100)
      })
      document.getElementById('msg').innerHTML = ''
    }

    if (latlngs.length > 1) {
      // Удаляем старую линию, если уже была нарисована
      if (historyLines[pointName]) {
        map.removeLayer(historyLines[pointName])
      }

      // Создаем новую линию
      const polyline = L.polyline(latlngs, {
        color: 'blue',
        weight: 3,
        opacity: 0.7
      }).addTo(map)

      historyLines[pointName] = polyline
      clearButton.style.display = 'inline-block'
    } else {
      alert('Недостаточно данных для построения истории.')
    }
  } catch (error) {
    console.error('Ошибка загрузки истории точки:', error)
    alert('Не удалось загрузить историю точки.')
  }
}

/**
 * Функция очистки всех архивных точек и линий
 */
function clearHistory () {
  Object.values(historyLines).forEach(line => map.removeLayer(line))
  historyLines = {}
  historyMarkers.forEach(marker => map.removeLayer(marker))
  historyMarkers = []
  toggleButtons()
}

const clearButton = L.DomUtil.create('button', 'glass-button b-1', buttonsContainer)
clearButton.innerHTML = 'Очистить историю точки'
clearButton.id = 'clearButton'
clearButton.style.display = 'none'
L.DomEvent.on(clearButton, 'click', clearHistory)

map.on('popupopen', function (e) {
  const button = e.popup._contentNode.querySelector('.one-gpx-download')
  if (button) {
    button.addEventListener('click', function () {
      const lat = this.getAttribute('data-lat')
      const lon = this.getAttribute('data-lon')
      const name = this.getAttribute('data-name')
      const comment = this.getAttribute('data-comment')
      const gpxContent = generateGPX([{ lat, lon, name, comment }])
      console.log('gpxContent', gpxContent)
      downloadGPX(`${name}.gpx`, gpxContent)
    })
  }
})

// function addGPXControl (points, status) {
//   if (status === 'actual') {
//     const gpxControl = L.control({ position: 'bottomleft' }) // Кнопка в левом нижнем углу
//
//     gpxControl.onAdd = function () {
//       const div = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-custom')
//       div.innerHTML = '<button id="downloadGPX" class="gpx-button downloadGPX">Скачать GPX актуальных точек</button>'
//
//       L.DomEvent.on(div, 'mousedown dblclick', L.DomEvent.stopPropagation)
//         .on(div, 'click', function () {
//           const gpxContent = generateGPX(points)
//           const date = new Date()
//           const formattedDate = `${String(date.getFullYear()).slice(2)}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}-${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}`
//
//           downloadGPX(`points-${formattedDate}.gpx`, gpxContent)
//         })
//
//       return div
//     }
//
//     gpxControl.addTo(map)
//   } else {
//     const historygGpxControl = L.control({ position: 'bottomleft' }) // Кнопка в левом нижнем углу
//
//     historygGpxControl.onAdd = function () {
//       const div = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-custom')
//       div.innerHTML = '<button id="downloadHistoryGPX" class="gpx-button downloadGPX">Скачать GPX архивных точек</button>'
//
//       L.DomEvent.on(div, 'mousedown dblclick', L.DomEvent.stopPropagation)
//         .on(div, 'click', function () {
//           const gpxContent = generateGPX(points)
//           const date = new Date()
//           const formattedDate = `${String(date.getFullYear()).slice(2)}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}-${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}`
//
//           downloadGPX(`history-points-${formattedDate}.gpx`, gpxContent)
//         })
//
//       return div
//     }
//
//     historygGpxControl.addTo(map)
//   }
// }

function generateGPX (points) {
  let gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="PointMapBot" xmlns="http://www.topografix.com/GPX/1/1">
`
  console.log('points', points)
  points.forEach(point => {
    gpx += `  <wpt lat="${point.lat}" lon="${point.lon}">
    <name>${point.name} / ${point.rating}б</name>
    <desc>${point.comment}</desc>
  </wpt>\n`
  })

  gpx += `</gpx>`

  return gpx
}

function downloadGPX (filename, gpxContent) {
  const blob = new Blob([gpxContent], { type: 'application/gpx+xml' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

function formatDateDDMMYYYY(timestamp) {
  const d = new Date(timestamp)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${dd}.${mm}.${yyyy}`
}

function downloadOnePointGPX (lat, lon, name, comment) {
  const gpxData = `<?xml version="1.0" encoding="UTF-8"?>
  <gpx version="1.1" creator="PointMap">
    <wpt lat="${lat}" lon="${lon}">
      <name>${name}</name>
      <desc>${comment}</desc>
    </wpt>
  </gpx>`

  const blob = new Blob([gpxData], { type: 'application/gpx+xml' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${name}.gpx`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

async function getHistoryPoints () {
  let archivePoints = []
  let circles = {}
  document.getElementById('msg').innerHTML = 'Загружаю архивные точки...'
  await fetch('https://point-map.ru/pointsHistory')
    .then(response => {
      if (!response.ok) {
        throw new Error('Network response was not ok ' + response.statusText)
      }
      return response.json()
    })
    .then(data => {
      //History Markers
      for (const point of data) {
        if (/^(точку украли|тестовая|тест)$/i.test(point.comment)) {
          continue
        }
        if (point.point === 'Точка 88') {
          continue
        }
        const coordinatesField = /^(\d\d\.\d{4,}, \d\d\.\d{4,})$/i.test(point.coordinates)
        if (!coordinatesField) {
          continue
        }
        const rawCoorditares = point.coordinates.split(',')
        const lat = parseFloat(rawCoorditares[0])
        const lon = parseFloat(rawCoorditares[1])

        if (isNaN(lat) || isNaN(lon)) continue

        const name = point.point
        const comment = point.comment
        const circleText = name.split(' ')[1]

        archivePoints.push({ lat, lon, name, comment })
        const marker = new L.Marker.SVGMarker([lat, lon], {
          iconOptions: {
            color: 'rgb(0,0,0)',
            circleText: circleText,
            circleRatio: 0.65,
            fontSize: 10,
            fontWeight: 800
          }
        })
        historyMarkers.push(marker)

        marker.addTo(map)
        markers.push(marker)

        const label = `
    <b>${name}<br>${rawCoorditares}<br>
    Рейтинг точки: ${point.rating}<br>
    Точку взял: ${point.installed}</b><br>
    ${point.comment}<br>
    <button class="one-gpx-download" data-lat="${lat}" data-lon="${lon}" data-name="${name}" data-comment="${point.comment}">
        Скачать GPX файл этой точки
    </button><br>
    <label class="circle-toggle">
      <input type="checkbox" class="show-circle" data-lat="${lat}" data-lon="${lon}">
      Показать зону ${RADIUS} метров
    </label>`
        const popup = marker.bindPopup(label)
        // popup.addTo(map)
        marker.on('popupopen', function (e) {
          setTimeout(() => {
            const popupEl = e.popup._contentNode
            if (!popupEl) return

            const checkbox = popupEl.querySelector('.show-circle')
            if (!checkbox) return

            const key = `${lat},${lon}`
            checkbox.checked = !!circles[key]

            checkbox.addEventListener('change', function () {
              if (checkbox.checked) {
                if (!circles[key]) {
                  circles[key] = L.circle([lat, lon], {
                    radius: RADIUS,
                    color: 'green',
                    fillColor: 'blue',
                    fillOpacity: 0.1
                  }).addTo(map)
                }
              } else {
                if (circles[key]) {
                  map.removeLayer(circles[key])
                  delete circles[key]
                }
              }
            })
          }, 100)
        })
        document.getElementById('msg').innerHTML = ''
      }
      console.log('archive points', archivePoints)
      toggleButtons()
    })
    .catch(error => {
      console.error('Ошибка добавления архивной точки:', error)
      document.getElementById('msg').innerHTML = 'Ошибка. Попробуйте обновить страницу.'
    })
  // addGPXControl(archivePoints, 'history')
}

function setRangColor (rang, pointId) {
  if (pointId) {
    return 'rgb(255,152,0)'
  }
  if (!rang) {
    return 'rgb(213,41,239)'
  }
  if (rang === 'Лайт') {
    return 'rgb(26,165,45)'
  } else if (rang === 'Хард') {
    return 'rgb(241,5,5)'
  } else if (rang === 'Медиум') {
    return 'rgb(5,60,241)'
  } else if (rang === 'Atv') {
    return 'rgb(248,147,13)'
  }
}

// Функция для проверки, находится ли пользователь в радиусе 30 метров от точки
function isWithinRadius (userLat, userLng, markerLat, markerLng, radiusInMeters) {
  const earthRadius = 6371000 // Радиус Земли в метрах
  const dLat = (markerLat - userLat) * Math.PI / 180
  const dLng = (markerLng - userLng) * Math.PI / 180

  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(userLat * Math.PI / 180) * Math.cos(markerLat * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2)

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  const distance = earthRadius * c

  return distance <= radiusInMeters
}

let activePoint = null

// Отслеживаем положение пользователя
navigator.geolocation.watchPosition(
  position => {
    const userLat = position.coords.latitude
    const userLng = position.coords.longitude

    // Проверяем, есть ли точки в пределах 300 м
    for (const marker of markers) {
      const markerLat = marker._latlng[0]
      const markerLng = marker._latlng[1]
      const distance = calculateDistance(userLat, userLng, markerLat, markerLng)

      if (distance <= 300) {
        if (!activePoint || activePoint.lat !== markerLat || activePoint.lng !== markerLng) {
          // Если новая точка в зоне, активируем экран
          activePoint = { lat: markerLat, lng: markerLng }
          document.getElementById('bg-text').style.display = 'block'
        }
        updateDistance(userLat, userLng) // Обновляем расстояние
        return
      }
    }

    // Если пользователь вышел из зоны 100 м
    activePoint = null
    document.getElementById('bg-text').style.display = 'none'
  },
  error => {
    console.error('Ошибка отслеживания местоположения: ', error.message)
  },
  { enableHighAccuracy: true }
)

function updateDistance (userLat, userLng) {
  if (!activePoint) return

  const distance = calculateDistance(userLat, userLng, activePoint.lat, activePoint.lng)

  // Обновляем текст на экране
  const overlayText = document.getElementById('overlay-text')
  if (overlayText) {
    overlayText.textContent = `Расстояние до точки: ${Math.round(distance)} м`
  }
}

function parseCoordinates (input) {
  input = input.trim().replace(/[^\d.,°′″ NSEW+\-]/g, '') // Удаляем лишние символы

  // Если уже в правильном формате
  let decimalMatch = input.match(/^([+\-]?\d{1,3}\.\d+),?\s*([+\-]?\d{1,3}\.\d+)$/)
  if (decimalMatch) {
    return `${parseFloat(decimalMatch[1]).toFixed(6)}, ${parseFloat(decimalMatch[2]).toFixed(6)}`
  }

  // Обработка формата с градусами, минутами и секундами
  let dmsMatch = input.match(/(\d{1,3})°(\d{1,2})′(\d{1,2}(?:\.\d+)?)″?\s*([NSEW])/g)
  if (dmsMatch && dmsMatch.length === 2) {
    let coords = dmsMatch.map(dms => {
      let [, deg, min, sec, dir] = dms.match(/(\d{1,3})°(\d{1,2})′(\d{1,2}(?:\.\d+)?)″?\s*([NSEW])/)
      let decimal = parseInt(deg) + parseInt(min) / 60 + parseFloat(sec) / 3600
      if (dir === 'S' || dir === 'W') decimal *= -1
      return decimal.toFixed(5)
    })
    return [coords[0], coords[1]]
  }

  return null
}

// Функция расчета расстояния (в метрах)
function calculateDistance (lat1, lng1, lat2, lng2) {
  const earthRadius = 6371000 // Радиус Земли в метрах
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180

  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2)

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return earthRadius * c
}

function saveLayerState () {
  const types = {}
  document.querySelectorAll('.toggle-type').forEach(cb => {
    types[cb.dataset.type] = cb.checked
  })
  localStorage.setItem(LS_KEY, JSON.stringify({
    gpx: document.getElementById('toggle-gpx')?.checked ?? true,
    types,
    collapsed: document.getElementById('layers-body')?.style.display === 'none'
  }))
}

function loadLayerState () {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY))
  } catch {
    return null
  }
}

function syncMasterCheckbox () {
  const cbs = [...document.querySelectorAll('.toggle-type')]
  const checkedCount = cbs.filter(cb => cb.checked).length
  const master = document.getElementById('toggle-all-points')
  if (!master) return
  master.checked = checkedCount > 0
  master.indeterminate = checkedCount > 0 && checkedCount < cbs.length
}

function formatDaysHoursSince (timestamp) {
  const now = new Date()
  const then = new Date(timestamp)

  let diffMs = now - then
  if (diffMs < 0) diffMs = 0

  const totalHours = Math.floor(diffMs / (1000 * 60 * 60))
  const days = Math.floor(totalHours / 24)
  const hours = totalHours % 24

  let result = ''

  if (days > 0) {
    result += `${days} ${declOfNum(days, 'дней')}`
  }

  if (hours > 0 || days === 0) {
    result += `${days > 0 ? ' ' : ''}${hours} ${declOfNum(hours, 'час')}`
  }

  return result
}

function declOfNum (number, label) {
  const labels = {
    'балл': ['балл', 'балла', 'баллов'],
    'час': ['час', 'часа', 'часов'],
    'мин': ['минуту', 'минуты', 'минут'],
    'дней': ['день', 'дня', 'дней']
  }

  const map = labels[label]

  if (!map) {
    return label
  }

  const cases = [2, 0, 1, 1, 1, 2]

  return map[(number % 100 > 4 && number % 100 < 20) ? 2 : cases[(number % 10 < 5) ? number % 10 : 5]]
}

const showHistoryBtn = document.getElementById('showHistory')
if (showHistoryBtn) {
  showHistoryBtn.addEventListener('click', () => {
    getHistoryPoints()
  })
}
