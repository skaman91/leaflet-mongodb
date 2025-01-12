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
  locateControl.start(); // Активируем слежение за местоположением
})

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
  })
  .catch(error => {
    console.error('There was a problem with the fetch operation:', error)
    document.getElementById('msg').innerHTML = 'Ошибка. Попробуйте обновить страницу.'
  })

function addScreenBlinkEffect() {
  const overlay = document.getElementById('screen-overlay');
  if (!overlay) {
    console.error('Элемент #screen-overlay не найден!');
    return;
  }

  // Показываем элемент и включаем анимацию
  overlay.style.display = 'block';
  overlay.style.animation = 'screen-blink 1s linear 3'; // 3 цикла анимации (1 секунда каждый)
  document.getElementById('overlay-text').innerHTML = 'ДО ТОЧКИ 30 МЕТРОВ'

  // Убираем эффект через 3 секунды
  setTimeout(() => {
    overlay.style.animation = ''; // Сбрасываем анимацию
    overlay.style.display = 'none'; // Скрываем элемент
  }, 3000);
}

// Функция для проверки, находится ли пользователь в радиусе 30 метров от точки
function isWithinRadius(userLat, userLng, markerLat, markerLng, radiusInMeters) {
  const earthRadius = 6371000; // Радиус Земли в метрах
  const dLat = (markerLat - userLat) * Math.PI / 180;
  const dLng = (markerLng - userLng) * Math.PI / 180;

  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(userLat * Math.PI / 180) * Math.cos(markerLat * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = earthRadius * c;

  return distance <= radiusInMeters;
}

// Отслеживаем положение пользователя
navigator.geolocation.watchPosition(
  position => {
    const userLat = position.coords.latitude;
    const userLng = position.coords.longitude;

    markers.forEach(marker => {
      const markerLat = marker._latlng[0];
      const markerLng = marker._latlng[1];
      if (isWithinRadius(userLat, userLng, markerLat, markerLng, 30)) {
        if (!playedSounds.has(marker)) {
          playSound(); // Воспроизводим звук
          addScreenBlinkEffect(); // Добавляем мерцание экрана
          playedSounds.add(marker); // Запоминаем, что звук для этой точки уже воспроизведен
        }
      }
    });
  },
  error => {
    console.error('Ошибка отслеживания местоположения: ', error.message);
  },
  { enableHighAccuracy: true }
);


// Обработчик клика по кнопке
document.getElementById('playSoundButton').addEventListener('click', () => {
  playSound() // Воспроизведение звука
  addScreenBlinkEffect(); // Добавляем мерцание экрана
})
