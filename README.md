# SpotiGuess 🎵

A full-stack Spotify song guessing game where users identify their own liked songs from tiny audio snippets.

---

## Features

- 🎵 **Your personal library** – plays clips from songs you've already saved on Spotify  
- ⏱️ **Progressive hints** – each wrong guess unlocks a longer audio snippet (0.1 → 0.5 → 1 → 3 → 10 seconds)  
- 🤔 **Fuzzy matching** – close enough spellings still count  
- 🏆 **Leaderboards** – daily and all-time global rankings  
- 📊 **Profile stats** – win percentage, streaks, fastest wins, recent games  
- 🌑 **Dark responsive UI** – works on mobile and desktop  

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python · Flask · Spotipy · Flask-Session |
| Database | PostgreSQL · SQLAlchemy ORM |
| Auth | Spotify OAuth 2.0 |
| Frontend | HTML · Tailwind CSS · Vanilla JS · Web Audio API |
| Fuzzy match | fuzzywuzzy / python-Levenshtein |

---



