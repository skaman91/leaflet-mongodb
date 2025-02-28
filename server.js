import { MongoClient } from 'mongodb'
import { MONGO_URL } from './auth/data.mjs'
import cors from 'cors'
import express from 'express'

const client = new MongoClient(MONGO_URL)
await client.connect() // Подключаемся один раз
console.log('Connected successfully to db')

const db = client.db('liteoffroad')
const pointsCollection = db.collection('points')
const historyCollection = db.collection('historyPoints')

const PORT = 3000
const app = express()

app.use(express.json()) // Добавляем JSON-парсер
app.use(cors()) // Разрешаем CORS

// Логирование запросов
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`)
  next()
})

app.get('/points', async (req, res) => {
  try {
    const points = await pointsCollection.find().toArray()
    res.status(200).json(points)
  } catch (err) {
    res.status(500).json({ error: 'Database error' })
    console.error('Error fetching data from database', err)
  }
})

app.get('/pointsHistory', async (req, res) => {
  try {
    const pointName = req.query.name
    console.log('pointName', pointName)

    const query = pointName ? { point: pointName } : {}
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
