let currentOffset = 0;
let currentUserId;

(async () => {
  const session = await requireAuth();
  if (!session) return;

  currentUserId = session.user.id;
  const profile = await getProfile(currentUserId);

  if (profile?.is_admin) {
    const link = document.getElementById('adminLink');
    link.style.display = '';
    link.href = 'admin.html';
  }

  document.getElementById('logoutBtn').addEventListener('click', (e) => {
    e.preventDefault();
    logout();
  });

  document.getElementById('prevWeek').addEventListener('click', () => {
    currentOffset--;
    refresh();
  });

  document.getElementById('nextWeek').addEventListener('click', () => {
    currentOffset++;
    refresh();
  });

  refresh();
})();

async function refresh() {
  const { start, end } = weekRange(currentOffset);
  document.getElementById('weekRange').textContent =
    `${formatDate(start)} – ${formatDate(end)}`;
  await renderCalendar(currentUserId, start, end);
}

function buildWeekDates(startIso) {
  const start = new Date(startIso + 'T00:00:00');
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    days.push({ iso, date: d });
  }
  return days;
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

async function renderCalendar(userId, start, end) {
  const container = document.getElementById('scheduleList');
  container.innerHTML = '<div class="empty">טוען…</div>';

  const { data: workouts, error: wErr } = await sb
    .from('workouts')
    .select('id, title, workout_date, start_time, duration_min, max_participants, notes')
    .gte('workout_date', start)
    .lte('workout_date', end)
    .order('workout_date', { ascending: true })
    .order('start_time', { ascending: true });

  if (wErr) {
    container.innerHTML = '<div class="empty">שגיאה בטעינת האימונים</div>';
    console.error(wErr);
    return;
  }

  let countMap = {};
  let myRegs = new Set();

  if (workouts.length) {
    const workoutIds = workouts.map((w) => w.id);
    const { data: regs } = await sb
      .from('registrations')
      .select('workout_id, user_id')
      .in('workout_id', workoutIds);

    for (const r of regs || []) {
      countMap[r.workout_id] = (countMap[r.workout_id] || 0) + 1;
      if (r.user_id === userId) myRegs.add(r.workout_id);
    }
  }

  const byDate = {};
  for (const w of workouts) (byDate[w.workout_date] ||= []).push(w);

  const days = buildWeekDates(start);
  const today = new Date();

  const grid = document.createElement('div');
  grid.className = 'calendar-grid';

  for (const { iso, date } of days) {
    const cell = document.createElement('div');
    const isToday = isSameDay(date, today);
    const isPastDay = date < new Date(today.getFullYear(), today.getMonth(), today.getDate());
    cell.className = 'cal-day' + (isToday ? ' today' : '') + (isPastDay ? ' past' : '');

    cell.innerHTML = `
      <div class="cal-day-header">
        <span class="cal-day-name">${DAY_NAMES[date.getDay()]}</span>
        <span class="cal-day-date">${date.getDate()}/${date.getMonth() + 1}</span>
      </div>
      <div class="cal-day-body"></div>
    `;

    const body = cell.querySelector('.cal-day-body');
    const dayWorkouts = byDate[iso] || [];

    if (!dayWorkouts.length) {
      body.innerHTML = '<div class="cal-empty">—</div>';
    } else {
      for (const w of dayWorkouts) {
        body.appendChild(renderMiniCard(w, userId, countMap, myRegs));
      }
    }

    grid.appendChild(cell);
  }

  container.innerHTML = '';
  container.appendChild(grid);
}

function renderMiniCard(w, userId, countMap, myRegs) {
  const count = countMap[w.id] || 0;
  const isRegistered = myRegs.has(w.id);
  const isFull = w.max_participants && count >= w.max_participants;
  const spotsLeft = w.max_participants ? w.max_participants - count : null;
  const almostFull = !isFull && spotsLeft !== null && spotsLeft <= 3 && spotsLeft > 0;
  const past = isPastWorkout(w);

  const card = document.createElement('div');
  card.className = 'workout-mini'
    + (isRegistered ? ' registered' : '')
    + (almostFull ? ' almost-full' : '')
    + (isFull && !isRegistered ? ' full' : '')
    + (past ? ' past' : '');

  card.innerHTML = `
    <div class="mini-time">${formatTime(w.start_time)}</div>
    <div class="mini-title">${escapeHtml(w.title)}</div>
    <div class="mini-meta">
      <span class="capacity">${count}${w.max_participants ? `/${w.max_participants}` : ''}</span>
      ${almostFull ? `<span class="almost-full-badge">⚠️ אחרונים</span>` : ''}
      ${w.duration_min ? `<span class="dim">${w.duration_min} דק׳</span>` : ''}
    </div>
    ${w.notes ? `<div class="mini-notes">${escapeHtml(w.notes)}</div>` : ''}
    <div class="mini-actions"></div>
  `;

  const actions = card.querySelector('.mini-actions');

  // Action button
  const btn = document.createElement('button');
  btn.className = 'btn small';

  if (past) {
    btn.textContent = isRegistered ? '✓ נכחת' : 'הסתיים';
    btn.disabled = true;
    btn.className = 'btn small ghost';
  } else if (isRegistered) {
    const cancelable = canCancel(w);
    btn.textContent = cancelable ? 'בטל הרשמה' : 'נעול לביטול';
    btn.className = 'btn small ' + (cancelable ? 'danger' : 'ghost');
  } else if (isFull) {
    btn.textContent = 'מלא';
    btn.disabled = true;
  } else {
    btn.textContent = 'הירשם';
  }

  btn.addEventListener('click', async () => {
    if (isRegistered && !canCancel(w)) {
      await confirmDialog({
        title: 'לא ניתן לבטל',
        message: `לא ניתן לבטל הרשמה פחות מ-${CANCEL_DEADLINE_HOURS} שעות לפני האימון. ליצירת קשר עם המאמן/ת.`,
        confirmText: 'הבנתי',
        cancelText: '',
      });
      return;
    }

    btn.disabled = true;
    if (isRegistered) {
      const confirmed = await confirmDialog({
        title: 'ביטול הרשמה',
        message: `לבטל את ההרשמה ל"${w.title}"?`,
        confirmText: 'בטל הרשמה',
        danger: true,
      });
      if (!confirmed) { btn.disabled = false; return; }

      const { error } = await sb
        .from('registrations')
        .delete()
        .eq('workout_id', w.id)
        .eq('user_id', userId);
      if (error) {
        toast('שגיאה בביטול ההרשמה', 'error');
        btn.disabled = false;
        return;
      }
      toast('ההרשמה בוטלה', 'success');
    } else {
      const { error } = await sb
        .from('registrations')
        .insert({ workout_id: w.id, user_id: userId });
      if (error) {
        toast('שגיאה בהרשמה', 'error');
        btn.disabled = false;
        return;
      }
      toast('נרשמת בהצלחה!', 'success');
    }
    await refresh();
  });

  actions.appendChild(btn);

  // Add-to-calendar button (only for registered, not-past workouts)
  if (isRegistered && !past) {
    const icsBtn = document.createElement('button');
    icsBtn.className = 'btn small ghost icon-btn';
    icsBtn.innerHTML = '📅';
    icsBtn.title = 'הוסף ליומן';
    icsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      downloadIcs(w);
      toast('הקובץ נוצר — פתח/י אותו ביומן שלך', 'success');
    });
    actions.appendChild(icsBtn);
  }

  return card;
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
