import { MongoClient } from 'mongodb'
import { MONGO_URL } from './auth/data.mjs'
import cors from 'cors'
import express from 'express'

const client = new MongoClient(MONGO_URL)
console.log('Connected successfully to db')

const PORT = 3000
const app = express()
app.use(cors())

app.get('/points', async (req, res) => {
  try {
    await client.connect()
    console.log('Connected to the MongoDB database.')

    const db = client.db('liteoffroad')
    const collection = db.collection('points')

    const cursor = await collection.find()
    let i = 0
    const points = []

    for (let data = await cursor.next(); data !== null; data = await cursor.next()) {
      i++
      const point = {
        name: data.point,
        coordinates: data.coordinates,
        comment: data.comment,
        rating: data.rating,
        installed: data.installed,
        rang: data.rang,
        takeTimestamp: data.takeTimestamp,
      }
      points.push(point)
    }
    if (points.length) {

      console.log('Starting')
    }
    console.log('[server]: points is ready %)')
    res.status(200).json(points)
  } catch (err) {
    res.status(500).json({ error: 'Database error' })
    console.error('Error fetching data from database', err)
  } finally {
    await client.close()
  }
})

app.get('/pointsHistory', async (req, res) => {
  try {
    await client.connect()
    console.log('Connected to the MongoDB database.')

    const db = client.db('liteoffroad')
    const collection = db.collection('historyPoints')

    const cursor = await collection.find()
    let i = 0
    const historyPoints = []

    for (let data = await cursor.next(); data !== null; data = await cursor.next()) {
      i++
      const point = {
        name: data.point,
        coordinates: data.coordinates,
        comment: data.comment,
        rating: data.rating,
        installed: data.installed,
        rang: data.rang,
        takeTimestamp: data.takeTimestamp
      }
      historyPoints.push(point)
    }
    if (historyPoints.length) {

      console.log('Starting get historyPoints')
    }
    console.log('[server]: historyPoints is ready %)')
    res.status(200).json(historyPoints)
  } catch (err) {
    res.status(500).json({ error: 'Database error' })
    console.error('Error fetching historyPoints from database', err)
  } finally {
    await client.close()
  }
})

app.use((req, res) => {
  res.status(404).send('404 Not Found')
})

app.listen(PORT, () => {
  console.log(`Server is listening on port ${PORT}`)
})
