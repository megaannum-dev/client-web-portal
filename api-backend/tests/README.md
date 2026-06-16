# api-backend test harness (B0)

Pytest harness for the `app` package. There is no `pyproject.toml`/`setup.py`;
`app` is imported from the `api-backend/` working directory, so tests must run
**with `api-backend/` as the cwd**.

## Install

```sh
pip install -r requirements.txt -r requirements-dev.txt
```

## Run (local + CI)

From the `api-backend/` directory:

```sh
# lint
python -m ruff check tests

# tests
python -m pytest -q
```

The suite uses a SQLite in-memory engine (schema built via
`Base.metadata.create_all`, not migrations) and runs with
`FIREBASE_AUTH_DISABLED=true`, so it never touches MariaDB or Firebase.

## CI step

Add the following job step (e.g. GitHub Actions) once CI is introduced — there
is no `.github/` workflow in the repo yet:

```yaml
- name: api-backend tests
  working-directory: api-backend
  run: |
    pip install -r requirements.txt -r requirements-dev.txt
    python -m ruff check tests
    python -m pytest -q
```

## What's provided (fixtures)

| Fixture | Purpose |
|---|---|
| `engine` | per-test SQLite in-memory engine (StaticPool, shared connection) |
| `session_factory` / `db_session` | SQLAlchemy `Session` bound to the test engine |
| `settings` | `Settings(firebase_auth_disabled=True, ...)` |
| `client` | `TestClient` with `get_db` + `get_settings` overridden |
| `fake_firebase` | `FakeFirebaseIdentityService` (substitutes B2's real service) |
| `factories` | row factories: `make_client`, `make_admin`, `make_rm` |

Tests needing custom settings can mutate `app.dependency_overrides[get_settings]`.

`tests/fakes.py` and `tests/factories.py` are importable directly
(`from tests.fakes import FakeFirebaseIdentityService`,
`from tests import factories`).
