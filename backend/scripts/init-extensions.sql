-- Extensions the schema depends on, created once when the container's data
-- directory is first initialised.
--
--   citext   — case-insensitive email uniqueness, enforced by the engine
--              rather than by remembering to .toLowerCase() at every call site
--   pgcrypto — gen_random_uuid() for the uuid primary keys

CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
