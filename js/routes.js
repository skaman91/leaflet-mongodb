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
  let view = 'list'          // 'list' | 'upload' | 'detail'
  let routes = []
  let activeLayer = null
  let allLayers = []
  let showAllOnMap = false
  let currentRoute = null

  // ─── Кнопка Маршруты (HTML-элемент над Слои) ──────────────────────────────
  document.getElementById('routes-toggle-btn').addEventListener('click', togglePanel)

  // ─── Панель ────────────────────────────────────────────────────────────────
  const panel   = document.getElementById('routes-panel')
  const content = document.getElementById('rp-content')
  const footer  = document.getElementById('rp-footer')
  const backBtn = document.getElementById('rp-back')
  const titleEl = document.getElementById('rp-title')

  document.getElementById('rp-close').addEventListener('click', closePanel)

  // запрещаем горизонтальные свайпы уходить на карту
  L.DomEvent.on(panel, 'touchstart touchmove touchend', L.DomEvent.stopPropagation)

  backBtn.addEventListener('click', () => {
    if (view === 'upload' || view === 'detail' || view === 'profile') showList()
    else if (view === 'edit') openRoute(currentRoute._id)
  })

  function togglePanel() {
    panelOpen ? closePanel() : openPanel()
  }

  function openPanel() {
    panelOpen = true
    panel.classList.add('open')
    const arrow = document.getElementById('routes-btn-arrow')
    if (arrow) arrow.textContent = '▴'
    document.getElementById('routes-toggle-btn')?.classList.add('active')
    updateAuthUI()
    if (view === 'list') loadAndShowList()
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
    backBtn.classList.toggle('hidden', v === 'list')
    footer.innerHTML = ''
    if (v === 'list') {
      titleEl.textContent = 'Маршруты'
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
    }
  }

  // ─── Auth UI ───────────────────────────────────────────────────────────────
  function updateAuthUI() {
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
    } else {
      authEl.innerHTML = `
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
          ${r.avgRating ? `<span>⭐ ${r.avgRating}</span>` : ''}
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
    const res = await fetch(`${API}/routes/${id}`)
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
        <div class="rp-detail-author">Автор: <b>${route.author.name}</b></div>
        ${route.description ? `<div class="rp-detail-desc">${route.description}</div>` : ''}
        <div class="rp-detail-stats">
          🏁 ${route.riddenCount} проехали
          ${route.downloadCount ? ` · ⬇ ${route.downloadCount} скачали` : ''}
          ${route.avgRating ? ` · ⭐ ${route.avgRating} (${route.reviewCount})` : ''}
          ${route.lastCondition ? `<br>${condBadge(route.lastCondition)} — ${route.lastCondition.authorName}` : ''}
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
          <div class="rp-section-title">Отзыв</div>
          <div class="rp-stars" id="rp-stars">
            ${[1,2,3,4,5].map(i => `<span class="rp-star" data-v="${i}">★</span>`).join('')}
          </div>
          <select id="rv-condition">
            <option value="">Состояние дороги</option>
            <option value="dry">🟢 Сухо</option>
            <option value="wet">🟡 Мокро</option>
            <option value="mud">🟠 Грязь</option>
            <option value="snow">🔵 Снег</option>
            <option value="impassable">🔴 Непроходимо</option>
          </select>
          <textarea id="rv-text" placeholder="Комментарий"></textarea>
          <button class="rp-btn-primary" id="btn-review">Отправить отзыв</button>
        </div>` : `<div class="rp-auth-hint">Войдите чтобы скачать трек и оставить отзыв</div>`}

        <div class="rp-reviews">
          <div class="rp-section-title">Отзывы ${route.reviewCount ? `(${route.reviewCount})` : ''}</div>
          ${route.reviews?.length ? route.reviews.map(r => `
            <div class="rp-review">
              <div class="rp-rv-top">
                <b>${r.author.name}</b>
                <span class="rp-rv-stars">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</span>
                ${r.condition ? condBadge({ status: r.condition }) : ''}
              </div>
              ${r.text ? `<div class="rp-rv-text">${r.text}</div>` : ''}
              <div class="rp-rv-date">${new Date(r.createdAt).toLocaleDateString('ru-RU')}</div>
            </div>`).join('') : '<div class="rp-empty-sm">Отзывов пока нет</div>'}
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
        const cond = document.getElementById('rv-condition')?.value || null
        const res  = await fetch(`${API}/routes/${route._id}/ridden`, {
          method: 'POST', headers: authHdr(), body: JSON.stringify({ condition: cond })
        })
        if (res.ok) openRoute(route._id)
      })
    }

    // Звёзды
    let rating = 5
    const stars = document.querySelectorAll('.rp-star')
    const paintStars = v => stars.forEach((s, i) => s.classList.toggle('active', i < v))
    paintStars(rating)
    stars.forEach(s => s.addEventListener('click', () => { rating = +s.dataset.v; paintStars(rating) }))

    // Отзыв
    document.getElementById('btn-review').addEventListener('click', async () => {
      const btn = document.getElementById('btn-review')
      btn.disabled = true
      await fetch(`${API}/routes/${route._id}/review`, {
        method: 'POST', headers: authHdr(),
        body: JSON.stringify({
          rating,
          text: document.getElementById('rv-text').value,
          condition: document.getElementById('rv-condition').value || null
        })
      })
      openRoute(route._id)
    })
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
          ${data.rank ? `<div class="rp-profile-rank">🏆 ${data.rank}</div>` : ''}

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
          </div>

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
    fetch(`${API}/routes/${routeId}/gpx-view`)
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

}) // waitForMap
