/**
 * game.js  –  Main game logic for SpotiGuess
 *
 * Uses Spotify Web Playback SDK for full song playback (requires Premium).
 * Snippet durations per attempt:
 */

(function () {
  'use strict';

  // ── State ───────────────────────────────────────────────────────────────────
  const SNIPPET_DURATIONS = [0.02, 0.05, 0.1, 0.5, 2];   // seconds per attempt
  const MAX_ATTEMPTS = 5;

  let state = {
    trackUri: null,
    trackId: null,
    attempt: 0,           // 0-indexed (0 = first attempt not yet made)
    guesses: [],
    gameOver: false,
    player: null,          // Spotify Player instance
    deviceId: null,        // Spotify device ID
    accessToken: null,     // Access token for API calls
    currentSource: null,
    score: 0,
    streak: 0,
    playing: false,
    playTimeout: null,     // Timeout for stopping playback
    likedSongs: [],        // Cache of user's liked songs for suggestions
  };

  // ── DOM refs ─────────────────────────────────────────────────────────────────
  const $ = id => document.getElementById(id);

  const startState     = $('start-state');
  const gameArea       = $('game-area');
  const loadingState   = $('loading-state');
  const errorState     = $('error-state');
  const resultCard     = $('result-card');

  const startBtn       = $('start-btn');
  const newGameBtn     = $('new-game-btn');
  const nextSongBtn    = $('next-song-btn');
  const retryBtn       = $('retry-btn');
  const playBtn        = $('play-btn');
  const playIcon       = $('play-icon');
  const playText       = $('play-text');
  const submitBtn      = $('submit-guess-btn');
  const skipBtn        = $('skip-btn');

  const guessInput     = $('guess-input');
  const prevGuesses    = $('previous-guesses');
  const suggestionsDrop = $('suggestions-dropdown');
  const attemptBadge   = $('attempt-badge');
  const snippetDuration = $('snippet-duration');
  const durationBar    = $('duration-bar');
  const scoreDisplay   = $('score-display');
  const streakDisplay  = $('streak-display');
  const errorTitle     = $('error-title');
  const errorMessage   = $('error-message');

  // Result card refs
  const resultEmoji    = $('result-emoji');
  const resultTitle    = $('result-title');
  const resultSubtitle = $('result-subtitle');
  const albumArt       = $('album-art');
  const trackName      = $('track-name');
  const trackArtists   = $('track-artists');
  const trackAlbum     = $('track-album');
  const pointsDisplay  = $('points-display');
  const resultStreak   = $('result-streak');

  // ── Visibility helpers ───────────────────────────────────────────────────────
  function showOnly(el) {
    [startState, gameArea, loadingState, errorState, resultCard].forEach(e => {
      if (e) e.classList.add('hidden');
    });
    if (el) el.classList.remove('hidden');
  }

  // ── Initialize Spotify Player ────────────────────────────────────────────────
  function initSpotifyPlayer() {
    return new Promise((resolve, reject) => {
      if (!state.accessToken) {
        reject(new Error('No access token available'));
        return;
      }

      // Define the callback for when SDK is ready
      window.onSpotifyWebPlaybackSDKReady = () => {
        const player = new Spotify.Player({
          name: 'SpotiGuess',
          getOAuthToken: cb => { cb(state.accessToken); },
          volume: 0.5,
        });

        player.addListener('player_state_changed', playerStateChanged);
        player.addListener('ready', ({ device_id }) => {
          console.log('Player ready with device:', device_id);
          state.deviceId = device_id;
          resolve(player);
        });
        player.addListener('not_ready', ({ device_id }) => {
          console.error('Device ID has gone offline:', device_id);
        });
        player.addListener('authentication_error', () => {
          reject(new Error('Spotify authentication error'));
        });
        player.addListener('account_error', () => {
          reject(new Error('Spotify account error - Premium required'));
        });
        player.addListener('playback_error', msg => {
          console.error('Spotify playback error:', msg);
        });

        player.connect().then(success => {
          if (!success) {
            reject(new Error('Failed to connect Spotify player'));
          }
        }).catch(err => {
          reject(err);
        });
      };

      // Check if SDK is already loaded
      if (window.Spotify && window.Spotify.Player) {
        window.onSpotifyWebPlaybackSDKReady();
      } else {
        // SDK not loaded yet - wait a bit and retry
        setTimeout(() => {
          if (window.Spotify && window.Spotify.Player) {
            window.onSpotifyWebPlaybackSDKReady();
          } else {
            reject(new Error('Spotify SDK failed to load. Please refresh the page.'));
          }
        }, 1000);
      }
    });
  }

  function playerStateChanged(state_obj) {
    // Handle player state changes if needed
  }

  // ── Update attempt UI ────────────────────────────────────────────────────────
  function refreshAttemptUI() {
    const idx = Math.min(state.attempt, MAX_ATTEMPTS - 1);
    const dur = SNIPPET_DURATIONS[idx];
    const pct = ((idx + 1) / MAX_ATTEMPTS) * 100;

    attemptBadge.textContent = `Attempt ${state.attempt + 1} / ${MAX_ATTEMPTS}`;
    snippetDuration.textContent = dur < 1 ? `${dur}s` : `${dur}s`;
    durationBar.style.width = `${pct}%`;

    // Update dots
    for (let i = 1; i <= MAX_ATTEMPTS; i++) {
      const dot = $(`dot-${i}`);
      dot.classList.remove('used-wrong', 'used-correct', 'active');
      if (i <= state.guesses.length) {
        dot.classList.add(state.guesses[i - 1].correct ? 'used-correct' : 'used-wrong');
      } else if (i === state.attempt + 1) {
        dot.classList.add('active');
      }
    }
  }

  // ── Fetch a new random song ───────────────────────────────────────────────────
  async function loadNewSong() {
    showOnly(loadingState);
    
    // Stop any current playback and clear timeout
    if (state.player) {
      try {
        state.player.pause();
      } catch (e) {
        console.error('Error pausing player:', e);
      }
    }
    if (state.playTimeout) {
      clearTimeout(state.playTimeout);
      state.playTimeout = null;
    }

    try {
      const resp = await fetch('/api/random-song');
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${resp.status}`);
      }
      const data = await resp.json();

      state.trackUri = data.track_uri;
      state.trackId = data.track_id;
      state.accessToken = data.access_token;
      state.attempt = 0;
      state.guesses = [];
      state.gameOver = false;
      state.playing = false;

      // Initialize player if not already done
      if (!state.player) {
        state.player = await initSpotifyPlayer();
      }

      // Fetch liked songs for autocomplete suggestions
      if (state.likedSongs.length === 0) {
        try {
          const likResp = await fetch('/api/liked-songs');
          if (likResp.ok) {
            const likData = await likResp.json();
            state.likedSongs = likData.songs || [];
          }
        } catch (e) {
          console.error('Failed to fetch liked songs:', e);
        }
      }

      prevGuesses.innerHTML = '';
      guessInput.value = '';
      guessInput.disabled = false;
      submitBtn.disabled = false;
      suggestionsDrop.classList.add('hidden');

      refreshAttemptUI();
      showOnly(gameArea);
      playBtn.classList.remove('playing-btn');
      playIcon.textContent = '▶';
      playText.textContent = 'Play Snippet';
      guessInput.focus();

    } catch (err) {
      errorTitle.textContent = 'Could not load song';
      errorMessage.textContent = err.message || 'Please check your internet connection or make sure you have Spotify Premium.';
      showOnly(errorState);
    }
  }

  // ── Playback ──────────────────────────────────────────────────────────────────

  async function playSnippet() {
    if (state.playing) {
      // Pause playback
      if (state.playTimeout) {
        clearTimeout(state.playTimeout);
        state.playTimeout = null;
      }
      try {
        state.player.pause();
      } catch (e) {
        console.error('Error pausing player:', e);
      }
      state.playing = false;
      playBtn.classList.remove('playing-btn');
      playIcon.textContent = '▶';
      playText.textContent = 'Play Snippet';
      return;
    }

    if (!state.trackUri) {
      alert('No song loaded. Try again!');
      return;
    }

    // Ensure player is ready
    if (!state.player || !state.deviceId) {
      playBtn.disabled = true;
      playIcon.textContent = '⏳';
      playText.textContent = 'Initializing…';
      
      try {
        // Wait up to 5 seconds for player to be ready
        let attempts = 0;
        while ((!state.player || !state.deviceId) && attempts < 10) {
          await new Promise(r => setTimeout(r, 500));
          attempts++;
        }

        if (!state.player || !state.deviceId) {
          playBtn.disabled = false;
          playIcon.textContent = '▶';
          playText.textContent = 'Play Snippet';
          alert('⚠️ Spotify player failed to initialize.\n\nMake sure:\n• Spotify app is running on this device\n• You have Spotify Premium\n• Device name matches browser name in Spotify');
          return;
        }
      } catch (err) {
        playBtn.disabled = false;
        playIcon.textContent = '▶';
        playText.textContent = 'Play Snippet';
        alert('Error initializing player: ' + err.message);
        return;
      }
    }

    const dur = SNIPPET_DURATIONS[Math.min(state.attempt, MAX_ATTEMPTS - 1)];
    playBtn.disabled = true;
    playIcon.textContent = '⏳';
    playText.textContent = 'Loading…';

    try {
      // Clear any existing timeout first
      if (state.playTimeout) {
        clearTimeout(state.playTimeout);
        state.playTimeout = null;
      }

      // Play the track via Web API
      const playResp = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${state.deviceId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${state.accessToken}`,
        },
        body: JSON.stringify({ 
          uris: [state.trackUri], 
          position_ms: 0 
        }),
      });

      if (!playResp.ok) {
        const errData = await playResp.json().catch(() => ({}));
        const statusError = playResp.status === 401 ? 'Token expired' 
                          : playResp.status === 404 ? 'Device not found'
                          : playResp.status === 403 ? 'Not authorized'
                          : `HTTP ${playResp.status}`;
        throw new Error(errData.error?.message || statusError);
      }

      // Give player time to start
      await new Promise(r => setTimeout(r, 500));

      state.player.resume();
      state.playing = true;

      playBtn.disabled = false;
      playBtn.classList.add('playing-btn');
      playIcon.textContent = '⏹';
      playText.textContent = `Playing (${dur}s)…`;

      // Stop playback after exact duration
      const stopTimeout = setTimeout(async () => {
        if (state.playing) {
          try {
            await state.player.pause();
          } catch (e) {
            console.error('Error stopping playback:', e);
          }
          state.playing = false;
          state.playTimeout = null;
          playBtn.classList.remove('playing-btn');
          playIcon.textContent = '▶';
          playText.textContent = 'Play Snippet';
        }
      }, Math.round(dur * 1000));

      state.playTimeout = stopTimeout;

    } catch (err) {
      console.error('Playback error:', err);
      playBtn.disabled = false;
      playIcon.textContent = '▶';
      playText.textContent = 'Play Snippet';
      alert('❌ Playback failed: ' + err.message + '\n\nMake sure Spotify is running and this browser tab is selected as the active device.');
    }
  }

  // ── Submit guess ──────────────────────────────────────────────────────────────
  async function submitGuess() {
    const guess = guessInput.value.trim();
    if (!guess || state.gameOver) return;

    submitBtn.disabled = true;
    guessInput.disabled = true;

    try {
      const resp = await fetch('/api/check-guess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guess }),
      });

      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${resp.status}`);
      }

      const data = await resp.json();

      // Record guess
      state.attempt = data.attempt;
      state.guesses.push({ text: guess, correct: data.correct });

      // Render guess pill
      const pill = document.createElement('div');
      pill.className = `guess-pill flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium
        ${data.correct ? 'bg-green-900/60 text-green-300 border border-green-700' : 'bg-red-900/40 text-red-300 border border-red-800'}`;
      pill.innerHTML = `
        <span>${data.correct ? '✅' : '❌'}</span>
        <span class="flex-1 truncate">${escapeHtml(guess)}</span>
        ${data.correct ? '' : `<span class="text-xs opacity-60">~${data.similarity}% match</span>`}
      `;
      prevGuesses.appendChild(pill);

      // Show suggestions if wrong guess
      if (!data.correct && data.suggestions && data.suggestions.length > 0) {
        const suggestionsDiv = document.createElement('div');
        suggestionsDiv.className = 'mt-2 p-2 bg-blue-900/30 border border-blue-700 rounded-lg text-xs text-blue-300';
        suggestionsDiv.innerHTML = `<div class="font-medium mb-1">Did you mean?</div>` +
          data.suggestions.map(s => 
            `<div class="text-blue-200 truncate">• ${escapeHtml(s.name)} - ${escapeHtml(s.artists.join(', '))}</div>`
          ).join('');
        prevGuesses.appendChild(suggestionsDiv);
      }

      if (!data.correct) {
        // Shake the input
        guessInput.classList.add('shake');
        setTimeout(() => guessInput.classList.remove('shake'), 400);
      }

      if (data.game_over) {
        state.gameOver = true;
        if (state.player) state.player.pause();

        // Save score to backend
        const saveResp = await fetch('/api/save-score', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            won: data.correct,
            guesses_used: data.attempt,
            time_seconds: data.time_seconds || null,
          }),
        });

        let saveData = {};
        if (saveResp.ok) {
          saveData = await saveResp.json();
          state.score = saveData.total_score || state.score;
          state.streak = saveData.current_streak || 0;
          scoreDisplay.textContent = state.score;
          streakDisplay.textContent = state.streak;
        }

        showResultCard(data, saveData);

      } else {
        // Game continues - re-enable input for next guess
        refreshAttemptUI();
        guessInput.value = '';
        guessInput.disabled = false;
        submitBtn.disabled = false;
        suggestionsDrop.classList.add('hidden');
        guessInput.focus();
      }

    } catch (err) {
      console.error('Error:', err);
      submitBtn.disabled = false;
      guessInput.disabled = false;
      suggestionsDrop.classList.add('hidden');
      alert('Error checking guess: ' + err.message);
    }
  }

  // ── Update suggestions dropdown ────────────────────────────────────────────────
  function updateSuggestions(searchText) {
    if (!searchText || !state.likedSongs || state.likedSongs.length === 0) {
      suggestionsDrop.classList.add('hidden');
      return;
    }

    const query = searchText.toLowerCase();
    const matches = state.likedSongs.filter(song => {
      const songStr = `${song.name} ${song.artists.join(' ')}`.toLowerCase();
      return songStr.includes(query);
    }).slice(0, 5);

    if (matches.length === 0) {
      suggestionsDrop.classList.add('hidden');
      return;
    }

    suggestionsDrop.innerHTML = matches.map(song => `
      <button class="w-full px-4 py-3 text-left hover:bg-spotify-card transition-colors text-sm border-b border-gray-700 last:border-b-0 cursor-pointer"
              data-song-name="${escapeHtml(song.name)}">
        <p class="text-white font-medium truncate">${escapeHtml(song.name)}</p>
        <p class="text-xs text-spotify-light truncate">${escapeHtml(song.artists.join(', '))}</p>
      </button>
    `).join('');

    suggestionsDrop.classList.remove('hidden');

    // Add click handlers to suggestions
    suggestionsDrop.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        guessInput.value = btn.dataset.songName;
        suggestionsDrop.classList.add('hidden');
        submitGuess();
      });
    });
  }

  // ── Skip/give up ──────────────────────────────────────────────────────────────
  async function skipGame() {
    if (state.gameOver) return;
    if (!confirm('Give up and reveal the answer?')) return;

    state.gameOver = true;
    state.attempt = MAX_ATTEMPTS;
    if (state.player) state.player.pause();

    // Force check-guess with obviously wrong guess to trigger game_over server-side
    // Actually: just call save-score with won=false then fetch the track from session
    const resp = await fetch('/api/check-guess', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guess: '___skip___' }),
    }).catch(() => null);

    // Keep submitting wrong guesses until game ends
    let data = resp ? await resp.json().catch(() => null) : null;

    // If still not game_over, call save-score directly
    if (!data || !data.game_over) {
      // Just hit save-score with loss
      const saveResp = await fetch('/api/save-score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ won: false, guesses_used: MAX_ATTEMPTS }),
      }).catch(() => null);

      // Load new song (we won't have track info without game_over response)
      await loadNewSong();
      return;
    }

    const saveResp = await fetch('/api/save-score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        won: false,
        guesses_used: data.attempt,
      }),
    });

    let saveData = {};
    if (saveResp.ok) {
      saveData = await saveResp.json();
      state.score = saveData.total_score || state.score;
      state.streak = saveData.current_streak || 0;
      scoreDisplay.textContent = state.score;
      streakDisplay.textContent = state.streak;
    }

    showResultCard(data, saveData);
  }

  // ── Show result card ──────────────────────────────────────────────────────────
  function showResultCard(data, saveData) {
    const won = data.correct;
    const track = data.track || {};

    resultEmoji.textContent = won ? '🎉' : '😞';
    resultTitle.textContent = won ? 'You got it!' : 'Better luck next time!';

    if (won) {
      resultSubtitle.textContent = `Guessed in ${data.attempt} attempt${data.attempt === 1 ? '' : 's'}`;
    } else {
      resultSubtitle.textContent = 'The song was…';
    }

    trackName.textContent = track.name || '–';
    trackArtists.textContent = track.artists ? track.artists.join(', ') : '–';
    trackAlbum.textContent = track.album || '–';

    if (track.album_art) {
      albumArt.classList.remove('hidden');
      albumArt.classList.add('loading');
      albumArt.src = track.album_art;
      albumArt.onload = () => albumArt.classList.remove('loading');
    } else {
      albumArt.classList.add('hidden');
    }

    const pts = saveData.points_earned || 0;
    pointsDisplay.textContent = won ? `+${pts}` : '+0';
    resultStreak.textContent = `${saveData.current_streak || 0} 🔥`;

    showOnly(resultCard);
  }

  // ── Utility ───────────────────────────────────────────────────────────────────
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── Event listeners ───────────────────────────────────────────────────────────
  startBtn.addEventListener('click', loadNewSong);
  newGameBtn.addEventListener('click', loadNewSong);
  nextSongBtn.addEventListener('click', loadNewSong);
  retryBtn.addEventListener('click', loadNewSong);
  playBtn.addEventListener('click', playSnippet);
  skipBtn.addEventListener('click', skipGame);

  submitBtn.addEventListener('click', submitGuess);
  guessInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') submitGuess();
  });
  guessInput.addEventListener('input', e => {
    updateSuggestions(e.target.value);
  });

  // Hide suggestions on blur
  guessInput.addEventListener('blur', () => {
    setTimeout(() => suggestionsDrop.classList.add('hidden'), 200);
  });

  guessInput.addEventListener('focus', () => {
    if (guessInput.value.trim()) {
      updateSuggestions(guessInput.value);
    }
  });

  // ── Init ──────────────────────────────────────────────────────────────────────
  // Load score/streak from server on page load
  (async function init() {
    try {
      const resp = await fetch('/api/user-stats');
      if (resp.ok) {
        const data = await resp.json();
        state.score = data.user?.total_score || 0;
        state.streak = data.user?.current_streak || 0;
        scoreDisplay.textContent = state.score;
        streakDisplay.textContent = state.streak;
      }
    } catch (_) { /* non-critical */ }

  })();

})();
