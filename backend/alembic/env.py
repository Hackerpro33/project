"""Alembic environment configuration."""
from __future__ import annotations

import logging
import os
import sys
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool
from sqlalchemy.exc import DBAPIError, OperationalError

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.append(BASE_DIR)

from app.core.config import get_settings  # noqa: E402
from app.db import Base  # noqa: E402

FORCE_OFFLINE = os.getenv("ALEMBIC_FORCE_OFFLINE", "").lower() in {"1", "true", "yes"}

logger = logging.getLogger("alembic.env")

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

settings = get_settings()
config.set_main_option("sqlalchemy.url", settings.database_url)

target_metadata = Base.metadata


def run_migrations_offline(*, render_as_sql: bool = False) -> None:
    url = config.get_main_option("sqlalchemy.url")
    kwargs = {
        "url": url,
        "target_metadata": target_metadata,
        "literal_binds": True,
    }
    if render_as_sql:
        kwargs.update({"as_sql": True, "dialect_opts": {"paramstyle": "named"}})

    context.configure(**kwargs)

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    try:
        with connectable.connect() as connection:
            context.configure(connection=connection, target_metadata=target_metadata)

            with context.begin_transaction():
                context.run_migrations()
    except (OperationalError, DBAPIError) as exc:
        if FORCE_OFFLINE:
            raise
        logger.info(
            "Database unavailable (%s); automatically rendering migrations in offline mode.",
            exc,
        )
        run_migrations_offline(render_as_sql=True)
    finally:
        connectable.dispose()


if FORCE_OFFLINE:
    logger.info("ALEMBIC_FORCE_OFFLINE set; rendering migrations without a database connection.")
    run_migrations_offline(render_as_sql=True)
elif context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
