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

  document.getElementById('emailDisplay').textContent = session.user.email || '';
  document.getElementById('full_name').value = profile?.full_name || '';
  document.getElementById('phone').value = profile?.phone || '';

  const subBox = document.getElementById('subBox');
  if (subBox) {
    subBox.innerHTML = `
      <div style="font-size:13px;color:var(--text-dim);margin-bottom:4px">מנוי</div>
      <div style="font-size:15px;font-weight:600;margin-bottom:12px">${subscriptionStatusText(profile)}</div>
      <a href="pricing.html" class="btn small ghost">רכישת כניסות</a>
    `;
  }

  document.getElementById('profileForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const full_name = document.getElementById('full_name').value.trim();
    const phone = document.getElementById('phone').value.trim() || null;

    if (!full_name) { toast('שם נדרש', 'error'); return; }

    const { error } = await sb
      .from('profiles')
      .update({ full_name, phone })
      .eq('id', userId);

    if (error) { toast('שגיאה בשמירה', 'error'); console.error(error); return; }
    toast('הפרטים נשמרו', 'success');
  });

  document.getElementById('passwordForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const newPass = document.getElementById('new_password').value;
    const confirm = document.getElementById('confirm_password').value;

    if (newPass.length < 6) { toast('סיסמה חייבת להיות לפחות 6 תווים', 'error'); return; }
    if (newPass !== confirm) { toast('הסיסמאות לא תואמות', 'error'); return; }

    const { error } = await sb.auth.updateUser({ password: newPass });
    if (error) { toast('שגיאה בשינוי הסיסמה', 'error'); console.error(error); return; }

    toast('הסיסמה שונתה בהצלחה', 'success');
    e.target.reset();
  });
})();
