# api-backend/app/utils/filenames.py
from __future__ import annotations


def fix_mojibake_filename(name: str | None) -> str | None:
    """Browsers that send a non-ASCII filename as a plain multipart
    `filename=` param (no RFC-2231 `filename*=`) get it decoded as latin-1
    by the parser even though the browser encoded it as UTF-8 -- this
    re-decodes it. ponytail: heuristic re-decode, not a parser-level fix;
    upgrade at the multipart-parsing layer if this proves insufficient."""
    if not name:
        return name
    try:
        return name.encode("latin-1").decode("utf-8")
    except UnicodeError:
        return name
