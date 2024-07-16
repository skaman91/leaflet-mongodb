// import { FETCH_URL } from './auth/data.mjs'
const map = L.map('map').setView([60.024828, 30.338195], 10)
document.getElementById("msg").innerHTML = 'Загружаю точки...'
//osm Layer
const OSM = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '<b>Liteoffroad "Застрянь друга"</b>'
})
OSM.addTo(map)

// OSM layer
const cyclOSM = L.tileLayer('https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png', {
  attribution: '<b>Liteoffroad "Застрянь друга"</b>'  })

//google2 Layer
const googleSat = L.tileLayer('http://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',{
  subdomains:['mt0','mt1','mt2','mt3'],
  attribution: '<b>Liteoffroad "Застрянь друга"</b>'
})

//layer Controls
const baseLayers = {
  "OpenStreetMap": OSM,
  "OSM": cyclOSM,
  "Google maps": googleSat
}

L.control.layers(baseLayers).addTo(map)

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
          color: "rgb(84,84,243)",
          circleText: circleText,
          circleRatio: 0.65,
          fontSize: 10,
          fontWeight: 800
        }})

      marker.addTo(map)
      const label = `<b>${name}<br>${rawCoorditares}<br>Рейтинг точки: ${point.rating}<br>Точку установил: ${point.installed}</b><br>${point.comment}`
      const popup = marker.bindPopup(label)
      popup.addTo(map)
      document.getElementById("msg").innerHTML = ''
    }
  })
  .catch(error => {
    console.error('There was a problem with the fetch operation:', error)
    document.getElementById("msg").innerHTML = 'Ошибка. Попробуйте обновить страницу.'
  })