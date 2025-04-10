import { MongoClient } from 'mongodb'
import { BOT_TOKEN, MONGO_URL } from './auth/data.mjs'
import cors from 'cors'
import express from 'express'
import crypto from 'crypto'

const client = new MongoClient(MONGO_URL)
await client.connect()
console.log('Connected successfully to db')

const db = client.db('liteoffroad')
const pointsCollection = db.collection('points')
const historyCollection = db.collection('historyPoints')

const PORT = 3000
const app = express()

app.use(express.json()) // Добавляем JSON-парсер
app.use(cors()) // Разрешаем CORS

// function checkTelegramAuth (data) {
//   const secret = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest()
//
//   // Преобразуем строку запроса в объект
//   const params = new URLSearchParams(data)
//   const hash = params.get('hash')
//   params.delete('hash')
//
//   // Сортируем параметры
//   const sortedParams = [...params.entries()]
//     .map(([key, value]) => `${key}=${value}`)
//     .sort()
//     .join('\n')
//
//   // Создаем подпись
//   const calculatedHash = crypto.createHmac('sha256', secret)
//     .update(sortedParams)
//     .digest('hex')
//
//   return calculatedHash === hash
// }
//
// // Пример использования (на сервере)
// app.get('/auth', (req, res) => {
//   console.log('123')
//   if (checkTelegramAuth(req.query)) {
//     res.send('✅ Авторизация успешна!')
//   } else {
//     res.status(403).send('❌ Ошибка авторизации!')
//   }
// })

app.get("/auth", (req, res) => {
  const data = req.query;

  if (!verifyTelegramData(data)) {
    return res.status(403).send("Ошибка авторизации!");
  }

  res.send(`Привет, ${data.first_name}! Авторизация успешна.`);
});

// 📌 Функция проверки данных Telegram
function verifyTelegramData(data) {
  const checkHash = data.hash;
  const secretKey = crypto.createHmac("sha256", BOT_TOKEN).update("WebAppData").digest();

  const sortedData = Object.keys(data)
    .filter(key => key !== "hash")
    .sort()
    .map(key => `${key}=${data[key]}`)
    .join("\n");

  const hash = crypto.createHmac("sha256", secretKey).update(sortedData).digest("hex");

  return hash === checkHash;
}

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
      query.id = parseInt(id, 10); // Фильтруем по конкретному ID
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

app.listen(PORT, () => {
  console.log(`Server is listening on port ${PORT}`)
})
