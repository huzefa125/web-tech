/**
 * Test stand-in for `ioredis`.
 *
 * ioredis-mock only has a default export, but the app imports the named
 * `Redis`. This shim provides both so src/lib/redis.ts needs no test-only
 * branching.
 */

import RedisMock from 'ioredis-mock';

export const Redis = RedisMock;
export default RedisMock;
