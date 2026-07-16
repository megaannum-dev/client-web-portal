from typing import Protocol


class SourceAdapter(Protocol):
    def __init__(self, db) -> None: ...
