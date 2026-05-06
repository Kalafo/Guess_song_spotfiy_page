/**
 * leaderboard.js  –  Fetches and renders the leaderboard.
 */

(function () {
  'use strict';

  let currentType = 'global';

  // ── DOM refs ─────────────────────────────────────────────────────────────────
  const $ = id => document.getElementById(id);

  const tabGlobal   = $('tab-global');
  const tabDaily    = $('tab-daily');
  const lbLoading   = $('lb-loading');
  const lbError     = $('lb-error');
  const lbContent   = $('lb-content');
  const lbEmpty     = $('lb-empty');
  const tableBody   = $('lb-table-body');
  const podium      = $('podium');
  const lbRetry     = $('lb-retry');
  const colExtra    = $('col-extra');

  // ── Fetch leaderboard ─────────────────────────────────────────────────────────
  async function loadLeaderboard(type) {
    currentType = type;

    // Update tab styles
    [tabGlobal, tabDaily].forEach(t => {
      t.classList.remove('bg-spotify-green', 'text-black');
      t.classList.add('text-spotify-light', 'hover:text-white');
    });
    const activeTab = type === 'global' ? tabGlobal : tabDaily;
    activeTab.classList.add('bg-spotify-green', 'text-black');
    activeTab.classList.remove('text-spotify-light', 'hover:text-white');

    // Show loading
    lbLoading.classList.remove('hidden');
    lbContent.classList.add('hidden');
    lbEmpty.classList.add('hidden');
    lbError.classList.add('hidden');

    try {
      const resp = await fetch(`/api/leaderboard?type=${type}&limit=20`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      const entries = data.leaderboard || [];

      lbLoading.classList.add('hidden');

      if (entries.length === 0) {
        lbEmpty.classList.remove('hidden');
        return;
      }

      renderLeaderboard(entries, type);
      lbContent.classList.remove('hidden');

    } catch (err) {
      lbLoading.classList.add('hidden');
      lbError.classList.remove('hidden');
      console.error('Leaderboard fetch error:', err);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  function renderLeaderboard(entries, type) {
    // Update extra column header
    if (colExtra) {
      colExtra.textContent = type === 'global' ? 'Streak' : 'Games';
    }

    // Render podium (top 3)
    if (entries.length >= 2) {
      podium.classList.remove('hidden');
      renderPodiumEntry(1, entries[0], type);
      renderPodiumEntry(2, entries[1], type);
      if (entries.length >= 3) {
        renderPodiumEntry(3, entries[2], type);
        $('podium-3').classList.remove('hidden');
      } else {
        $('podium-3').classList.add('hidden');
      }
    } else {
      podium.classList.add('hidden');
    }

    // Render table rows
    tableBody.innerHTML = '';
    entries.forEach((entry, idx) => {
      const tr = document.createElement('tr');
      tr.className = `border-b border-gray-800 hover:bg-spotify-hover transition-colors ${entry.is_me ? 'lb-me' : ''}`;

      const rankDisplay = getRankDisplay(idx + 1);
      const extraValue = type === 'global'
        ? `${entry.streak || 0} 🔥`
        : `${entry.games || 0}`;
      const winPctCell = type === 'global'
        ? `<td class="text-right px-5 py-3.5 hidden md:table-cell text-spotify-light">${entry.win_percentage || 0}%</td>`
        : '<td class="text-right px-5 py-3.5 hidden md:table-cell text-spotify-light">–</td>';

      tr.innerHTML = `
        <td class="px-5 py-3.5 font-bold text-lg ${getRankColor(idx + 1)}">${rankDisplay}</td>
        <td class="px-5 py-3.5">
          <div class="flex items-center gap-3">
            ${entry.avatar_url
              ? `<img src="${escapeHtml(entry.avatar_url)}" alt="" class="w-8 h-8 rounded-full object-cover flex-shrink-0" />`
              : `<div class="w-8 h-8 rounded-full bg-spotify-hover flex items-center justify-center text-xs flex-shrink-0">👤</div>`
            }
            <span class="font-medium text-white truncate max-w-[120px] sm:max-w-none">${escapeHtml(entry.username || 'Unknown')}</span>
          </div>
        </td>
        <td class="text-right px-5 py-3.5 font-bold text-spotify-green">${entry.score || 0}</td>
        <td class="text-right px-5 py-3.5 hidden sm:table-cell text-spotify-light">${extraValue}</td>
        ${winPctCell}
      `;
      tableBody.appendChild(tr);
    });
  }

  function renderPodiumEntry(rank, entry, type) {
    const container = $(`podium-${rank}`);
    if (!container || !entry) return;

    const avatarEl = container.querySelector('.podium-avatar');
    const nameEl   = container.querySelector('.podium-name');
    const scoreEl  = container.querySelector('.podium-score');

    if (entry.avatar_url) {
      avatarEl.src = entry.avatar_url;
      avatarEl.alt = entry.username || '';
    } else {
      avatarEl.src = '';
      avatarEl.alt = '';
    }

    nameEl.textContent = entry.username || 'Unknown';
    scoreEl.textContent = entry.score || 0;
  }

  // ── Utilities ─────────────────────────────────────────────────────────────────
  function getRankDisplay(rank) {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return rank;
  }

  function getRankColor(rank) {
    if (rank === 1) return 'text-yellow-400';
    if (rank === 2) return 'text-gray-300';
    if (rank === 3) return 'text-orange-400';
    return 'text-spotify-light';
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
  tabGlobal.addEventListener('click', () => loadLeaderboard('global'));
  tabDaily.addEventListener('click',  () => loadLeaderboard('daily'));
  if (lbRetry) lbRetry.addEventListener('click', () => loadLeaderboard(currentType));

  // ── Init ──────────────────────────────────────────────────────────────────────
  loadLeaderboard('global');

})();
