"""The seam three execution sources (CRM, IB, PC) plug into.

Each source normalises its own storage (CRM/PC read MariaDB, IB reads a Flex
drop directory or the Flex Web Service) into ``UnifiedExecutionRow``. Swapping
a source's backing store means replacing its module, not this seam — see
``app.core.storage`` for the same pattern applied to file storage.

Filtering by grain (order vs fill) is the caller's job, not the source's.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, ClassVar, Literal, Protocol

if TYPE_CHECKING:
    from datetime import date

    from app.schemas.unified_execution import UnifiedExecutionRow


class SourceUnavailable(RuntimeError):
    """A source could not be read (misconfigured, unreachable, malformed).

    Implementations raise ONLY this; anything else is a bug. The caller
    degrades that source to zero rows plus a warning rather than failing the
    whole view.
    """


class ExecutionSource(Protocol):
    """One trading system's executions, normalised to UnifiedExecutionRow.

    The backing store is the implementation's business: crm/pc read MariaDB,
    ib reads a Flex drop directory or the Flex Web Service. Swapping a
    source's store means replacing its module, not this seam. Filtering by
    grain is the caller's job, not the source's.
    """

    name: ClassVar[Literal["CRM", "IB", "PC"]]

    def days(self) -> list[date]:
        """ET session dates this source has any rows for, newest first."""
        ...

    def rows(self, day: date) -> list[UnifiedExecutionRow]:
        """Both grains for one ET session date, each order followed by its fills."""
        ...
