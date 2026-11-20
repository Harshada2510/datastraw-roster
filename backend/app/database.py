import os

from dotenv import load_dotenv
from sqlalchemy import create_engine, URL
from sqlalchemy.orm import sessionmaker, declarative_base

load_dotenv()

# Read database configuration from environment variables
DATABASE_URL = URL.create(
    drivername="mysql+pymysql",
    username=os.getenv("DB_USER"),
    password=os.getenv("DB_PASSWORD"),
    host=os.getenv("DB_HOST", "localhost"),
    port=int(os.getenv("DB_PORT", "3306")),
    database=os.getenv("DB_NAME", "datastraw_roster")
)

# Enable SSL certificate verification when a CA certificate is provided
connect_args = {}

ca_path = os.getenv("DB_SSL_CA")

if ca_path:
    connect_args["ssl"] = {
        "ca": ca_path,
        "check_hostname": True
    }
    connect_args["ssl_verify_cert"] = True
    connect_args["ssl_verify_identity"] = True

# Create database engine
engine = create_engine(
    DATABASE_URL,
    echo=os.getenv("DB_ECHO", "false").lower() == "true",
    pool_pre_ping=True,
    connect_args=connect_args
)

# Create database sessions
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)

# Base class for database models
Base = declarative_base()


# Database dependency for API routes
def get_db():
    db = SessionLocal()

    try:
        yield db
    finally:
        db.close()