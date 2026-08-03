'use client';

import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';

/**
 * OAuth entry points. These are full page navigations, not fetches: the
 * provider round-trip has to happen in the top-level browsing context, and the
 * backend finishes by setting the refresh cookie and redirecting back.
 */
export function OAuthButtons({ redirectTo }: { redirectTo?: string }) {
  return (
    <div className="grid gap-2">
      <Button
        variant="outline"
        type="button"
        onClick={() => {
          window.location.href = api.oauthUrl('google', redirectTo);
        }}
      >
        <svg className="mr-2 size-4" viewBox="0 0 24 24" aria-hidden>
          <path
            fill="currentColor"
            d="M12.24 10.29v3.62h5.04a4.32 4.32 0 0 1-1.88 2.83v2.35h3.03c1.78-1.64 2.8-4.05 2.8-6.92 0-.67-.06-1.31-.17-1.93z"
          />
          <path
            fill="currentColor"
            d="M12.24 22c2.54 0 4.67-.84 6.19-2.28l-3.03-2.35c-.84.56-1.91.9-3.16.9-2.43 0-4.49-1.64-5.23-3.85H3.9v2.42A9.36 9.36 0 0 0 12.24 22"
          />
          <path
            fill="currentColor"
            d="M7.01 14.42a5.6 5.6 0 0 1 0-3.58V8.42H3.9a9.36 9.36 0 0 0 0 8.42z"
          />
          <path
            fill="currentColor"
            d="M12.24 5.98c1.37 0 2.6.47 3.57 1.4l2.68-2.68C16.9 3.14 14.78 2.2 12.24 2.2A9.36 9.36 0 0 0 3.9 8.42l3.11 2.42c.74-2.21 2.8-3.85 5.23-3.85"
          />
        </svg>
        Continue with Google
      </Button>

      <Button
        variant="outline"
        type="button"
        onClick={() => {
          window.location.href = api.oauthUrl('github', redirectTo);
        }}
      >
        <svg className="mr-2 size-4" viewBox="0 0 24 24" aria-hidden>
          <path
            fill="currentColor"
            d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.1-1.47-1.1-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.56-1.11-4.56-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.5 9.5 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.69-4.57 4.94.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2"
          />
        </svg>
        Continue with GitHub
      </Button>
    </div>
  );
}
