from flask import Flask, jsonify
from sqlalchemy import text

from app.config import Config
from app.extensions import cors, db
from app.routes.admin import admin_bp
from app.routes.dashboard import dashboard_bp
from app.routes.public import public_bp
from app.routes.webhooks import webhook_bp


def create_app(config_object=Config):
    app = Flask(__name__)
    app.config.from_object(config_object)

    db.init_app(app)
    cors.init_app(app, resources={r"/api/*": {"origins": "*"}})

    app.register_blueprint(public_bp)
    app.register_blueprint(webhook_bp)
    app.register_blueprint(admin_bp, url_prefix="/api/v1")
    app.register_blueprint(dashboard_bp, url_prefix="/admin")

    @app.errorhandler(404)
    def not_found(_error):
        return jsonify({"ok": False, "error": "not_found"}), 404

    @app.errorhandler(500)
    def server_error(error):
        app.logger.exception("Unhandled error: %s", error)
        return jsonify({"ok": False, "error": "internal_server_error"}), 500

    @app.cli.command("init-db")
    def init_db_command():
        from app.seed import seed_demo_data

        db.create_all()
        seed_demo_data()
        print("Database initialized.")

    @app.cli.command("check-db")
    def check_db_command():
        with db.engine.connect() as conn:
            conn.execute(text("select 1"))
        print("Database OK.")

    return app
