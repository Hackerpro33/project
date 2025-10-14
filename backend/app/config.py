"""Compatibility shim for legacy ``app.config`` imports.

The project migrated configuration helpers to :mod:`app.core.config`, but a
significant amount of code – including the automated test-suite – still imports
from ``app.config``.  Import-time side effects such as monkeypatching expect to
interact with the authoritative module, so simply re-exporting symbols is not
enough.  Instead we install a lightweight module proxy that forwards attribute
access and mutation to :mod:`app.core.config`.
"""
from __future__ import annotations

import sys
from types import ModuleType

from app.core import config as core_config


class _ConfigProxy(ModuleType):
    """Delegate attribute access and assignment to :mod:`app.core.config`."""

    def __getattr__(self, item):  # type: ignore[override]
        return getattr(core_config, item)

    def __setattr__(self, key, value):  # type: ignore[override]
        setattr(core_config, key, value)


_proxy = _ConfigProxy(__name__)
_proxy.__dict__.update({
    "__doc__": __doc__,
    "__package__": __package__,
    "__file__": __file__,
})

sys.modules[__name__] = _proxy
