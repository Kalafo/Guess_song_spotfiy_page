"""
models.py - SQLAlchemy ORM models for users and scores.
"""

from datetime import datetime, timezone
from database import db


class User(db.Model):
    """Stores Spotify users who have played the game."""

    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    spotify_id = db.Column(db.String(255), unique=True, nullable=False, index=True)
    username = db.Column(db.String(255), nullable=False)
    display_name = db.Column(db.String(255), nullable=True)
    avatar_url = db.Column(db.String(512), nullable=True)

    # Aggregated stats
    total_score = db.Column(db.Integer, default=0, nullable=False)
    current_streak = db.Column(db.Integer, default=0, nullable=False)
    best_streak = db.Column(db.Integer, default=0, nullable=False)
    games_played = db.Column(db.Integer, default=0, nullable=False)
    wins = db.Column(db.Integer, default=0, nullable=False)
    # Average number of guesses to win (only counting wins)
    avg_guesses = db.Column(db.Float, default=0.0, nullable=False)
    # Fastest win in seconds (time from start to correct guess)
    fastest_win_seconds = db.Column(db.Float, nullable=True)

    created_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # Relationship to scores
    scores = db.relationship("Score", backref="user", lazy=True, cascade="all, delete-orphan")

    def win_percentage(self):
        """Return win percentage as a float (0-100)."""
        if self.games_played == 0:
            return 0.0
        return round((self.wins / self.games_played) * 100, 1)

    def to_dict(self):
        return {
            "spotify_id": self.spotify_id,
            "username": self.username,
            "display_name": self.display_name,
            "avatar_url": self.avatar_url,
            "total_score": self.total_score,
            "current_streak": self.current_streak,
            "best_streak": self.best_streak,
            "games_played": self.games_played,
            "wins": self.wins,
            "win_percentage": self.win_percentage(),
            "avg_guesses": round(self.avg_guesses, 2),
            "fastest_win_seconds": self.fastest_win_seconds,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class Score(db.Model):
    """Records each individual game round a user plays."""

    __tablename__ = "scores"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)

    # The Spotify track ID that was being guessed
    track_id = db.Column(db.String(255), nullable=False)
    track_name = db.Column(db.String(512), nullable=True)
    artist_name = db.Column(db.String(512), nullable=True)

    # Game outcome
    won = db.Column(db.Boolean, default=False, nullable=False)
    # Number of guesses used (1-5); None if user gave up
    guesses_used = db.Column(db.Integer, nullable=True)
    # Points awarded this round
    points = db.Column(db.Integer, default=0, nullable=False)
    # Time in seconds from first snippet play to correct guess (only if won)
    time_seconds = db.Column(db.Float, nullable=True)

    played_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True,
    )

    def to_dict(self):
        return {
            "id": self.id,
            "track_id": self.track_id,
            "track_name": self.track_name,
            "artist_name": self.artist_name,
            "won": self.won,
            "guesses_used": self.guesses_used,
            "points": self.points,
            "time_seconds": self.time_seconds,
            "played_at": self.played_at.isoformat() if self.played_at else None,
        }
