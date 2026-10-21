from dataclasses import dataclass


@dataclass(frozen=True)
class Pagination:
    limit: int
    offset: int


def normalize_pagination(limit: int = 100, offset: int = 0, max_limit: int = 500) -> Pagination:
    return Pagination(
        limit=min(max(int(limit), 1), max_limit),
        offset=max(int(offset), 0),
    )
