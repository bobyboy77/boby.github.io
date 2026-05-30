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

  document.getElementById('subStatus').textContent =
    'המנוי הנוכחי שלך: ' + subscriptionStatusText(profile);

  const list = document.getElementById('productsList');
  list.innerHTML = '';

  for (const key of Object.keys(PRODUCTS)) {
    const p = PRODUCTS[key];
    const card = document.createElement('div');
    card.className = 'product-card';
    card.innerHTML = `
      <div class="product-info">
        <div class="product-title">${p.label}</div>
        <div class="product-meta">
          ${p.entries} כניס${p.entries === 1 ? 'ה' : 'ות'}
          • בתוקף ${p.validMonths} חודש${p.validMonths === 1 ? '' : 'ים'}
        </div>
      </div>
      <div class="product-price">${p.price}₪</div>
      <button class="btn" data-product="${p.key}">רכישה בביט 💸</button>
    `;
    card.querySelector('button').addEventListener('click', () => {
      showBitPayment(p, userId);
    });
    list.appendChild(card);
  }
})();
