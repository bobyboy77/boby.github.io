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

  await renderTrialsList();
  await renderAdminList();
})();

async function renderTrialsList() {
  const container = document.getElementById('trialsList');

  const { data: trials, error } = await sb
    .from('profiles')
    .select('id, full_name, phone, email, trial_goal, trial_source, trial_status, created_at')
    .eq('is_trial', true)
    .order('created_at', { ascending: false });

  if (error) {
    container.innerHTML = '<div class="empty">שגיאה בטעינת הטריאלים</div>';
    console.error(error);
    return;
  }

  if (!trials.length) {
    container.innerHTML = '<div class="empty">אין טריאלים פעילים</div>';
    return;
  }

  const ids = trials.map((t) => t.id);
  const { data: regs } = await sb
    .from('registrations')
    .select('user_id, workouts(title, workout_date, start_time)')
    .in('user_id', ids);

  const regMap = {};
  for (const r of regs || []) {
    (regMap[r.user_id] ||= []).push(r);
  }

  container.innerHTML = '';
  for (const t of trials) {
    const bookings = regMap[t.id] || [];
    const card = document.createElement('div');
    card.className = 'trial-card';
    card.innerHTML = `
      <div class="trial-info">
        <div class="title">${escapeHtml(t.full_name)}</div>
        <div class="meta">
          ${t.phone ? `<span>📞 <a href="tel:${escapeHtml(t.phone)}" style="color:inherit">${escapeHtml(t.phone)}</a></span>` : ''}
          ${t.email ? `<span>✉️ <a href="mailto:${escapeHtml(t.email)}" style="color:inherit">${escapeHtml(t.email)}</a></span>` : ''}
        </div>
        ${t.trial_goal ? `<div class="meta" style="margin-top:6px"><strong>מטרה:</strong> ${escapeHtml(t.trial_goal)}</div>` : ''}
        ${t.trial_source ? `<div class="meta" style="margin-top:2px"><strong>שמע/ה דרך:</strong> ${escapeHtml(t.trial_source)}</div>` : ''}
        ${bookings.length ? `
          <div class="meta" style="margin-top:8px;padding-top:8px;border-top:1px dashed var(--border)">
            <strong>נרשמ/ה ל:</strong>
            ${bookings.map((b) => `${escapeHtml(b.workouts?.title || '?')} • ${formatDate(b.workouts?.workout_date)} • ${formatTime(b.workouts?.start_time)}`).join('<br>')}
          </div>` : ''}
      </div>
      <div class="workout-actions">
        <button class="btn small" data-action="convert">סמן כממיר ✓</button>
        <button class="btn danger small" data-action="delete">מחק</button>
      </div>
    `;

    card.querySelector('[data-action="convert"]').addEventListener('click', async () => {
      const { error } = await sb
        .from('profiles')
        .update({ is_trial: false, trial_status: 'converted' })
        .eq('id', t.id);
      if (error) { toast('שגיאה בעדכון', 'error'); console.error(error); return; }
      toast('סומן כממיר!', 'success');
      await renderTrialsList();
      await renderAdminList();
    });

    card.querySelector('[data-action="delete"]').addEventListener('click', async () => {
      if (!confirm(`למחוק את הטריאל "${t.full_name}"?`)) return;
      const { error } = await sb.from('profiles').delete().eq('id', t.id);
      if (error) { toast('שגיאה במחיקה', 'error'); console.error(error); return; }
      toast('הטריאל נמחק', 'success');
      await renderTrialsList();
      await renderAdminList();
    });

    container.appendChild(card);
  }
}

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
    .select('workout_id, user_id, profiles(full_name, is_trial, phone)')
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
              <ul>${participants.map((p) => {
                const name = escapeHtml(p.profiles?.full_name || 'משתמש');
                const badge = p.profiles?.is_trial ? ' <span class="trial-badge">🆕 טריאל</span>' : '';
                const phone = p.profiles?.phone ? ` • <a href="tel:${escapeHtml(p.profiles.phone)}" style="color:inherit">${escapeHtml(p.profiles.phone)}</a>` : '';
                return `<li>• ${name}${badge}${phone}</li>`;
              }).join('')}</ul>
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
