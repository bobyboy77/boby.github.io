(async () => {
  const session = await requireAuth();
  if (!session) return;

  const userId = session.user.id;
  const profile = await getProfile(userId);

  if (profile?.is_admin) {
    const link = document.getElementById('adminLink');
    link.style.display = '';
    link.href = 'admin.html';
  }

  document.getElementById('logoutBtn').addEventListener('click', (e) => {
    e.preventDefault();
    logout();
  });

  const { start, end } = weekRange();
  document.getElementById('weekRange').textContent =
    `${formatDate(start)} – ${formatDate(end)}`;

  await renderSchedule(userId, start, end);
})();

async function renderSchedule(userId, start, end) {
  const list = document.getElementById('scheduleList');

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
    list.innerHTML = '<div class="empty">אין אימונים מתוכננים השבוע</div>';
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

      const card = document.createElement('div');
      card.className = 'workout-card' + (isRegistered ? ' registered' : '');
      card.innerHTML = `
        <div class="workout-info">
          <div class="title">${escapeHtml(w.title)}</div>
          <div class="meta">
            <span>🕘 ${formatTime(w.start_time)}${w.duration_min ? ` (${w.duration_min} דק׳)` : ''}</span>
            <span class="capacity ${isFull ? 'full' : ''}">
              ${count}${w.max_participants ? `/${w.max_participants}` : ''} נרשמו
            </span>
          </div>
          ${w.notes ? `<div class="meta" style="margin-top:6px">${escapeHtml(w.notes)}</div>` : ''}
        </div>
        <div class="workout-actions"></div>
      `;

      const actions = card.querySelector('.workout-actions');
      const btn = document.createElement('button');
      btn.className = 'btn small ' + (isRegistered ? 'danger' : '');
      btn.textContent = isRegistered ? 'בטל הרשמה' : 'הירשם';
      btn.disabled = !isRegistered && isFull;
      if (!isRegistered && isFull) btn.textContent = 'מלא';

      btn.addEventListener('click', async () => {
        btn.disabled = true;
        if (isRegistered) {
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
        const { start, end } = weekRange();
        await renderSchedule(userId, start, end);
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
