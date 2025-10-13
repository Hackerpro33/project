"""Build a combined coverage badge for backend and frontend suites.

The job downloads coverage artefacts from matrix jobs (Python/Node) and this
script picks the *best* report per platform to avoid double-counting the same
suite while still keeping the highest achieved percentage. The result is
written to ``coverage/coverage.json`` (served via GitHub Pages) and the
existing badge in ``README.md`` is updated to point at the generated endpoint.
"""

from __future__ import annotations

import json
import math
import os
import re
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Iterable, Tuple

COVERAGE_DIR = Path("coverage")
ARTIFACTS_DIR = Path("coverage-artifacts")


def _iter_backend_reports() -> Iterable[Tuple[int, int]]:
    """Yield ``(covered, total)`` tuples from coverage.py XML reports."""

    for report in sorted(ARTIFACTS_DIR.glob("backend/**/*.xml")):
        tree = ET.parse(report)
        root = tree.getroot()
        covered = int(root.get("lines-covered", 0))
        total = int(root.get("lines-valid", 0))
        yield covered, total


def _iter_frontend_reports() -> Iterable[Tuple[int, int]]:
    """Yield ``(covered, total)`` tuples from Vitest coverage summaries."""

    for summary in sorted(ARTIFACTS_DIR.glob("frontend/**/coverage-summary.json")):
        data = json.loads(summary.read_text(encoding="utf-8"))
        lines = data.get("total", {}).get("lines", {})
        covered = int(lines.get("covered", 0))
        total = int(lines.get("total", 0))
        yield covered, total


def _pick_best(results: Iterable[Tuple[int, int]]) -> Tuple[int, int]:
    """Return the tuple with the highest coverage percentage."""

    best_ratio = -1.0
    best_pair = (0, 0)
    for covered, total in results:
        if total <= 0:
            continue
        ratio = covered / total
        if (
            best_ratio < 0
            or ratio > best_ratio
            or (math.isclose(ratio, best_ratio) and covered > best_pair[0])
        ):
            best_ratio = ratio
            best_pair = (covered, total)
    return best_pair


def _pick_color(percentage: float) -> str:
    if percentage >= 90:
        return "brightgreen"
    if percentage >= 80:
        return "green"
    if percentage >= 70:
        return "yellowgreen"
    if percentage >= 60:
        return "yellow"
    return "orange"


def _update_readme(badge_url: str) -> None:
    """Ensure the README contains a badge referencing ``badge_url``."""

    readme = Path("README.md")
    if not readme.exists():
        return

    text = readme.read_text(encoding="utf-8")
    replacement = f"![Coverage badge]({badge_url})"
    pattern = re.compile(r"!\[Coverage badge\]\([^)]+\)")

    if pattern.search(text):
        updated = pattern.sub(replacement, text, count=1)
    else:
        updated = replacement + "\n\n" + text

    if updated != text:
        readme.write_text(updated, encoding="utf-8")


def main() -> None:
    backend_covered, backend_total = _pick_best(_iter_backend_reports())
    frontend_covered, frontend_total = _pick_best(_iter_frontend_reports())

    total_covered = backend_covered + frontend_covered
    total_lines = backend_total + frontend_total
    if total_lines == 0:
        raise SystemExit("No coverage reports found")

    percentage = (total_covered / total_lines) * 100
    message = f"{percentage:.1f}%"
    color = _pick_color(percentage)

    COVERAGE_DIR.mkdir(exist_ok=True)
    (COVERAGE_DIR / ".nojekyll").write_text("", encoding="utf-8")
    badge = {
        "schemaVersion": 1,
        "label": "coverage",
        "message": message,
        "color": color,
    }
    (COVERAGE_DIR / "coverage.json").write_text(
        json.dumps(badge, ensure_ascii=False), encoding="utf-8"
    )

    repository = os.environ.get("GITHUB_REPOSITORY", "OWNER/REPO")
    badge_url = (
        "https://img.shields.io/endpoint?url="
        f"https://raw.githubusercontent.com/{repository}/gh-pages/coverage/coverage.json"
    )
    _update_readme(badge_url)


if __name__ == "__main__":
    main()
