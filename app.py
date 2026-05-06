"""
app.py - Flask backend for the Spotify Song Guessing Game.

Routes:
  GET  /                  - Redirect to login or game
  GET  /login             - Begin Spotify OAuth flow
  GET  /callback          - OAuth callback from Spotify
  GET  /logout            - Clear session and redirect to login
  GET  /game              - Main game page
  GET  /leaderboard       - Leaderboard page
  GET  /profile           - User profile/stats page

API endpoints (JSON):
  POST /api/check-guess   - Validate the user's guess with fuzzy matching
  GET  /api/leaderboard   - Return top scores (query ?type=daily|global)
  GET  /api/user-stats    - Return the current user's aggregate stats
  POST /api/save-score    - Persist result of a finished game round
"""

import os
import random
import time
from datetime import datetime, timezone, timedelta
from functools import wraps

import spotipy
from dotenv import load_dotenv
from flask import (
    Flask,
    redirect,
    render_template,
    request,
    session,
    jsonify,
    url_for,
)
from flask_session import Session
from fuzzywuzzy import fuzz
from spotipy.oauth2 import SpotifyOAuth

from database import db, init_db
from models import User, Score

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------

load_dotenv()

app = Flask(__name__)

# Secret key for Flask sessions
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "dev-secret-key-change-in-production")

# Server-side session (filesystem)
app.config["SESSION_TYPE"] = "filesystem"
app.config["SESSION_FILE_DIR"] = os.path.join(os.path.dirname(__file__), "flask_session")
app.config["SESSION_PERMANENT"] = True
app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(days=7)
app.config["SESSION_USE_SIGNER"] = True
os.makedirs(app.config["SESSION_FILE_DIR"], exist_ok=True)

Session(app)

# Database
init_db(app)

# ---------------------------------------------------------------------------
# Spotify OAuth helpers
# ---------------------------------------------------------------------------

SPOTIFY_SCOPES = "user-library-read user-read-private user-read-email streaming"


def _make_sp_oauth():
    """Create a SpotifyOAuth instance using environment variables."""
    return SpotifyOAuth(
        client_id=os.environ.get("SPOTIFY_CLIENT_ID"),
        client_secret=os.environ.get("SPOTIFY_CLIENT_SECRET"),
        redirect_uri=os.environ.get("SPOTIFY_REDIRECT_URI", "http://localhost:5000/callback"),
        scope=SPOTIFY_SCOPES,
        cache_handler=spotipy.cache_handler.FlaskSessionCacheHandler(session),
        show_dialog=True,
    )


def _get_spotify_client():
    """Return an authenticated Spotipy client or None if not logged in."""
    access_token = session.get("access_token")
    if not access_token:
        return None
    return spotipy.Spotify(auth=access_token)


def login_required(f):
    """Decorator that redirects unauthenticated users to /login."""

    @wraps(f)
    def decorated(*args, **kwargs):
        if not session.get("user_id"):
            return redirect(url_for("login"))
        return f(*args, **kwargs)

    return decorated


def _check_premium(sp):
    """Check if the current user has Spotify Premium. Returns True if Premium, False otherwise."""
    try:
        user = sp.current_user()
        product = user.get("product", "").lower()
        return product == "premium"
    except Exception:
        return False


# ---------------------------------------------------------------------------
# Helper: fetch all liked songs and cache in session
# ---------------------------------------------------------------------------

def _fetch_liked_songs(sp):
    """
    Fetch user's saved tracks from Spotify.
    Returns a list of track dicts with at least: id, name, artists, preview_url, album.
    Results are cached in the session for the duration of the login.
    """
    if "liked_songs" in session and session["liked_songs"]:
        return session["liked_songs"]

    tracks = []
    limit = 50
    offset = 0

    while True:
        results = sp.current_user_saved_tracks(limit=limit, offset=offset)
        items = results.get("items", [])
        if not items:
            break
        for item in items:
            track = item.get("track")
            if track:
                tracks.append(
                    {
                        "id": track["id"],
                        "name": track["name"],
                        "artists": [a["name"] for a in track.get("artists", [])],
                        "preview_url": track.get("preview_url"),
                        "album": track.get("album", {}).get("name", ""),
                        "album_art": (
                            track.get("album", {}).get("images", [{}])[0].get("url", "")
                            if track.get("album", {}).get("images")
                            else ""
                        ),
                    }
                )
        # Spotify caps liked songs at 50 per request; paginate
        if results.get("next") is None:
            break
        offset += limit

    session["liked_songs"] = tracks
    return tracks


# ---------------------------------------------------------------------------
# Page routes
# ---------------------------------------------------------------------------


@app.route("/")
def index():
    if session.get("user_id"):
        return redirect(url_for("game"))
    return redirect(url_for("login"))


@app.route("/login")
def login():
    if session.get("user_id"):
        return redirect(url_for("game"))
    return render_template("login.html")


@app.route("/auth/spotify")
def auth_spotify():
    """Redirect user to Spotify's authorization page."""
    sp_oauth = _make_sp_oauth()
    auth_url = sp_oauth.get_authorize_url()
    return redirect(auth_url)


@app.route("/callback")
def callback():
    """Handle Spotify OAuth callback."""
    sp_oauth = _make_sp_oauth()
    error = request.args.get("error")
    if error:
        return redirect(url_for("login") + "?error=" + error)

    code = request.args.get("code")
    if not code:
        return redirect(url_for("login") + "?error=no_code")

    token_info = sp_oauth.get_access_token(code, as_dict=True)
    if not token_info:
        return redirect(url_for("login") + "?error=token_error")

    # Check if user has Spotify Premium
    sp = spotipy.Spotify(auth=token_info["access_token"])
    if not _check_premium(sp):
        return redirect(url_for("login") + "?error=not_premium")

    # Fetch basic user profile
    spotify_user = sp.current_user()

    spotify_id = spotify_user["id"]
    username = spotify_user.get("display_name") or spotify_id
    avatar_url = (
        spotify_user.get("images", [{}])[0].get("url", "") if spotify_user.get("images") else ""
    )

    # Upsert user in database
    user = User.query.filter_by(spotify_id=spotify_id).first()
    if not user:
        user = User(
            spotify_id=spotify_id,
            username=username,
            display_name=username,
            avatar_url=avatar_url,
        )
        db.session.add(user)
    else:
        user.username = username
        user.display_name = username
        user.avatar_url = avatar_url
        user.updated_at = datetime.now(timezone.utc)

    db.session.commit()

    # Store user info in session (including access token for Web Playback SDK)
    session["user_id"] = user.id
    session["spotify_id"] = spotify_id
    session["username"] = username
    session["avatar_url"] = avatar_url
    session["access_token"] = token_info["access_token"]

    return redirect(url_for("game"))


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))


@app.route("/game")
@login_required
def game():
    return render_template("game.html", username=session.get("username"), avatar_url=session.get("avatar_url"))


@app.route("/leaderboard")
@login_required
def leaderboard_page():
    return render_template("leaderboard.html", username=session.get("username"), avatar_url=session.get("avatar_url"))


@app.route("/profile")
@login_required
def profile():
    return render_template(
        "profile.html",
        username=session.get("username"),
        avatar_url=session.get("avatar_url"),
        spotify_id=session.get("spotify_id"),
    )


# ---------------------------------------------------------------------------
# API routes
# ---------------------------------------------------------------------------


@app.route("/api/random-song")
@login_required
def random_song():
    """
    Return a random song with Spotify URI for playback.
    Can fetch from liked songs (default) or a specific playlist.
    Query params:
      playlist_id = Spotify playlist ID (optional; if not provided, uses liked songs)
    Stores the current song in the session so /api/check-guess can validate.
    Requires Spotify Premium for full playback.
    """
    sp = _get_spotify_client()
    if not sp:
        return jsonify({"error": "Not authenticated with Spotify"}), 401

    try:
        tracks = _fetch_liked_songs(sp)
    except spotipy.SpotifyException:
        return jsonify({"error": "Spotify API error. Please try again."}), 502

    if not tracks:
        return jsonify({"error": "No songs found"}), 404

    track = random.choice(tracks)

    # Save answer in session (never sent to client)
    session["current_track"] = {
        "id": track["id"],
        "name": track["name"],
        "artists": track["artists"],
        "album": track["album"],
        "album_art": track["album_art"],
        "uri": f"spotify:track:{track['id']}",  # For Web Playback SDK
    }
    session["game_start_time"] = time.time()
    session["attempts"] = 0
    session.modified = True

    # Return only safe info to the client (no track name/artists yet)
    return jsonify(
        {
            "track_uri": f"spotify:track:{track['id']}",
            "track_id": track["id"],
            "access_token": session.get("access_token"),  # For Web Playback SDK
        }
    )


@app.route("/api/check-guess", methods=["POST"])
@login_required
def check_guess():
    """
    Accept a guess from the frontend and validate it with fuzzy matching.
    Returns whether the guess was correct, the attempt number, and closest matching songs.
    """
    current_track = session.get("current_track")
    if not current_track:
        return jsonify({"error": "No active game - fetch a song first"}), 400

    data = request.get_json(silent=True) or {}
    guess = data.get("guess", "").strip()
    if not guess:
        return jsonify({"error": "No guess provided"}), 400

    attempts = session.get("attempts", 0) + 1
    session["attempts"] = attempts

    correct_name = current_track["name"]

    # Fuzzy match: compare guess to the song title (case-insensitive)
    score = fuzz.token_sort_ratio(guess.lower(), correct_name.lower())
    is_correct = score >= 75  # 75% similarity threshold

    max_attempts = 5
    game_over = is_correct or attempts >= max_attempts

    # Get liked songs for suggestions
    try:
        sp = _get_spotify_client()
        liked_songs = _fetch_liked_songs(sp) if sp else []
    except spotipy.SpotifyException:
        liked_songs = []

    # Find closest matching songs for suggestions
    matches = []
    if liked_songs:
        for song in liked_songs:
            song_str = f"{song['name']} {' '.join(song['artists'])}".lower()
            match_score = fuzz.token_sort_ratio(guess.lower(), song_str)
            if match_score > 50:
                matches.append({
                    "name": song["name"],
                    "artists": song["artists"],
                    "score": match_score,
                })
    matches = sorted(matches, key=lambda x: x["score"], reverse=True)[:5]

    response = {
        "correct": is_correct,
        "attempt": attempts,
        "max_attempts": max_attempts,
        "game_over": game_over,
        "similarity": score,
        "suggestions": matches,  # Closest matching songs
    }

    if game_over:
        # Always reveal the answer when the game is over
        response["track"] = {
            "name": current_track["name"],
            "artists": current_track["artists"],
            "album": current_track["album"],
            "album_art": current_track["album_art"],
        }

        if is_correct:
            elapsed = time.time() - session.get("game_start_time", time.time())
            response["time_seconds"] = round(elapsed, 2)

    return jsonify(response)


@app.route("/api/save-score", methods=["POST"])
@login_required
def save_score():
    """
    Persist the result of a completed game round to the database.
    Expected JSON body:
      { "won": bool, "guesses_used": int, "time_seconds": float }
    """
    current_track = session.get("current_track")
    if not current_track:
        return jsonify({"error": "No active game"}), 400

    data = request.get_json(silent=True) or {}
    won = bool(data.get("won", False))
    guesses_used = int(data.get("guesses_used", 5))
    time_seconds = data.get("time_seconds")

    # Points: 6 - guesses_used if won, else 0
    points = max(6 - guesses_used, 1) if won else 0

    user = User.query.get(session["user_id"])
    if not user:
        return jsonify({"error": "User not found"}), 404

    # Save score record
    score_record = Score(
        user_id=user.id,
        track_id=current_track["id"],
        track_name=current_track["name"],
        artist_name=", ".join(current_track["artists"]),
        won=won,
        guesses_used=guesses_used,
        points=points,
        time_seconds=time_seconds,
    )
    db.session.add(score_record)

    # Update user aggregate stats
    user.games_played += 1
    user.total_score += points

    if won:
        user.wins += 1
        user.current_streak += 1
        if user.current_streak > user.best_streak:
            user.best_streak = user.current_streak

        # Update average guesses (rolling average over wins only)
        prev_avg = user.avg_guesses or 0.0
        user.avg_guesses = ((prev_avg * (user.wins - 1)) + guesses_used) / user.wins

        # Update fastest win
        if time_seconds is not None:
            if user.fastest_win_seconds is None or time_seconds < user.fastest_win_seconds:
                user.fastest_win_seconds = time_seconds
    else:
        user.current_streak = 0

    user.updated_at = datetime.now(timezone.utc)
    db.session.commit()

    # Clear current game from session
    session.pop("current_track", None)
    session.pop("game_start_time", None)
    session.pop("attempts", None)

    return jsonify(
        {
            "points_earned": points,
            "total_score": user.total_score,
            "current_streak": user.current_streak,
        }
    )


@app.route("/api/leaderboard")
@login_required
def leaderboard_api():
    """
    Return leaderboard data.
    Query params:
      type = 'daily' | 'global' (default: 'global')
      limit = int (default: 20)
    """
    board_type = request.args.get("type", "global")
    limit = min(int(request.args.get("limit", 20)), 100)

    if board_type == "daily":
        today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        # Aggregate scores for today
        from sqlalchemy import func

        rows = (
            db.session.query(
                User.spotify_id,
                User.username,
                User.avatar_url,
                func.sum(Score.points).label("daily_score"),
                func.count(Score.id).label("games_today"),
                func.sum(func.cast(Score.won, db.Integer)).label("wins_today"),
            )
            .join(Score, Score.user_id == User.id)
            .filter(Score.played_at >= today_start)
            .group_by(User.id)
            .order_by(func.sum(Score.points).desc())
            .limit(limit)
            .all()
        )

        leaderboard = [
            {
                "rank": i + 1,
                "spotify_id": row.spotify_id,
                "username": row.username,
                "avatar_url": row.avatar_url,
                "score": int(row.daily_score or 0),
                "games": int(row.games_today or 0),
                "wins": int(row.wins_today or 0),
            }
            for i, row in enumerate(rows)
        ]
    else:
        # Global all-time leaderboard by total_score
        users = (
            User.query.order_by(User.total_score.desc(), User.best_streak.desc())
            .limit(limit)
            .all()
        )
        leaderboard = [
            {
                "rank": i + 1,
                "spotify_id": u.spotify_id,
                "username": u.username,
                "avatar_url": u.avatar_url,
                "score": u.total_score,
                "streak": u.best_streak,
                "wins": u.wins,
                "games": u.games_played,
                "win_percentage": u.win_percentage(),
            }
            for i, u in enumerate(users)
        ]

    return jsonify({"type": board_type, "leaderboard": leaderboard})


@app.route("/api/user-stats")
@login_required
def user_stats():
    """Return aggregate stats for the currently logged-in user."""
    user = User.query.get(session["user_id"])
    if not user:
        return jsonify({"error": "User not found"}), 404

    # Recent 10 games
    recent_scores = (
        Score.query.filter_by(user_id=user.id)
        .order_by(Score.played_at.desc())
        .limit(10)
        .all()
    )

    return jsonify(
        {
            "user": user.to_dict(),
            "recent_games": [s.to_dict() for s in recent_scores],
        }
    )


@app.route("/api/liked-songs")
@login_required
def liked_songs_api():
    """Return user's liked songs for autocomplete suggestions."""
    sp = _get_spotify_client()
    if not sp:
        return jsonify({"error": "Not authenticated with Spotify"}), 401

    try:
        tracks = _fetch_liked_songs(sp)
    except spotipy.SpotifyException:
        return jsonify({"error": "Spotify API error"}), 502

    songs = [
        {
            "id": t["id"],
            "name": t["name"],
            "artists": t["artists"],
        }
        for t in tracks
    ]

    return jsonify({"songs": songs})


@app.errorhandler(404)
def not_found(e):
    return jsonify({"error": "Not found"}), 404


@app.errorhandler(500)
def server_error(e):
    return jsonify({"error": "Internal server error"}), 500


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    debug = os.environ.get("FLASK_DEBUG", "0") == "1"
    app.run(host="0.0.0.0", port=port, debug=debug)
