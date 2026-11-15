from typing import Annotated

from fastapi import Depends, Query
from pydantic import BaseModel


class PageParams:
    def __init__(
        self,
        limit: Annotated[int, Query(ge=1, le=100)] = 50,
        offset: Annotated[int, Query(ge=0)] = 0,
    ):
        self.limit, self.offset = limit, offset


PageDep = Annotated[PageParams, Depends()]


class Page[T](BaseModel):
    items: list[T]
    total: int
    limit: int
    offset: int
