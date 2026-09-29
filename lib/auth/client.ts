"use client";

import { magicLinkClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

// No baseURL: the client talks to the same origin, so no NEXT_PUBLIC_* config is needed.
export const authClient = createAuthClient({ plugins: [magicLinkClient()] });
