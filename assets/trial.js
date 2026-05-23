let selectedWorkoutId = null;
let availableWorkouts = [];

(async () => {
  await loadAvailableWorkouts();

  document.getElementById('trialForm').addEventListener('submit', handleSubmit);
})();

async function loadAvailableWorkouts() {
  const picker = document.getElementById('workoutPicker');

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const twoWeeksOut = new Date(today);
  twoWeeksOut.setDate(today.getDate() + 14);

  const fmt = (d) => d.toISOString().slice(0, 10);

  const { data: workouts, error } = await sb
    .from('workouts')
    .select('id, title, workout_date, start_time, duration_min, max_participants')
    .gte('workout_date', fmt(today))
    .lte('workout_date', fmt(twoWeeksOut))
    .order('workout_date', { ascending: true })
    .order('start_time', { ascending: true });

  if (error) {
    picker.innerHTML = '<div class="empty">שגיאה בטעינת האימונים</div>';
    console.error(error);
    return;
  }

  if (!workouts.length) {
    picker.innerHTML = '<div class="empty">אין אימונים זמינים בשבועיים הקרובים</div>';
    return;
  }

  const ids = workouts.map((w) => w.id);
  const { data: regs } = await sb
    .from('registrations')
    .select('workout_id')
    .in('workout_id', ids);

  const countMap = {};
  for (const r of regs || []) {
    countMap[r.workout_id] = (countMap[r.workout_id] || 0) + 1;
  }

  availableWorkouts = workouts.filter((w) => {
    const count = countMap[w.id] || 0;
    return !w.max_participants || count < w.max_participants;
  });

  if (!availableWorkouts.length) {
    picker.innerHTML = '<div class="empty">כל האימונים מלאים כרגע</div>';
    return;
  }

  picker.innerHTML = '';
  for (const w of availableWorkouts) {
    const count = countMap[w.id] || 0;
    const card = document.createElement('label');
    card.className = 'workout-pick';
    card.innerHTML = `
      <input type="radio" name="workout" value="${w.id}" />
      <div class="workout-pick-info">
        <div class="title">${escapeHtml(w.title)}</div>
        <div class="meta">
          <span>${formatDate(w.workout_date)}</span>
          <span>🕘 ${formatTime(w.start_time)}${w.duration_min ? ` (${w.duration_min} דק׳)` : ''}</span>
          ${w.max_participants ? `<span>${count}/${w.max_participants} נרשמו</span>` : ''}
        </div>
      </div>
    `;
    card.querySelector('input').addEventListener('change', (e) => {
      selectedWorkoutId = e.target.value;
      document.getElementById('submitBtn').disabled = false;
      document.querySelectorAll('.workout-pick').forEach((el) => el.classList.remove('selected'));
      card.classList.add('selected');
    });
    picker.appendChild(card);
  }
}

async function handleSubmit(e) {
  e.preventDefault();
  const btn = document.getElementById('submitBtn');
  btn.disabled = true;
  btn.textContent = 'מבצע הרשמה…';

  const payload = {
    full_name: document.getElementById('full_name').value.trim(),
    phone: document.getElementById('phone').value.trim(),
    email: document.getElementById('email').value.trim() || null,
    trial_goal: document.getElementById('trial_goal').value.trim() || null,
    trial_source: document.getElementById('trial_source').value.trim() || null,
  };

  if (!selectedWorkoutId) {
    toast('בחר/י אימון', 'error');
    btn.disabled = false;
    btn.textContent = 'קבע/י שיעור ניסיון';
    return;
  }

  const { data: signInData, error: signInError } = await sb.auth.signInAnonymously();
  if (signInError) {
    console.error(signInError);
    toast('שגיאה בהרשמה. ודא/י שהאופציה Anonymous Sign-Ins פעילה ב-Supabase', 'error');
    btn.disabled = false;
    btn.textContent = 'קבע/י שיעור ניסיון';
    return;
  }

  const userId = signInData.user.id;

  const { error: updateError } = await sb
    .from('profiles')
    .update(payload)
    .eq('id', userId);

  if (updateError) {
    console.error(updateError);
    toast('שגיאה בשמירת הפרטים', 'error');
    await sb.auth.signOut();
    btn.disabled = false;
    btn.textContent = 'קבע/י שיעור ניסיון';
    return;
  }

  const { error: regError } = await sb
    .from('registrations')
    .insert({ workout_id: selectedWorkoutId, user_id: userId });

  if (regError) {
    console.error(regError);
    toast('שגיאה בהרשמה לאימון', 'error');
    await sb.auth.signOut();
    btn.disabled = false;
    btn.textContent = 'קבע/י שיעור ניסיון';
    return;
  }

  const chosenWorkout = availableWorkouts.find((w) => w.id === selectedWorkoutId);
  document.getElementById('successDetails').textContent =
    `${chosenWorkout.title} • ${formatDate(chosenWorkout.workout_date)} • ${formatTime(chosenWorkout.start_time)}`;

  document.getElementById('formStep').style.display = 'none';
  document.getElementById('successStep').style.display = 'block';

  await sb.auth.signOut();
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
