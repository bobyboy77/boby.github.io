let currentOffset = 0;
let currentUserId;
let currentProfile;

(async () => {
  const session = await requireAuth();
  if (!session) return;

  currentUserId = session.user.id;
  currentProfile = await getProfile(currentUserId);

  if (currentProfile?.is_admin) {
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
  currentProfile = await getProfile(currentUserId);
  const { start, end } = weekRange(currentOffset);
  document.getElementById('weekRange').textContent =
    `${formatDate(start)} – ${formatDate(end)}`;
  await Promise.all([
    renderQuotaBanner(),
    renderCalendar(currentUserId, start, end),
  ]);
}

async function renderQuotaBanner() {
  const banner = document.getElementById('quotaBanner');
  if (!banner) return;
  const p = currentProfile;
  if (!p || p.is_admin) { banner.style.display = 'none'; return; }

  const monthName = MONTH_NAMES[new Date().getMonth()];
  const parts = [];

  if (hasMonthlyPlan(p)) {
    const state = membershipState(p);
    if (state === 'frozen') {
      parts.push(`המנוי מוקפא${p.frozen_until ? ' עד ' + formatShortDate(p.frozen_until) : ''}`);
    } else if (state === 'ended') {
      parts.push(`המנוי הסתיים ב-${formatShortDate(p.membership_end)} • לחידוש פנה/י למאמן`);
    } else if (state === 'future') {
      parts.push(`המנוי מתחיל ב-${formatShortDate(p.membership_start)}`);
    } else {
      const used = (await getMonthlyUsage([p.id]))[p.id] || 0;
      parts.push(p.monthly_entries == null
        ? `מנוי ללא הגבלה • נוצלו ${used} כניסות ב${monthName}`
        : `נשארו לך <strong>${Math.max(0, p.monthly_entries - used)}</strong> מתוך ${p.monthly_entries} כניסות ב${monthName}`);
    }
  }
  if (subscriptionIsActive(p)) {
    parts.push(`בכרטיסייה: ${p.entries_remaining} כניסות`);
  }

  banner.innerHTML = parts.length
    ? parts.join(' • ')
    : 'אין מנוי פעיל • <a href="pricing.html">לרכישה</a>';
  banner.style.display = '';
}

// Shows the right message for a book_workout status. Returns true when booked.
async function handleBookingStatus(status, workout) {
  if (status === 'ok') { toast('נרשמת בהצלחה!', 'success'); return true; }
  if (status === 'ok_card') { toast('נרשמת! ירדה כניסה מהכרטיסייה', 'success'); return true; }
  if (status === 'already') { toast('כבר נרשמת לאימון הזה', 'error'); return true; }
  if (status === 'full') { toast('האימון מלא', 'error'); return true; }
  if (status === 'past') { toast('האימון כבר התחיל', 'error'); return true; }

  const offerSingle = async (title, message) => {
    const go = await confirmDialog({ title, message, confirmText: 'רכישת שיעור בודד', cancelText: 'סגירה' });
    if (go) window.location.href = 'pricing.html';
  };

  const monthName = MONTH_NAMES[new Date(workout.workout_date + 'T00:00:00').getMonth()];
  if (status === 'quota_reached') {
    await offerSingle('ניצלת את כל הכניסות',
      `ניצלת את כל ${currentProfile.monthly_entries} הכניסות של ${monthName}. אפשר לרכוש שיעור בודד כדי להגיע בכל זאת.`);
  } else if (status === 'frozen') {
    await confirmDialog({
      title: 'המנוי מוקפא',
      message: 'המנוי שלך מוקפא בתאריך של האימון. לשינוי פנה/י למאמן.',
      confirmText: 'הבנתי',
      cancelText: '',
    });
  } else if (status === 'outside_membership') {
    await offerSingle('מחוץ לתקופת המנוי', 'האימון לא בתוך תקופת המנוי שלך. לחידוש פנה/י למאמן, או רכוש/י שיעור בודד.');
  } else if (status === 'no_membership') {
    await offerSingle('אין מנוי פעיל', 'אין לך מנוי פעיל או כניסות בכרטיסייה.');
  } else {
    toast('שגיאה בהרשמה', 'error');
  }
  return false;
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
  const isAdmin = !!currentProfile?.is_admin;

  const card = document.createElement('div');
  card.className = 'workout-mini'
    + (isRegistered ? ' registered' : '')
    + (almostFull ? ' almost-full' : '')
    + (isFull && !isRegistered ? ' full' : '')
    + (past ? ' past' : '')
    + (isAdmin ? ' clickable' : '');

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

  if (isAdmin) {
    card.addEventListener('click', (e) => {
      // Don't open modal when clicking action buttons
      if (e.target.closest('.mini-actions')) return;
      showWorkoutDetails(w, { isAdmin: true, onChange: refresh });
    });
  }

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

  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    btn.disabled = true;

    const changed = isRegistered
      ? await cancelBookingFlow(w)
      : await handleBookingStatus(await bookWorkout(w.id), w);

    if (changed) await refresh();
    else btn.disabled = false;
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
      showCalendarOptions(w);
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
