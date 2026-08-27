// Bewertungen & Favoriten, gemeinsam für index.html und recipe.html.
// Bewertungen sind öffentlich (jeder sieht Durchschnitt/Anzahl, Details nur auf
// der Detailseite). Favoriten sind rein privat (nur die eigene Liste ist sichtbar).
// Kein echtes Login: die Identität ist eine selbst hinterlegte, ungeprüfte
// E-Mail + ein öffentlicher Anzeigename — siehe planung/spec-e9-bewertungen-favoriten.md.

// ── Supabase-Zugangsdaten ──────────────────────────────────────────────
// Diese zwei Werte nach dem Supabase-Setup eintragen (siehe SUPABASE-SETUP.md).
const SUPABASE_URL = 'https://edvhweqsaydmxmlggdty.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVkdmh3ZXFzYXlkbXhtbGdnZHR5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc2NzcwMDYsImV4cCI6MjEwMzI1MzAwNn0.ugP5I2APW7xD4ksX35BRqtAWOo55BQlY0Bp_6iCHdW8';

const Ratings = (function () {
  const IDENTITY_KEY = 'tuttobene-identity';
  const REST_URL = `${SUPABASE_URL}/rest/v1`;

  function getIdentity() {
    try {
      const raw = localStorage.getItem(IDENTITY_KEY);
      if (!raw) return null;
      const identity = JSON.parse(raw);
      if (identity && identity.email && identity.displayName) return identity;
      return null;
    } catch (err) {
      return null;
    }
  }

  function setIdentity(email, displayName) {
    const identity = { email: email.trim(), displayName: displayName.trim() };
    localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
    return identity;
  }

  function isConfigured() {
    return SUPABASE_URL && !SUPABASE_URL.includes('HIER') && SUPABASE_ANON_KEY && !SUPABASE_ANON_KEY.includes('HIER');
  }

  function headers(extra) {
    const identity = getIdentity();
    return {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      'x-user-email': identity ? identity.email : '',
      ...(extra || {}),
    };
  }

  async function request(path, options) {
    const response = await fetch(`${REST_URL}${path}`, {
      ...options,
      headers: headers(options && options.headers),
    });
    if (!response.ok) {
      throw new Error(`Supabase-Anfrage fehlgeschlagen: ${response.status}`);
    }
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  // ── Bewertungen (öffentlich) ────────────────────────────────────────

  async function ratingsForRecipes(recipeIds) {
    if (!isConfigured() || recipeIds.length === 0) return new Map();
    const idsParam = recipeIds.map(id => `"${id}"`).join(',');
    const rows = await request(`/ratings?recipe_id=in.(${idsParam})&select=recipe_id,stars`);
    const byRecipe = new Map();
    (rows || []).forEach(row => {
      if (!byRecipe.has(row.recipe_id)) byRecipe.set(row.recipe_id, []);
      byRecipe.get(row.recipe_id).push(Number(row.stars));
    });
    const summary = new Map();
    byRecipe.forEach((stars, recipeId) => {
      const average = stars.reduce((a, b) => a + b, 0) / stars.length;
      summary.set(recipeId, { average, count: stars.length });
    });
    return summary;
  }

  async function ratingsForRecipe(recipeId) {
    if (!isConfigured()) return [];
    const rows = await request(
      `/ratings?recipe_id=eq.${encodeURIComponent(recipeId)}&select=display_name,stars,comment,updated_at,user_email&order=updated_at.desc`
    );
    return rows || [];
  }

  async function submitRating(recipeId, stars, comment) {
    const identity = getIdentity();
    if (!identity) throw new Error('Keine Identität hinterlegt.');
    await request('/ratings', {
      method: 'POST',
      headers: { 'Prefer': 'resolution=merge-duplicates' },
      body: JSON.stringify({
        recipe_id: recipeId,
        user_email: identity.email,
        display_name: identity.displayName,
        stars,
        comment: comment || null,
        updated_at: new Date().toISOString(),
      }),
    });
  }

  async function deleteRating(recipeId) {
    const identity = getIdentity();
    if (!identity) throw new Error('Keine Identität hinterlegt.');
    await request(
      `/ratings?recipe_id=eq.${encodeURIComponent(recipeId)}&user_email=eq.${encodeURIComponent(identity.email)}`,
      { method: 'DELETE' }
    );
  }

  // ── Favoriten (privat) ──────────────────────────────────────────────

  async function ownFavorites() {
    const identity = getIdentity();
    if (!isConfigured() || !identity) return new Set();
    const rows = await request('/favorites?select=recipe_id');
    return new Set((rows || []).map(row => row.recipe_id));
  }

  async function setFavorite(recipeId, isFavorite) {
    const identity = getIdentity();
    if (!identity) throw new Error('Keine Identität hinterlegt.');
    if (isFavorite) {
      await request('/favorites', {
        method: 'POST',
        headers: { 'Prefer': 'resolution=merge-duplicates' },
        body: JSON.stringify({ recipe_id: recipeId, user_email: identity.email }),
      });
    } else {
      await request(
        `/favorites?recipe_id=eq.${encodeURIComponent(recipeId)}&user_email=eq.${encodeURIComponent(identity.email)}`,
        { method: 'DELETE' }
      );
    }
  }

  // ── Anmelde-Dialog (E-Mail + Anzeigename, einmalig) ────────────────
  // Wird von index.html und recipe.html gleichermaßen genutzt, wenn eine
  // Aktion (Bewerten/Favorisieren) eine Identität braucht, aber noch keine
  // hinterlegt ist. Gibt ein Promise zurück, das mit der Identität auflöst,
  // oder mit null, falls der Dialog abgebrochen wurde.

  function ensureIdentityDialog() {
    return new Promise((resolve) => {
      const existing = getIdentity();
      if (existing) {
        resolve(existing);
        return;
      }

      const overlay = document.createElement('div');
      overlay.className = 'identity-overlay';
      overlay.innerHTML = `
        <div class="identity-dialog">
          <h3>Kurz vorstellen</h3>
          <p>Zum Bewerten oder Favorisieren brauchen wir einmalig deine E-Mail (nur intern, nicht sichtbar) und einen Namen, der bei Bewertungen angezeigt wird.</p>
          <label class="identity-field">
            E-Mail
            <input type="email" id="identity-email" autocomplete="email" placeholder="du@beispiel.de">
          </label>
          <label class="identity-field">
            Anzeigename
            <input type="text" id="identity-name" autocomplete="nickname" placeholder="z. B. Bene">
          </label>
          <p class="identity-hint">Ungeprüft — bitte nur die eigene E-Mail verwenden.</p>
          <div class="identity-actions">
            <button type="button" class="identity-cancel" id="identity-cancel">Abbrechen</button>
            <button type="button" class="identity-confirm" id="identity-confirm">Los geht's</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);

      const emailInput = overlay.querySelector('#identity-email');
      const nameInput = overlay.querySelector('#identity-name');
      emailInput.focus();

      function close(result) {
        overlay.remove();
        resolve(result);
      }

      overlay.querySelector('#identity-cancel').addEventListener('click', () => close(null));
      overlay.addEventListener('click', (event) => {
        if (event.target === overlay) close(null);
      });
      overlay.querySelector('#identity-confirm').addEventListener('click', () => {
        const email = emailInput.value.trim();
        const displayName = nameInput.value.trim();
        if (!email || !displayName) return;
        close(setIdentity(email, displayName));
      });
    });
  }

  return {
    isConfigured,
    getIdentity,
    setIdentity,
    ensureIdentityDialog,
    ratingsForRecipes,
    ratingsForRecipe,
    submitRating,
    deleteRating,
    ownFavorites,
    setFavorite,
  };
})();
