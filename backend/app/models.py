"""Aggregator: importing this module registers every table on ``Base.metadata``.

Models live in their own feature packages (``app/<feature>/models.py``). Do not
define tables here -- defining them twice raises "Table is already defined".
"""

import app.assistant.models  # noqa: F401
import app.audit.models  # noqa: F401
import app.discovery.models  # noqa: F401
import app.emergency.models  # noqa: F401
import app.feedback.models  # noqa: F401
import app.identity.models  # noqa: F401
import app.medications.models  # noqa: F401
import app.nutrition.models  # noqa: F401
import app.patients.models  # noqa: F401
import app.records.models  # noqa: F401
import app.safety.models  # noqa: F401
import app.sharing.models  # noqa: F401
from app.core.db import Base

__all__ = ["Base"]

