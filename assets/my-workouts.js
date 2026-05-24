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

  await renderMyWorkouts();
})();

async function renderMyWorkouts() {
  const upcomingList = document.getElementById('upcomingList');
  const pastList = document.getElementById('pastList');

  const { data: regs, error } = await sb
    .from('registrations')
    .select('id, workout_id, workouts(id, title, workout_date, start_time, duration_min, max_participants, notes)')
    .eq('user_id', currentUserId);

  if (error) {
    upcomingList.innerHTML = '<div class="empty">שגיאה בטעינה</div>';
    console.error(error);
    return;
  }

  const workouts = (regs || [])
    .filter((r) => r.workouts)
    .map((r) => r.workouts);

  workouts.sort((a, b) => {
    const da = new Date(`${a.workout_date}T${a.start_time}`);
    const db = new Date(`${b.workout_date}T${b.start_time}`);
    return da - db;
  });

  const upcoming = workouts.filter((w) => !isPastWorkout(w));
  const past = workouts.filter((w) => isPastWorkout(w)).reverse();

  renderList(upcomingList, upcoming, false);
  renderList(pastList, past, true);
}

function renderList(container, workouts, isPast) {
  if (!workouts.length) {
    container.innerHTML = `<div class="empty">${isPast ? 'אין אימונים שעברו' : 'אינך רשום/ה לאימונים קרובים'}</div>`;
    return;
  }

  container.innerHTML = '';
  for (const w of workouts) {
    const card = document.createElement('div');
    card.className = 'workout-card registered' + (isPast ? ' past' : '');
    card.innerHTML = `
      <div class="workout-info">
        <div class="title">${escapeHtml(w.title)}</div>
        <div class="meta">
          <span>${formatDate(w.workout_date)}</span>
          <span>🕘 ${formatTime(w.start_time)}${w.duration_min ? ` (${w.duration_min} דק׳)` : ''}</span>
        </div>
        ${w.notes ? `<div class="meta" style="margin-top:6px">${escapeHtml(w.notes)}</div>` : ''}
      </div>
      <div class="workout-actions"></div>
    `;

    if (!isPast) {
      const actions = card.querySelector('.workout-actions');

      // Add to calendar
      const icsBtn = document.createElement('button');
      icsBtn.className = 'btn small ghost';
      icsBtn.innerHTML = '📅 הוסף ליומן';
      icsBtn.addEventListener('click', () => {
        showCalendarOptions(w);
      });
      actions.appendChild(icsBtn);

      // Cancel
      const btn = document.createElement('button');
      const cancelable = canCancel(w);
      btn.className = 'btn small ' + (cancelable ? 'danger' : 'ghost');
      btn.textContent = cancelable ? 'בטל הרשמה' : 'נעול לביטול';

      btn.addEventListener('click', async () => {
        if (!cancelable) {
          await confirmDialog({
            title: 'לא ניתן לבטל',
            message: `לא ניתן לבטל הרשמה פחות מ-${CANCEL_DEADLINE_HOURS} שעות לפני האימון. ליצירת קשר עם המאמן/ת.`,
            confirmText: 'הבנתי',
            cancelText: '',
          });
          return;
        }

        const confirmed = await confirmDialog({
          title: 'ביטול הרשמה',
          message: `לבטל את ההרשמה ל"${w.title}"?`,
          confirmText: 'בטל הרשמה',
          danger: true,
        });
        if (!confirmed) return;

        btn.disabled = true;
        const { error } = await sb
          .from('registrations')
          .delete()
          .eq('workout_id', w.id)
          .eq('user_id', currentUserId);

        if (error) {
          toast('שגיאה בביטול', 'error');
          btn.disabled = false;
          return;
        }
        toast('ההרשמה בוטלה', 'success');
        await renderMyWorkouts();
      });
      actions.appendChild(btn);
    }

    container.appendChild(card);
  }
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
