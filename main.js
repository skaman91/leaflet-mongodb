// import { FETCH_URL } from './auth/data.mjs'
const map = L.map('map').setView([60.024828, 30.338195], 10)
document.getElementById('msg').innerHTML = 'Загружаю точки...'
let historyMarkers = []
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

// Функция для воспроизведения звука
function playSound () {
  console.log('1111')
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
    //Markers
    let pointsArray = []
    for (const point of data) {
      if (point.comment === 'точку украли' || point.comment === 'тестовая') {
        continue
      }
      const rawCoorditares = point.coordinates.split(',')
      const lat = rawCoorditares[0]
      const lon = rawCoorditares[1]
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
      markers.push(marker) // Добавляем маркер в массив

      const label = `
    <b>${name}<br>${rawCoorditares}<br>
    Рейтинг точки: ${point.rating}<br>
    Точку установил: ${point.installed}</b><br>
    ${point.comment}<br>
    <button class="one-gpx-download" data-lat="${rawCoorditares[0]}" data-lon="${rawCoorditares[1]}" data-name="${name}" data-comment="${point.comment}">
        Скачать GPX файл этой точки
    </button>`

      const popup = marker.bindPopup(label)
      popup.addTo(map)
      document.getElementById('msg').innerHTML = ''
    }
    console.log('pointsArray', pointsArray)
    addGPXControl(pointsArray, 'actual')
  })
  .catch(error => {
    console.error('There was a problem with the fetch operation:', error)
    document.getElementById('msg').innerHTML = 'Ошибка. Попробуйте обновить страницу.'
  })

map.on('popupopen', function (e) {
  const button = e.popup._contentNode.querySelector('.one-gpx-download');
  if (button) {
    button.addEventListener('click', function () {
      const lat = this.getAttribute('data-lat');
      const lon = this.getAttribute('data-lon');
      const name = this.getAttribute('data-name');
      const comment = this.getAttribute('data-comment');
      const gpxContent = generateGPX([{ lat, lon, name, comment }]);
      downloadGPX(`${name}.gpx`, gpxContent);
    });
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
          downloadGPX('points.gpx', gpxContent)
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
          downloadGPX('historyPoints.gpx', gpxContent)
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

async function getHistoryPoints () {
  let archivePoints = []
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
        const coordinatesField = /^(\d\d\.\d{4,}, \d\d\.\d{4,})$/i.test(point.coordinates)
        if (!coordinatesField) {
          continue
        }
        const rawCoorditares = point.coordinates.split(',')
        const lat = rawCoorditares[0]
        const lon = rawCoorditares[1]
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
        markers.push(marker) // Добавляем маркер в массив

        const label = `
    <b>${name}<br>${rawCoorditares}<br>
    Рейтинг точки: ${point.rating}<br>
    Точку установил: ${point.installed}</b><br>
    ${point.comment}<br>
    <button class="one-gpx-download" data-lat="${rawCoorditares[0]}" data-lon="${rawCoorditares[1]}" data-name="${name}" data-comment="${point.comment}">
        Скачать GPX файл этой точки
    </button>`
        const popup = marker.bindPopup(label)
        popup.addTo(map)
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

    // Проверяем, есть ли точки в пределах 100 м
    for (const marker of markers) {
      const markerLat = marker._latlng[0]
      const markerLng = marker._latlng[1]
      const distance = calculateDistance(userLat, userLng, markerLat, markerLng)

      if (distance <= 100) {
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
          playSound() // Воспроизводим звук
          addScreenBlinkEffect() // Добавляем мерцание экрана
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

let activePoint = null // Текущая активная точка

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

// Обработчик клика по кнопке
document.getElementById('playSoundButton').addEventListener('click', () => {
  playSound() // Воспроизведение звука
  addScreenBlinkEffect() // Добавляем мерцание экрана
})

document.getElementById('showHistory').addEventListener('click', () => {
  getHistoryPoints()
})
