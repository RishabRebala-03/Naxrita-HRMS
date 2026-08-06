from flask_pymongo import PyMongo
from dotenv import load_dotenv
import os

load_dotenv()

mongo = PyMongo()

DEFAULT_MONGO_URI = "mongodb://localhost:27017/company_leave_system"

def init_db(app):
    mongo_uri = os.getenv("MONGO_URI", DEFAULT_MONGO_URI)
    if not mongo_uri:
        mongo_uri = DEFAULT_MONGO_URI
    app.config["MONGO_URI"] = mongo_uri
    mongo.init_app(app)