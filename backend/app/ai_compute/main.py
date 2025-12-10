"""Entrypoint for running the AI compute provider."""
from __future__ import annotations

import asyncio
import logging
import signal

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

    await service.run()


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
