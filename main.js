// import { FETCH_URL } from './auth/data.mjs'
const map = L.map('map').setView([60.024828, 30.338195], 10)
document.getElementById('msg').innerHTML = 'Загружаю точки...'
let historyMarkers = []
let archivePoints = []
let buttonsContainer

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

    for (const point of data) {
      if (['точку украли', 'тестовая', 'Новая точка, еще не устанавливалась'].includes(point.comment)) {
        continue
      }
      if (point.coordinates === ',') {
        continue
      }

      const rawCoordinates = point.coordinates.split(',')
      const lat = parseFloat(rawCoordinates[0])
      const lon = parseFloat(rawCoordinates[1])
      if (isNaN(lat) || isNaN(lon)) continue // Проверка на корректность координат

      const name = point.name
      const circleText = name.split(' ')[1]
      const comment = point.comment

      pointsArray.push({ lat, lon, name, comment })

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

      const popupContent = `
        <b>${name}</b><br>
        Координаты: ${lat}, ${lon}<br>
        Рейтинг точки: ${point.rating}<br>
        Точку установил: ${point.installed}<br>
        ${point.comment}<br>
        <button class="one-gpx-download" data-lat="${lat}" data-lon="${lon}" data-name="${name}" data-comment="${point.comment}">
            Скачать GPX файл этой точки
        </button><br>
        <label><input type="checkbox" class="show-circle" data-lat="${lat}" data-lon="${lon}">Показать зону 5 км</label>
      `
      marker.bindPopup(popupContent)

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
    }

    addGPXControl(pointsArray, 'actual')
    document.getElementById('msg').innerHTML = ''

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

  points.forEach(point => {
    gpx += `  <wpt lat="${point.lat}" lon="${point.lon}">
    <name>${point.name}</name>
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
        if (point.name === 'Точка 88') {
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

        const name = point.name
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
    Точку установил: ${point.installed}</b><br>
    ${point.comment}<br>
    <button class="one-gpx-download" data-lat="${lat}" data-lon="${lon}" data-name="${name}" data-comment="${point.comment}">
        Скачать GPX файл этой точки
    </button><br>
    <label><input type="checkbox" class="show-circle" data-lat="${lat}" data-lon="${lon}">Показать зону 5 км</label>
`
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
      console.log('archive points', archivePoints)
      toggleButtons()
    })
    .catch(error => {
      console.error('Ошибка добавления архивной точки:', error)
      document.getElementById('msg').innerHTML = 'Ошибка. Попробуйте обновить страницу.'
    })
  addGPXControl(archivePoints, 'history')
}

function setRangColor (rang) {
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

document.getElementById('playSoundButton').addEventListener('click', () => {
  playSound()
  addScreenBlinkEffect()
})

document.getElementById('showHistory').addEventListener('click', () => {
  getHistoryPoints()
})
