// ОСНОВНАЯ ЛОГИКА ПРИЛОЖЕНИЯ

let currentDayNum = 1;
let readDays = JSON.parse(localStorage.getItem('elli_progress')) || [];
// По умолчанию открыты 1, 2 дни (3-й за отзыв)
let unlockedDays = JSON.parse(localStorage.getItem('elli_unlocked_days')) || [1, 2];

// --- ТЕЛЕГРАМ ИНИЦИАЛИЗАЦИЯ ---
const tg = window.Telegram.WebApp;
// Проверяем, запущен ли сайт внутри мессенджера
if (tg && tg.initDataUnsafe && Object.keys(tg.initDataUnsafe).length > 0) {
    tg.ready(); 
    tg.expand();
    tg.setHeaderColor('#fdfbf7'); 
    tg.setBackgroundColor('#fdfbf7');
}

let isScrolling = false;
let scrollInterval;

// ПРОВЕРКА ЧЕРНОГО СПИСКА
checkBlacklist();

// ПРОВЕРКА ДОСТУПА ПРИ ЗАПУСКЕ
// Мы делаем это "тихо", чтобы обновить права, если админ добавил пользователя в базу
// checkUserAccess(true);

// --- 1. ОТРИСОВКА СЕТКИ ---
function renderGrid() {
    const grid = document.getElementById('main-grid');
    if (!grid) return; // Защита от ошибок, если элемента нет
    grid.innerHTML = '';
    items.forEach((item, i) => {
        const dayNum = i + 1;
        const card = document.createElement('div');
        const isRead = readDays.includes(dayNum);
        const isLocked = !unlockedDays.includes(dayNum);

        card.className = `day-card ${isLocked ? 'locked' : ''} ${isRead && !isLocked ? 'completed' : ''}`;
        
        // Обработчик клика
        card.onclick = () => handleDayClick(dayNum, item.n, isLocked, isRead);

        card.innerHTML = `
            <div style="font-size:9px; color: ${isRead && !isLocked ? '#d4af37' : '#aaa'}; font-weight:${isRead && !isLocked ?'bold':'normal'};">ДЕНЬ ${dayNum}</div>
            <div class="day-icon">${item.i}</div>
            <div class="day-name">${item.n}</div>
        `;
        grid.appendChild(card);
    });

    // ПРОВЕРКА ФИНАЛА
    // Если открыты все 30 дней (1..30)
    const all30Unlocked = items.every((_, i) => unlockedDays.includes(i + 1));
    
    if (all30Unlocked) {
        const finalCard = document.createElement('div');
        finalCard.className = 'day-card final-day-card';
        finalCard.onclick = () => openDayMenu('final', 'ФИНАЛ');
        
        finalCard.innerHTML = `
            <div style="font-size:11px; font-weight:bold; color: rgba(255,255,255,0.9);">ГРАНД ФИНАЛ</div>
            <div class="day-icon">🏆</div>
            <div class="day-name">Вершина Пути</div>
        `;
        grid.appendChild(finalCard);
    }
}
// Запускаем отрисовку при загрузке
document.addEventListener('DOMContentLoaded', renderGrid);

// Обработка клика по дню
function handleDayClick(dayNum, name, isLocked, isRead) {
    const lastRead = readDays.length > 0 ? Math.max(...readDays) : 0;
    const nextSequential = lastRead + 1;

    // Разрешаем открывать если это следующий по очереди или старые дни (даже если не прочитаны, но доступны)
    // Но также проверяем unlockedDays
    
    // Если пытаемся открыть день, который далеко впереди (пропуская этапы)
    // НО если день уже открыт (isLocked == false), то разрешаем доступ
    if (dayNum > nextSequential && dayNum > 3 && isLocked) { // 3 первых дня - исключение, они всегда доступны
            showWarningModal(nextSequential);
            return;
    }

    if (isLocked) {
        // Если это День 3, показываем спецпредложение "За отзыв"
        if (dayNum === 3) {
            showReviewModal();
        } else {
            // Иначе предлагаем купить (Offer)
            showAccessModal();
        }
    } else {
        // Если открыт -> заходим
        openDayMenu(dayNum, name);
    }
}

// --- ЛОГИКА ПРОВЕРКИ ДОСТУПА ---
async function checkUserAccess(silent = false, retryCount = 0) {
    const user = tg.initDataUnsafe?.user;
    
    // Если пользователя нет, пробуем подождать (до 5 раз по 1000мс = 5 секунд)
    if (!user) {
        if (retryCount < 5) {
            console.log(`[Access] Telegram user not ready. Retry ${retryCount + 1}/5...`);
            setTimeout(() => checkUserAccess(silent, retryCount + 1), 1000);
            return;
        }
        console.warn("[Access] Ошибка: Не удалось получить ID пользователя Telegram после 5 попыток.");
        return;
    }

    const userId = String(user.id);
    console.log(`[Access] Проверка доступа для ID: ${userId}`);

    try {
        // Загружаем базу пользователей (users.json)
        const response = await fetch(`users.json?t=${new Date().getTime()}`);
        if (!response.ok) throw new Error("Database not found");
        
        const db = await response.json();
        
        // Проверяем есть ли пользователь в базе
        // Приводим ключи базы к строкам на всякий случай
        if (db.hasOwnProperty(userId)) {
            const maxLevel = db[userId];
            console.log(`[Access] Нашлась запись! Уровень доступа: ${maxLevel}`);
            
            let updated = false;

            // Открываем дни
            for (let i = 1; i <= maxLevel; i++) {
                if (!unlockedDays.includes(i)) {
                    unlockedDays.push(i);
                    updated = true;
                }
            }

            // ВСЕГДА сохраняем и перерисовываем, если нашли пользователя, 
            // чтобы гарантировать синхронизацию, даже если updated=false (на всякий случай)
            localStorage.setItem('elli_unlocked_days', JSON.stringify(unlockedDays));
            renderGrid(); // <--- ВАЖНО: Перерисовка интерфейса

            if (updated && !silent) {
                alert(`🎉 Доступ восстановлен! Открыто дней: ${maxLevel}`);
            }
        } else {
            console.log(`[Access] ID ${userId} не найден в базе.`);
        }

    } catch (e) {
        console.error("[Access] Ошибка проверки доступа:", e);
        // Не показываем алерт, чтобы не пугать пользователя, если просто нет сети
        // if (!silent) alert("Ошибка проверки доступа. Попробуйте позже.");
    }
}

// --- ЛОГИКА ЧЕРНОГО СПИСКА ---
async function checkBlacklist() {
    const user = tg.initDataUnsafe?.user;
    if (!user) return;

    try {
        const response = await fetch(`blacklist.json?t=${new Date().getTime()}`);
        if (!response.ok) return; // Если файла нет, значит и списка нет

        const blacklist = await response.json();
        if (blacklist.includes(String(user.id)) || blacklist.includes(user.id)) {
            // БЛОКИРОВКА
            document.getElementById('blocked-modal').classList.add('visible');
            // Убираем возможность закрыть окно
            document.getElementById('blocked-modal').onclick = (e) => e.stopPropagation();
        }
    } catch (e) {
        console.error("Ошибка проверки черного списка:", e);
    }
}

// --- ФУНКЦИИ ПОДТВЕРЖДЕНИЯ ОПЛАТЫ ---

function showPaymentWarning() {
    // Скрываем окно предложения, показываем предупреждение
    closeAccessModal();
    document.getElementById('payment-warning-modal').classList.add('visible');
}

function closePaymentWarning() {
    document.getElementById('payment-warning-modal').classList.remove('visible');
}

function confirmPaymentClaim() {
    // Уведомляем админа
    if (APP_CONFIG.telegram && APP_CONFIG.telegram.enabled) {
        const user = tg.initDataUnsafe?.user;
        if (user) {
            sendTelegramNotification(user, "⚠️ УТВЕРЖДАЕТ, ЧТО ОПЛАТИЛ");
        }
    }
    
    closePaymentWarning();
    alert("Заявка принята. Ожидайте проверки в течение 24 часов.");
}


// --- 2. ОТКРЫТИЕ МЕНЮ ДНЯ ---
function openDayMenu(num, name) {
    currentDayNum = num;
    
    switchView('view-menu');
    document.getElementById('menu-title').innerText = `День ${num}: ${name}`;

    // Сохраняем, что день открыт
    if (!readDays.includes(num)) {
        readDays.push(num);
        localStorage.setItem('elli_progress', JSON.stringify(readDays));
        renderGrid();
    }
}

// --- 3. ЗАГРУЗКА КОНТЕНТА (HTML, ВИДЕО, АУДИО) ---
async function openContent(type) {
    switchView('view-content');
    stopScroll(); 

    const container = document.getElementById('scroll-box');
    container.scrollTop = 0;
    const titleLabel = document.getElementById('header-title');
    
    const videoArea = document.getElementById('video-area');
    const videoPlayer = document.getElementById('video-player');
    const textBox = document.getElementById('text-box');
    const textDisplay = document.getElementById('text-display');
    const audioBox = document.getElementById('audio-box');
    const audioPlayer = document.getElementById('audio-player');
    const audioTitle = document.getElementById('audio-title');
    const mainImage = document.getElementById('main-image');
    const scrollBtn = document.getElementById('scroll-btn');

    videoPlayer.pause();
    audioPlayer.pause();
    videoArea.style.display = 'none';
    textBox.style.display = 'none';
    audioBox.style.display = 'none';
    mainImage.style.display = 'none';
    scrollBtn.classList.remove('visible');
    textDisplay.innerHTML = ""; 

    // Определяем префикс файла (если финал, то особое имя, иначе dayN)
    const filePrefix = currentDayNum === 'final' ? 'final' : `day${currentDayNum}`;

    // 1. ИСТОРИЯ
    if (type === 'story') {
        titleLabel.innerText = "📖 История";
        await loadTextContent(`texts/${filePrefix}_story.html`); 
        
        // Для финала может не быть аудио, проверим (или просто попытаемся загрузить)
        // Но по ТЗ были только HTML ссылки. Оставим аудио по стандарту, если есть.
        audioBox.style.display = 'block';
        audioTitle.innerText = "🎧 Слушать сказку";
        audioPlayer.src = `audio/${filePrefix}_story.mp3`;
        scrollBtn.classList.add('visible');
    } 
    // 2. ВИДЕО
    else if (type === 'video') {
        titleLabel.innerText = "🎬 Видео";
        videoArea.style.display = 'block';
        // Если финал видео
        const videoName = currentDayNum === 'final' ? 'final' : `day${currentDayNum}`;
        videoPlayer.src = `videos/${videoName}.mp4`;
    } 
    // 3. ПЕСНЯ
    else if (type === 'song') {
        titleLabel.innerText = "🎵 Песенка";
        const imgName = currentDayNum === 'final' ? 'final' : `day${currentDayNum}`;
        mainImage.src = `images/${imgName}.jpg`;
        mainImage.style.display = 'block';
        
        audioBox.style.display = 'block';
        audioTitle.innerText = "🎧 Слушать песенку";
        audioPlayer.src = `audio/${filePrefix}_song.mp3`;
    } 
    // 4. ДЕТИ
    else if (type === 'child') {
        titleLabel.innerText = "👶 Практика (Дети)";
        await loadTextContent(`texts/${filePrefix}_child.html`);
        
        audioBox.style.display = 'block';
        audioTitle.innerText = "🎧 Слушать практику";
        audioPlayer.src = `audio/${filePrefix}_child.mp3`;
        scrollBtn.classList.add('visible');
    } 
    // 5. ВЗРОСЛЫЕ
    else if (type === 'adult') {
        titleLabel.innerText = "🧘‍♀️ Практика (Взр)";
        await loadTextContent(`texts/${filePrefix}_adult.html`);
        
        audioBox.style.display = 'block';
        audioTitle.innerText = "🎧 Слушать практику";
        audioPlayer.src = `audio/${filePrefix}_adult.mp3`;
        scrollBtn.classList.add('visible');
    }
    
    if (audioBox.style.display === 'block') audioPlayer.load();
}

async function openInstructions() {
    switchView('view-content');
    stopScroll();

    const container = document.getElementById('scroll-box');
    container.scrollTop = 0;
    const titleLabel = document.getElementById('header-title');
    
    // Скрываем все медиа-элементы, оставляем только текст
    document.getElementById('video-area').style.display = 'none';
    document.getElementById('audio-box').style.display = 'none';
    document.getElementById('main-image').style.display = 'none';
    document.getElementById('video-player').pause();
    document.getElementById('audio-player').pause();
    document.getElementById('scroll-btn').classList.remove('visible');

    titleLabel.innerText = "❓ Инструкция";
    
    // Загружаем текст инструкции
    await loadTextContent('texts/instructions.html');
}

async function loadTextContent(filePath) {
    const textBox = document.getElementById('text-box');
    const textDisplay = document.getElementById('text-display');
    try {
        const res = await fetch(filePath);
        if (res.ok) {
            let text = await res.text();
            textDisplay.innerHTML = formatText(text, currentDayNum);
            textBox.style.display = 'block';
            initVideoObserver();
        } else {
            textDisplay.innerHTML = "<p style='text-align:center'>Текст скоро появится...</p>";
            textBox.style.display = 'block';
        }
    } catch (e) {
        textDisplay.innerHTML = "<p style='text-align:center'>Ошибка загрузки текста :(</p>";
        textBox.style.display = 'block';
    }
}

function initVideoObserver() {
    const videos = document.querySelectorAll('#text-display video');
    if (!videos.length) return;
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.play().catch(e => console.log('Autoplay blocked', e));
            } else {
                entry.target.pause();
            }
        });
    }, { threshold: 0.1 });
    videos.forEach(video => observer.observe(video));
}

function switchView(viewId) {
    document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active-view'));
    document.getElementById(viewId).classList.add('active-view');
}

function formatText(text, dayNum) {
    if (!text) return "";
    let html = text.replace(/\[IMAGE(\d*)\]/g, (match, p1) => {
        const suffix = p1 ? `_${p1}` : ''; 
        return `<img src="images/day${dayNum}${suffix}.jpg" class="book-media" onerror="this.style.display='none'">`;
    });
    html = html.replace(/\[GIF(\d*)\]/g, (match, p1) => {
        const suffix = p1 ? `_${p1}` : '';
        return `<img src="images/day${dayNum}${suffix}.gif" class="book-media" onerror="this.style.display='none'">`;
    });
    html = html.replace(/\[VID(\d*)\]/g, (match, p1) => {
        const suffix = p1 ? `_${p1}` : '';
        return `<video src="videos/day${dayNum}${suffix}.mp4" class="book-media" autoplay muted loop playsinline onerror="this.style.display='none'"></video>`;
    });
    return html;
}

function goBackToMenu() {
    stopScroll();
    document.getElementById('audio-player').pause();
    document.getElementById('video-player').pause();
    switchView('view-menu');
}

function goHome() {
    stopScroll();
    document.getElementById('audio-player').pause();
    document.getElementById('video-player').pause();
    switchView('view-grid');
}

function toggleAutoScroll() {
    const container = document.getElementById('scroll-box');
    const btn = document.getElementById('scroll-btn');
    
    if (isScrolling) {
        clearInterval(scrollInterval);
        btn.classList.remove('active');
    } else {
        scrollInterval = setInterval(() => {
            container.scrollTop += 1; 
            if (container.scrollTop + container.clientHeight >= container.scrollHeight - 2) {
                stopScroll();
            }
        }, 35);
        btn.classList.add('active');
    }
    isScrolling = !isScrolling;
}

function stopScroll() {
    clearInterval(scrollInterval);
    isScrolling = false;
    const btn = document.getElementById('scroll-btn');
    if(btn) btn.classList.remove('active');
}

// --- 4. МОДАЛЬНЫЕ ОКНА И ЛОГИКА ДОСТУПА ---

// Окно "Нет доступа" (ОПЛАТА)
function showAccessModal() {
    // 1. Отправляем уведомление админу "Пользователь заинтересовался"
    if (APP_CONFIG.telegram && APP_CONFIG.telegram.enabled) {
        const user = tg.initDataUnsafe?.user;
        if (user) {
            sendTelegramNotification(user, "интересуется оплатой");
        }
    }

    // 2. Показываем окно
    checkUserAccess(true).then(() => {
        document.getElementById('access-denied-modal').classList.add('visible');
        startOfferTimer();
    });
}

function closeAccessModal() {
    document.getElementById('access-denied-modal').classList.remove('visible');
}

// Таймер спецпредложения
let timerInterval;
function startOfferTimer() {
    const timerDisplay = document.getElementById('offer-timer');
    // Пробуем достать время окончания из памяти
    let endTime = localStorage.getItem('offer_end_time');
    
    if (!endTime) {
        // Если нет, ставим +30 минут от текущего момента
        endTime = new Date().getTime() + (30 * 60 * 1000);
        localStorage.setItem('offer_end_time', endTime);
    }

    // Функция обновления
    const update = () => {
        const now = new Date().getTime();
        const distance = endTime - now;

        const discountBlock = document.getElementById('discount-block');
        const priceContainer = document.getElementById('day-price-container');

        if (distance < 0) {
            // Время вышло: скрываем скидку, ставим обычную цену
            if (discountBlock) discountBlock.style.display = 'none';
            if (priceContainer) priceContainer.innerHTML = '<span class="offer-price-val">2 000 руб.</span>';
            
            clearInterval(timerInterval);
            return;
        } else {
            // Время есть: показываем скидку
            if (discountBlock) discountBlock.style.display = 'block';
            if (priceContainer && !priceContainer.innerHTML.includes('price-strike')) {
                // Восстанавливаем HTML скидки, если он был затерт
                priceContainer.innerHTML = '<span class="price-strike">2 000 руб.</span> <span class="price-new">1 000 руб.</span>';
            }
        }

        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((distance % (1000 * 60)) / 1000);

        if (timerDisplay) {
            timerDisplay.innerText = 
                (minutes < 10 ? "0" + minutes : minutes) + ":" + 
                (seconds < 10 ? "0" + seconds : seconds);
        }
    };

    update(); // Сразу покажем
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(update, 1000);
}

// Переход к оплате
function openPaymentLink() {
    // Проверяем, действует ли скидка
    let action = "нажал ОПЛАТИТЬ";
    const endTime = localStorage.getItem('offer_end_time');
    
    // Если таймер не установлен, значит скидка не активирована (пользователь еще не видел OfferModal)
    // Но если он платит из ReviewModal, мы считаем что скидка есть, если бы он открыл OfferModal?
    // Или мы должны запустить таймер при входе в ReviewModal?
    // Давайте запустим таймер при входе в ReviewModal тоже, чтобы скидка начала действовать.
    
    if (endTime) {
        const now = new Date().getTime();
        if (endTime - now > 0) {
            action = "нажал ОПЛАТИТЬ (СО СКИДКОЙ 🔥)";
        } else {
            action = "нажал ОПЛАТИТЬ (ПОЛНАЯ ЦЕНА)";
        }
    } else {
        // Таймера нет -> значит только что зашел -> Скидка есть (по умолчанию 30 мин)
        action = "нажал ОПЛАТИТЬ (СО СКИДКОЙ 🔥)";
        // И запустим таймер, раз он проявил интерес
        startOfferTimer(); 
    }

    // Уведомляем админа
    if (APP_CONFIG.telegram && APP_CONFIG.telegram.enabled) {
        const user = tg.initDataUnsafe?.user;
        if (user) sendTelegramNotification(user, action);
    }

    if (APP_CONFIG.paymentUrl) {
        tg.openTelegramLink(APP_CONFIG.paymentUrl);
    } else {
        alert("Ссылка на оплату не настроена в config.js");
    }
    closeAccessModal();
    closeReviewModal(); // На случай если вызвано оттуда
}

// --- ФУНКЦИИ ОТЗЫВОВ (ДЕНЬ 3) ---

function showReviewModal() {
    document.getElementById('review-modal').classList.add('visible');
}

function closeReviewModal() {
    document.getElementById('review-modal').classList.remove('visible');
}

function openReviewLink() {
    // Уведомляем админа
    if (APP_CONFIG.telegram && APP_CONFIG.telegram.enabled) {
        const user = tg.initDataUnsafe?.user;
        if (user) sendTelegramNotification(user, "пошел писать ОТЗЫВ (День 3) ✍️");
    }

    if (APP_CONFIG.reviewUrl) {
        tg.openTelegramLink(APP_CONFIG.reviewUrl);
    } else {
        alert("Ссылка на отзывы не настроена в config.js");
    }
    closeReviewModal();
}

// Функция отправки уведомления в Telegram (Админу)
async function sendTelegramNotification(user, action) {
    const { botToken, chatId } = APP_CONFIG.telegram;
    if (!botToken || botToken === "ВАШ_ТОКЕН_БОТА" || !chatId) return;

    const username = user.username ? `@${user.username}` : 'нет юзернейма';
    const message = `🔔 <b>${action}</b>%0A%0A👤 Имя: ${user.first_name}%0A🏷 Юзернейм: ${username}%0A🆔 ID: <code>${user.id}</code>`;
    
    const url = `https://api.telegram.org/bot${botToken}/sendMessage?chat_id=${chatId}&text=${message}&parse_mode=HTML`;

    try {
        fetch(url).catch(err => console.error("Ошибка отправки уведомления:", err));
    } catch (err) {
        console.error("Ошибка:", err);
    }
}

// Окно предупреждения (перескок)
function showWarningModal(nextDay) {
    const modal = document.getElementById('warning-modal');
    const unlockBtn = document.getElementById('warn-btn-unlock');
    
    // Кнопка ведет к логике проверки "следующего" дня
    // Если он закрыт -> покажем access modal (Offer)
    // Если открыт -> откроем меню
    
    unlockBtn.onclick = () => {
        closeWarningModal();
        const isNextLocked = !unlockedDays.includes(nextDay);
        if (isNextLocked) {
            showAccessModal();
        } else {
            const item = items[nextDay - 1];
            openDayMenu(nextDay, item ? item.n : '');
        }
    };

    if (!unlockedDays.includes(nextDay)) {
        unlockBtn.innerText = "Открыть доступ";
    } else {
        unlockBtn.innerText = `Перейти к Дню ${nextDay}`;
    }
    
    modal.classList.add('visible');
}

function closeWarningModal() {
    document.getElementById('warning-modal').classList.remove('visible');
}

// Сброс прогресса
function confirmReset() {
    const isConfirmed = confirm("⚠️ Сбросить прогресс?\n\nВы вернетесь к началу (дни 1-3).");
    if (isConfirmed) {
        localStorage.removeItem('elli_progress');
        localStorage.removeItem('elli_unlocked_days');
        location.reload();
    }
}

// Кнопка Назад (системная)
tg.BackButton.onClick(() => {
    if (document.getElementById('view-menu').classList.contains('active-view')) goHome();
    else if (document.getElementById('view-content').classList.contains('active-view')) goBackToMenu();
});

setInterval(() => {
    if (document.getElementById('view-grid').classList.contains('active-view')) tg.BackButton.hide();
    else tg.BackButton.show();
}, 200);
