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
    await renderStats();
    await renderAdminList();
  });

  await renderStats();
  await renderTrialsList();
  await renderAdminList();
})();

async function renderStats() {
  const strip = document.getElementById('statsStrip');
  if (!strip) return;

  const { start, end } = weekRange();

  // Week registrations
  const { data: weekWorkouts } = await sb
    .from('workouts')
    .select('id, max_participants')
    .gte('workout_date', start)
    .lte('workout_date', end);

  const weekIds = (weekWorkouts || []).map((w) => w.id);
  let weekRegs = 0;
  let fullCount = 0;
  if (weekIds.length) {
    const { data: regs } = await sb
      .from('registrations')
      .select('workout_id')
      .in('workout_id', weekIds);
    weekRegs = regs?.length || 0;
    const countMap = {};
    for (const r of regs || []) countMap[r.workout_id] = (countMap[r.workout_id] || 0) + 1;
    for (const w of weekWorkouts) {
      if (w.max_participants && (countMap[w.id] || 0) >= w.max_participants) fullCount++;
    }
  }

  // Active trials
  const { count: activeTrials } = await sb
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('is_trial', true);

  // Conversions this month
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const { count: conversions } = await sb
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('trial_status', 'converted')
    .gte('created_at', monthStart.toISOString());

  strip.innerHTML = `
    <div class="stat-card"><div class="stat-num">${weekRegs}</div><div class="stat-label">הרשמות השבוע</div></div>
    <div class="stat-card"><div class="stat-num">${activeTrials || 0}</div><div class="stat-label">טריאלים פעילים</div></div>
    <div class="stat-card"><div class="stat-num">${conversions || 0}</div><div class="stat-label">המרות החודש</div></div>
    <div class="stat-card"><div class="stat-num">${fullCount}</div><div class="stat-label">אימונים מלאים</div></div>
  `;
}

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
      await renderStats();
      await renderTrialsList();
      await renderAdminList();
    });

    card.querySelector('[data-action="delete"]').addEventListener('click', async () => {
      const confirmed = await confirmDialog({
        title: 'מחיקת טריאל',
        message: `למחוק את הטריאל של ${t.full_name}? פעולה זו תמחק גם את ההרשמה שלו לאימון.`,
        confirmText: 'מחק',
        danger: true,
      });
      if (!confirmed) return;

      // Delete registrations first, then the profile
      const { error: regError } = await sb.from('registrations').delete().eq('user_id', t.id);
      if (regError) { toast('שגיאה במחיקת ההרשמה', 'error'); console.error(regError); return; }

      const { error: profileError } = await sb.from('profiles').delete().eq('id', t.id);
      if (profileError) {
        toast('שגיאה במחיקה. ודא/י שמדיניות מחיקה מוגדרת ב-Supabase', 'error');
        console.error(profileError);
        return;
      }
      toast('הטריאל נמחק', 'success');
      await renderStats();
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
          <button class="btn ghost small" data-action="duplicate">שכפל</button>
          <button class="btn danger small" data-action="delete">מחק</button>
        </div>
      `;

      card.querySelector('[data-action="delete"]').addEventListener('click', async () => {
        const confirmed = await confirmDialog({
          title: 'מחיקת אימון',
          message: `למחוק את "${w.title}"? כל ההרשמות לאימון יימחקו.`,
          confirmText: 'מחק',
          danger: true,
        });
        if (!confirmed) return;
        const { error } = await sb.from('workouts').delete().eq('id', w.id);
        if (error) { toast('שגיאה במחיקה', 'error'); return; }
        toast('האימון נמחק', 'success');
        await renderStats();
        await renderAdminList();
      });

      card.querySelector('[data-action="edit"]').addEventListener('click', async () => {
        const result = await promptDialog({
          title: 'עריכת אימון',
          fields: [
            { name: 'title', label: 'כותרת', value: w.title },
            { name: 'workout_date', label: 'תאריך', type: 'date', value: w.workout_date },
            { name: 'start_time', label: 'שעת התחלה', type: 'time', value: formatTime(w.start_time) },
            { name: 'duration_min', label: 'משך (דקות)', type: 'number', value: w.duration_min || 60 },
            { name: 'max_participants', label: 'מקסימום משתתפים', type: 'number', value: w.max_participants || 10 },
            { name: 'notes', label: 'הערות', value: w.notes || '' },
          ],
        });
        if (!result) return;

        const { error } = await sb.from('workouts').update({
          title: result.title.trim() || w.title,
          workout_date: result.workout_date || w.workout_date,
          start_time: result.start_time || w.start_time,
          duration_min: parseInt(result.duration_min) || null,
          max_participants: parseInt(result.max_participants) || null,
          notes: result.notes.trim() || null,
        }).eq('id', w.id);

        if (error) { toast('שגיאה בעדכון', 'error'); return; }
        toast('עודכן', 'success');
        await renderAdminList();
      });

      card.querySelector('[data-action="duplicate"]').addEventListener('click', async () => {
        const result = await promptDialog({
          title: `שכפול: ${w.title}`,
          fields: [
            { name: 'weeks', label: 'לכמה שבועות קדימה?', type: 'number', value: 4, min: 1, max: 26 },
          ],
          confirmText: 'שכפל',
        });
        if (!result) return;

        const weeks = Math.max(1, Math.min(26, parseInt(result.weeks) || 4));
        const baseDate = new Date(w.workout_date + 'T00:00:00');
        const copies = [];
        for (let i = 1; i <= weeks; i++) {
          const d = new Date(baseDate);
          d.setDate(d.getDate() + i * 7);
          copies.push({
            title: w.title,
            workout_date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
            start_time: w.start_time,
            duration_min: w.duration_min,
            max_participants: w.max_participants,
            notes: w.notes,
          });
        }

        const { error } = await sb.from('workouts').insert(copies);
        if (error) { toast('שגיאה בשכפול', 'error'); console.error(error); return; }
        toast(`נוצרו ${weeks} עותקים`, 'success');
        await renderStats();
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
