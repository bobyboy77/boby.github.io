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

  // Personal sessions summary
  const ptTotal = profile?.pt_sessions_total || 0;
  const ptUsed = profile?.pt_sessions_used || 0;
  const ptRemaining = Math.max(0, ptTotal - ptUsed);
  const ptBox = document.getElementById('ptSessionsBox');

  if (ptTotal > 0) {
    ptBox.innerHTML = `
      <div class="pt-summary-box">
        <div class="pt-summary-title">מפגשים אישיים</div>
        <div class="pt-summary-stats">
          <div class="pt-stat">
            <div class="pt-stat-num">${ptUsed}</div>
            <div class="pt-stat-label">נעשו</div>
          </div>
          <div class="pt-stat">
            <div class="pt-stat-num" style="color:${ptRemaining > 0 ? 'var(--success)' : 'var(--danger)'}">${ptRemaining}</div>
            <div class="pt-stat-label">נשארו</div>
          </div>
          <div class="pt-stat">
            <div class="pt-stat-num">${ptTotal}</div>
            <div class="pt-stat-label">בחבילה</div>
          </div>
        </div>
      </div>
    `;
  } else {
    ptBox.innerHTML = '<div class="empty" style="padding:16px">אין חבילת מפגשים אישיים פעילה</div>';
  }

  // Workout plan
  const planContent = document.getElementById('myPlanContent');
  const { data: assignments } = await sb
    .from('plan_assignments')
    .select('plan_id')
    .eq('trainee_id', userId);

  if (!assignments?.length) {
    planContent.innerHTML = '<div class="empty">אין תוכנית אימון מוקצית עדיין</div>';
  } else {
    const planIds = assignments.map((a) => a.plan_id);
    const { data: plans } = await sb
      .from('workout_plans')
      .select('id, title, description, plan_exercises(id, exercise_name, sets, reps, rest_sec, notes, sort_order)')
      .in('id', planIds);

    if (!plans?.length) {
      planContent.innerHTML = '<div class="empty">אין תוכנית אימון מוקצית עדיין</div>';
    } else {
      planContent.innerHTML = '';
      for (const plan of plans) {
        const exercises = (plan.plan_exercises || []).sort((a, b) => a.sort_order - b.sort_order);
        const card = document.createElement('div');
        card.className = 'plan-card plan-card-trainee';
        card.innerHTML = `
          <div class="plan-title">${escapeHtml(plan.title)}</div>
          ${plan.description ? `<div class="plan-desc">${escapeHtml(plan.description)}</div>` : ''}
          <div class="plan-exercises-list" style="margin-top:12px">
            ${exercises.length ? `
              <div class="exercise-table-wrap">
                <table class="exercise-table">
                  <thead>
                    <tr><th>תרגיל</th><th>סטים</th><th>חזרות</th><th>מנוחה</th><th>הערות</th></tr>
                  </thead>
                  <tbody>
                    ${exercises.map((ex) => `
                      <tr>
                        <td>${escapeHtml(ex.exercise_name)}</td>
                        <td>${ex.sets ?? '—'}</td>
                        <td>${ex.reps ?? '—'}</td>
                        <td>${ex.rest_sec != null ? ex.rest_sec + '″' : '—'}</td>
                        <td class="ex-notes">${ex.notes ? escapeHtml(ex.notes) : '—'}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            ` : '<div style="color:var(--text-mute);font-size:13px;padding:8px">אין תרגילים עדיין</div>'}
          </div>
        `;
        planContent.appendChild(card);
      }
    }
  }

  // Progress history
  const progressContent = document.getElementById('myProgressContent');
  const { data: logs } = await sb
    .from('progress_logs')
    .select('exercise_name, log_date, reps, hold_sec, weight_kg, notes')
    .eq('trainee_id', userId)
    .order('log_date', { ascending: true })
    .order('created_at', { ascending: true });

  if (!logs?.length) {
    progressContent.innerHTML = '<div class="empty">אין רישומי התקדמות עדיין</div>';
  } else {
    const exerciseMap = {};
    for (const log of logs) (exerciseMap[log.exercise_name] ||= []).push(log);

    progressContent.innerHTML = Object.entries(exerciseMap).map(([exName, entries]) => {
      const first = entries[0];
      const last = entries[entries.length - 1];
      return `
        <div class="progress-exercise-block">
          <div class="progress-exercise-name">${escapeHtml(exName)}</div>
          <div class="exercise-table-wrap">
            <table class="progress-table">
              <thead>
                <tr><th>תאריך</th><th>חזרות</th><th>החזקה</th><th>משקל (ק"ג)</th><th>הערות</th></tr>
              </thead>
              <tbody>
                ${entries.map((entry, idx) => `
                  <tr class="${idx === entries.length - 1 && entries.length > 1 ? 'progress-latest' : ''}">
                    <td>${formatDate(entry.log_date)}</td>
                    <td>${entry.reps ?? '—'}</td>
                    <td>${entry.hold_sec != null ? entry.hold_sec + '″' : '—'}</td>
                    <td>${entry.weight_kg != null ? entry.weight_kg + ' ק"ג' : '—'}</td>
                    <td class="ex-notes">${entry.notes ? escapeHtml(entry.notes) : '—'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          ${entries.length > 1 ? renderMyProgressDelta(first, last) : ''}
        </div>
      `;
    }).join('');
  }
})();

function renderMyProgressDelta(first, last) {
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

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
