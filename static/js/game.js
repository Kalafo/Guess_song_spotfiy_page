/**
 * game.js  –  Main game logic for SpotiGuess
 *
 * Snippet durations per attempt:
 *   1st: 0.1s   2nd: 0.5s   3rd: 1s   4th: 3s   5th: 10s
 */

(function () {
  'use strict';

  // ── State ───────────────────────────────────────────────────────────────────
  const SNIPPET_DURATIONS = [0.1, 0.5, 1, 3, 10];   // seconds per attempt
  const MAX_ATTEMPTS = 5;

  let state = {
    previewUrl: null,
    trackId: null,
    attempt: 0,           // 0-indexed (0 = first attempt not yet made)
    guesses: [],
    gameOver: false,
    audioCtx: null,
    currentSource: null,
    score: 0,
    streak: 0,
    playing: false,
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
    stopAudio();

    try {
      const resp = await fetch('/api/random-song');
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${resp.status}`);
      }
      const data = await resp.json();

      state.previewUrl = data.preview_url;
      state.trackId = data.track_id;
      state.attempt = 0;
      state.guesses = [];
      state.gameOver = false;
      state.playing = false;

      prevGuesses.innerHTML = '';
      guessInput.value = '';

      refreshAttemptUI();
      showOnly(gameArea);
      playBtn.classList.remove('playing-btn');
      playIcon.textContent = '▶';
      playText.textContent = 'Play Snippet';
      guessInput.focus();

    } catch (err) {
      errorTitle.textContent = 'Could not load song';
      errorMessage.textContent = err.message || 'Please check your internet connection.';
      showOnly(errorState);
    }
  }

  // ── Web Audio API playback ────────────────────────────────────────────────────
  function getAudioCtx() {
    if (!state.audioCtx || state.audioCtx.state === 'closed') {
      state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    // Resume if suspended (browser autoplay policy)
    if (state.audioCtx.state === 'suspended') {
      state.audioCtx.resume();
    }
    return state.audioCtx;
  }

  function stopAudio() {
    if (state.currentSource) {
      try { state.currentSource.stop(); } catch (_) { /* already stopped */ }
      state.currentSource = null;
    }
    state.playing = false;
  }

  async function playSnippet() {
    if (state.playing) {
      stopAudio();
      playBtn.classList.remove('playing-btn');
      playIcon.textContent = '▶';
      playText.textContent = 'Play Snippet';
      return;
    }

    const dur = SNIPPET_DURATIONS[Math.min(state.attempt, MAX_ATTEMPTS - 1)];

    playBtn.disabled = true;
    playIcon.textContent = '⏳';
    playText.textContent = 'Loading…';

    try {
      const ctx = getAudioCtx();
      const resp = await fetch(state.previewUrl);
      const arrayBuffer = await resp.arrayBuffer();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

      stopAudio();   // stop any previous

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);

      // Play from offset 0 for `dur` seconds
      source.start(0, 0, dur);
      state.currentSource = source;
      state.playing = true;

      playBtn.disabled = false;
      playBtn.classList.add('playing-btn');
      playIcon.textContent = '⏹';
      playText.textContent = `Playing (${dur}s)…`;

      source.onended = () => {
        state.playing = false;
        state.currentSource = null;
        playBtn.classList.remove('playing-btn');
        playIcon.textContent = '▶';
        playText.textContent = 'Play Snippet';
      };

    } catch (err) {
      playBtn.disabled = false;
      playIcon.textContent = '▶';
      playText.textContent = 'Play Snippet';
      console.error('Audio playback error:', err);
      alert('Could not play audio snippet. Your browser may block autoplay — click anywhere first.');
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

      if (!data.correct) {
        // Shake the input
        guessInput.value = '';
        guessInput.classList.add('shake');
        setTimeout(() => guessInput.classList.remove('shake'), 400);
      }

      if (data.game_over) {
        state.gameOver = true;
        stopAudio();

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
        refreshAttemptUI();
        guessInput.disabled = false;
        submitBtn.disabled = false;
        guessInput.value = '';
        guessInput.focus();
      }

    } catch (err) {
      submitBtn.disabled = false;
      guessInput.disabled = false;
      alert('Error checking guess: ' + err.message);
    }
  }

  // ── Skip/give up ──────────────────────────────────────────────────────────────
  async function skipGame() {
    if (state.gameOver) return;
    if (!confirm('Give up and reveal the answer?')) return;

    state.gameOver = true;
    state.attempt = MAX_ATTEMPTS;
    stopAudio();

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
