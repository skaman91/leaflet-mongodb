// ⚠️ Замените на username вашего Telegram-бота (без @)
const BOT_USERNAME = 'liteoffroad_bot'
const API = 'https://point-map.ru'

// ─── Ожидаем пока main.js инициализирует карту ────────────────────────────────
function waitForMap(cb) {
  if (window.mapInstance) return cb(window.mapInstance)
  setTimeout(() => waitForMap(cb), 100)
}

waitForMap(map => {

  // ─── Auth ──────────────────────────────────────────────────────────────────
  const getToken    = () => localStorage.getItem('routes_token')
  const getUserName = () => localStorage.getItem('routes_name')
  function getJwtPayload() {
    try { return JSON.parse(atob(getToken().split('.')[1])) }
    catch { return null }
  }
  const getJwtChatId = () => getJwtPayload()?.chatId
  const getJwtRole   = () => getJwtPayload()?.role || 'user'
  const isAdmin      = () => getJwtRole() === 'admin'
  const authHdr = () => ({ Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' })

  // ─── Состояние панели ──────────────────────────────────────────────────────
  let panelOpen = false
  let view = 'list'          // 'list' | 'upload' | 'detail' | 'profile' | 'mytracks' | 'edit'
  let currentTab = 'routes'  // 'routes' | 'poi' | 'events' | 'rides'
  let routes = []
  let activeLayer = null
  let allLayers = []
  let showAllOnMap = false
  let currentRoute = null

  // ─── GPS Recording state ───────────────────────────────────────────────────
  let recording = false
  let recordWatchId = null
  let recordedPoints = []
  let recordPolyline = null

  // ─── Кнопка Маршруты (HTML-элемент над Слои) ──────────────────────────────
  document.getElementById('routes-toggle-btn').addEventListener('click', togglePanel)

  // ─── Панель ────────────────────────────────────────────────────────────────
  const panel   = document.getElementById('routes-panel')
  const content = document.getElementById('rp-content')
  const footer  = document.getElementById('rp-footer')
  const backBtn = document.getElementById('rp-back')
  const titleEl = document.getElementById('rp-title')
  const tabsEl  = document.getElementById('rp-tabs')

  const TAB_LABELS = {
    routes: 'Маршруты',
    poi: 'Точки POI',
    events: 'Соревнования',
    rides: 'Покатушки'
  }

  // Переключение разделов
  tabsEl.querySelectorAll('.rp-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentTab = btn.dataset.tab
      tabsEl.querySelectorAll('.rp-tab-btn').forEach(b => b.classList.toggle('active', b === btn))
      if (currentTab === 'routes') {
        loadAndShowList()
      } else {
        showTabPlaceholder(currentTab)
      }
    })
  })

  document.getElementById('rp-close').addEventListener('click', closePanel)

  // запрещаем горизонтальные свайпы уходить на карту
  L.DomEvent.on(panel, 'touchstart touchmove touchend', L.DomEvent.stopPropagation)

  backBtn.addEventListener('click', () => {
    if (view === 'upload' || view === 'detail' || view === 'profile') showList()
    else if (view === 'mytracks') showProfile()
    else if (view === 'edit') openRoute(currentRoute._id)
  })

  function togglePanel() {
    panelOpen ? closePanel() : openPanel()
  }

  function openPanel(hint) {
    panelOpen = true
    panel.classList.add('open')
    const arrow = document.getElementById('routes-btn-arrow')
    if (arrow) arrow.textContent = '▴'
    document.getElementById('routes-toggle-btn')?.classList.add('active')
    updateAuthUI(hint)
    if (view === 'list') {
      currentTab === 'routes' ? loadAndShowList() : showTabPlaceholder(currentTab)
    }
  }

  function closePanel() {
    panelOpen = false
    panel.classList.remove('open')
    const arrow = document.getElementById('routes-btn-arrow')
    if (arrow) arrow.textContent = '▾'
    document.getElementById('routes-toggle-btn')?.classList.remove('active')
    // треки остаются на карте
  }

  function setView(v) {
    view = v
    const isList = v === 'list'
    backBtn.classList.toggle('hidden', isList)
    titleEl.classList.toggle('hidden', isList)    // заголовок только в подразделах
    tabsEl.classList.toggle('hidden', !isList)    // табы только в корневом виде
    footer.innerHTML = ''
    if (v === 'list') {
      titleEl.textContent = TAB_LABELS[currentTab] || 'Маршруты'
      if (getToken()) {
        footer.innerHTML = `<button class="rp-btn-primary" id="btn-open-upload">+ Загрузить маршрут</button>`
        document.getElementById('btn-open-upload').addEventListener('click', showUpload)
      }
    } else if (v === 'upload') {
      titleEl.textContent = 'Новый маршрут'
    } else if (v === 'detail') {
      titleEl.textContent = currentRoute?.title || 'Маршрут'
    } else if (v === 'edit') {
      titleEl.textContent = 'Редактировать'
    } else if (v === 'profile') {
      titleEl.textContent = 'Профиль'
    } else if (v === 'mytracks') {
      titleEl.textContent = 'Мои треки'
    }
  }

  // ─── Auth UI ───────────────────────────────────────────────────────────────
  function updateAuthUI(hint) {
    const authEl = document.getElementById('rp-auth')
    if (getToken()) {
      authEl.innerHTML = `
        <div class="rp-auth-row">
          <button class="rp-auth-name-btn" id="rp-profile-btn">
            ${isAdmin() ? '⚙️' : '👤'} ${getUserName()}${isAdmin() ? ' <span class="rp-role-badge">Admin</span>' : ''}
          </button>
          <button class="rp-logout" id="rp-logout">Выйти</button>
        </div>`
      document.getElementById('rp-profile-btn').addEventListener('click', showProfile)
      document.getElementById('rp-logout').addEventListener('click', () => {
        localStorage.removeItem('routes_token')
        localStorage.removeItem('routes_name')
        updateAuthUI()
        setView('list')
        loadAndShowList()
      })
      updateRecordBtn()
      checkInterruptedTrack()
    } else {
      authEl.innerHTML = `
        ${hint ? `<div class="rp-auth-hint-msg">${hint}</div>` : ''}
        <div class="rp-auth-tabs">
          <button class="rp-tab active" data-tab="login">Войти</button>
          <button class="rp-tab" data-tab="register">Регистрация</button>
        </div>
        <div id="rp-auth-form">
          <input type="text" id="auth-username" placeholder="Имя пользователя" autocomplete="username">
          <input type="email" id="auth-email" placeholder="Email" autocomplete="email" class="hidden">
          <input type="password" id="auth-password" placeholder="Пароль" autocomplete="current-password">
          <div id="auth-error" class="rp-error hidden"></div>
          <button class="rp-btn-primary" id="btn-auth-submit">Войти</button>
        </div>`

      let authMode = 'login'

      authEl.querySelectorAll('.rp-tab').forEach(tab => {
        tab.addEventListener('click', () => {
          authEl.querySelectorAll('.rp-tab').forEach(t => t.classList.remove('active'))
          tab.classList.add('active')
          authMode = tab.dataset.tab
          const isReg = authMode === 'register'
          document.getElementById('btn-auth-submit').textContent = isReg ? 'Зарегистрироваться' : 'Войти'
          document.getElementById('auth-email').classList.toggle('hidden', !isReg)
          document.getElementById('auth-error').classList.add('hidden')
          document.getElementById('auth-password').setAttribute('autocomplete',
            isReg ? 'new-password' : 'current-password')
        })
      })

      document.getElementById('btn-auth-submit').addEventListener('click', () => doAuth(authMode))
      document.getElementById('auth-password').addEventListener('keydown', e => {
        if (e.key === 'Enter') doAuth(authMode)
      })
      updateRecordBtn()
    }
  }

  async function doAuth(mode) {
    const username = document.getElementById('auth-username').value.trim()
    const password = document.getElementById('auth-password').value
    const errEl    = document.getElementById('auth-error')
    const btn      = document.getElementById('btn-auth-submit')
    errEl.classList.add('hidden')

    if (!username || !password) {
      errEl.textContent = 'Заполните все поля'
      errEl.classList.remove('hidden')
      return
    }

    btn.disabled = true
    btn.textContent = '…'

    const btnLabel = mode === 'login' ? 'Войти' : 'Зарегистрироваться'
    const resetBtn = () => { btn.disabled = false; btn.textContent = btnLabel }

    const showErr = msg => {
      errEl.textContent = msg
      errEl.classList.remove('hidden')
      resetBtn()
    }

    try {
      const email = document.getElementById('auth-email')?.value.trim() || ''
      const res = await fetch(`${API}/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, ...(mode === 'register' && { email }) })
      })

      let data
      try { data = await res.json() }
      catch { return showErr(`Ошибка сервера (${res.status})`) }

      if (data.token) {
        localStorage.setItem('routes_token', data.token)
        localStorage.setItem('routes_name', data.name)
        if (data.role) localStorage.setItem('routes_role', data.role)
        updateAuthUI()
        setView('list')
        loadAndShowList()
      } else {
        showErr(data.error || `Ошибка ${res.status}`)
      }
    } catch (e) {
      showErr(`Нет соединения: ${e.message}`)
    }
  }

  // ─── Список маршрутов ──────────────────────────────────────────────────────
  async function loadAndShowList() {
    setView('list')
    content.innerHTML = `
      <div class="rp-filters">
        <select id="rf-transport"><option value="">Тип транспорта</option>
          <option value="suv">🚙 Внедорожник</option>
          <option value="crossover">🚗 Кроссовер</option>
          <option value="car">🚘 Легковой</option>
          <option value="atv">🏍 Квадроцикл</option>
          <option value="enduro">🏁 Эндуро</option>
          <option value="swamp">🛥 Болотоход</option>
        </select>
        <select id="rf-difficulty"><option value="">Любая сложность</option>
          <option value="1">🟢 Асфальт / Грунтовка</option>
          <option value="2">🟡 Грязь, лужи</option>
          <option value="3">🔴 Серьёзное бездорожье</option>
          <option value="4">⚫ Осторожно!</option>
        </select>
        <label class="rp-show-all-label">
          <input type="checkbox" id="rf-show-all" ${showAllOnMap ? 'checked' : ''}>
          Показать все на карте
        </label>
      </div>
      <div id="rp-list"><div class="rp-loading">Загружаю…</div></div>`

    ;['rf-transport', 'rf-difficulty'].forEach(id =>
      document.getElementById(id)?.addEventListener('change', fetchRoutes)
    )

    document.getElementById('rf-show-all').addEventListener('change', function () {
      showAllOnMap = this.checked
      showAllOnMap ? loadAllOnMap() : clearAllLayers()
    })

    fetchRoutes()
  }

  function showList() {
    loadAndShowList()
    clearMapLayer()
  }

  async function fetchRoutes() {
    const params = new URLSearchParams()
    const t = document.getElementById('rf-transport')?.value
    const d = document.getElementById('rf-difficulty')?.value
    if (t) params.set('transport', t)
    if (d) params.set('difficulty', d)

    try {
      const res = await fetch(`${API}/routes?${params}`)
      routes = await res.json()
      renderList()
      if (showAllOnMap) loadAllOnMap()
    } catch {
      document.getElementById('rp-list').innerHTML = '<div class="rp-empty">Ошибка загрузки</div>'
    }
  }

  function renderList() {
    const list = document.getElementById('rp-list')
    if (!routes.length) {
      list.innerHTML = '<div class="rp-empty">Маршрутов пока нет.<br>Будьте первым!</div>'
      return
    }
    list.innerHTML = routes.map(r => `
      <div class="rp-card" data-id="${r._id}">
        <div class="rp-card-title-row">
          <span class="rp-diff-dot" style="background:${diffColor(r.difficulty)}"></span>
          <span class="rp-card-title">${r.title}</span>
        </div>
        <div class="rp-card-meta">
          ${transportIcon(r.transport)} · ${r.distance} км
        </div>
        <div class="rp-card-footer">
          ${condBadge(r.lastCondition)}
          <span>🏁 ${r.riddenCount}</span>
          ${r.downloadCount ? `<span>⬇ ${r.downloadCount}</span>` : ''}
          ${r.reviewCount ? `<span>💬 ${r.reviewCount}</span>` : ''}
          <span class="rp-author">${r.author.name}</span>
        </div>
      </div>`
    ).join('')

    list.querySelectorAll('.rp-card').forEach(c =>
      c.addEventListener('click', () => openRoute(c.dataset.id))
    )
  }

  // ─── Детальный просмотр ────────────────────────────────────────────────────
  async function openRoute(id, { keepLayers = false } = {}) {
    if (!keepLayers) {
      clearAllLayers()
      showAllOnMap = false
    }
    if (!panelOpen) {
      panelOpen = true
      panel.classList.add('open')
      updateAuthUI()
    }
    content.innerHTML = '<div class="rp-loading">Загружаю…</div>'
    const detailHeaders = getToken() ? { Authorization: `Bearer ${getToken()}` } : {}
    const res = await fetch(`${API}/routes/${id}`, { headers: detailHeaders })
    currentRoute = await res.json()
    setView('detail')
    renderDetail(currentRoute)
    if (keepLayers) {
      highlightLayer(id)  // выделяем трек без пересоздания
    } else {
      showOnMap(id)
    }
  }

  function renderDetail(route) {
    const token    = getToken()
    const chatId   = getJwtChatId()
    const isAuthor = token && (String(route.author.chatId) === String(chatId) || isAdmin())
    const alreadyRidden = route.riddenUsers?.some(u => String(u.chatId) === String(chatId))

    content.innerHTML = `
      <div class="rp-detail">
        <div class="rp-detail-meta">
          ${transportIcon(route.transport)}
          <span class="rp-diff-pill" style="background:${diffColor(route.difficulty)}">${diffLabel(route.difficulty)}</span>
          <span>${route.distance} км</span>
        </div>
        <div class="rp-detail-author">Автор: <button class="rp-user-link" data-uid="${route.author.chatId}">${route.author.name}</button></div>
        ${route.description ? `<div class="rp-detail-desc">${route.description}</div>` : ''}
        <div class="rp-detail-stats">
          🏁 ${route.riddenCount} проехали
          ${route.downloadCount ? ` · ⬇ ${route.downloadCount} скачали` : ''}
          ${route.reviewCount ? ` · 💬 ${route.reviewCount} коммент.` : ''}
        </div>

        ${route.riddenUsers?.length ? `
        <div class="rp-ridden-list">
          <div class="rp-section-title">Трек проехали (${route.riddenUsers.length})</div>
          ${route.riddenUsers.map(u => `
            <span class="rp-ridden-user">${u.name}</span>`).join('')}
        </div>` : ''}

        ${isAuthor ? `
        <div class="rp-author-actions">
          <button class="rp-btn-edit" id="btn-edit-route">✏️ Редактировать</button>
          <button class="rp-btn-delete" id="btn-delete-route">🗑 Удалить</button>
        </div>` : ''}
        ${isAdmin() && String(route.author.chatId) !== String(chatId) ? `
        <div class="rp-admin-actions">
          <span class="rp-admin-badge">⚙️ Admin</span>
          <button class="rp-btn-ban" id="btn-ban-author">🚫 Заблокировать автора</button>
        </div>` : ''}

        ${token ? `
        <div class="rp-actions">
          <button class="rp-btn-primary" id="btn-dl">⬇ Скачать GPX</button>
          <button class="rp-btn-secondary ${alreadyRidden ? 'rp-btn-done' : ''}"
            id="btn-ridden" ${alreadyRidden ? 'disabled' : ''}>
            ${alreadyRidden ? '✅ Вы проехали' : '🏁 Я проехал'}
          </button>
        </div>
        <div class="rp-review-form">
          <div class="rp-section-title">Комментарий</div>
          <textarea id="rv-text" placeholder="Напишите комментарий к маршруту…"></textarea>
          <button class="rp-btn-primary" id="btn-review">Отправить</button>
        </div>` : `<div class="rp-auth-hint">Войдите чтобы скачать трек и оставить комментарий</div>`}

        <div class="rp-reviews" id="rp-reviews-list">
          ${route.reviews?.length ? `
          <div class="rp-section-title">Комментарии (${route.reviews.length})</div>
          ${route.reviews.map(r => {
            const canDelete = token && (String(r.author.chatId) === String(chatId) || isAdmin())
            return `
            <div class="rp-review" data-review-id="${r._id}">
              <div class="rp-rv-top">
                <b>${r.author.name}</b>
                <div style="display:flex;gap:6px;align-items:center">
                  <span class="rp-rv-date">${new Date(r.createdAt).toLocaleDateString('ru-RU')}</span>
                  ${canDelete ? `<button class="rp-rv-delete" data-id="${r._id}" title="Удалить">✕</button>` : ''}
                </div>
              </div>
              ${r.text ? `<div class="rp-rv-text">${r.text}</div>` : ''}
            </div>`
          }).join('')}` : ''}
        </div>
      </div>`

    if (!token) return

    // Редактировать / Удалить (только автор)
    if (isAuthor) {
      document.getElementById('btn-edit-route').addEventListener('click', () => showEditForm(route))

      document.getElementById('btn-delete-route').addEventListener('click', function () {
        if (this.dataset.confirm !== '1') {
          this.textContent = 'Уверены?'
          this.dataset.confirm = '1'
          setTimeout(() => { if (this.dataset.confirm) { this.textContent = '🗑 Удалить'; delete this.dataset.confirm } }, 3000)
          return
        }
        fetch(`${API}/routes/${route._id}`, { method: 'DELETE', headers: authHdr() })
          .then(r => r.json())
          .then(d => { if (d.ok) { clearMapLayer(); showList() } })
      })
    }

    // Бан (только admin, на чужих маршрутах)
    if (isAdmin() && String(route.author.chatId) !== String(chatId)) {
      document.getElementById('btn-ban-author').addEventListener('click', async function () {
        if (this.dataset.confirm !== '1') {
          this.textContent = 'Уверены?'
          this.dataset.confirm = '1'
          setTimeout(() => { if (this.dataset.confirm) { this.textContent = '🚫 Заблокировать автора'; delete this.dataset.confirm } }, 3000)
          return
        }
        const r = await fetch(`${API}/auth/ban/${route.author.chatId}`, { method: 'POST', headers: authHdr() })
        const d = await r.json().catch(() => ({}))
        if (r.ok) {
          this.textContent = '✅ Заблокирован'
          this.disabled = true
        } else {
          this.textContent = d.error || 'Ошибка'
        }
      })
    }

    // Скачать
    document.getElementById('btn-dl').addEventListener('click', () => {
      fetch(`${API}/routes/${route._id}/gpx`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.blob())
        .then(blob => {
          const a = Object.assign(document.createElement('a'), {
            href: URL.createObjectURL(blob),
            download: `${route.title}.gpx`
          })
          a.click()
          URL.revokeObjectURL(a.href)
        })
    })

    // Проехал (только если ещё не нажимал)
    if (!alreadyRidden) {
      document.getElementById('btn-ridden').addEventListener('click', async () => {
        const res = await fetch(`${API}/routes/${route._id}/ridden`, {
          method: 'POST', headers: authHdr(), body: JSON.stringify({})
        })
        if (res.ok) openRoute(route._id)
      })
    }

    // Клик на имя автора → публичный профиль
    document.querySelector('.rp-user-link')?.addEventListener('click', e => {
      showUserProfile(e.target.dataset.uid, e.target.textContent)
    })

    // Удаление комментария
    document.getElementById('rp-reviews-list')?.addEventListener('click', async e => {
      const btn = e.target.closest('.rp-rv-delete')
      if (!btn) return
      const reviewId = btn.dataset.id
      const res = await fetch(`${API}/routes/${route._id}/review/${reviewId}`, {
        method: 'DELETE', headers: authHdr()
      })
      if (res.ok) openRoute(route._id)
    })

    // Комментарий
    document.getElementById('btn-review').addEventListener('click', async () => {
      const btn  = document.getElementById('btn-review')
      const text = document.getElementById('rv-text').value.trim()
      if (!text) return
      btn.disabled = true
      btn.textContent = '…'
      await fetch(`${API}/routes/${route._id}/review`, {
        method: 'POST', headers: authHdr(),
        body: JSON.stringify({ text })
      })
      openRoute(route._id)
    })
  }

  // ─── Заглушки для новых разделов ──────────────────────────────────────────
  function showTabPlaceholder(tab) {
    setView('list')
    const info = {
      poi: {
        icon: '📍',
        title: 'Точки интереса',
        text: 'Здесь будут точки интереса:\nкрасивые места, сложные броды,\nхорошие стоянки и многое другое.'
      },
      events: {
        icon: '🏁',
        title: 'Соревнования',
        text: 'Анонсы и результаты\nклубных соревнований.'
      },
      rides: {
        icon: '🚙',
        title: 'Покатушки',
        text: 'Планируемые совместные\nвыезды и покатушки.'
      }
    }[tab]
    if (!info) return
    footer.innerHTML = ''
    content.innerHTML = `
      <div class="rp-coming-soon">
        <div class="rp-coming-icon">${info.icon}</div>
        <div class="rp-coming-title">${info.title}</div>
        <div class="rp-coming-text">${info.text}</div>
        <div class="rp-coming-text" style="margin-top:8px;font-size:11px;color:#ccc">В разработке</div>
      </div>`
  }

  // ─── Публичный профиль другого пользователя ───────────────────────────────
  async function showUserProfile(uid, name) {
    setView('profile')
    titleEl.textContent = name
    content.innerHTML = '<div class="rp-loading">Загружаю…</div>'

    try {
      const res = await fetch(`${API}/users/${uid}`, {
        headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {}
      })
      let data
      try { data = await res.json() } catch { data = {} }

      content.innerHTML = `
        <div class="rp-profile">
          <div class="rp-profile-name">${data.name || name}</div>
          <div class="rp-profile-rank">🏆 ${data.rank || '—'}</div>

          <div class="rp-stats">
            <div class="rp-stat-item">
              <span class="rp-stat-value">${data.uploadedCount ?? '—'}</span>
              <span class="rp-stat-label">загружено треков</span>
            </div>
            <div class="rp-stat-item">
              <span class="rp-stat-value">${data.riddenCount ?? '—'}</span>
              <span class="rp-stat-label">проехал маршрутов</span>
            </div>
            <div class="rp-stat-item">
              <span class="rp-stat-value">${data.downloadedCount ?? '—'}</span>
              <span class="rp-stat-label">скачал треков</span>
            </div>
            <div class="rp-stat-item" style="grid-column: 1 / -1">
              <span class="rp-stat-value">${data.commentCount ?? '—'}</span>
              <span class="rp-stat-label">написал комментариев</span>
            </div>
          </div>
        </div>`
    } catch {
      content.innerHTML = '<div class="rp-empty">Нет соединения</div>'
    }
  }

  // ─── Профиль ───────────────────────────────────────────────────────────────
  async function showProfile() {
    setView('profile')
    content.innerHTML = '<div class="rp-loading">Загружаю…</div>'

    try {
      const res = await fetch(`${API}/auth/profile`, { headers: authHdr() })
      let data
      try { data = await res.json() } catch { data = {} }

      if (!res.ok) {
        content.innerHTML = `<div class="rp-empty">Ошибка загрузки профиля</div>`
        return
      }

      const regDate = data.createdAt
        ? new Date(data.createdAt).toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' })
        : null

      content.innerHTML = `
        <div class="rp-profile">
          <div class="rp-profile-name">${data.name}</div>
          ${data.email ? `<div class="rp-profile-email">📧 ${data.email}</div>` : ''}
          ${regDate ? `<div class="rp-profile-reg">📅 Зарегистрирован: ${regDate}</div>` : ''}
          <div class="rp-profile-rank">🏆 ${data.rank || '—'}</div>

          <div class="rp-stats">
            <div class="rp-stat-item">
              <span class="rp-stat-value">${data.uploadedCount}</span>
              <span class="rp-stat-label">загружено треков</span>
            </div>
            <div class="rp-stat-item">
              <span class="rp-stat-value">${data.riddenCount}</span>
              <span class="rp-stat-label">проехал маршрутов</span>
            </div>
            <div class="rp-stat-item">
              <span class="rp-stat-value">${data.downloadedCount}</span>
              <span class="rp-stat-label">скачал треков</span>
            </div>
            <div class="rp-stat-item" style="grid-column: 1 / -1">
              <span class="rp-stat-value">${data.commentCount ?? 0}</span>
              <span class="rp-stat-label">написал комментариев</span>
            </div>
          </div>

          <button class="rp-btn-secondary rp-my-tracks-btn" id="btn-my-tracks">🗂 Мои треки</button>

          ${data.hasPassword ? `
          <div class="rp-pw-form">
            <div class="rp-section-title">Сменить пароль</div>
            <input type="password" id="pw-current" placeholder="Текущий пароль" autocomplete="current-password">
            <input type="password" id="pw-new" placeholder="Новый пароль" autocomplete="new-password">
            <input type="password" id="pw-confirm" placeholder="Повторите новый пароль" autocomplete="new-password">
            <div id="pw-error" class="rp-error hidden"></div>
            <div id="pw-ok" class="rp-pw-ok hidden">✅ Пароль изменён</div>
            <button class="rp-btn-primary" id="btn-pw-save">Сохранить</button>
          </div>` : ''}
        </div>`

      document.getElementById('btn-my-tracks')?.addEventListener('click', showMyTracks)

      if (data.hasPassword) {
        document.getElementById('btn-pw-save').addEventListener('click', async () => {
          const btn      = document.getElementById('btn-pw-save')
          const errEl    = document.getElementById('pw-error')
          const okEl     = document.getElementById('pw-ok')
          const current  = document.getElementById('pw-current').value
          const newPw    = document.getElementById('pw-new').value
          const confirm  = document.getElementById('pw-confirm').value
          errEl.classList.add('hidden')
          okEl.classList.add('hidden')

          if (!current || !newPw) { errEl.textContent = 'Заполните все поля'; errEl.classList.remove('hidden'); return }
          if (newPw !== confirm)  { errEl.textContent = 'Пароли не совпадают'; errEl.classList.remove('hidden'); return }

          btn.disabled = true
          btn.textContent = 'Сохраняю…'
          try {
            const r = await fetch(`${API}/auth/password`, {
              method: 'PATCH', headers: authHdr(),
              body: JSON.stringify({ currentPassword: current, newPassword: newPw })
            })
            let d; try { d = await r.json() } catch { d = {} }
            if (r.ok) {
              document.getElementById('pw-current').value = ''
              document.getElementById('pw-new').value = ''
              document.getElementById('pw-confirm').value = ''
              okEl.classList.remove('hidden')
            } else {
              errEl.textContent = d.error || `Ошибка ${r.status}`
              errEl.classList.remove('hidden')
            }
          } catch (e) {
            errEl.textContent = `Нет соединения: ${e.message}`
            errEl.classList.remove('hidden')
          }
          btn.disabled = false
          btn.textContent = 'Сохранить'
        })
      }
    } catch (e) {
      content.innerHTML = `<div class="rp-empty">Нет соединения</div>`
    }
  }

  // ─── Форма редактирования ──────────────────────────────────────────────────
  function showEditForm(route) {
    setView('edit')
    content.innerHTML = `
      <div class="rp-form">
        <input type="text" id="edit-title" value="${route.title}" placeholder="Название *">
        <textarea id="edit-desc" placeholder="Описание">${route.description || ''}</textarea>
        <select id="edit-difficulty">
          <option value="1" ${route.difficulty == 1 ? 'selected' : ''}>🟢 Асфальт / Грунтовка</option>
          <option value="2" ${route.difficulty == 2 ? 'selected' : ''}>🟡 Грязь, лужи</option>
          <option value="3" ${route.difficulty == 3 ? 'selected' : ''}>🔴 Серьёзное бездорожье</option>
          <option value="4" ${route.difficulty == 4 ? 'selected' : ''}>⚫ Осторожно!</option>
        </select>
        <div id="edit-error" class="rp-error hidden"></div>
        <button class="rp-btn-primary" id="btn-edit-save">Сохранить</button>
      </div>`

    document.getElementById('btn-edit-save').addEventListener('click', async () => {
      const btn   = document.getElementById('btn-edit-save')
      const errEl = document.getElementById('edit-error')
      const title = document.getElementById('edit-title').value.trim()
      errEl.classList.add('hidden')

      if (!title) { errEl.textContent = 'Укажите название'; errEl.classList.remove('hidden'); return }

      btn.disabled = true
      btn.textContent = 'Сохраняю…'

      try {
        const res = await fetch(`${API}/routes/${route._id}`, {
          method: 'PATCH',
          headers: authHdr(),
          body: JSON.stringify({
            title,
            description: document.getElementById('edit-desc').value.trim(),
            difficulty:  document.getElementById('edit-difficulty').value
          })
        })
        let data
        try { data = await res.json() } catch { data = {} }
        if (res.ok) {
          openRoute(route._id)
        } else {
          errEl.textContent = data.error || `Ошибка ${res.status}`
          errEl.classList.remove('hidden')
          btn.disabled = false
          btn.textContent = 'Сохранить'
        }
      } catch (e) {
        errEl.textContent = `Нет соединения: ${e.message}`
        errEl.classList.remove('hidden')
        btn.disabled = false
        btn.textContent = 'Сохранить'
      }
    })
  }

  // ─── Форма загрузки ────────────────────────────────────────────────────────
  function showUpload() {
    setView('upload')
    content.innerHTML = `
      <div class="rp-form">
        <input type="text" id="up-title" placeholder="Название маршрута *">
        <textarea id="up-desc" placeholder="Описание маршрута"></textarea>
        <select id="up-transport">
          <option value="suv">🚙 Внедорожник</option>
          <option value="crossover">🚗 Кроссовер</option>
          <option value="car">🚘 Легковой</option>
          <option value="atv">🏍 Квадроцикл</option>
          <option value="enduro">🏁 Эндуро</option>
          <option value="swamp">🛥 Болотоход</option>
        </select>
        <select id="up-difficulty">
          <option value="1">🟢 Асфальт / Грунтовка</option>
          <option value="2">🟡 Грязь, лужи</option>
          <option value="3">🔴 Серьёзное бездорожье</option>
          <option value="4">⚫ Осторожно!</option>
        </select>
        <label class="rp-file-label">
          <input type="file" id="up-gpx" accept=".gpx">
          <span id="up-file-name">📎 Выберите GPX файл</span>
        </label>
        <div id="up-error" class="rp-error hidden"></div>
        <button class="rp-btn-primary" id="btn-upload-submit">Загрузить</button>
      </div>`

    document.getElementById('up-gpx').addEventListener('change', function () {
      document.getElementById('up-file-name').textContent = this.files[0]?.name || '📎 Выберите GPX файл'
    })

    document.getElementById('btn-upload-submit').addEventListener('click', submitUpload)
  }

  async function submitUpload() {
    const errEl = document.getElementById('up-error')
    errEl.classList.add('hidden')
    const title = document.getElementById('up-title').value.trim()
    const file  = document.getElementById('up-gpx').files[0]

    if (!title) { errEl.textContent = 'Укажите название'; errEl.classList.remove('hidden'); return }
    if (!file)  { errEl.textContent = 'Выберите GPX файл'; errEl.classList.remove('hidden'); return }

    const btn = document.getElementById('btn-upload-submit')
    btn.disabled = true
    btn.textContent = 'Загружаю…'

    const form = new FormData()
    form.append('gpx',         file)
    form.append('title',       title)
    form.append('description', document.getElementById('up-desc').value.trim())
    form.append('transport',   document.getElementById('up-transport').value)
    form.append('difficulty',  document.getElementById('up-difficulty').value)

    const resetBtn = () => { btn.disabled = false; btn.textContent = 'Загрузить' }
    const showErr = msg => { errEl.textContent = msg; errEl.classList.remove('hidden'); resetBtn() }

    try {
      const res = await fetch(`${API}/routes`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
        body: form
      })

      let data
      try { data = await res.json() }
      catch { return showErr(`Ошибка сервера (${res.status})`) }

      if (data._id) {
        openRoute(data._id)
      } else {
        showErr(data.error || `Ошибка ${res.status}`)
      }
    } catch (e) {
      showErr(`Нет соединения: ${e.message}`)
    }
  }

  // ─── GPX на карте ──────────────────────────────────────────────────────────
  function fitWithPadding(bounds) {
    const mobile = window.innerWidth <= 640
    map.fitBounds(bounds, mobile
      ? { paddingTopLeft: [20, 20], paddingBottomRight: [20, Math.round(window.innerHeight * 0.57)] }
      : { padding: [40, 40] }
    )
  }

  function clearAllLayers() {
    allLayers.forEach(({ layer }) => map.removeLayer(layer))
    allLayers = []
  }

  // подсветить выбранный трек, остальные затушить
  function highlightLayer(id) {
    allLayers.forEach(({ layer, routeId }) => {
      const selected = String(routeId) === String(id)
      layer.setStyle({ weight: selected ? 6 : 2, opacity: selected ? 1 : 0.25 })
    })
  }

  async function loadAllOnMap() {
    clearAllLayers()
    clearMapLayer()
    if (!routes.length) return

    const results = await Promise.all(
      routes.map(r =>
        fetch(`${API}/routes/${r._id}/gpx-view`)
          .then(res => res.text())
          .then(text => ({ text, route: r }))
          .catch(() => null)
      )
    )

    let loadedCount = 0
    let combinedBounds = null
    const valid = results.filter(Boolean)

    valid.forEach(({ text, route }) => {
      const url = URL.createObjectURL(new Blob([text], { type: 'application/gpx+xml' }))
      const color = diffColor(route.difficulty)
      const layer = new L.GPX(url, {
        async: true,
        polyline_options: { color, weight: 3, opacity: 0.8 },
        marker_options: { startIconUrl: '', endIconUrl: '', wptIconUrls: {} },
        get_marker: () => null
      })
      layer.on('loaded', e => {
        URL.revokeObjectURL(url)
        loadedCount++
        const b = e.target.getBounds()
        if (b.isValid()) combinedBounds = combinedBounds ? combinedBounds.extend(b) : b
        if (loadedCount === valid.length && combinedBounds) fitWithPadding(combinedBounds)

        e.target.bindTooltip(route.title, { sticky: true, className: 'rp-track-tooltip' })

        // клик — выделяем трек, открываем детали без пересоздания слоёв
        e.target.on('click', () => openRoute(route._id, { keepLayers: true }))

        e.target.on('mouseover', () => e.target.setStyle({ weight: 5, opacity: 1 }))
        e.target.on('mouseout',  () => {
          const isHighlighted = allLayers.some(({ layer: l, routeId }) =>
            l === e.target && String(routeId) === String(currentRoute?._id)
          )
          e.target.setStyle({ weight: isHighlighted ? 6 : 3, opacity: isHighlighted ? 1 : 0.8 })
        })
      })
      layer.addTo(map)
      allLayers.push({ layer, routeId: route._id })
    })
  }

  function showOnMap(routeId) {
    clearMapLayer()
    const color = currentRoute ? diffColor(currentRoute.difficulty) : '#2a6cff'
    const gpxHeaders = getToken() ? { Authorization: `Bearer ${getToken()}` } : {}
    fetch(`${API}/routes/${routeId}/gpx-view`, { headers: gpxHeaders })
      .then(r => r.text())
      .then(text => {
        const url = URL.createObjectURL(new Blob([text], { type: 'application/gpx+xml' }))
        activeLayer = new L.GPX(url, {
          async: true,
          polyline_options: { color, weight: 5, opacity: 0.9 },
          marker_options: { startIconUrl: '', endIconUrl: '', wptIconUrls: {} },
          get_marker: () => null
        })
        activeLayer.on('loaded', e => {
          URL.revokeObjectURL(url)
          fitWithPadding(e.target.getBounds())
          e.target.on('click', () => { if (!panelOpen) { panelOpen = true; panel.classList.add('open'); updateAuthUI() } })
        })
        activeLayer.addTo(map)
      })
  }

  function clearMapLayer() {
    if (activeLayer) { map.removeLayer(activeLayer); activeLayer = null }
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────
  function transportIcon(t) {
    return { suv: '🚙', crossover: '🚗', car: '🚘', atv: '🏍', enduro: '🏁', swamp: '🛥' }[t] || '🚙'
  }
  function transportLabel(t) {
    return { suv: '🚙 Внедорожник', crossover: '🚗 Кроссовер', car: '🚘 Легковой', atv: '🏍 Квадроцикл', enduro: '🏁 Эндуро', swamp: '🛥 Болотоход' }[t] || t
  }
  function diffColor(d) {
    return { 1: '#2a9d2a', 2: '#c8a800', 3: '#cc2200', 4: '#111111' }[d] || '#2a9d2a'
  }
  function diffLabel(d) {
    return { 1: 'Асфальт/Грунт', 2: 'Грязь, лужи', 3: 'Бездорожье', 4: 'Осторожно!' }[d] || ''
  }
  function condBadge(c) {
    if (!c) return ''
    const m = { dry: '🟢 Сухо', wet: '🟡 Мокро', mud: '🟠 Грязь', snow: '🔵 Снег', impassable: '🔴 Непроходимо' }
    return `<span class="rp-cond">${m[c.status] || c.status}</span>`
  }

  // ─── GPS Recording ─────────────────────────────────────────────────────────

  const TRACK_KEY = 'rec_track_v1'
  let wakeLock = null
  let bgGeoWatcherId = null

  // ── Wake Lock: не даём экрану погаснуть пока идёт запись ──────────────────
  async function acquireWakeLock() {
    if (!('wakeLock' in navigator)) return
    try {
      wakeLock = await navigator.wakeLock.request('screen')
      // ОС сбрасывает wake lock при смене видимости страницы — восстанавливаем
      document.addEventListener('visibilitychange', onVisibilityChange)
    } catch (e) { /* устройство не поддерживает или батарея критически низкая */ }
  }

  async function onVisibilityChange() {
    if (recording && document.visibilityState === 'visible' && !wakeLock) {
      try { wakeLock = await navigator.wakeLock.request('screen') } catch (e) {}
    }
  }

  function releaseWakeLock() {
    document.removeEventListener('visibilitychange', onVisibilityChange)
    if (wakeLock) { wakeLock.release(); wakeLock = null }
  }

  // ── localStorage: сохраняем трек при каждой новой точке ───────────────────
  function persistTrack() {
    try {
      localStorage.setItem(TRACK_KEY, JSON.stringify(recordedPoints))
    } catch (e) { /* нет места — игнорируем */ }
  }

  function clearPersistedTrack() {
    localStorage.removeItem(TRACK_KEY)
  }

  function checkInterruptedTrack() {
    const raw = localStorage.getItem(TRACK_KEY)
    if (!raw) return
    let points
    try { points = JSON.parse(raw) } catch { clearPersistedTrack(); return }
    if (!Array.isArray(points) || points.length < 2) { clearPersistedTrack(); return }

    const dist = calcDistanceFor(points)
    const modal = document.createElement('div')
    modal.id = 'resume-modal'
    modal.innerHTML = `
      <div class="rec-modal-bg"></div>
      <div class="rec-modal-box">
        <div class="rec-modal-title">⚠️ Незавершённая запись</div>
        <div class="rec-modal-info">${points.length} точек · ${dist} км</div>
        <div class="rec-modal-info" style="font-size:11px;color:#888">Приложение было закрыто во время записи</div>
        <div class="rec-modal-btns" style="flex-direction:column;gap:8px">
          <button class="rp-btn-primary" id="resume-continue">▶ Продолжить запись</button>
          <button class="rp-btn-secondary" id="resume-save">💾 Сохранить как есть</button>
          <button class="rp-btn-secondary" id="resume-discard" style="color:#c00">🗑 Удалить</button>
        </div>
      </div>`
    document.body.appendChild(modal)

    document.getElementById('resume-continue').addEventListener('click', async () => {
      modal.remove()
      recordedPoints = points
      restorePolyline()
      recording = true
      updateRecordBtn()
      acquireWakeLock()
      if (window.Capacitor) {
        await startBgRecording()
      } else {
        startWebRecording()
      }
    })

    document.getElementById('resume-save').addEventListener('click', () => {
      modal.remove()
      recordedPoints = points
      showSaveRecordDialog()
    })

    document.getElementById('resume-discard').addEventListener('click', () => {
      modal.remove()
      clearPersistedTrack()
    })
  }

  function restorePolyline() {
    if (recordPolyline) { map.removeLayer(recordPolyline); recordPolyline = null }
    const latlngs = recordedPoints.map(p => [p.lat, p.lng])
    recordPolyline = L.polyline(latlngs, { color: '#ff2200', weight: 4, opacity: 0.9 }).addTo(map)
    if (latlngs.length) map.panTo(latlngs[latlngs.length - 1])
  }

  function calcDistanceFor(points) {
    let d = 0
    for (let i = 1; i < points.length; i++) {
      const R = 6371
      const dLat = (points[i].lat - points[i-1].lat) * Math.PI / 180
      const dLon = (points[i].lng - points[i-1].lng) * Math.PI / 180
      const a = Math.sin(dLat/2)**2 + Math.cos(points[i-1].lat*Math.PI/180)*Math.cos(points[i].lat*Math.PI/180)*Math.sin(dLon/2)**2
      d += R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
    }
    return Math.round(d * 10) / 10
  }

  function initRecordBtn() {
    if (document.getElementById('btn-record')) return
    const RecordControl = L.Control.extend({
      options: { position: 'topleft' },
      onAdd: function () {
        const btn = L.DomUtil.create('div', 'leaflet-control-record')
        btn.id = 'btn-record'
        L.DomEvent.on(btn, 'click', function (e) {
          L.DomEvent.stopPropagation(e)
          if (recording) { stopRecording(); return }
          if (!getToken()) { openPanel('⏺ Для записи трека необходимо войти в аккаунт'); return }
          const geoActive = !!document.querySelector('.leaflet-control-locate.active')
          if (!geoActive) { showGeoNeededModal(); return }
          startRecording()
        })
        return btn
      }
    })
    map.addControl(new RecordControl())
    updateRecordBtn()
    if (getToken()) checkInterruptedTrack()
  }

  function updateRecordBtn() {
    const btn = document.getElementById('btn-record')
    if (!btn) return
    btn.classList.toggle('recording', recording)
    if (recording) {
      const dist = recordedPoints.length > 1 ? calcRecordedDistance() + ' км' : ''
      btn.innerHTML = `<span class="rec-icon rec-stop">■</span><span class="rec-label">STOP${dist ? '<br><small>' + dist + '</small>' : ''}</span>`
    } else {
      btn.innerHTML = `<span class="rec-icon">▶</span><span class="rec-label">REC</span>`
    }
  }

  function showGeoNeededModal() {
    document.getElementById('geo-needed-modal')?.remove()
    const el = document.createElement('div')
    el.id = 'geo-needed-modal'
    el.innerHTML = `
      <div class="geo-needed-box">
        <div class="geo-needed-title">📍 Нужна геолокация</div>
        <div class="geo-needed-text">Для записи трека включите геолокацию</div>
        <div class="geo-needed-btns">
          <button id="geo-needed-enable">Включить</button>
          <button id="geo-needed-cancel">Отмена</button>
        </div>
      </div>
    `
    document.body.appendChild(el)
    el.addEventListener('click', e => { if (e.target === el) el.remove() })
    document.getElementById('geo-needed-enable').addEventListener('click', () => {
      el.remove()
      window.locateControl?.start()
    })
    document.getElementById('geo-needed-cancel').addEventListener('click', () => el.remove())
  }

  function onGpsPoint(lat, lng, time) {
    recordedPoints.push({ lat, lng, time })
    recordPolyline.addLatLng([lat, lng])
    persistTrack()
    updateRecordBtn()
  }

  function startWebRecording() {
    recordWatchId = navigator.geolocation.watchPosition(
      pos => onGpsPoint(pos.coords.latitude, pos.coords.longitude, pos.timestamp),
      err => console.warn('GPS error:', err.message),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    )
  }

  async function startBgRecording() {
    try {
      const { BackgroundGeolocation } = await import('@capacitor-community/background-geolocation')
      bgGeoWatcherId = await BackgroundGeolocation.addWatcher(
        {
          backgroundMessage: 'Запись трека продолжается...',
          backgroundTitle: 'Liteoffroad — запись трека',
          requestPermissions: true,
          stale: false,
          distanceFilter: 5
        },
        (location, error) => {
          if (error) { console.warn('BgGeo error:', error.code, error.message); return }
          onGpsPoint(location.latitude, location.longitude, location.time)
        }
      )
    } catch (e) {
      console.error('BackgroundGeolocation недоступен, fallback на watchPosition:', e)
      startWebRecording()
    }
  }

  async function startRecording() {
    recordedPoints = []
    recording = true
    clearPersistedTrack()
    updateRecordBtn()
    acquireWakeLock()

    if (recordPolyline) { map.removeLayer(recordPolyline); recordPolyline = null }
    recordPolyline = L.polyline([], { color: '#ff2200', weight: 4, opacity: 0.9 }).addTo(map)

    if (window.Capacitor) {
      await startBgRecording()
    } else {
      if (!navigator.geolocation) { alert('Геолокация не поддерживается браузером'); return }
      startWebRecording()
    }
  }

  async function stopRecording() {
    if (bgGeoWatcherId) {
      try {
        const { BackgroundGeolocation } = await import('@capacitor-community/background-geolocation')
        await BackgroundGeolocation.removeWatcher({ id: bgGeoWatcherId })
      } catch (e) { console.error(e) }
      bgGeoWatcherId = null
    }
    if (recordWatchId !== null) {
      navigator.geolocation.clearWatch(recordWatchId)
      recordWatchId = null
    }
    recording = false
    releaseWakeLock()
    updateRecordBtn()

    if (recordedPoints.length < 2) {
      alert('Слишком мало точек для сохранения трека')
      if (recordPolyline) { map.removeLayer(recordPolyline); recordPolyline = null }
      recordedPoints = []
      clearPersistedTrack()
      return
    }

    showSaveRecordDialog()
  }

  function calcRecordedDistance() {
    let d = 0
    for (let i = 1; i < recordedPoints.length; i++) {
      const lat1 = recordedPoints[i-1].lat, lon1 = recordedPoints[i-1].lng
      const lat2 = recordedPoints[i].lat, lon2 = recordedPoints[i].lng
      const R = 6371
      const dLat = (lat2 - lat1) * Math.PI / 180
      const dLon = (lon2 - lon1) * Math.PI / 180
      const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2
      d += R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
    }
    return Math.round(d * 10) / 10
  }

  function buildGpx(points, title) {
    const trkpts = points.map(p =>
      `    <trkpt lat="${p.lat}" lon="${p.lng}"><time>${new Date(p.time).toISOString()}</time></trkpt>`
    ).join('\n')
    const safeName = title.replace(/[<>&'"]/g, c => ({ '<':'&lt;','>':'&gt;','&':'&amp;',"'":'&apos;','"':'&quot;' }[c]))
    return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="LiteOffroad GPS Recorder" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><name>${safeName}</name><trkseg>
${trkpts}
  </trkseg></trk>
</gpx>`
  }

  function showSaveRecordDialog() {
    const dist = calcRecordedDistance()
    const modal = document.createElement('div')
    modal.id = 'record-modal'
    modal.innerHTML = `
      <div class="rec-modal-bg"></div>
      <div class="rec-modal-box">
        <div class="rec-modal-title">Сохранить трек</div>
        <div class="rec-modal-info">${recordedPoints.length} точек · ${dist} км</div>
        <input type="text" id="rec-title" placeholder="Название трека *" autocomplete="off">
        <select id="rec-transport">
          <option value="suv">🚙 Внедорожник</option>
          <option value="crossover">🚗 Кроссовер</option>
          <option value="car">🚘 Легковой</option>
          <option value="atv">🏍 Квадроцикл</option>
          <option value="enduro">🏁 Эндуро</option>
          <option value="swamp">🛥 Болотоход</option>
        </select>
        <select id="rec-difficulty">
          <option value="1">🟢 Асфальт / Грунтовка</option>
          <option value="2">🟡 Грязь, лужи</option>
          <option value="3">🔴 Серьёзное бездорожье</option>
          <option value="4">⚫ Осторожно!</option>
        </select>
        <div id="rec-error" class="rp-error hidden"></div>
        <div class="rec-modal-btns">
          <button class="rp-btn-secondary" id="rec-cancel">Отмена</button>
          <button class="rp-btn-primary" id="rec-save">Сохранить</button>
        </div>
      </div>`
    document.body.appendChild(modal)

    modal.querySelector('.rec-modal-bg').addEventListener('click', dismissSaveDialog)
    document.getElementById('rec-cancel').addEventListener('click', dismissSaveDialog)
    document.getElementById('rec-save').addEventListener('click', saveRecordedTrack)
  }

  function dismissSaveDialog() {
    document.getElementById('record-modal')?.remove()
    if (recordPolyline) { map.removeLayer(recordPolyline); recordPolyline = null }
    recordedPoints = []
    clearPersistedTrack()
  }

  async function saveRecordedTrack() {
    const btn = document.getElementById('rec-save')
    const errEl = document.getElementById('rec-error')
    const title = document.getElementById('rec-title').value.trim()
    errEl.classList.add('hidden')

    if (!title) {
      errEl.textContent = 'Укажите название'
      errEl.classList.remove('hidden')
      return
    }

    btn.disabled = true
    btn.textContent = 'Сохраняю…'

    const gpxContent = buildGpx(recordedPoints, title)
    const gpxFile = new File(
      [new Blob([gpxContent], { type: 'application/gpx+xml' })],
      `${title}.gpx`,
      { type: 'application/gpx+xml' }
    )

    const form = new FormData()
    form.append('gpx', gpxFile)
    form.append('title', title)
    form.append('description', '')
    form.append('transport', document.getElementById('rec-transport').value)
    form.append('difficulty', document.getElementById('rec-difficulty').value)
    form.append('isPublic', 'false')

    try {
      const res = await fetch(`${API}/routes`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
        body: form
      })
      const data = await res.json().catch(() => ({}))

      if (data._id) {
        document.getElementById('record-modal')?.remove()
        if (recordPolyline) { map.removeLayer(recordPolyline); recordPolyline = null }
        recordedPoints = []
        clearPersistedTrack()
        showRecordSavedToast(data._id, title)
      } else {
        errEl.textContent = data.error || `Ошибка ${res.status}`
        errEl.classList.remove('hidden')
        btn.disabled = false
        btn.textContent = 'Сохранить'
      }
    } catch (e) {
      errEl.textContent = `Нет соединения: ${e.message}`
      errEl.classList.remove('hidden')
      btn.disabled = false
      btn.textContent = 'Сохранить'
    }
  }

  function showRecordSavedToast(routeId, title) {
    document.getElementById('record-toast')?.remove()
    const toast = document.createElement('div')
    toast.id = 'record-toast'
    toast.innerHTML = `
      <div class="rec-toast">
        <span class="rec-toast-msg">✅ Трек сохранён</span>
        <div class="rec-toast-btns">
          <button class="rec-toast-btn" id="toast-view">Посмотреть</button>
          <button class="rec-toast-btn rec-toast-publish" id="toast-publish">Опубликовать</button>
          <button class="rec-toast-close" id="toast-close">✕</button>
        </div>
      </div>`
    document.body.appendChild(toast)

    const cleanup = () => toast.remove()
    document.getElementById('toast-close').addEventListener('click', cleanup)

    document.getElementById('toast-view').addEventListener('click', () => {
      cleanup()
      openRoute(routeId)
    })

    document.getElementById('toast-publish').addEventListener('click', async () => {
      const btn = document.getElementById('toast-publish')
      btn.disabled = true
      btn.textContent = '…'
      const r = await fetch(`${API}/routes/${routeId}/publish`, { method: 'PATCH', headers: authHdr() })
      if (r.ok) {
        toast.querySelector('.rec-toast-msg').textContent = '✅ Опубликован!'
        toast.querySelector('.rec-toast-btns').innerHTML =
          `<button class="rec-toast-btn" id="toast-view2">Посмотреть</button>
           <button class="rec-toast-close" id="toast-close2">✕</button>`
        document.getElementById('toast-close2').addEventListener('click', cleanup)
        document.getElementById('toast-view2').addEventListener('click', () => { cleanup(); openRoute(routeId) })
      } else {
        btn.disabled = false
        btn.textContent = 'Опубликовать'
      }
    })

    setTimeout(cleanup, 12000)
  }

  // ─── Мои треки ──────────────────────────────────────────────────────────────

  async function showMyTracks() {
    setView('mytracks')
    content.innerHTML = '<div class="rp-loading">Загружаю…</div>'
    footer.innerHTML = ''

    try {
      const res = await fetch(`${API}/my-tracks`, { headers: authHdr() })
      if (!res.ok) throw new Error(res.status)
      const tracks = await res.json()

      if (!tracks.length) {
        content.innerHTML = `
          <div class="rp-empty">Треков пока нет.<br>
          Запишите свой первый маршрут<br>кнопкой ⏺ Запись на карте!</div>`
        return
      }

      content.innerHTML = `<div id="my-tracks-list">${tracks.map(t => `
        <div class="rp-card rp-mt-card" data-id="${t._id}">
          <div class="rp-card-title-row">
            <span class="rp-diff-dot" style="background:${diffColor(t.difficulty)}"></span>
            <span class="rp-card-title">${t.title}</span>
            ${t.isPublic === false ? '<span class="rp-private-badge">приватный</span>' : '<span class="rp-public-badge">публичный</span>'}
          </div>
          <div class="rp-card-meta">
            ${transportIcon(t.transport)} · ${t.distance} км ·
            ${new Date(t.createdAt).toLocaleDateString('ru-RU')}
          </div>
          <div class="rp-mt-actions">
            <button class="rp-act-btn rp-act-view" data-id="${t._id}">👁 Карта</button>
            <button class="rp-act-btn rp-act-dl" data-id="${t._id}" data-title="${t.title}">⬇ GPX</button>
            ${t.isPublic === false
              ? `<button class="rp-act-btn rp-act-publish" data-id="${t._id}">📢 Публикация</button>`
              : ''}
            <button class="rp-act-btn rp-act-delete" data-id="${t._id}">🗑</button>
          </div>
        </div>`
      ).join('')}</div>`

      const list = document.getElementById('my-tracks-list')

      list.addEventListener('click', async e => {
        const viewBtn    = e.target.closest('.rp-act-view')
        const dlBtn      = e.target.closest('.rp-act-dl')
        const publishBtn = e.target.closest('.rp-act-publish')
        const deleteBtn  = e.target.closest('.rp-act-delete')

        if (viewBtn) {
          openRoute(viewBtn.dataset.id)
          return
        }
        if (dlBtn) {
          const id = dlBtn.dataset.id
          const title = dlBtn.dataset.title || 'track'
          fetch(`${API}/routes/${id}/gpx`, { headers: { Authorization: `Bearer ${getToken()}` } })
            .then(r => r.blob())
            .then(blob => {
              const a = Object.assign(document.createElement('a'), {
                href: URL.createObjectURL(blob),
                download: `${title}.gpx`
              })
              a.click()
              URL.revokeObjectURL(a.href)
            })
          return
        }
        if (publishBtn) {
          publishBtn.disabled = true
          publishBtn.textContent = '…'
          const r = await fetch(`${API}/routes/${publishBtn.dataset.id}/publish`,
            { method: 'PATCH', headers: authHdr() })
          if (r.ok) showMyTracks()
          else { publishBtn.disabled = false; publishBtn.textContent = '📢 Публикация' }
          return
        }
        if (deleteBtn) {
          if (deleteBtn.dataset.confirm !== '1') {
            deleteBtn.textContent = 'Удалить?'
            deleteBtn.dataset.confirm = '1'
            setTimeout(() => { if (deleteBtn.dataset.confirm) { deleteBtn.textContent = '🗑'; delete deleteBtn.dataset.confirm } }, 3000)
            return
          }
          const r = await fetch(`${API}/routes/${deleteBtn.dataset.id}`,
            { method: 'DELETE', headers: authHdr() })
          if (r.ok) showMyTracks()
          return
        }
      })

    } catch {
      content.innerHTML = '<div class="rp-empty">Ошибка загрузки</div>'
    }
  }

  // ─── Init ──────────────────────────────────────────────────────────────────
  initRecordBtn()

}) // waitForMap
