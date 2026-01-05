import { MongoClient } from 'mongodb'
import { BOT_TOKEN, MONGO_URL } from './auth/data.mjs'
import cors from 'cors'
import express from 'express'
import crypto from 'crypto'
import axios from 'axios'
import fs from 'fs'
import https from 'https'

const client = new MongoClient(MONGO_URL)
await client.connect()
console.log('Connected successfully to db')

const db = client.db('liteoffroad')
const pointsCollection = db.collection('points')
const historyCollection = db.collection('historyPoints')
const stateCollection = db.collection('state')
const tracksCollection = db.collection('tracks')
const trackPointsCollection = db.collection('track_points')

const PORT = 3000
const app = express()

app.use(express.json())
app.use(cors())

function checkTelegramAuth(data) {
  const { hash, ...fields } = data

  const secret = crypto.createHash('sha256').update(BOT_TOKEN).digest()

  const sortedData = Object.keys(fields)
    .sort()
    .map(key => `${key}=${fields[key]}`)
    .join('\n')
  console.log('sortedData', sortedData)

  const calculatedHash = crypto
    .createHmac('sha256', secret)
    .update(sortedData)
    .digest('hex')

  return calculatedHash === hash
}


// Авторизация
app.get('/auth', (req, res) => {
  if (checkTelegramAuth(req.query)) {
    console.log('Авторизация успешна!')
    res.redirect('/')
  } else {
    res.status(403).send('❌ Ошибка авторизации!')
  }
})

// загрузка фото точки
app.get('/photo/telegram/:fileId', async (req, res) => {
  const fileId = req.params.fileId

  try {
    const tgRes = await axios.get(`https://api.telegram.org/bot${BOT_TOKEN}/getFile`, {
      params: { file_id: fileId }
    })

    if (!tgRes.data.ok) {
      console.error('❌ Ошибка Telegram API:', tgRes.data)
      return res.status(500).send('Ошибка Telegram API')
    }

    const filePath = tgRes.data.result.file_path
    const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`

    const fileStream = await axios({
      url: fileUrl,
      method: 'GET',
      responseType: 'stream'
    })

    res.setHeader('Content-Type', fileStream.headers['content-type'] || 'application/octet-stream')
    fileStream.data.pipe(res)
  } catch (err) {
    console.error('🔥 Ошибка при получении изображения:', err.message)
    if (err.response?.data) {
      console.error('🔍 Telegram API ответ:', err.response.data)
    }
    res.status(500).send('Ошибка загрузки изображения')
  }
})

app.get('/locations', async (req, res) => {
  try {
    const { chatId } = req.query

    // =============================
    // 1. Запрос с chatId
    // =============================
    if (chatId) {
      const numericChatId = Number(chatId)

      // ищем активный трек юзера
      const activeTrack = await tracksCollection.findOne({
        chatId: numericChatId,
        active: true
      })

      let pointQuery = {}

      if (activeTrack) {
        pointQuery.trackId = activeTrack._id
      } else {
        // если нет активного — берём все его точки
        pointQuery.chatId = numericChatId
      }

      const lastPoint = await trackPointsCollection
        .find(pointQuery)
        .sort({ timestamp: -1 })
        .limit(1)
        .toArray()

      return res.status(200).json(lastPoint[0] || {})
    }

    // =========================================
    // 2. Если chatId НЕ передан → все активные
    // =========================================

    const latestLocations = await tracksCollection.aggregate([

      // только активные треки
      { $match: { active: true } },

      // соединяем с точками
      {
        $lookup: {
          from: 'track_points',
          localField: '_id',
          foreignField: 'trackId',
          as: 'points'
        }
      },

      // разворачиваем массив
      { $unwind: '$points' },

      // упорядочиваем по времени
      { $sort: { 'points.timestamp': -1 } },

      // берём последнюю точку на юзера
      {
        $group: {
          _id: '$chatId',
          chatId: { $first: '$chatId' },
          name: { $first: '$displayName' },
          expiresAt: { $first: '$expiresAt' },
          latitude: { $first: '$points.latitude' },
          longitude: { $first: '$points.longitude' },
          heading: { $first: '$points.heading' },
          accuracy: { $first: '$points.accuracy' },
          speed: { $first: '$points.speed' },
          timestamp: { $first: '$points.timestamp' },
          trackId: { $first: '$_id' }
        }
      }

    ]).toArray()

    res.status(200).json(latestLocations)

  } catch (err) {
    console.error('Error fetching locations:', err)
    res.status(500).json({ error: 'Database error' })
  }
})




// app.get('/auth', (req, res) => {
//   const data = req.query
//
//   if (!verifyTelegramData(data)) {
//     return res.status(403).send('Ошибка авторизации!')
//   }
//
//   res.send(`Привет, ${data.first_name}! Авторизация успешна.`)
// })
//
// // 📌 Функция проверки данных Telegram
// function verifyTelegramData (data) {
//   console.log('data', data)
//   const checkHash = data.hash
//   const secretKey = crypto.createHmac('sha256', BOT_TOKEN).update('WebAppData').digest()
//
//   const sortedData = Object.keys(data)
//     .filter(key => key !== 'hash')
//     .sort()
//     .map(key => `${key}=${data[key]}`)
//     .join('\n')
//
//   const hash = crypto.createHmac('sha256', secretKey).update(sortedData).digest('hex')
//
//   return hash === checkHash
// }

// Логирование запросов
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`)
  next()
})

app.get('/points', async (req, res) => {
  try {
    const { id } = req.query
    let query = {
      comment: { $ne: 'точку украли' },
      name: { $ne: 'Точка 88' }
    }
    if (id) {
      query.id = parseInt(id, 10); // Фильтруем по конкретному ID
    }
    const points = await pointsCollection.find(query)
      .sort({ point: 1 })
      .toArray()
    res.status(200).json(points)
  } catch (err) {
    res.status(500).json({ error: 'Database error' })
    console.error('Error fetching data from database', err)
  }
})

app.get('/pointsHistory', async (req, res) => {
  try {
    const { id } = req.query
    console.log('id', id)

    const pointName = req.query.name
    if (pointName) {
      console.log('pointName', pointName)
    }

    const query = pointName ? { point: pointName } : {}
    if (id) {
      query.id = parseInt(id, 10) // Фильтруем по конкретному ID
    }
    console.log('query', query)
    const historyPoints = await historyCollection.find(query).sort({ takeTimestamp: 1 }).toArray()

    res.status(200).json(historyPoints)
  } catch (err) {
    res.status(500).json({ error: 'Database error' })
    console.error('Error fetching historyPoints from database', err)
  }
})

app.use((req, res) => {
  res.status(404).send('404 Not Found')
})

const options = {
  key: fs.readFileSync('./auth/point-map.ru.key'),
  cert: fs.readFileSync('./auth/point-map.ru.crt') // или .pem
}

https.createServer(options, app).listen(PORT, () => {
  console.log(`HTTPS Server is running on port ${PORT}`)
})

