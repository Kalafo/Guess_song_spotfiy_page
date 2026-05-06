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

## Project Structure

```
.
├── app.py          # Flask app, all routes and API endpoints
├── models.py       # SQLAlchemy models (User, Score)
├── database.py     # DB initialisation helper
├── requirements.txt
├── .env.example    # Copy to .env and fill in your values
├── templates/
│   ├── base.html
│   ├── login.html
│   ├── game.html
│   ├── leaderboard.html
│   └── profile.html
└── static/
    ├── css/style.css
    └── js/
        ├── game.js
        ├── leaderboard.js
        └── profile.js
```

---

## Setup

### Prerequisites

- Python 3.10+
- PostgreSQL (or SQLite for local dev – no config needed)
- A Spotify Developer account

### 1. Clone the repository

```bash
git clone https://github.com/Kalafo/Guess_song_spotfiy_page.git
cd Guess_song_spotfiy_page
```

### 2. Create a virtual environment and install dependencies

```bash
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 3. Configure Spotify credentials

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)  
2. Create a new app  
3. Add `http://localhost:5000/callback` to the **Redirect URIs**  
4. Copy your **Client ID** and **Client Secret**

### 4. Set environment variables

```bash
cp .env.example .env
```

Edit `.env`:

```env
SPOTIFY_CLIENT_ID=your_client_id
SPOTIFY_CLIENT_SECRET=your_client_secret
SPOTIFY_REDIRECT_URI=http://localhost:5000/callback
SECRET_KEY=some-random-secret-string
DATABASE_URL=postgresql://user:password@localhost:5432/spotify_game
```

> **SQLite fallback**: If you don't have PostgreSQL, omit `DATABASE_URL` and
> a local `spotify_game.db` file will be created automatically.

### 5. Set up the database

The database tables are created automatically on first run via `db.create_all()`.

If you're using PostgreSQL, create the database first:

```sql
CREATE DATABASE spotify_game;
```

### 6. Run the development server

```bash
python app.py
```

Open [http://localhost:5000](http://localhost:5000) in your browser.

---

## API Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/login` | Login page |
| `GET` | `/auth/spotify` | Start Spotify OAuth flow |
| `GET` | `/callback` | OAuth callback |
| `GET` | `/logout` | Clear session |
| `GET` | `/game` | Main game page |
| `GET` | `/leaderboard` | Leaderboard page |
| `GET` | `/profile` | Profile/stats page |
| `GET` | `/api/random-song` | Fetch a random liked song |
| `POST` | `/api/check-guess` | Validate a guess |
| `POST` | `/api/save-score` | Save the round result |
| `GET` | `/api/leaderboard` | Leaderboard data (`?type=global\|daily`) |
| `GET` | `/api/user-stats` | Current user's stats |

---

## Deployment (Production)

```bash
# Using gunicorn
gunicorn -w 4 -b 0.0.0.0:5000 app:app
```

Set the following environment variables on your host:

```
SPOTIFY_CLIENT_ID=...
SPOTIFY_CLIENT_SECRET=...
SPOTIFY_REDIRECT_URI=https://your-domain.com/callback
SECRET_KEY=<strong-random-secret>
DATABASE_URL=postgresql://...
FLASK_ENV=production
FLASK_DEBUG=0
```

---

## Game Rules

1. Click **Start Game** to receive a random song from your Spotify liked library  
2. Press **Play Snippet** to hear a tiny clip  
3. Type your guess and press **Guess** (or Enter)  
4. Wrong guesses reveal progressively longer clips  
5. You have **5 attempts** before the answer is revealed  
6. Scoring: 5 pts for 1st attempt, 4 for 2nd, 3 for 3rd, 2 for 4th, 1 for 5th  

---

## License

MIT

