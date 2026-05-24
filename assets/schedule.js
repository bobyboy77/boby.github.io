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
  await renderSchedule(currentUserId, start, end);
}

async function renderSchedule(userId, start, end) {
  const list = document.getElementById('scheduleList');
  list.innerHTML = '<div class="empty">טוען…</div>';

  const { data: workouts, error: wErr } = await sb
    .from('workouts')
    .select('id, title, workout_date, start_time, duration_min, max_participants, notes')
    .gte('workout_date', start)
    .lte('workout_date', end)
    .order('workout_date', { ascending: true })
    .order('start_time', { ascending: true });

  if (wErr) {
    list.innerHTML = '<div class="empty">שגיאה בטעינת האימונים</div>';
    console.error(wErr);
    return;
  }

  if (!workouts.length) {
    list.innerHTML = '<div class="empty">אין אימונים מתוכננים בשבוע זה</div>';
    return;
  }

  const workoutIds = workouts.map((w) => w.id);
  const { data: regs } = await sb
    .from('registrations')
    .select('workout_id, user_id')
    .in('workout_id', workoutIds);

  const countMap = {};
  const myRegs = new Set();
  for (const r of regs || []) {
    countMap[r.workout_id] = (countMap[r.workout_id] || 0) + 1;
    if (r.user_id === userId) myRegs.add(r.workout_id);
  }

  const byDate = {};
  for (const w of workouts) {
    (byDate[w.workout_date] ||= []).push(w);
  }

  list.innerHTML = '';
  for (const date of Object.keys(byDate)) {
    const group = document.createElement('div');
    group.className = 'day-group';
    group.innerHTML = `<div class="day-title">${formatDate(date)}</div>`;

    for (const w of byDate[date]) {
      const count = countMap[w.id] || 0;
      const isRegistered = myRegs.has(w.id);
      const isFull = w.max_participants && count >= w.max_participants;
      const spotsLeft = w.max_participants ? w.max_participants - count : null;
      const almostFull = !isFull && spotsLeft !== null && spotsLeft <= 3 && spotsLeft > 0;
      const past = isPastWorkout(w);

      const card = document.createElement('div');
      card.className = 'workout-card'
        + (isRegistered ? ' registered' : '')
        + (almostFull ? ' almost-full' : '')
        + (past ? ' past' : '');

      card.innerHTML = `
        <div class="workout-info">
          <div class="title">${escapeHtml(w.title)}</div>
          <div class="meta">
            <span>🕘 ${formatTime(w.start_time)}${w.duration_min ? ` (${w.duration_min} דק׳)` : ''}</span>
            <span class="capacity ${isFull ? 'full' : ''}">
              ${count}${w.max_participants ? `/${w.max_participants}` : ''} נרשמו
            </span>
            ${almostFull ? `<span class="almost-full-badge">⚠️ מקומות אחרונים!</span>` : ''}
          </div>
          ${w.notes ? `<div class="meta" style="margin-top:6px">${escapeHtml(w.notes)}</div>` : ''}
        </div>
        <div class="workout-actions"></div>
      `;

      const actions = card.querySelector('.workout-actions');
      const btn = document.createElement('button');
      btn.className = 'btn small ' + (isRegistered ? 'danger' : '');

      if (past) {
        btn.textContent = isRegistered ? 'נכחת' : 'הסתיים';
        btn.disabled = true;
      } else if (isRegistered) {
        const cancelable = canCancel(w);
        btn.textContent = cancelable ? 'בטל הרשמה' : 'נעול לביטול';
        if (!cancelable) btn.className = 'btn small ghost';
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
      group.appendChild(card);
    }
    list.appendChild(group);
  }
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
