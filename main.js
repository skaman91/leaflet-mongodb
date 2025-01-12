// import { FETCH_URL } from './auth/data.mjs'
const map = L.map('map').setView([60.024828, 30.338195], 10)
document.getElementById('msg').innerHTML = 'Загружаю точки...'

//osm Layer
const OSM = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '<b>Liteoffroad "Застрянь друга"</b>'
})
OSM.addTo(map)

// OSM layer
const cyclOSM = L.tileLayer('https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png', {
  attribution: '<b>Liteoffroad "Застрянь друга"</b>'
})

//google2 Layer
const googleSat = L.tileLayer('http://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
  subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
  attribution: '<b>Liteoffroad "Застрянь друга"</b>'
})

//layer Controls
const baseLayers = {
  'OpenStreetMap': OSM,
  'OSM': cyclOSM,
  'Google maps': googleSat
}

L.control.layers(baseLayers).addTo(map)

const locateControl = L.control.locate({
  position: 'topright', // Расположение кнопки на карте
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
  locateControl.start(); // Активируем слежение за местоположением
})

// Функция для перемещения карты на текущее местоположение
function moveToLocation() {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      position => {
        const userLat = position.coords.latitude;
        const userLng = position.coords.longitude;
        map.setView([userLat, userLng], 15); // Перемещаем карту и задаем зум
      },
      error => {
        console.error('Ошибка геолокации: ', error.message);
        alert('Не удалось получить геопозицию. Разрешите доступ в настройках браузера.');
      },
      { enableHighAccuracy: true } // Используем высокую точность
    );
  } else {
    alert('Геолокация не поддерживается вашим браузером.');
  }
}

// Создаем кастомную кнопку
const customControl = L.Control.extend({
  options: {
    position: 'topright' // Позиция кнопки на карте
  },
  onAdd: function (map) {
    const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-custom');

    container.style.backgroundColor = 'white';
    container.style.width = '30px';
    container.style.height = '30px';
    container.style.display = 'flex';
    container.style.justifyContent = 'center';
    container.style.alignItems = 'center';
    container.style.cursor = 'pointer';
    container.title = 'Моя геопозиция';

    container.innerHTML = '<i style="font-size:18px;">📍</i>'; // Иконка кнопки (можно заменить)

    // Обработчик клика по кнопке
    container.onclick = moveToLocation;

    return container;
  }
});

// Добавляем кнопку на карту
map.addControl(new customControl());

// Функция для воспроизведения звука
function playSound () {
  const audio = new Audio('./sound_30.mp3')

  audio.play().then(() => {
    console.log('Звук успешно проигран')
  }).catch(error => {
    console.error('Ошибка при воспроизведении звука:', error)
  })
}

// Функция проверки, находится ли пользователь в радиусе 30 метров от точки
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
    for (const point of data) {
      const rawCoorditares = point.coordinates.split(',')
      const name = point.name
      const circleText = name.split(' ')[1]

      const marker = new L.Marker.SVGMarker([rawCoorditares[0], rawCoorditares[1]], {
        iconOptions: {
          color: 'rgb(84,84,243)',
          circleText: circleText,
          circleRatio: 0.65,
          fontSize: 10,
          fontWeight: 800
        }
      })

      marker.addTo(map)
      markers.push(marker) // Добавляем маркер в массив

      const label = `<b>${name}<br>${rawCoorditares}<br>Рейтинг точки: ${point.rating}<br>Точку установил: ${point.installed}</b><br>${point.comment}`
      const popup = marker.bindPopup(label)
      popup.addTo(map)
      document.getElementById('msg').innerHTML = ''
    }
    // locateUser()
  })
  .catch(error => {
    console.error('There was a problem with the fetch operation:', error)
    document.getElementById('msg').innerHTML = 'Ошибка. Попробуйте обновить страницу.'
  })

// Обработчик клика по кнопке
document.getElementById('playSoundButton').addEventListener('click', () => {
  playSound() // Воспроизведение звука
})
