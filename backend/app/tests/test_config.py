import os

from .. import config


def test_apply_sops_secrets_loads_env(monkeypatch, tmp_path):
    secrets_file = tmp_path / "runtime.secrets.yaml"
    secrets_file.write_text(
        "env:\n  SOPS_TEST_KEY: injected\n", encoding="utf-8"
    )

    monkeypatch.setattr(config, "DEFAULT_SECRETS_FILE", secrets_file)
    monkeypatch.delenv("INSIGHT_SECRETS_FILE", raising=False)
    monkeypatch.delenv("SOPS_TEST_KEY", raising=False)

    config._apply_sops_secrets()

    assert os.environ["SOPS_TEST_KEY"] == "injected"

    # Ensure re-running the loader does not overwrite existing explicit overrides.
    monkeypatch.setenv("SOPS_TEST_KEY", "manual")
    config._apply_sops_secrets()
    assert os.environ["SOPS_TEST_KEY"] == "manual"
