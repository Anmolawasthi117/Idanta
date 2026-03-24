"""
Supabase client singleton.
Uses the service-role key for server-side operations (bypasses RLS).
"""

from functools import lru_cache

from supabase import create_client, Client

from app.core.config import settings


@lru_cache()
def get_supabase() -> Client:
    """
    Return a cached Supabase client using the service-role key.
    This client has admin privileges — never expose it to the frontend.
    """
    return create_client(
        settings.SUPABASE_URL,
        settings.SUPABASE_SERVICE_ROLE_KEY,
    )


# Module-level singleton for convenience import
supabase: Client = get_supabase()
