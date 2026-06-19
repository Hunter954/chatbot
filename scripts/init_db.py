from app import create_app
from app.extensions import db
from app.seed import seed_demo_data

app = create_app()
with app.app_context():
    if app.config.get("AUTO_CREATE_TABLES"):
        db.create_all()
    if app.config.get("SEED_DEMO"):
        seed_demo_data()
