let adminUserId;

(async () => {
  const session = await requireAuth();
  if (!session) return;

  adminUserId = session.user.id;
  const profile = await getProfile(adminUserId);
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
      created_by: adminUserId,
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

  // Tab switching — lazy-load non-overview tabs
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach((p) => { p.style.display = 'none'; });
      btn.classList.add('active');
      document.getElementById('tab-' + tab).style.display = '';
      if (tab === 'personal') await renderPersonalSessions();
      if (tab === 'plans') await renderWorkoutPlans();
      if (tab === 'progress') await renderProgressTracking();
    });
  });

  await renderStats();
  await renderPaymentRequests();
  await renderTraineesManagement();
  await renderTrialsList();
  await renderAdminList();
})();

// ===== Helpers =====

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function adminSelectDialog({ title, options, confirmText = 'בחר' }) {
  return new Promise((resolve) => {
    const root = ensureModalRoot();
    const optHtml = options.map((o) =>
      `<option value="${escapeModalHtml(String(o.value))}">${escapeModalHtml(o.label)}</option>`
    ).join('');
    root.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal-card">
          <h3>${escapeModalHtml(title)}</h3>
          <div class="field">
            <select id="adminSelectInput">
              <option value="">— בחר/י —</option>
              ${optHtml}
            </select>
          </div>
          <div class="modal-actions">
            <button class="btn ghost" data-act="cancel">ביטול</button>
            <button class="btn" data-act="ok">${escapeModalHtml(confirmText)}</button>
          </div>
        </div>
      </div>
    `;
    const close = (val) => { root.innerHTML = ''; resolve(val); };
    root.querySelector('[data-act="cancel"]').addEventListener('click', () => close(null));
    root.querySelector('[data-act="ok"]').addEventListener('click', () => {
      const val = root.querySelector('#adminSelectInput').value;
      close(val || null);
    });
    root.querySelector('.modal-backdrop').addEventListener('click', (e) => {
      if (e.target.classList.contains('modal-backdrop')) close(null);
    });
  });
}

async function getNonAdminTrainees() {
  const { data, error } = await sb
    .from('profiles')
    .select('id, full_name, phone, is_admin, pt_sessions_total, pt_sessions_used, subscription_type, entries_remaining, subscription_expires_at')
    .or('is_trial.eq.false,is_trial.is.null')
    .order('full_name');
  if (error) console.error(error);
  return (data || []).filter((t) => !t.is_admin);
}

// ===== Overview Tab =====

async function renderPaymentRequests() {
  const container = document.getElementById('paymentRequestsList');
  if (!container) return;

  const { data: requests, error } = await sb
    .from('payment_requests')
    .select('id, user_id, product, amount_ils, status, created_at, profiles(full_name, phone)')
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) {
    container.innerHTML = '<div class="empty">שגיאה</div>';
    console.error(error);
    return;
  }

  if (!requests.length) {
    container.innerHTML = '<div class="empty">אין בקשות תשלום ממתינות</div>';
    return;
  }

  container.innerHTML = '';
  for (const req of requests) {
    const pr = req.profiles || {};
    const product = PRODUCTS[req.product];
    const card = document.createElement('div');
    card.className = 'trial-card';
    card.innerHTML = `
      <div class="trial-info">
        <div class="title">${escapeHtml(pr.full_name || 'משתמש')}</div>
        <div class="meta">
          ${pr.phone ? `<span>📞 <a href="tel:${escapeHtml(pr.phone)}" style="color:inherit">${escapeHtml(pr.phone)}</a></span>` : ''}
          <span>💰 ${req.amount_ils}₪</span>
          <span>📦 ${escapeHtml(product?.label || req.product)}</span>
        </div>
        <div class="meta dim" style="margin-top:4px;font-size:11px">
          ${new Date(req.created_at).toLocaleString('he-IL')}
        </div>
      </div>
      <div class="workout-actions">
        <button class="btn small success-solid" data-act="confirm">✓ אישור</button>
        <button class="btn danger small" data-act="reject">✗ דחייה</button>
      </div>
    `;

    card.querySelector('[data-act="confirm"]').addEventListener('click', async () => {
      if (!product) { toast('מוצר לא נמצא', 'error'); return; }
      const expiresAt = new Date();
      expiresAt.setMonth(expiresAt.getMonth() + product.validMonths);
      const expiresIso = expiresAt.toISOString().slice(0, 10);
      const { error: profErr } = await sb.from('profiles').update({
        subscription_type: product.key,
        entries_remaining: product.entries,
        subscription_expires_at: expiresIso,
      }).eq('id', req.user_id);
      if (profErr) { toast('שגיאה בעדכון המנוי', 'error'); console.error(profErr); return; }
      const { error: reqErr } = await sb.from('payment_requests')
        .update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
        .eq('id', req.id);
      if (reqErr) { toast('שגיאה בעדכון הבקשה', 'error'); return; }
      toast('המנוי הוטען!', 'success');
      await renderPaymentRequests();
      await renderTraineesManagement();
    });

    card.querySelector('[data-act="reject"]').addEventListener('click', async () => {
      const confirmed = await confirmDialog({
        title: 'דחיית בקשה',
        message: 'לדחות את בקשת התשלום?',
        confirmText: 'דחה',
        danger: true,
      });
      if (!confirmed) return;
      const { error } = await sb.from('payment_requests').update({ status: 'rejected' }).eq('id', req.id);
      if (error) { toast('שגיאה', 'error'); return; }
      toast('נדחה', 'success');
      await renderPaymentRequests();
    });

    container.appendChild(card);
  }
}

async function renderTraineesManagement() {
  const container = document.getElementById('traineesList');
  if (!container) return;

  const list = await getNonAdminTrainees();

  if (!list.length) {
    container.innerHTML = '<div class="empty">אין מתאמנים</div>';
    return;
  }

  container.innerHTML = '';
  for (const t of list) {
    const isActive = subscriptionIsActive(t);
    const card = document.createElement('div');
    card.className = 'trial-card';
    card.style.borderRight = isActive ? '3px solid var(--success)' : '3px solid var(--danger)';
    card.innerHTML = `
      <div class="trial-info">
        <div class="title">${escapeHtml(t.full_name || 'משתמש')}</div>
        <div class="meta">
          ${t.phone ? `<span>📞 <a href="tel:${escapeHtml(t.phone)}" style="color:inherit">${escapeHtml(t.phone)}</a></span>` : ''}
          <span class="dim" style="font-size:12px">${escapeHtml(subscriptionStatusText(t))}</span>
        </div>
      </div>
      <div class="workout-actions">
        <button class="btn ghost small" data-act="edit">ערוך מנוי</button>
      </div>
    `;

    card.querySelector('[data-act="edit"]').addEventListener('click', async () => {
      const result = await promptDialog({
        title: `מנוי: ${t.full_name}`,
        fields: [
          { name: 'type', label: 'סוג מנוי (card_10 / single / none)', value: t.subscription_type || 'none' },
          { name: 'entries', label: 'כניסות', type: 'number', value: t.entries_remaining || 0 },
          { name: 'expires', label: 'תוקף (YYYY-MM-DD)', type: 'date', value: t.subscription_expires_at || '' },
        ],
      });
      if (!result) return;
      const { error } = await sb.from('profiles').update({
        subscription_type: result.type || 'none',
        entries_remaining: parseInt(result.entries) || 0,
        subscription_expires_at: result.expires || null,
      }).eq('id', t.id);
      if (error) { toast('שגיאה', 'error'); return; }
      toast('עודכן', 'success');
      await renderTraineesManagement();
    });

    container.appendChild(card);
  }
}

async function renderStats() {
  const strip = document.getElementById('statsStrip');
  if (!strip) return;

  const { start, end } = weekRange();
  const { data: weekWorkouts } = await sb
    .from('workouts')
    .select('id, max_participants')
    .gte('workout_date', start)
    .lte('workout_date', end);

  const weekIds = (weekWorkouts || []).map((w) => w.id);
  let weekRegs = 0;
  let fullCount = 0;
  if (weekIds.length) {
    const { data: regs } = await sb.from('registrations').select('workout_id').in('workout_id', weekIds);
    weekRegs = regs?.length || 0;
    const countMap = {};
    for (const r of regs || []) countMap[r.workout_id] = (countMap[r.workout_id] || 0) + 1;
    for (const w of weekWorkouts) {
      if (w.max_participants && (countMap[w.id] || 0) >= w.max_participants) fullCount++;
    }
  }

  const { count: activeTrials } = await sb
    .from('profiles').select('id', { count: 'exact', head: true }).eq('is_trial', true);

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const { count: conversions } = await sb
    .from('profiles').select('id', { count: 'exact', head: true })
    .eq('trial_status', 'converted').gte('created_at', monthStart.toISOString());

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

  if (error) { container.innerHTML = '<div class="empty">שגיאה בטעינת הטריאלים</div>'; return; }
  if (!trials.length) { container.innerHTML = '<div class="empty">אין טריאלים פעילים</div>'; return; }

  const ids = trials.map((t) => t.id);
  const { data: regs } = await sb
    .from('registrations')
    .select('user_id, workouts(title, workout_date, start_time)')
    .in('user_id', ids);

  const regMap = {};
  for (const r of regs || []) (regMap[r.user_id] ||= []).push(r);

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
      const { error } = await sb.from('profiles')
        .update({ is_trial: false, trial_status: 'converted' }).eq('id', t.id);
      if (error) { toast('שגיאה בעדכון', 'error'); return; }
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

      const { error: regError } = await sb.from('registrations')
        .delete().eq('user_id', t.id).select();
      if (regError) { toast('שגיאה במחיקת ההרשמה', 'error'); return; }

      const { data: deletedRows, error: profileError } = await sb
        .from('profiles').delete().eq('id', t.id).select();
      if (profileError) { toast('שגיאה במחיקה: ' + profileError.message, 'error'); return; }

      if (!deletedRows || deletedRows.length === 0) {
        await confirmDialog({
          title: 'המחיקה נחסמה על-ידי Supabase',
          message: 'נראה שמדיניות RLS למחיקת פרופילים עדיין לא הוגדרה. הרץ/י את ה-SQL מסעיף 7.3 ב-SETUP.md ונסה/י שוב.',
          confirmText: 'הבנתי',
          cancelText: '',
        });
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

  if (error) { list.innerHTML = '<div class="empty">שגיאה בטעינה</div>'; return; }
  if (!workouts.length) { list.innerHTML = '<div class="empty">אין אימונים השבוע</div>'; return; }

  const ids = workouts.map((w) => w.id);
  const { data: regs } = await sb
    .from('registrations')
    .select('workout_id, user_id, profiles(full_name, is_trial, phone)')
    .in('workout_id', ids);

  const regMap = {};
  for (const r of regs || []) (regMap[r.workout_id] ||= []).push(r);

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
          fields: [{ name: 'weeks', label: 'לכמה שבועות קדימה?', type: 'number', value: 4, min: 1, max: 26 }],
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
        if (error) { toast('שגיאה בשכפול', 'error'); return; }
        toast(`נוצרו ${weeks} עותקים`, 'success');
        await renderStats();
        await renderAdminList();
      });

      group.appendChild(card);
    }
    list.appendChild(group);
  }
}

// ===== Personal Sessions Tab =====

async function renderPersonalSessions() {
  const container = document.getElementById('personalSessionsList');
  if (!container) return;
  container.innerHTML = '<div class="empty">טוען…</div>';

  const list = await getNonAdminTrainees();
  if (!list.length) {
    container.innerHTML = '<div class="empty">אין מתאמנים</div>';
    return;
  }

  container.innerHTML = '';
  for (const t of list) {
    const total = t.pt_sessions_total || 0;
    const used = t.pt_sessions_used || 0;
    const remaining = Math.max(0, total - used);

    const card = document.createElement('div');
    card.className = 'trial-card pt-session-card';
    card.innerHTML = `
      <div class="trial-info" style="flex:1">
        <div class="title">${escapeHtml(t.full_name)}</div>
        <div class="meta" style="margin-top:6px">
          ${t.phone ? `<span>📞 ${escapeHtml(t.phone)}</span>` : ''}
        </div>
        <div class="pt-stats-row">
          <span class="pt-stat-chip">${used} נעשו</span>
          <span class="pt-stat-chip">${total} בחבילה</span>
          <span class="pt-stat-chip" style="color:${remaining > 0 ? 'var(--success)' : 'var(--text-mute)'}">
            ${remaining} נשארו
          </span>
        </div>
        <div class="pt-history-wrap" id="pt-hist-${escapeHtml(t.id)}" style="display:none"></div>
      </div>
      <div class="workout-actions" style="flex-shrink:0">
        <button class="btn small" data-act="add-session">+ הוסף מפגש</button>
        <button class="btn ghost small" data-act="set-package">עדכן חבילה</button>
        <button class="btn ghost small" data-act="show-history">היסטוריה</button>
      </div>
    `;

    card.querySelector('[data-act="add-session"]').addEventListener('click', async () => {
      const today = new Date().toISOString().slice(0, 10);
      const result = await promptDialog({
        title: `הוסף מפגש — ${t.full_name}`,
        fields: [
          { name: 'session_date', label: 'תאריך', type: 'date', value: today },
          { name: 'notes', label: 'הערות (אופציונלי)', value: '' },
        ],
        confirmText: 'הוסף',
      });
      if (!result) return;

      const { error: insErr } = await sb.from('personal_sessions').insert({
        trainee_id: t.id,
        session_date: result.session_date || today,
        notes: result.notes || null,
        created_by: adminUserId,
      });
      if (insErr) { toast('שגיאה בהוספת מפגש', 'error'); console.error(insErr); return; }

      const { error: upErr } = await sb.from('profiles')
        .update({ pt_sessions_used: used + 1 })
        .eq('id', t.id);
      if (upErr) { toast('שגיאה בעדכון ספירה', 'error'); return; }

      toast('מפגש נוסף', 'success');
      await renderPersonalSessions();
    });

    card.querySelector('[data-act="set-package"]').addEventListener('click', async () => {
      const result = await promptDialog({
        title: `חבילת מפגשים — ${t.full_name}`,
        fields: [
          { name: 'total', label: 'סה"כ מפגשים בחבילה', type: 'number', value: total },
          { name: 'used', label: 'מפגשים שנעשו', type: 'number', value: used },
        ],
        confirmText: 'שמור',
      });
      if (!result) return;
      const { error } = await sb.from('profiles').update({
        pt_sessions_total: parseInt(result.total) || 0,
        pt_sessions_used: parseInt(result.used) || 0,
      }).eq('id', t.id);
      if (error) { toast('שגיאה', 'error'); return; }
      toast('עודכן', 'success');
      await renderPersonalSessions();
    });

    card.querySelector('[data-act="show-history"]').addEventListener('click', async () => {
      const histWrap = document.getElementById('pt-hist-' + t.id);
      if (histWrap.style.display !== 'none') {
        histWrap.style.display = 'none';
        return;
      }
      histWrap.innerHTML = '<div style="padding:8px;color:var(--text-mute);font-size:13px">טוען…</div>';
      histWrap.style.display = '';

      const { data: sessions } = await sb
        .from('personal_sessions')
        .select('session_date, notes')
        .eq('trainee_id', t.id)
        .order('session_date', { ascending: false });

      if (!sessions?.length) {
        histWrap.innerHTML = '<div style="padding:8px;color:var(--text-mute);font-size:13px">אין מפגשים עדיין</div>';
        return;
      }

      histWrap.innerHTML = `
        <div class="pt-history-list">
          ${sessions.map((s) => `
            <div class="pt-history-row">
              <span class="pt-history-date">${formatDate(s.session_date)}</span>
              ${s.notes ? `<span class="pt-history-notes">${escapeHtml(s.notes)}</span>` : ''}
            </div>
          `).join('')}
        </div>
      `;
    });

    container.appendChild(card);
  }
}

// ===== Workout Plans Tab =====

async function renderWorkoutPlans() {
  const container = document.getElementById('workoutPlansList');
  if (!container) return;
  container.innerHTML = '<div class="empty">טוען…</div>';

  const createBtn = document.getElementById('createPlanBtn');
  if (createBtn && !createBtn.dataset.wired) {
    createBtn.dataset.wired = '1';
    createBtn.addEventListener('click', async () => {
      const result = await promptDialog({
        title: 'תוכנית אימון חדשה',
        fields: [
          { name: 'title', label: 'שם התוכנית', value: '' },
          { name: 'description', label: 'תיאור (אופציונלי)', value: '' },
        ],
        confirmText: 'צור',
      });
      if (!result || !result.title.trim()) return;
      const { error } = await sb.from('workout_plans').insert({
        title: result.title.trim(),
        description: result.description.trim() || null,
        created_by: adminUserId,
      });
      if (error) { toast('שגיאה ביצירת תוכנית', 'error'); return; }
      toast('תוכנית נוצרה', 'success');
      await renderWorkoutPlans();
    });
  }

  const { data: plans, error } = await sb
    .from('workout_plans')
    .select('id, title, description, created_at, plan_exercises(id, exercise_name, sets, reps, rest_sec, notes, sort_order)')
    .order('created_at', { ascending: false });

  if (error) { container.innerHTML = '<div class="empty">שגיאה</div>'; return; }
  if (!plans?.length) {
    container.innerHTML = '<div class="empty">אין תוכניות עדיין — לחץ "צור תוכנית חדשה"</div>';
    return;
  }

  // Fetch assignments + profiles (two separate queries to avoid FK inference issue)
  const planIds = plans.map((p) => p.id);
  const { data: assignments } = await sb
    .from('plan_assignments')
    .select('id, plan_id, trainee_id')
    .in('plan_id', planIds);

  const assigneeIds = [...new Set((assignments || []).map((a) => a.trainee_id))];
  let profileMap = {};
  if (assigneeIds.length) {
    const { data: profs } = await sb.from('profiles').select('id, full_name').in('id', assigneeIds);
    for (const p of profs || []) profileMap[p.id] = p;
  }

  const assignMap = {};
  for (const a of assignments || []) {
    (assignMap[a.plan_id] ||= []).push({ ...a, profile: profileMap[a.trainee_id] });
  }

  container.innerHTML = '';
  for (const plan of plans) {
    const exercises = (plan.plan_exercises || []).sort((a, b) => a.sort_order - b.sort_order);
    const assignees = assignMap[plan.id] || [];

    const card = document.createElement('div');
    card.className = 'plan-card';

    const assigneesHtml = assignees.length
      ? assignees.map((a) => `
          <span class="assignee-tag">
            ${escapeHtml(a.profile?.full_name || 'משתמש')}
            <button class="assignee-remove" data-assign-id="${escapeHtml(a.id)}" title="הסר שיוך">×</button>
          </span>
        `).join('')
      : '<span style="color:var(--text-mute);font-size:13px">לא מוקצה</span>';

    card.innerHTML = `
      <div class="plan-header">
        <div style="flex:1;min-width:0">
          <div class="plan-title">${escapeHtml(plan.title)}</div>
          ${plan.description ? `<div class="plan-desc">${escapeHtml(plan.description)}</div>` : ''}
          <div class="plan-assignees">${assigneesHtml}</div>
        </div>
        <div class="workout-actions" style="flex-shrink:0;align-self:flex-start">
          <button class="btn small" data-act="add-exercise">+ תרגיל</button>
          <button class="btn ghost small" data-act="assign">שייך למתאמן</button>
          <button class="btn danger small" data-act="delete-plan">מחק</button>
        </div>
      </div>
      <div class="plan-exercises-list">
        ${exercises.length ? `
          <div class="exercise-table-wrap">
            <table class="exercise-table">
              <thead><tr><th>תרגיל</th><th>סטים</th><th>חזרות</th><th>מנוחה</th><th>הערות</th><th></th></tr></thead>
              <tbody>
                ${exercises.map((ex) => `
                  <tr>
                    <td>${escapeHtml(ex.exercise_name)}</td>
                    <td>${ex.sets ?? '—'}</td>
                    <td>${ex.reps ?? '—'}</td>
                    <td>${ex.rest_sec != null ? ex.rest_sec + '″' : '—'}</td>
                    <td class="ex-notes">${ex.notes ? escapeHtml(ex.notes) : '—'}</td>
                    <td><button class="btn danger small" data-del-ex="${escapeHtml(ex.id)}">✕</button></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        ` : '<div style="padding:12px;color:var(--text-mute);font-size:13px">אין תרגילים — הוסף עם הכפתור</div>'}
      </div>
    `;

    // Add exercise
    card.querySelector('[data-act="add-exercise"]').addEventListener('click', async () => {
      const result = await promptDialog({
        title: `תרגיל חדש — ${plan.title}`,
        fields: [
          { name: 'exercise_name', label: 'שם התרגיל', value: '' },
          { name: 'sets', label: 'סטים', type: 'number', value: 3 },
          { name: 'reps', label: 'חזרות (מספר או טווח כמו 8-12)', value: '10' },
          { name: 'rest_sec', label: 'מנוחה (שניות)', type: 'number', value: 60 },
        ],
        confirmText: 'הוסף',
      });
      if (!result || !result.exercise_name?.trim()) return;
      const { error } = await sb.from('plan_exercises').insert({
        plan_id: plan.id,
        exercise_name: result.exercise_name.trim(),
        sets: parseInt(result.sets) || null,
        reps: result.reps?.trim() || null,
        rest_sec: parseInt(result.rest_sec) || null,
        sort_order: exercises.length,
      });
      if (error) { toast('שגיאה', 'error'); return; }
      toast('תרגיל נוסף', 'success');
      await renderWorkoutPlans();
    });

    // Delete individual exercises
    card.querySelectorAll('[data-del-ex]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const confirmed = await confirmDialog({ title: 'מחק תרגיל', message: 'למחוק תרגיל זה?', confirmText: 'מחק', danger: true });
        if (!confirmed) return;
        const { error } = await sb.from('plan_exercises').delete().eq('id', btn.dataset.delEx);
        if (error) { toast('שגיאה', 'error'); return; }
        await renderWorkoutPlans();
      });
    });

    // Remove assignee
    card.querySelectorAll('.assignee-remove').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const { error } = await sb.from('plan_assignments').delete().eq('id', btn.dataset.assignId);
        if (error) { toast('שגיאה בהסרת שיוך', 'error'); return; }
        toast('שיוך הוסר', 'success');
        await renderWorkoutPlans();
      });
    });

    // Assign to trainee
    card.querySelector('[data-act="assign"]').addEventListener('click', async () => {
      const allTrainees = await getNonAdminTrainees();
      const alreadyAssigned = new Set(assignees.map((a) => a.trainee_id));
      const unassigned = allTrainees.filter((t) => !alreadyAssigned.has(t.id));

      if (!unassigned.length) {
        await confirmDialog({ title: 'שיוך', message: 'כל המתאמנים כבר משויכים לתוכנית זו.', confirmText: 'סגור', cancelText: '' });
        return;
      }

      const traineeId = await adminSelectDialog({
        title: `שייך תוכנית — ${plan.title}`,
        options: unassigned.map((t) => ({ value: t.id, label: t.full_name })),
        confirmText: 'שייך',
      });
      if (!traineeId) return;

      const { error } = await sb.from('plan_assignments').insert({ plan_id: plan.id, trainee_id: traineeId });
      if (error) { toast('שגיאה בשיוך', 'error'); return; }
      toast('התוכנית שויכה', 'success');
      await renderWorkoutPlans();
    });

    // Delete plan
    card.querySelector('[data-act="delete-plan"]').addEventListener('click', async () => {
      const confirmed = await confirmDialog({
        title: 'מחיקת תוכנית',
        message: `למחוק את "${plan.title}"? כל התרגילים והשיוכים יימחקו.`,
        confirmText: 'מחק',
        danger: true,
      });
      if (!confirmed) return;
      const { error } = await sb.from('workout_plans').delete().eq('id', plan.id);
      if (error) { toast('שגיאה', 'error'); return; }
      toast('תוכנית נמחקה', 'success');
      await renderWorkoutPlans();
    });

    container.appendChild(card);
  }
}

// ===== Progress Tracking Tab =====

async function renderProgressTracking() {
  const container = document.getElementById('progressTrackingArea');
  if (!container) return;
  container.innerHTML = '<div class="empty">טוען…</div>';

  const list = await getNonAdminTrainees();
  if (!list.length) {
    container.innerHTML = '<div class="empty">אין מתאמנים</div>';
    return;
  }

  container.innerHTML = `
    <div class="progress-controls">
      <div class="field" style="max-width:320px">
        <label>בחר/י מתאמן/ת</label>
        <select id="progressTraineeSelect">
          <option value="">— בחר —</option>
          ${list.map((t) => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.full_name)}</option>`).join('')}
        </select>
      </div>
    </div>
    <div id="progressContent" style="margin-top:24px"></div>
  `;

  document.getElementById('progressTraineeSelect').addEventListener('change', async (e) => {
    const traineeId = e.target.value;
    const trainee = list.find((t) => t.id === traineeId);
    if (!traineeId || !trainee) {
      document.getElementById('progressContent').innerHTML = '';
      return;
    }
    await loadProgressForTrainee(traineeId, trainee.full_name);
  });
}

async function loadProgressForTrainee(traineeId, traineeName) {
  const content = document.getElementById('progressContent');
  if (!content) return;
  content.innerHTML = '<div class="empty">טוען…</div>';

  const { data: logs, error } = await sb
    .from('progress_logs')
    .select('id, exercise_name, log_date, reps, hold_sec, weight_kg, notes')
    .eq('trainee_id', traineeId)
    .order('log_date', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) { content.innerHTML = '<div class="empty">שגיאה</div>'; return; }

  const exerciseMap = {};
  for (const log of logs || []) (exerciseMap[log.exercise_name] ||= []).push(log);
  const exercises = Object.keys(exerciseMap);

  content.innerHTML = '';

  const addBtn = document.createElement('button');
  addBtn.className = 'btn';
  addBtn.style.marginBottom = '20px';
  addBtn.textContent = `+ הוסף רשומה עבור ${traineeName}`;
  addBtn.addEventListener('click', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const result = await promptDialog({
      title: `רשומת התקדמות — ${traineeName}`,
      fields: [
        { name: 'exercise_name', label: 'שם התרגיל', value: '' },
        { name: 'log_date', label: 'תאריך', type: 'date', value: today },
        { name: 'reps', label: 'חזרות (אופציונלי)', type: 'number', value: '' },
        { name: 'hold_sec', label: 'החזקה בשניות (אופציונלי)', type: 'number', value: '' },
        { name: 'weight_kg', label: 'משקל בק"ג (אופציונלי)', value: '' },
        { name: 'notes', label: 'הערות (אופציונלי)', value: '' },
      ],
      confirmText: 'שמור',
    });
    if (!result || !result.exercise_name?.trim()) return;

    const { error: insErr } = await sb.from('progress_logs').insert({
      trainee_id: traineeId,
      exercise_name: result.exercise_name.trim(),
      log_date: result.log_date || today,
      reps: parseInt(result.reps) || null,
      hold_sec: parseInt(result.hold_sec) || null,
      weight_kg: parseFloat(result.weight_kg) || null,
      notes: result.notes?.trim() || null,
      logged_by: adminUserId,
    });
    if (insErr) { toast('שגיאה', 'error'); console.error(insErr); return; }
    toast('רשומה נשמרה', 'success');
    await loadProgressForTrainee(traineeId, traineeName);
  });
  content.appendChild(addBtn);

  if (!exercises.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'אין רשומות התקדמות עדיין';
    content.appendChild(empty);
    return;
  }

  for (const exName of exercises) {
    const entries = exerciseMap[exName];
    const first = entries[0];
    const last = entries[entries.length - 1];

    const block = document.createElement('div');
    block.className = 'progress-exercise-block';
    block.innerHTML = `
      <div class="progress-exercise-name">${escapeHtml(exName)}</div>
      <div class="exercise-table-wrap">
        <table class="progress-table">
          <thead>
            <tr><th>תאריך</th><th>חזרות</th><th>החזקה</th><th>משקל (ק"ג)</th><th>הערות</th><th></th></tr>
          </thead>
          <tbody>
            ${entries.map((entry, idx) => `
              <tr class="${idx === entries.length - 1 && entries.length > 1 ? 'progress-latest' : ''}">
                <td>${formatDate(entry.log_date)}</td>
                <td>${entry.reps ?? '—'}</td>
                <td>${entry.hold_sec != null ? entry.hold_sec + '″' : '—'}</td>
                <td>${entry.weight_kg != null ? entry.weight_kg + ' ק"ג' : '—'}</td>
                <td class="ex-notes">${entry.notes ? escapeHtml(entry.notes) : '—'}</td>
                <td><button class="btn danger small" data-del-log="${escapeHtml(entry.id)}">✕</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      ${entries.length > 1 ? renderProgressDelta(first, last) : ''}
    `;

    block.querySelectorAll('[data-del-log]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const confirmed = await confirmDialog({ title: 'מחק רשומה', message: 'למחוק רשומה זו?', confirmText: 'מחק', danger: true });
        if (!confirmed) return;
        const { error } = await sb.from('progress_logs').delete().eq('id', btn.dataset.delLog);
        if (error) { toast('שגיאה', 'error'); return; }
        await loadProgressForTrainee(traineeId, traineeName);
      });
    });

    content.appendChild(block);
  }
}

function renderProgressDelta(first, last) {
  const parts = [];

  if (first.reps != null && last.reps != null && first.reps !== last.reps) {
    const delta = last.reps - first.reps;
    const cls = delta > 0 ? 'delta-up' : 'delta-down';
    parts.push(`חזרות: ${first.reps} → ${last.reps} <span class="${cls}">(${delta > 0 ? '+' : ''}${delta})</span>`);
  }
  if (first.hold_sec != null && last.hold_sec != null && first.hold_sec !== last.hold_sec) {
    const delta = last.hold_sec - first.hold_sec;
    const cls = delta > 0 ? 'delta-up' : 'delta-down';
    parts.push(`החזקה: ${first.hold_sec}″ → ${last.hold_sec}″ <span class="${cls}">(${delta > 0 ? '+' : ''}${delta}″)</span>`);
  }
  if (first.weight_kg != null && last.weight_kg != null && +first.weight_kg !== +last.weight_kg) {
    const delta = +(last.weight_kg - first.weight_kg).toFixed(1);
    const cls = delta > 0 ? 'delta-up' : 'delta-down';
    parts.push(`משקל: ${first.weight_kg} → ${last.weight_kg} ק"ג <span class="${cls}">(${delta > 0 ? '+' : ''}${delta})</span>`);
  }

  if (!parts.length) return '';
  return `<div class="progress-delta">📈 שינוי: ${parts.join(' • ')}</div>`;
}
