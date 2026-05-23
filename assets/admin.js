(async () => {
  const session = await requireAuth();
  if (!session) return;

  const profile = await getProfile(session.user.id);
  if (!profile?.is_admin) {
    toast('אין לך הרשאות מאמן', 'error');
    setTimeout(() => window.location.href = 'schedule.html', 1500);
    return;
  }

  document.getElementById('logoutBtn').addEventListener('click', (e) => {
    e.preventDefault();
    logout();
  });

  document.getElementById('newWorkoutForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      title: document.getElementById('title').value.trim(),
      workout_date: document.getElementById('workout_date').value,
      start_time: document.getElementById('start_time').value,
      duration_min: parseInt(document.getElementById('duration_min').value) || null,
      max_participants: parseInt(document.getElementById('max_participants').value) || null,
      notes: document.getElementById('notes').value.trim() || null,
      created_by: session.user.id,
    };

    const { error } = await sb.from('workouts').insert(payload);
    if (error) {
      toast('שגיאה בהוספת האימון', 'error');
      console.error(error);
      return;
    }
    toast('האימון נוסף', 'success');
    e.target.reset();
    document.getElementById('duration_min').value = 60;
    document.getElementById('max_participants').value = 10;
    await renderAdminList();
  });

  await renderAdminList();
})();

async function renderAdminList() {
  const list = document.getElementById('adminList');
  const { start, end } = weekRange();

  const { data: workouts, error } = await sb
    .from('workouts')
    .select('id, title, workout_date, start_time, duration_min, max_participants, notes')
    .gte('workout_date', start)
    .lte('workout_date', end)
    .order('workout_date', { ascending: true })
    .order('start_time', { ascending: true });

  if (error) {
    list.innerHTML = '<div class="empty">שגיאה בטעינה</div>';
    return;
  }
  if (!workouts.length) {
    list.innerHTML = '<div class="empty">אין אימונים השבוע</div>';
    return;
  }

  const ids = workouts.map((w) => w.id);
  const { data: regs } = await sb
    .from('registrations')
    .select('workout_id, user_id, profiles(full_name)')
    .in('workout_id', ids);

  const regMap = {};
  for (const r of regs || []) {
    (regMap[r.workout_id] ||= []).push(r);
  }

  list.innerHTML = '';
  const byDate = {};
  for (const w of workouts) (byDate[w.workout_date] ||= []).push(w);

  for (const date of Object.keys(byDate)) {
    const group = document.createElement('div');
    group.className = 'day-group';
    group.innerHTML = `<div class="day-title">${formatDate(date)}</div>`;

    for (const w of byDate[date]) {
      const participants = regMap[w.id] || [];
      const card = document.createElement('div');
      card.className = 'workout-card';
      card.innerHTML = `
        <div class="workout-info">
          <div class="title">${escapeHtml(w.title)}</div>
          <div class="meta">
            <span>🕘 ${formatTime(w.start_time)}${w.duration_min ? ` (${w.duration_min} דק׳)` : ''}</span>
            <span class="capacity">${participants.length}${w.max_participants ? `/${w.max_participants}` : ''} נרשמו</span>
          </div>
          ${w.notes ? `<div class="meta" style="margin-top:6px">${escapeHtml(w.notes)}</div>` : ''}
          ${participants.length ? `
            <div class="participants">
              <strong>משתתפים:</strong>
              <ul>${participants.map((p) => `<li>• ${escapeHtml(p.profiles?.full_name || 'משתמש')}</li>`).join('')}</ul>
            </div>` : ''}
        </div>
        <div class="workout-actions">
          <button class="btn ghost small" data-action="edit">ערוך</button>
          <button class="btn danger small" data-action="delete">מחק</button>
        </div>
      `;

      card.querySelector('[data-action="delete"]').addEventListener('click', async () => {
        if (!confirm(`למחוק את "${w.title}"?`)) return;
        const { error } = await sb.from('workouts').delete().eq('id', w.id);
        if (error) { toast('שגיאה במחיקה', 'error'); return; }
        toast('האימון נמחק', 'success');
        await renderAdminList();
      });

      card.querySelector('[data-action="edit"]').addEventListener('click', async () => {
        const newTitle = prompt('כותרת חדשה:', w.title);
        if (newTitle === null) return;
        const newTime = prompt('שעת התחלה (HH:MM):', formatTime(w.start_time));
        if (newTime === null) return;
        const newMax = prompt('מקסימום משתתפים:', w.max_participants || '');
        if (newMax === null) return;

        const { error } = await sb.from('workouts').update({
          title: newTitle.trim() || w.title,
          start_time: newTime || w.start_time,
          max_participants: parseInt(newMax) || null,
        }).eq('id', w.id);

        if (error) { toast('שגיאה בעדכון', 'error'); return; }
        toast('עודכן', 'success');
        await renderAdminList();
      });

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
