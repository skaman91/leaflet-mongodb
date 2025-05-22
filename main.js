import { RADIUS } from './const.js'

const map = L.map('map').setView([60.024828, 30.338195], 10)
document.getElementById('msg').innerHTML = 'Загружаю точки...'
let historyMarkers = []
let archivePoints = []
let buttonsContainer
let historyLines = {}
let litePoints = 0
let hardPoints = 0
let elsePoints = 0
let noInstall = 0

//osm Layer
const OSM = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '<b>Liteoffroad "Застрянь друга"</b>'
})
OSM.addTo(map)

//google2 Layer
const googleSat = L.tileLayer('http://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
  subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
  attribution: '<b>Liteoffroad "Застрянь друга"</b>'
})

// Кнопка начать играть
const StartButton = L.Control.extend({
  options: {
    position: 'topright'
  },

  onAdd: function () {
    const container = L.DomUtil.create('div', 'start-button')
    container.innerHTML = '🚀 Играть'

    container.onclick = function () {
      window.open('https://t.me/liteoffroad_bot', '_blank') // Заменить на @username бота
    }

    return container
  }
})

map.addControl(new StartButton())

//layer Controls
const baseLayers = {
  'OpenStreetMap': OSM,
  'Google maps': googleSat
}

L.control.layers(baseLayers).addTo(map)

setTimeout(() => {
  const layersList = document.querySelector('.leaflet-control-layers-list')

  if (layersList) {
    function createButton (text, className, onClick) {
      const button = document.createElement('button')
      button.textContent = text
      button.className = className
      button.addEventListener('click', onClick)
      return button
    }

    // Функции для переключения кнопок
    function showHistory () {
      clearMarkers()
      getHistoryPoints()
      showHistoryButton.style.display = 'none'
      clearHistoryButton.style.display = 'flex'
      historyButton.style.display = 'flex'
    }

    function clearHistory () {
      clearMarkers()
      clearHistoryButton.style.display = 'none'
      showHistoryButton.style.display = 'flex'
      historyButton.style.display = 'none'
    }

    // Функция скачивания GPX
    function downloadGPXFile (filename, pointsData) {
      const gpxContent = generateGPX(pointsData)
      downloadGPX(filename, gpxContent)
    }

    // Кнопка "Скачать GPX актуальных точек"
    const gpxActualButton = createButton('Скачать GPX актуальных точек', 'main-menu-buttons', () => {
      downloadGPXFile('points.gpx', activePoint)
    })

    // Кнопка "Скачать архивные точки"
    const historyButton = createButton('Скачать GPX архивных точек', 'main-menu-buttons', () => {
      downloadGPXFile('points.gpx', historyMarkers)
    })

    // Кнопка "Показать историю"
    const showHistoryButton = createButton('Показать историю', 'main-menu-buttons', showHistory)

    // Кнопка "Очистить историю" (скрыта по умолчанию)
    const clearHistoryButton = createButton('Очистить историю', 'main-menu-buttons', clearHistory)
    clearHistoryButton.style.display = 'none'

    // Добавляем кнопки в список слоёв
    layersList.appendChild(showHistoryButton)
    layersList.appendChild(clearHistoryButton)
    layersList.appendChild(historyButton)
    layersList.appendChild(gpxActualButton)
  }
}, 100)

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

map.whenReady(() => {
  locateControl.start() // Активируем слежение за местоположением
})

// Создание кнопок в нижнем левом углу
const ButtonsControl = L.Control.extend({
  options: {
    position: 'bottomleft'
  },

  onAdd: function (map) {
    buttonsContainer = L.DomUtil.create('div')

    // Кнопка "Показать историю"
    const showButton = L.DomUtil.create('button', 'custom-button', buttonsContainer)
    showButton.innerHTML = 'Показать историю'
    showButton.id = 'showButton'
    L.DomEvent.on(showButton, 'click', getHistoryPoints)

    // Кнопка "Очистить историю" (скрыта по умолчанию)
    const clearButton = L.DomUtil.create('button', 'custom-button', buttonsContainer)
    clearButton.innerHTML = 'Очистить историю'
    clearButton.id = 'clearButton'
    clearButton.style.display = 'none'
    L.DomEvent.on(clearButton, 'click', clearMarkers)

    return buttonsContainer
  }
})
// Создаем попап для отображения списка точек на руках
const noInstallPopup = L.popup()

// Добавление кнопок на карту
map.addControl(new ButtonsControl())

new L.GPX('./lib/50km-area.gpx', {
  async: true,
  polyline_options: { color: 'red', weight: 3, opacity: 0.9 },
  marker_options: {
    startIconUrl: '',
    endIconUrl: '',
    wptIconUrls: {}
  },
  get_marker: function () { return null }
}).addTo(map)

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
//
// new L.GPX('./lib/граница восток4.gpx', {
//   async: true,
//   polyline_options: { color: 'green', weight: 3, opacity: 1 },
//   marker_options: {
//     startIconUrl: '',
//     endIconUrl: '',
//     wptIconUrls: {}
//   },
//   get_marker: function () { return null }
// }).addTo(map)

// Функция удаления маркеров
function clearMarkers () {
  historyMarkers.forEach(marker => map.removeLayer(marker))
  historyMarkers = []

  toggleButtons() // Переключаем кнопки
}

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
      Телефон для связи: +79006356625
    </div>
    <img src="img/service.png" alt="Точка 4х4" style="width:50px;">
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

// document.addEventListener('DOMContentLoaded', function () {
  // ✅ Создаем элемент для крестика
  const crosshair = document.createElement('div')
  crosshair.className = 'map-crosshair'
  document.body.appendChild(crosshair)

  // ✅ Создаем элемент для отображения координат
  const coordDisplay = document.createElement('div')
  coordDisplay.className = 'coord-display'
  document.body.appendChild(coordDisplay)

  // ✅ Функция обновления координат
  function updateCoordinates () {
    const center = map.getCenter()
    const coordsText = `${center.lat.toFixed(6)}, ${center.lng.toFixed(6)}`
    coordDisplay.innerText = `${coordsText}`
    coordDisplay.setAttribute('data-coords', coordsText) // Корректное сохранение
  }

  // ✅ Обработчик клика для копирования координат
  coordDisplay.addEventListener('click', function () {
    const coords = coordDisplay.getAttribute('data-coords') // Читаем атрибут с координатами
    navigator.clipboard.writeText(coords).then(() => {
      coordDisplay.innerText = `✅ Скопировано!`
      setTimeout(updateCoordinates, 1000) // Вернуть координаты через 1 сек.
    }).catch(err => console.error('Ошибка копирования:', err))
  })

  // ✅ Обновляем координаты при движении карты
  map.on('move', updateCoordinates)
  updateCoordinates() // Обновляем при загрузке
// })

// Функция для воспроизведения звука
function playSound () {
  const audio = new Audio('./sound_30.mp3')

  audio.play().then(() => {
    console.log('Звук успешно проигран')
  }).catch(error => {
    console.error('Ошибка при воспроизведении звука:', error)
  })
}

const markers = [] // Для хранения маркеров
const playedSounds = new Set() // Для предотвращения повторного воспроизведения звука

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
    let historyLines = {} // Хранение линий истории для каждой точки
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

      if (rang === 'Лайт') {
        litePoints += 1
      } else if (rang === 'Хард') {
        hardPoints += 1
      } else {
        elsePoints += 1
      }

      const popupContent = `
  <b>${rang} ${name}</b><br>
  Координаты: <span id="copy-coords" style="cursor: pointer">${lat}, ${lon}</span><br>
  Рейтинг точки: ${rating}<br>
  Точку установил: ${point.installed}<br>
  ${point.comment}<br>
  Точка установлена: ${getDaysSinceInstallation(installTime)} ${declOfNum(getDaysSinceInstallation(installTime), 'дней')} назад <br>
  <button class="one-gpx-download" data-lat="${lat}" data-lon="${lon}" data-name="${name}" data-comment="${comment}">
    Скачать GPX файл этой точки
  </button><br>
  <button class="load-history" data-name="${name}">История перемещения точки</button><br>
  <label class="circle-toggle">
    <input type="checkbox" class="show-circle" data-lat="${lat}" data-lon="${lon}">
    Показать зону ${RADIUS} метров
  </label>
  <!-- Изображение в попапе, изначально маленькое -->
  <div style="display: flex; align-items: center;">
    <img id="popup-photo" src="https://point-map.ru/photo/telegram/${point.photo}" 
      style="width: 100%; cursor: pointer; margin-right: 10px;" alt="Фото">
  </div>
`

      marker.bindPopup(popupContent)

// Используем делегирование событий для обработки клика
      marker.on('popupopen', () => {
        // Находим элемент попапа и добавляем обработчик для клика по изображениям внутри
        const popupElement = marker.getPopup().getElement()
        popupElement.addEventListener('click', function (event) {
          // Проверяем, был ли клик по изображению
          if (event.target && event.target.id === 'popup-photo') {
            openFullSizeImage(event.target.src)
          }
        })
      })

// Функция для открытия изображения в полном размере
      function openFullSizeImage (imageUrl) {
        // Создаем модальное окно
        const modal = document.createElement('div')
        modal.style.position = 'fixed'
        modal.style.top = '0'
        modal.style.left = '0'
        modal.style.width = '100%'
        modal.style.height = '100%'
        modal.style.backgroundColor = 'rgba(0, 0, 0, 0.8)'
        modal.style.display = 'flex'
        modal.style.justifyContent = 'center'
        modal.style.alignItems = 'center'
        modal.style.zIndex = '9999'

        // Создаем изображение
        const img = document.createElement('img')
        img.src = imageUrl
        img.style.maxWidth = '90%'
        img.style.maxHeight = '90%'
        img.style.cursor = 'pointer'

        // Закрытие модального окна при клике на изображение
        img.addEventListener('click', () => {
          document.body.removeChild(modal)
        })

        modal.appendChild(img)
        document.body.appendChild(modal)
      }

      // Обработчик при открытии попапа
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

          // Обработчик загрузки истории точки
          const historyBtn = popupEl.querySelector('.load-history')
          if (historyBtn) {
            historyBtn.addEventListener('click', async function () {
              const pointName = this.dataset.name
              await loadPointHistory(pointName, marker)
            })
          }
        }, 100)
      })
      marker.on('popupopen', () => {
        document.addEventListener('click', function copyHandler (event) {
          if (event.target && event.target.id === 'copy-coords') {
            const button = event.target // Получаем кнопку
            const originalText = button.innerText // Сохраняем оригинальный текст

            const textToCopy = `${lat}, ${lon}`
            navigator.clipboard.writeText(textToCopy).then(() => {
              button.innerHTML = `<span style="color: green; font-weight: bold;">✅ Скопировано!</span>`
              // Через 1 секунду возвращаем обратно координаты
              setTimeout(() => {
                button.innerText = originalText
              }, 1000)
            }).catch(err => console.error('Ошибка копирования:', err))

            // Убираем обработчик после копирования (чтобы не дублировался)
            document.removeEventListener('click', copyHandler)
          }
        })
      })

    }
    const pointId = getQueryParam('id')
    const pointType = getQueryParam('type')
    const point = getQueryParam('point')

    if (pointId) {
      if (pointType === 'install' && point) {
        fetch(`https://point-map.ru/points/?point=${pointId}`)  // Запрос к API
          .then(response => response.json())
          .then(point => {
            const rawCoordinates = point[0].coordinates.split(',')
            const lat = parseFloat(rawCoordinates[0])
            const lon = parseFloat(rawCoordinates[1])
            map.setView([lat, lon], 10)
          })
          .catch(err => console.error('Ошибка загрузки точки:', err))
      } else if (pointType === 'take') {

        fetch(`https://point-map.ru/pointsHistory/?id=${pointId}`)  // Запрос к API
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

    addGPXControl(pointsArray, 'actual')
    document.getElementById('msg').innerHTML = ''

    const infoDiv = document.createElement('div')
    infoDiv.id = 'points-info'
    infoDiv.innerHTML = `
  <div>🟢 Лайт: <span id="lite-count">0</span></div>
  <div>🔴 Хард: <span id="hard-count">0</span></div>
  <div>🔵 Прочее: <span id="else-count">0</span></div>
  <div id="noInstall">На руках: <span id="noInstall-count">0</span></div>
`
    document.body.appendChild(infoDiv)
    document.getElementById('lite-count').textContent = litePoints
    document.getElementById('hard-count').textContent = hardPoints
    document.getElementById('else-count').textContent = elsePoints
    document.getElementById('noInstall-count').textContent = noInstall

// Обработчик клика на строку "На руках"
    document.getElementById('noInstall').addEventListener('click', function (event) {
      const rect = event.target.getBoundingClientRect()
      const clickPoint = map.containerPointToLatLng([
        rect.left + rect.width / 2 - 130,
        rect.top - 70
      ])

      const noInstallPoints = data.filter(point => !point.install)

      showNoInstallPopup(noInstallPoints)

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
    const daysSinceTake = getDaysSinceInstallation(point.takeTimestamp)
    popupContent += `<div>${point.point} - ${daysSinceTake} ${declOfNum(daysSinceTake, 'дней')} назад, Взял: ${point.installed}</div>`
  })
  noInstallPopup.setContent(popupContent)
}

/**
 * Загружает историю указанной точки и строит линию на карте
 */
async function loadPointHistory (pointName, marker) {
  try {
    let circles = {}
    let latlngs = []
    const response = await fetch(`https://point-map.ru/pointsHistory?name=${encodeURIComponent(pointName)}`)
    console.log('response', response)
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
  // Удаляем линии
  Object.values(historyLines).forEach(line => map.removeLayer(line))
  historyLines = {}

  // Удаляем маркеры архивных точек
  historyMarkers.forEach(marker => map.removeLayer(marker))
  historyMarkers = []
  clearButton.style.display = 'none'
}

const clearButton = L.DomUtil.create('button', 'custom-button', buttonsContainer)
clearButton.innerHTML = 'Очистить историю'
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

function addGPXControl (points, status) {
  if (status === 'actual') {
    const gpxControl = L.control({ position: 'bottomleft' }) // Кнопка в левом нижнем углу

    gpxControl.onAdd = function () {
      const div = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-custom')
      div.innerHTML = '<button id="downloadGPX" class="gpx-button downloadGPX">Скачать GPX актуальных точек</button>'

      L.DomEvent.on(div, 'mousedown dblclick', L.DomEvent.stopPropagation)
        .on(div, 'click', function () {
          const gpxContent = generateGPX(points)
          const date = new Date()
          const formattedDate = `${String(date.getFullYear()).slice(2)}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}-${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}`

          downloadGPX(`points-${formattedDate}.gpx`, gpxContent)
        })

      return div
    }

    gpxControl.addTo(map)
  } else {
    const historygGpxControl = L.control({ position: 'bottomleft' }) // Кнопка в левом нижнем углу

    historygGpxControl.onAdd = function () {
      const div = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-custom')
      div.innerHTML = '<button id="downloadHistoryGPX" class="gpx-button downloadGPX">Скачать GPX архивных точек</button>'

      L.DomEvent.on(div, 'mousedown dblclick', L.DomEvent.stopPropagation)
        .on(div, 'click', function () {
          const gpxContent = generateGPX(points)
          const date = new Date()
          const formattedDate = `${String(date.getFullYear()).slice(2)}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}-${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}`

          downloadGPX(`history-points-${formattedDate}.gpx`, gpxContent)
        })

      return div
    }

    historygGpxControl.addTo(map)
  }
}

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
  addGPXControl(archivePoints, 'history')
}

function setRangColor (rang, pointId) {
  if (pointId) {
    return 'rgb(255,152,0)'
  }
  if (!rang) {
    return 'rgb(84,84,243)'
  }
  if (rang === 'Лайт') {
    return 'rgb(26,165,45)'
  } else {
    return 'rgb(241,5,5)'
  }
}

function addScreenBlinkEffect () {
  const overlay = document.getElementById('screen-overlay')
  if (!overlay) {
    console.error('Элемент #screen-overlay не найден!')
    return
  }

  // Показываем элемент и включаем анимацию
  overlay.style.display = 'block'
  overlay.style.animation = 'screen-blink 1s linear 3' // 3 цикла анимации (1 секунда каждый)

  // Убираем эффект через 3 секунды
  setTimeout(() => {
    overlay.style.animation = ''
    overlay.style.display = 'none'
  }, 3000)
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
      if (distance <= 30) {
        if (!playedSounds.has(marker)) {
          playSound()
          addScreenBlinkEffect()
          playedSounds.add(marker) // Запоминаем, что звук для этой точки уже воспроизведен
        }
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

let activePoint = null

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

function getDaysSinceInstallation (timestamp) {
  const currentDate = new Date()
  const installationDate = new Date(timestamp)

  // Разница в днях, считая смену даты
  return Math.ceil((currentDate - installationDate) / (1000 * 60 * 60 * 24))
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

document.getElementById('playSoundButton').addEventListener('click', () => {
  playSound()
  addScreenBlinkEffect()
})

const showHistoryBtn = document.getElementById('showHistory')
if (showHistoryBtn) {
  showHistoryBtn.addEventListener('click', () => {
    getHistoryPoints()
  })
}