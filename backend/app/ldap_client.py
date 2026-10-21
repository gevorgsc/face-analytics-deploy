"""LDAP / Active Directory SSO client."""

import json
import logging
from typing import Optional

logger = logging.getLogger(__name__)


def _get_ldap3():
    try:
        import ldap3
        return ldap3
    except ImportError:
        return None


def ldap_authenticate(server_url: str, bind_dn: Optional[str], bind_password: Optional[str],
                      base_dn: str, search_filter: str, username: str, password: str,
                      admin_groups: list[str], operator_groups: list[str],
                      default_role: str = "viewer") -> Optional[dict]:
    """
    Authenticate a user against LDAP/AD.
    Returns dict with {username, role, display_name, email} or None on failure.
    Requires: pip install ldap3
    """
    ldap3 = _get_ldap3()
    if ldap3 is None:
        logger.error("ldap3 library not installed. Run: pip install ldap3")
        return None

    try:
        server = ldap3.Server(server_url, get_info=ldap3.ALL, connect_timeout=5)

        # Step 1: bind with service account to search for user DN
        if bind_dn and bind_password:
            conn = ldap3.Connection(server, user=bind_dn, password=bind_password,
                                    auto_bind=ldap3.AUTO_BIND_TLS_BEFORE_BIND)
        else:
            conn = ldap3.Connection(server, auto_bind=True)

        # Search for user
        user_filter = search_filter.replace("{username}", username)
        conn.search(base_dn, user_filter, attributes=["dn", "displayName", "mail", "memberOf"])

        if not conn.entries:
            logger.warning("LDAP: user '%s' not found", username)
            return None

        user_entry = conn.entries[0]
        user_dn = str(user_entry.entry_dn)
        display_name = str(user_entry.displayName) if hasattr(user_entry, "displayName") else username
        email = str(user_entry.mail) if hasattr(user_entry, "mail") else None

        # Step 2: re-bind as the found user to verify password
        user_conn = ldap3.Connection(server, user=user_dn, password=password)
        if not user_conn.bind():
            logger.warning("LDAP: password verification failed for '%s'", username)
            return None

        # Step 3: determine role from group memberships
        member_of = []
        if hasattr(user_entry, "memberOf"):
            member_of = [str(g) for g in user_entry.memberOf]

        role = default_role
        for group_dn in admin_groups:
            if group_dn and group_dn in member_of:
                role = "admin"
                break
        if role != "admin":
            for group_dn in operator_groups:
                if group_dn and group_dn in member_of:
                    role = "operator"
                    break

        logger.info("LDAP authentication successful for '%s' → role=%s", username, role)
        return {"username": username, "role": role, "display_name": display_name, "email": email}

    except Exception as e:
        logger.error("LDAP authentication error: %s", e)
        return None


def test_ldap_connection(server_url: str, bind_dn: Optional[str], bind_password: Optional[str]) -> dict:
    """Test LDAP server connectivity."""
    ldap3 = _get_ldap3()
    if ldap3 is None:
        return {"ok": False, "error": "ldap3 not installed. Run: pip install ldap3"}

    try:
        server = ldap3.Server(server_url, connect_timeout=5)
        if bind_dn and bind_password:
            conn = ldap3.Connection(server, user=bind_dn, password=bind_password)
        else:
            conn = ldap3.Connection(server)
        bound = conn.bind()
        return {"ok": bound, "server_info": str(server.info)[:500] if server.info else None}
    except Exception as e:
        return {"ok": False, "error": str(e)}
