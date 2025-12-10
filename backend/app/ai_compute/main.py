"""Entrypoint for running the AI compute provider."""
from __future__ import annotations

import asyncio
import logging
import signal

from redis.exceptions import ConnectionError as RedisConnectionError

from .config import load_config
from .service import AiComputeService


async def _run_service() -> None:
    config = load_config()
    service = AiComputeService(config)

    loop = asyncio.get_running_loop()

    def _handle_signal() -> None:
        logging.getLogger(__name__).info("Signal received, requesting shutdown")
        service.request_stop()

    for sig in (signal.SIGINT, signal.SIGTERM):  # pragma: no branch - platform dependent
        try:
            loop.add_signal_handler(sig, _handle_signal)
        except NotImplementedError:  # pragma: no cover - Windows
            pass

    try:
        await service.run()
    except RedisConnectionError as exc:
        logging.getLogger(__name__).error(
            "Unable to connect to Redis at %s. Ensure Redis is running and reachable. Original error: %s",
            config.general.redis_url,
            exc,
        )
        raise SystemExit(1)


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )
    try:
        asyncio.run(_run_service())
    except KeyboardInterrupt:  # pragma: no cover - manual interruption
        logging.getLogger(__name__).info("Interrupted by user")


if __name__ == "__main__":
    main()
