"""Create or promote an admin account.

    ADMIN_PASSWORD=... python -m app.scripts.create_admin --email admin@example.com

The password is read from the environment (or prompted), never from argv, so it does not
land in shell history or process listings.
"""

import argparse
import getpass
import os
import sys

from app.core.config import get_settings
from app.core.db import make_engine, make_sessionmaker
from app.core.security import hash_password
from app.identity import service as svc


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--email", required=True)
    parser.add_argument("--name", default="Administrator")
    args = parser.parse_args()

    password = os.environ.get("ADMIN_PASSWORD") or getpass.getpass("Admin password: ")
    problem = svc.validate_password(password, args.email)
    if problem:
        print(problem, file=sys.stderr)
        return 1

    sm = make_sessionmaker(make_engine(get_settings().database_url))
    with sm() as db:
        user = svc.get_user_by_email(db, args.email)
        if user is None:
            user = svc.create_user(
                db,
                args.email,
                hash_password(password),
                args.name,
                email_verified=True,
                role="admin",
            )
        else:
            user.role = "admin"
            user.password_hash = hash_password(password)
            user.email_verified_at = user.email_verified_at or svc.now()
            svc.revoke_all_sessions(db, user.id)
        db.commit()
    print(f"Admin ready: {args.email}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
