/**
 * profile.js  –  Fetches and renders the current user's stats.
 */

(function () {
  'use strict';

  // ── DOM refs ─────────────────────────────────────────────────────────────────
  const $ = id => document.getElementById(id);

  const profileLoading      = $('profile-loading');
  const profileError        = $('profile-error');
  const profileContent      = $('profile-content');
  const profileRetry        = $('profile-retry');

  const userAvatar          = $('user-avatar');
  const userAvatarPlaceholder = $('user-avatar-placeholder');
  const userDisplayName     = $('user-display-name');
  const userSpotifyId       = $('user-spotify-id');
  const userSince           = $('user-since');

  const statScore           = $('stat-score');
  const statStreak          = $('stat-streak');
  const statGames           = $('stat-games');
  const statWins            = $('stat-wins');
  const statWinPct          = $('stat-winpct');
  const statAvgGuesses      = $('stat-avg-guesses');
  const statFastest         = $('stat-fastest');
  const winRateBar          = $('win-rate-bar');

  const recentGamesList     = $('recent-games-list');
  const noGamesMsg          = $('no-games-msg');

  // ── Fetch & render ────────────────────────────────────────────────────────────
  async function loadProfile() {
    profileLoading.classList.remove('hidden');
    profileContent.classList.add('hidden');
    profileError.classList.add('hidden');

    try {
      const resp = await fetch('/api/user-stats');
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();

      renderProfile(data);

      profileLoading.classList.add('hidden');
      profileContent.classList.remove('hidden');

    } catch (err) {
      profileLoading.classList.add('hidden');
      profileError.classList.remove('hidden');
      console.error('Profile fetch error:', err);
    }
  }

  function renderProfile(data) {
    const user = data.user || {};
    const recent = data.recent_games || [];

    // Avatar
    if (user.avatar_url) {
      userAvatar.src = user.avatar_url;
      userAvatar.classList.remove('hidden');
      userAvatarPlaceholder.classList.add('hidden');
    } else {
      userAvatar.classList.add('hidden');
      userAvatarPlaceholder.classList.remove('hidden');
    }

    userDisplayName.textContent = user.display_name || user.username || '–';
    userSpotifyId.textContent = user.spotify_id ? `@${user.spotify_id}` : '';

    if (user.created_at) {
      const d = new Date(user.created_at);
      userSince.textContent = `Member since ${d.toLocaleDateString(undefined, { year: 'numeric', month: 'long' })}`;
    }

    // Stats
    statScore.textContent = user.total_score || 0;
    statStreak.textContent = user.best_streak || 0;
    statGames.textContent = user.games_played || 0;
    statWins.textContent = user.wins || 0;
    statWinPct.textContent = `${user.win_percentage || 0}%`;
    statAvgGuesses.textContent = user.avg_guesses ? user.avg_guesses.toFixed(1) : '–';

    // Fastest win
    if (user.fastest_win_seconds != null) {
      statFastest.textContent = formatTime(user.fastest_win_seconds);
    } else {
      statFastest.textContent = '–';
    }

    // Win rate bar animation
    const pct = Math.min(user.win_percentage || 0, 100);
    setTimeout(() => {
      winRateBar.style.width = `${pct}%`;
    }, 100);

    // Recent games
    recentGamesList.innerHTML = '';
    if (recent.length === 0) {
      noGamesMsg.classList.remove('hidden');
    } else {
      noGamesMsg.classList.add('hidden');
      recent.forEach(game => {
        const item = document.createElement('div');
        item.className = `flex items-center gap-3 p-3 rounded-xl ${game.won ? 'bg-green-900/20 border border-green-800/40' : 'bg-red-900/20 border border-red-900/30'}`;

        const date = game.played_at ? new Date(game.played_at).toLocaleDateString() : '–';
        const result = game.won ? '✅' : '❌';
        const guesses = game.guesses_used ? `${game.guesses_used} guess${game.guesses_used === 1 ? '' : 'es'}` : '–';
        const pts = game.won ? `+${game.points}` : '+0';

        item.innerHTML = `
          <span class="text-xl flex-shrink-0">${result}</span>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium text-white truncate">${escapeHtml(game.track_name || 'Unknown song')}</p>
            <p class="text-xs text-spotify-light truncate">${escapeHtml(game.artist_name || '–')}</p>
          </div>
          <div class="text-right flex-shrink-0">
            <p class="text-sm font-bold ${game.won ? 'text-spotify-green' : 'text-gray-500'}">${pts}</p>
            <p class="text-xs text-spotify-light">${guesses}</p>
          </div>
        `;
        recentGamesList.appendChild(item);
      });
    }
  }

  // ── Utilities ─────────────────────────────────────────────────────────────────
  function formatTime(seconds) {
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return `${m}m ${s}s`;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── Event listeners ───────────────────────────────────────────────────────────
  if (profileRetry) {
    profileRetry.addEventListener('click', loadProfile);
  }

  // ── Init ──────────────────────────────────────────────────────────────────────
  loadProfile();

})();
