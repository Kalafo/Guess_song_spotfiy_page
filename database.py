"""
database.py - Database setup and initialization using SQLAlchemy with PostgreSQL.
"""

import os
from flask_sqlalchemy import SQLAlchemy

# Single SQLAlchemy instance shared across the app
db = SQLAlchemy()


def init_db(app):
    """Initialize the database with the Flask app."""
    database_url = os.environ.get("DATABASE_URL", "sqlite:///spotify_game.db")

    # Heroku-style postgres:// URLs need to be updated to postgresql://
    if database_url.startswith("postgres://"):
        database_url = database_url.replace("postgres://", "postgresql://", 1)

    app.config["SQLALCHEMY_DATABASE_URI"] = database_url
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

    db.init_app(app)

    with app.app_context():
        # Import models so SQLAlchemy picks them up
        from models import User, Score  # noqa: F401
        db.create_all()

    return db
