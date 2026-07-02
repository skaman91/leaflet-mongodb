import { MongoClient, ObjectId } from 'mongodb'
import { BOT_TOKEN, MONGO_URL, SESSION_SECRET as JWT_SECRET, RESEND_API_KEY } from './auth/data.mjs'
import { Resend } from 'resend'
import cors from 'cors'
import express from 'express'
import crypto from 'crypto'
import fs from 'fs'
import https from 'https'
import path from 'path'
import axios from "axios"
import { HttpsProxyAgent } from "https-proxy-agent"
import multer from 'multer'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'

const proxyAgent = new HttpsProxyAgent("http://95.85.229.24:8888")
const resend = new Resend(RESEND_API_KEY)

const client = new MongoClient(MONGO_URL)
await client.connect()
console.log('Connected successfully to db')

const db = client.db('liteoffroad')
const pointsCollection = db.collection('points')
const historyCollection = db.collection('historyPoints')
const stateCollection = db.collection('state')
const tracksCollection = db.collection('tracks')
const trackPointsCollection = db.collection('track_points')
const routesCollection    = db.collection('routes')
const reviewsCollection   = db.collection('route_reviews')
const usersCollection     = db.collection('route_users')
const downloadsCollection = db.collection('route_downloads')

// Назначаем skaman администратором (идемпотентно)
usersCollection.updateOne({ username: 'skaman' }, { $set: { role: 'admin' } }).catch(console.error)

// Индексы под горячие запросы (createIndex идемпотентен)
Promise.all([
  tracksCollection.createIndex({ active: 1 }),
  tracksCollection.createIndex({ chatId: 1, active: 1 }),
  trackPointsCollection.createIndex({ trackId: 1, timestamp: -1 }),
  trackPointsCollection.createIndex({ chatId: 1, timestamp: -1 }),
  pointsCollection.createIndex({ point: 1 }),
  historyCollection.createIndex({ point: 1, takeTimestamp: 1 }),
  historyCollection.createIndex({ id: 1 }),
  usersCollection.createIndex({ username: 1 }),
  usersCollection.createIndex({ email: 1 }),
  routesCollection.createIndex({ isPublic: 1, createdAt: -1 }),
  routesCollection.createIndex({ 'author.chatId': 1, createdAt: -1 }),
  reviewsCollection.createIndex({ routeId: 1, createdAt: -1 })
]).catch(err => console.error('Ошибка создания индексов:', err))

const PHOTO_CACHE_DIR = path.join(process.cwd(), 'cache', 'photos')
fs.mkdirSync(PHOTO_CACHE_DIR, { recursive: true })

const GPX_DIR = path.join(process.cwd(), 'gpx_tracks')
fs.mkdirSync(GPX_DIR, { recursive: true })

const PORT = 3000
const app = express()
const proxyConfig = {
  host: "95.85.229.24",
  port: 8888,
  protocol: "http"
}

app.use(express.json())

const isDev = process.env.NODE_ENV !== 'production'
app.use(cors({
  origin: isDev ? true : ['https://point-map.ru'],
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}))

if (isDev) {
  app.use(express.static('.'))
}

// ─── Multer для GPX ───────────────────────────────────────────────────────────
const gpxStorage = multer.diskStorage({
  destination: GPX_DIR,
  filename: (req, file, cb) => {
    const uid = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    cb(null, `${uid}.gpx`)
  }
})
const upload = multer({
  storage: gpxStorage,
  fileFilter: (req, file, cb) => {
    const ok = file.originalname.toLowerCase().endsWith('.gpx')
    cb(ok ? null : new Error('Только GPX файлы'), ok)
  },
  limits: { fileSize: 10 * 1024 * 1024 }
})

// ─── JWT middleware ────────────────────────────────────────────────────────────
async function authRequired(req, res, next) {
  const auth = req.headers.authorization
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Не авторизован' })
  try {
    req.user = jwt.verify(auth.slice(7), JWT_SECRET)
  } catch {
    return res.status(401).json({ error: 'Токен недействителен' })
  }
  try {
    const user = await usersCollection.findOne(
      { _id: new ObjectId(req.user.chatId) },
      { projection: { banned: 1, role: 1 } }
    )
    if (user?.banned) return res.status(403).json({ error: 'Аккаунт заблокирован' })
    if (user?.role) req.user.role = user.role  // актуальная роль из БД
  } catch {
    // Telegram-юзеры не в usersCollection — пропускаем
  }
  next()
}

// ─── Расчёт дистанции из GPX ──────────────────────────────────────────────────
function parseGpxDistance(filePath) {
  try {
    const xml = fs.readFileSync(filePath, 'utf-8')
    const pts = [...xml.matchAll(/lat="([^"]+)"[^>]*lon="([^"]+)"/g)]
      .map(m => [parseFloat(m[1]), parseFloat(m[2])])
    let d = 0
    for (let i = 1; i < pts.length; i++) {
      const [lat1, lon1] = pts[i - 1]
      const [lat2, lon2] = pts[i]
      const R = 6371
      const dLat = (lat2 - lat1) * Math.PI / 180
      const dLon = (lon2 - lon1) * Math.PI / 180
      const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
      d += R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    }
    return Math.round(d * 10) / 10
  } catch {
    return 0
  }
}

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
  const fileId = req.params.fileId.replace(/[^a-zA-Z0-9_-]/g, '')
  if (!fileId) return res.status(400).send('Некорректный fileId')

  const cachePath = path.join(PHOTO_CACHE_DIR, fileId)

  // отдаём из кеша если файл уже скачан
  if (fs.existsSync(cachePath)) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    return res.sendFile(cachePath)
  }

  try {
    const tgRes = await axios.get(
      `https://api.telegram.org/bot${BOT_TOKEN}/getFile`,
      { params: { file_id: fileId }, httpsAgent: proxyAgent }
    )

    if (!tgRes.data.ok) {
      console.error('❌ Ошибка Telegram API:', tgRes.data)
      return res.status(500).send('Ошибка Telegram API')
    }

    const filePath = tgRes.data.result.file_path
    const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`

    const fileStream = await axios({
      url: fileUrl,
      method: 'GET',
      responseType: 'stream',
      httpsAgent: proxyAgent
    })

    const contentType = fileStream.headers['content-type'] || 'image/jpeg'
    res.setHeader('Content-Type', contentType)
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')

    const cacheWriteStream = fs.createWriteStream(cachePath)

    fileStream.data.on('data', chunk => {
      res.write(chunk)
      cacheWriteStream.write(chunk)
    })

    fileStream.data.on('end', () => {
      res.end()
      cacheWriteStream.end()
    })

    fileStream.data.on('error', err => {
      console.error('🔥 Ошибка стрима:', err)
      cacheWriteStream.destroy()
      fs.unlink(cachePath, () => {})
      if (!res.headersSent) res.status(500).send('Ошибка загрузки изображения')
    })

    cacheWriteStream.on('error', () => fs.unlink(cachePath, () => {}))

  } catch (err) {
    console.error('🔥 Ошибка при получении изображения:', err)
    if (err.response?.data) console.error('🔍 Telegram API ответ:', err.response.data)
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

// ─── Регистрация ──────────────────────────────────────────────────────────────
app.post('/auth/register', async (req, res) => {
  const { username, email, password } = req.body
  if (!username?.trim() || !email?.trim() || !password)
    return res.status(400).json({ error: 'Укажите имя, email и пароль' })
  if (password.length < 4) return res.status(400).json({ error: 'Пароль минимум 4 символа' })
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
    return res.status(400).json({ error: 'Некорректный email' })

  const name = username.trim()
  const normalEmail = email.trim().toLowerCase()

  const exists = await usersCollection.findOne({
    $or: [{ username: name.toLowerCase() }, { email: normalEmail }]
  })
  if (exists?.username === name.toLowerCase()) return res.status(409).json({ error: 'Имя уже занято' })
  if (exists?.email === normalEmail) return res.status(409).json({ error: 'Email уже используется' })

  const hash = await bcrypt.hash(password, 10)
  const result = await usersCollection.insertOne({
    username: name.toLowerCase(),
    displayName: name,
    email: normalEmail,
    password: hash,
    createdAt: new Date()
  })

  const token = jwt.sign({ chatId: result.insertedId.toString(), name }, JWT_SECRET, { expiresIn: '30d' })
  res.json({ token, name })
})

// ─── Вход ─────────────────────────────────────────────────────────────────────
app.post('/auth/login', async (req, res) => {
  const { username, password } = req.body
  if (!username?.trim() || !password) return res.status(400).json({ error: 'Укажите имя и пароль' })

  const user = await usersCollection.findOne({ username: username.trim().toLowerCase() })
  if (!user) return res.status(401).json({ error: 'Неверное имя или пароль' })

  const ok = await bcrypt.compare(password, user.password)
  if (!ok) return res.status(401).json({ error: 'Неверное имя или пароль' })
  if (user.banned) return res.status(403).json({ error: 'Аккаунт заблокирован' })

  const token = jwt.sign(
    { chatId: user._id.toString(), name: user.displayName, role: user.role || 'user' },
    JWT_SECRET, { expiresIn: '30d' }
  )
  res.json({ token, name: user.displayName, role: user.role || 'user' })
})

// ─── Авторизация через Telegram Widget ────────────────────────────────────────
app.post('/auth/telegram', (req, res) => {
  if (!checkTelegramAuth(req.body)) return res.status(403).json({ error: 'Ошибка авторизации' })
  const { id, first_name, last_name } = req.body
  const name = [first_name, last_name].filter(Boolean).join(' ')
  const token = jwt.sign({ chatId: id, name }, JWT_SECRET, { expiresIn: '30d' })
  res.json({ token, name })
})

// ─── Профиль пользователя ─────────────────────────────────────────────────────
app.get('/auth/profile', authRequired, async (req, res) => {
  try {
    const chatId = req.user.chatId

    let user = null
    try { user = await usersCollection.findOne({ _id: new ObjectId(chatId) }, { projection: { password: 0 } }) } catch {}

    const [uploadedCount, riddenCount, downloadedCount, commentCount] = await Promise.all([
      routesCollection.countDocuments({ 'author.chatId': chatId }),
      routesCollection.countDocuments({ 'riddenUsers.chatId': chatId }),
      downloadsCollection.countDocuments({ chatId }),
      reviewsCollection.countDocuments({ 'author.chatId': chatId })
    ])

    res.json({
      name: user?.displayName || req.user.name,
      email: user?.email || null,
      createdAt: user?.createdAt || null,
      rank: user?.role || null,
      hasPassword: !!user?.password,
      uploadedCount,
      riddenCount,
      downloadedCount,
      commentCount
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Ошибка' })
  }
})

// ─── Смена пароля ─────────────────────────────────────────────────────────────
app.patch('/auth/password', authRequired, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body
    if (!currentPassword || !newPassword)
      return res.status(400).json({ error: 'Укажите текущий и новый пароль' })
    if (newPassword.length < 4)
      return res.status(400).json({ error: 'Новый пароль минимум 4 символа' })

    const user = await usersCollection.findOne({ _id: new ObjectId(req.user.chatId) })
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' })

    const ok = await bcrypt.compare(currentPassword, user.password)
    if (!ok) return res.status(401).json({ error: 'Неверный текущий пароль' })

    await usersCollection.updateOne(
      { _id: new ObjectId(req.user.chatId) },
      { $set: { password: await bcrypt.hash(newPassword, 10) } }
    )
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: 'Ошибка' })
  }
})

// ─── Забыл пароль ────────────────────────────────────────────────────────────
app.post('/auth/forgot-password', async (req, res) => {
  const { email } = req.body
  if (!email?.trim()) return res.status(400).json({ error: 'Укажите email' })

  // Всегда отвечаем 200, чтобы не раскрывать существование email
  res.json({ ok: true })

  try {
    const user = await usersCollection.findOne({ email: email.trim().toLowerCase() })
    if (!user) return

    const token = crypto.randomBytes(32).toString('hex')
    const expiry = new Date(Date.now() + 60 * 60 * 1000) // 1 час

    await usersCollection.updateOne(
      { _id: user._id },
      { $set: { resetToken: token, resetTokenExpiry: expiry } }
    )

    const link = `https://point-map.ru/?reset=${token}`
    await resend.emails.send({
      from: 'Liteoffroad <noreply@point-map.ru>',
      to: user.email,
      subject: 'Сброс пароля — Liteoffroad point-map.ru',
      html: `
        <p>Привет, ${user.displayName}!</p>
        <p>Для сброса пароля перейди по ссылке (действительна 1 час):</p>
        <p><a href="${link}">${link}</a></p>
        <p>Если ты не запрашивал сброс — просто проигнорируй это письмо.</p>
      `
    })
  } catch (err) {
    console.error('forgot-password error:', err)
  }
})

// ─── Сброс пароля по токену ───────────────────────────────────────────────────
app.post('/auth/reset-password', async (req, res) => {
  const { token, newPassword } = req.body
  if (!token || !newPassword) return res.status(400).json({ error: 'Укажите токен и новый пароль' })
  if (newPassword.length < 6) return res.status(400).json({ error: 'Пароль минимум 6 символов' })

  try {
    const user = await usersCollection.findOne({
      resetToken: token,
      resetTokenExpiry: { $gt: new Date() }
    })
    if (!user) return res.status(400).json({ error: 'Ссылка недействительна или истекла' })

    await usersCollection.updateOne(
      { _id: user._id },
      {
        $set: { password: await bcrypt.hash(newPassword, 10) },
        $unset: { resetToken: '', resetTokenExpiry: '' }
      }
    )
    res.json({ ok: true })
  } catch (err) {
    console.error('reset-password error:', err)
    res.status(500).json({ error: 'Ошибка' })
  }
})

// ─── Бан пользователя (только admin) ─────────────────────────────────────────
app.post('/auth/ban/:userId', authRequired, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Нет прав' })
  try {
    const result = await usersCollection.updateOne(
      { _id: new ObjectId(req.params.userId) },
      { $set: { banned: true } }
    )
    if (!result.matchedCount) return res.status(404).json({ error: 'Пользователь не найден' })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: 'Ошибка' })
  }
})

app.post('/auth/unban/:userId', authRequired, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Нет прав' })
  try {
    await usersCollection.updateOne({ _id: new ObjectId(req.params.userId) }, { $unset: { banned: '' } })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: 'Ошибка' })
  }
})

// ─── Публичный профиль пользователя ──────────────────────────────────────────
app.get('/users/:chatId', async (req, res) => {
  try {
    const chatId = req.params.chatId
    let user = null
    try { user = await usersCollection.findOne({ _id: new ObjectId(chatId) }, { projection: { password: 0, email: 0 } }) } catch {}

    const [uploadedCount, riddenCount, downloadedCount, commentCount] = await Promise.all([
      routesCollection.countDocuments({ 'author.chatId': chatId }),
      routesCollection.countDocuments({ 'riddenUsers.chatId': chatId }),
      downloadsCollection.countDocuments({ chatId }),
      reviewsCollection.countDocuments({ 'author.chatId': chatId })
    ])

    res.json({
      name: user?.displayName || chatId,
      rank: user?.rank || null,
      uploadedCount,
      riddenCount,
      downloadedCount,
      commentCount
    })
  } catch (err) {
    res.status(500).json({ error: 'Ошибка' })
  }
})

// ─── Мои треки (включая приватные) ───────────────────────────────────────────
app.get('/my-tracks', authRequired, async (req, res) => {
  try {
    const tracks = await routesCollection
      .find({ 'author.chatId': req.user.chatId }, { projection: { gpxFile: 0 } })
      .sort({ createdAt: -1 })
      .toArray()
    res.json(tracks)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Database error' })
  }
})

// ─── Маршруты ─────────────────────────────────────────────────────────────────
app.get('/routes', async (req, res) => {
  try {
    const filter = { isPublic: { $ne: false } }
    if (req.query.transport) filter.transport = req.query.transport
    if (req.query.difficulty) filter.difficulty = parseInt(req.query.difficulty)
    if (req.query.season && req.query.season !== 'all') filter.season = { $in: [req.query.season, 'all'] }
    const routes = await routesCollection
      .find(filter, { projection: { gpxFile: 0 } })
      .sort({ createdAt: -1 })
      .toArray()
    res.json(routes)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Database error' })
  }
})

app.get('/routes/:id', async (req, res) => {
  try {
    const id = new ObjectId(req.params.id)
    const [route, reviews] = await Promise.all([
      routesCollection.findOne({ _id: id }),
      reviewsCollection.find({ routeId: id }).sort({ createdAt: -1 }).toArray()
    ])
    if (!route) return res.status(404).json({ error: 'Маршрут не найден' })
    if (route.isPublic === false) {
      const auth = req.headers.authorization
      let chatId = null
      if (auth?.startsWith('Bearer ')) {
        try { chatId = jwt.verify(auth.slice(7), JWT_SECRET).chatId } catch {}
      }
      if (!chatId || String(chatId) !== String(route.author.chatId)) {
        return res.status(403).json({ error: 'Нет доступа' })
      }
    }
    res.json({ ...route, reviews })
  } catch (err) {
    res.status(500).json({ error: 'Database error' })
  }
})

// GPX для отображения на карте
app.get('/routes/:id/gpx-view', async (req, res) => {
  try {
    const route = await routesCollection.findOne(
      { _id: new ObjectId(req.params.id) },
      { projection: { gpxFile: 1, isPublic: 1, author: 1 } }
    )
    if (!route) return res.status(404).send('Not found')
    if (route.isPublic === false) {
      const auth = req.headers.authorization
      let chatId = null
      if (auth?.startsWith('Bearer ')) {
        try { chatId = jwt.verify(auth.slice(7), JWT_SECRET).chatId } catch {}
      }
      if (!chatId || String(chatId) !== String(route.author.chatId)) {
        return res.status(403).send('Access denied')
      }
    }
    res.setHeader('Content-Type', 'application/gpx+xml')
    res.sendFile(path.join(GPX_DIR, route.gpxFile))
  } catch (err) {
    res.status(500).send('Error')
  }
})

// GPX для скачивания (авторизация обязательна)
app.get('/routes/:id/gpx', authRequired, async (req, res) => {
  try {
    const id = new ObjectId(req.params.id)
    const route = await routesCollection.findOne(
      { _id: id },
      { projection: { gpxFile: 1, title: 1 } }
    )
    if (!route) return res.status(404).send('Not found')
    await Promise.all([
      routesCollection.updateOne({ _id: id }, { $inc: { downloadCount: 1 } }),
      downloadsCollection.updateOne(
        { routeId: id, chatId: req.user.chatId },
        { $setOnInsert: { routeId: id, chatId: req.user.chatId, downloadedAt: new Date() } },
        { upsert: true }
      )
    ])
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(route.title)}.gpx`)
    res.setHeader('Content-Type', 'application/gpx+xml')
    res.sendFile(path.join(GPX_DIR, route.gpxFile))
  } catch (err) {
    res.status(500).send('Error')
  }
})

// Загрузка нового маршрута
app.post('/routes', authRequired, upload.single('gpx'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'GPX файл обязателен' })
  try {
    const { title, description, difficulty, transport } = req.body
    const route = {
      title: title?.trim() || 'Без названия',
      description: description?.trim() || '',
      difficulty: Math.min(4, Math.max(1, parseInt(difficulty) || 1)),
      transport: transport || 'suv',
      distance: parseGpxDistance(req.file.path),
      gpxFile: req.file.filename,
      author: { chatId: req.user.chatId, name: req.user.name },
      createdAt: new Date(),
      isPublic: req.body.isPublic !== 'false',
      avgRating: 0,
      reviewCount: 0,
      riddenCount: 0,
      riddenUsers: [],
      downloadCount: 0,
      lastCondition: null
    }
    const result = await routesCollection.insertOne(route)
    res.json({ _id: result.insertedId, ...route })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Ошибка сохранения' })
  }
})

// Опубликовать маршрут (автор или admin)
app.patch('/routes/:id/publish', authRequired, async (req, res) => {
  try {
    const id = new ObjectId(req.params.id)
    const route = await routesCollection.findOne({ _id: id })
    if (!route) return res.status(404).json({ error: 'Маршрут не найден' })
    if (String(route.author.chatId) !== String(req.user.chatId) && req.user.role !== 'admin')
      return res.status(403).json({ error: 'Нет прав' })
    await routesCollection.updateOne({ _id: id }, { $set: { isPublic: true } })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: 'Ошибка' })
  }
})

// Редактировать маршрут (только автор)
app.patch('/routes/:id', authRequired, async (req, res) => {
  try {
    const id = new ObjectId(req.params.id)
    const route = await routesCollection.findOne({ _id: id })
    if (!route) return res.status(404).json({ error: 'Маршрут не найден' })
    if (String(route.author.chatId) !== String(req.user.chatId) && req.user.role !== 'admin')
      return res.status(403).json({ error: 'Нет прав на редактирование' })

    const { title, description, difficulty } = req.body
    const update = {}
    if (title?.trim()) update.title = title.trim()
    if (description !== undefined) update.description = description.trim()
    if (difficulty) update.difficulty = Math.min(4, Math.max(1, parseInt(difficulty)))

    await routesCollection.updateOne({ _id: id }, { $set: update })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: 'Ошибка' })
  }
})

// Удалить маршрут (только автор)
app.delete('/routes/:id', authRequired, async (req, res) => {
  try {
    const id = new ObjectId(req.params.id)
    const route = await routesCollection.findOne({ _id: id })
    if (!route) return res.status(404).json({ error: 'Маршрут не найден' })
    if (String(route.author.chatId) !== String(req.user.chatId) && req.user.role !== 'admin')
      return res.status(403).json({ error: 'Нет прав на удаление' })

    const gpxPath = path.join(GPX_DIR, route.gpxFile)
    if (fs.existsSync(gpxPath)) fs.unlink(gpxPath, () => {})

    await reviewsCollection.deleteMany({ routeId: id })
    await routesCollection.deleteOne({ _id: id })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: 'Ошибка' })
  }
})

// Комментарий к маршруту
app.post('/routes/:id/review', authRequired, async (req, res) => {
  try {
    const routeId = new ObjectId(req.params.id)
    const { text } = req.body
    if (!text?.trim()) return res.status(400).json({ error: 'Комментарий не может быть пустым' })
    await reviewsCollection.insertOne({
      routeId,
      author: { chatId: req.user.chatId, name: req.user.name },
      text: text.trim(),
      createdAt: new Date()
    })
    const count = await reviewsCollection.countDocuments({ routeId })
    await routesCollection.updateOne({ _id: routeId }, { $set: { reviewCount: count } })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: 'Ошибка' })
  }
})

// Удалить комментарий (автор комментария или admin)
app.delete('/routes/:id/review/:reviewId', authRequired, async (req, res) => {
  try {
    const reviewId = new ObjectId(req.params.reviewId)
    const review = await reviewsCollection.findOne({ _id: reviewId })
    if (!review) return res.status(404).json({ error: 'Комментарий не найден' })
    if (String(review.author.chatId) !== String(req.user.chatId) && req.user.role !== 'admin')
      return res.status(403).json({ error: 'Нет прав' })

    await reviewsCollection.deleteOne({ _id: reviewId })
    const count = await reviewsCollection.countDocuments({ routeId: new ObjectId(req.params.id) })
    await routesCollection.updateOne({ _id: new ObjectId(req.params.id) }, { $set: { reviewCount: count } })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: 'Ошибка' })
  }
})

// Отметить "Я проехал"
app.post('/routes/:id/ridden', authRequired, async (req, res) => {
  try {
    const routeId = new ObjectId(req.params.id)
    const alreadyRidden = await routesCollection.findOne({
      _id: routeId,
      'riddenUsers.chatId': req.user.chatId
    })
    if (alreadyRidden) return res.status(409).json({ error: 'Вы уже отмечали этот маршрут' })

    const { condition } = req.body
    const update = {
      $inc: { riddenCount: 1 },
      $push: { riddenUsers: { chatId: req.user.chatId, name: req.user.name, date: new Date() } }
    }
    if (condition) {
      update.$set = { lastCondition: { status: condition, authorName: req.user.name, updatedAt: new Date() } }
    }
    await routesCollection.updateOne({ _id: routeId }, update)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: 'Ошибка' })
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

