import { randomUUID } from "crypto";
import { Router } from "express";

import {
  DISCORD_CLIENT_ID,
  DISCORD_CLIENT_SECRET,
  DISCORD_REDIRECT_URI,
  FRONTEND_BASE_URL,
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_LINK_REDIRECT_URI,
} from "../config";
import { db } from "../firebase";
import {
  buildClearSessionCookie,
  buildSessionCookie,
  createSessionToken,
  SESSION_COOKIE_NAME,
  verifySessionToken,
} from "../session";
import { ensureUser } from "../users";
import type { AuthProvider, ProviderDocEntry, UserDoc } from "../users";

const authRouter = Router();

const isProd = process.env.NODE_ENV === "production";

const buildAccountRedirectUrl = (params: Record<string, string>) => {
  const url = new URL("/settings/account", FRONTEND_BASE_URL);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });
  return url.toString();
};

const formatAuthUser = (user: UserDoc) => {
  const formattedProviders: Partial<Record<AuthProvider, ProviderDocEntry>> = {};
  (["discord", "google"] as AuthProvider[]).forEach((provider) => {
    const entry = user.providers?.[provider];
    if (entry) {
      formattedProviders[provider] = entry;
    }
  });

  return {
    id: user.userId,
    displayName: user.profile?.displayName ?? user.displayName,
    avatarUrl: user.avatarUrl,
    provider: user.primaryProvider,
    providers: formattedProviders,
    roles: user.roles,
    createdAt: user.createdAt?.toDate().toISOString(),
    lastLoginAt: user.lastLoginAt?.toDate().toISOString(),
  };
};

const getSessionUser = async (token?: string | null): Promise<UserDoc | null> => {
  if (!token) return null;
  const payload = verifySessionToken(token);
  if (!payload) return null;

  const doc = await db.collection("users").doc(payload.userId).get();
  if (!doc.exists) return null;

  return doc.data() as UserDoc;
};

const buildStateCookie = (state: string) => {
  const parts = [
    `sfdatahub_oauth_state=${state}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/auth/discord",
    "Max-Age=300",
  ];
  if (isProd) {
    parts.push("Secure");
  }
  return parts.join("; ");
};

const clearStateCookie = () => {
  const parts = [
    "sfdatahub_oauth_state=",
    "HttpOnly",
    "SameSite=Lax",
    "Path=/auth/discord",
    "Max-Age=0",
  ];
  if (isProd) {
    parts.push("Secure");
  }
  return parts.join("; ");
};

const buildGoogleLinkStateCookie = (state: string) => {
  const parts = [
    `sfdatahub_google_link_state=${state}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/auth/google",
    "Max-Age=300",
  ];
  if (isProd) {
    parts.push("Secure");
  }
  return parts.join("; ");
};

const clearGoogleLinkStateCookie = () => {
  const parts = [
    "sfdatahub_google_link_state=",
    "HttpOnly",
    "SameSite=Lax",
    "Path=/auth/google",
    "Max-Age=0",
  ];
  if (isProd) {
    parts.push("Secure");
  }
  return parts.join("; ");
};

authRouter.get("/session", async (req, res) => {
  try {
    const user = await getSessionUser(req.cookies?.[SESSION_COOKIE_NAME]);
    if (!user) {
      return res.json({ authenticated: false });
    }

    return res.json({
      authenticated: true,
      user: formatAuthUser(user),
    });
  } catch (error) {
    console.error("[auth] Failed to fetch session user", error);
    return res.json({ authenticated: false });
  }
});

authRouter.post("/logout", (req, res) => {
  res.setHeader("Set-Cookie", buildClearSessionCookie());
  return res.json({ ok: true });
});

authRouter.get("/discord/login", (req, res) => {
  if (!DISCORD_CLIENT_ID || !DISCORD_REDIRECT_URI) {
    return res.status(500).json({ error: "Discord OAuth not configured" });
  }

  const state = randomUUID();
  const authorizeUrl = new URL("https://discord.com/oauth2/authorize");
  authorizeUrl.searchParams.set("client_id", DISCORD_CLIENT_ID);
  authorizeUrl.searchParams.set("redirect_uri", DISCORD_REDIRECT_URI);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("scope", "identify");
  authorizeUrl.searchParams.set("state", state);

  res.setHeader("Set-Cookie", buildStateCookie(state));
  return res.redirect(authorizeUrl.toString());
});

authRouter.get("/discord/callback", async (req, res) => {
  const { code, state, error: discordError } = req.query;

  if (discordError) {
    return res.status(400).json({ error: discordError });
  }

  if (!code || !state || typeof code !== "string" || typeof state !== "string") {
    return res.status(400).json({ error: "Missing code or state" });
  }

  if (!DISCORD_CLIENT_ID || !DISCORD_CLIENT_SECRET || !DISCORD_REDIRECT_URI) {
    return res.status(500).json({ error: "Discord OAuth not configured" });
  }

  const stateCookie = req.cookies?.sfdatahub_oauth_state;
  if (!stateCookie || stateCookie !== state) {
    return res.status(400).json({ error: "Invalid OAuth state" });
  }

  try {
    const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: DISCORD_REDIRECT_URI,
      }),
    });

    if (!tokenResponse.ok) {
      console.error("[auth] Discord token exchange failed:", await tokenResponse.text());
      return res.status(502).json({ error: "Failed to exchange code with Discord" });
    }

    const tokenPayload = (await tokenResponse.json()) as { access_token?: string };
    if (!tokenPayload.access_token) {
      return res.status(502).json({ error: "Invalid token response from Discord" });
    }

    const userResponse = await fetch("https://discord.com/api/users/@me", {
      headers: {
        Authorization: `Bearer ${tokenPayload.access_token}`,
      },
    });

    if (!userResponse.ok) {
      console.error("[auth] Discord user fetch failed:", await userResponse.text());
      return res.status(502).json({ error: "Failed to fetch user from Discord" });
    }

    const discordUser = await userResponse.json();
    const displayName =
      discordUser.global_name ||
      (discordUser.username
        ? `${discordUser.username}${discordUser.discriminator ? `#${discordUser.discriminator}` : ""}`
        : "Discord User");
    const avatarUrl = discordUser.avatar
      ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
      : undefined;

    const userDoc = await ensureUser({
      provider: "discord",
      providerId: discordUser.id,
      displayName,
      avatarUrl,
    });

    const sessionToken = createSessionToken(userDoc);
    const cookies = [buildSessionCookie(sessionToken), clearStateCookie()];

    res.setHeader("Set-Cookie", cookies);
    return res.redirect(FRONTEND_BASE_URL);
  } catch (error) {
    console.error("[auth] Discord callback failed", error);
    return res.status(500).json({ error: "Discord OAuth callback failed" });
  }
});

authRouter.get("/google/link/start", async (req, res) => {
  try {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_LINK_REDIRECT_URI) {
      return res.status(500).json({ error: "Google OAuth not configured" });
    }

    const user = await getSessionUser(req.cookies?.[SESSION_COOKIE_NAME]);
    if (!user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const state = randomUUID();
    const authorizeUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authorizeUrl.searchParams.set("client_id", GOOGLE_CLIENT_ID);
    authorizeUrl.searchParams.set("redirect_uri", GOOGLE_LINK_REDIRECT_URI);
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("scope", "openid profile");
    authorizeUrl.searchParams.set("state", state);
    authorizeUrl.searchParams.set("prompt", "consent");

    res.setHeader("Set-Cookie", buildGoogleLinkStateCookie(state));
    return res.redirect(authorizeUrl.toString());
  } catch (error) {
    console.error("[auth] Failed to start Google linking", error);
    return res.status(500).json({ error: "Failed to start Google linking" });
  }
});

authRouter.get("/google/link/callback", async (req, res) => {
  const { code, state, error: googleError } = req.query;

  if (googleError) {
    console.warn("[auth] Google link callback returned error", googleError);
    res.setHeader("Set-Cookie", clearGoogleLinkStateCookie());
    return res.redirect(buildAccountRedirectUrl({ error: "google_link_failed" }));
  }

  if (!code || !state || typeof code !== "string" || typeof state !== "string") {
    res.setHeader("Set-Cookie", clearGoogleLinkStateCookie());
    return res.status(400).send("Missing code or state.");
  }

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_LINK_REDIRECT_URI) {
    res.setHeader("Set-Cookie", clearGoogleLinkStateCookie());
    return res.status(500).send("Google OAuth not configured.");
  }

  const currentUser = await getSessionUser(req.cookies?.[SESSION_COOKIE_NAME]);
  if (!currentUser) {
    res.setHeader("Set-Cookie", clearGoogleLinkStateCookie());
    return res.status(401).send("Linking failed – please log in and try again.");
  }

  const stateCookie = req.cookies?.sfdatahub_google_link_state;
  if (!stateCookie || stateCookie !== state) {
    res.setHeader("Set-Cookie", clearGoogleLinkStateCookie());
    return res.status(400).send("Invalid or expired state. Please start over.");
  }

  try {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: GOOGLE_LINK_REDIRECT_URI,
        grant_type: "authorization_code",
      }).toString(),
    });

    if (!tokenResponse.ok) {
      console.error("[auth] Google token exchange failed:", await tokenResponse.text());
      res.setHeader("Set-Cookie", clearGoogleLinkStateCookie());
      return res.status(502).send("Failed to exchange code with Google.");
    }

    const tokenPayload = (await tokenResponse.json()) as { access_token?: string };
    if (!tokenPayload.access_token) {
      res.setHeader("Set-Cookie", clearGoogleLinkStateCookie());
      return res.status(502).send("Invalid token response from Google.");
    }

    const userResponse = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: {
        Authorization: `Bearer ${tokenPayload.access_token}`,
      },
    });

    if (!userResponse.ok) {
      console.error("[auth] Google user fetch failed:", await userResponse.text());
      res.setHeader("Set-Cookie", clearGoogleLinkStateCookie());
      return res.status(502).send("Failed to fetch user info from Google.");
    }

    const googleUser = (await userResponse.json()) as {
      sub?: string;
      name?: string;
      picture?: string;
    };

    if (!googleUser?.sub) {
      res.setHeader("Set-Cookie", clearGoogleLinkStateCookie());
      return res.status(500).send("Google profile is missing an ID.");
    }

    const googleId = googleUser.sub;
    const googleDisplayName = googleUser.name?.trim() || "Google User";
    const googleAvatar = typeof googleUser.picture === "string" ? googleUser.picture : undefined;

    const conflictSnapshot = await db
      .collection("users")
      .where("providers.google.id", "==", googleId)
      .limit(1)
      .get();

    const conflictingDoc = conflictSnapshot.docs[0];
    if (conflictingDoc && conflictingDoc.id !== currentUser.userId) {
      res.setHeader("Set-Cookie", clearGoogleLinkStateCookie());
      return res.redirect(buildAccountRedirectUrl({ error: "google_already_linked" }));
    }

    const userRef = db.collection("users").doc(currentUser.userId);
    const alreadyLinked = currentUser.providers?.google?.id === googleId;

    if (!alreadyLinked) {
      const providerEntry: ProviderDocEntry = {
        id: googleId,
        displayName: googleDisplayName,
      };
      if (googleAvatar) {
        providerEntry.avatarUrl = googleAvatar;
      }

      await userRef.set(
        {
          providers: {
            google: providerEntry,
          },
        },
        { merge: true },
      );
    }

    const updatedSnapshot = await userRef.get();
    if (!updatedSnapshot.exists) {
      res.setHeader("Set-Cookie", clearGoogleLinkStateCookie());
      return res.status(404).send("User not found.");
    }

    const updatedUser = updatedSnapshot.data() as UserDoc;
    const sessionToken = createSessionToken(updatedUser);
    res.setHeader("Set-Cookie", [buildSessionCookie(sessionToken), clearGoogleLinkStateCookie()]);

    return res.redirect(buildAccountRedirectUrl({ linked: "google" }));
  } catch (error) {
    console.error("[auth] Google link callback failed", error);
    res.setHeader("Set-Cookie", clearGoogleLinkStateCookie());
    return res.status(500).send("Failed to link Google account. Please try again.");
  }
});

const notImplemented = (_req: any, res: any) => {
  res.status(501).json({ error: "Not implemented yet" });
};

authRouter.get("/google/login", notImplemented);
authRouter.get("/google/callback", notImplemented);

const MIN_DISPLAY_NAME = 3;
const MAX_DISPLAY_NAME = 32;
const hasDisallowedChars = (value: string) => /[\u0000-\u001F]/.test(value);

authRouter.patch("/account/profile", async (req, res) => {
  const token = req.cookies?.[SESSION_COOKIE_NAME];
  const payload = token ? verifySessionToken(token) : null;

  if (!payload) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const rawName = req.body?.displayName;
  if (typeof rawName !== "string") {
    return res.status(400).json({ error: "displayName must be a string" });
  }

  const nextName = rawName.trim();
  if (nextName.length < MIN_DISPLAY_NAME || nextName.length > MAX_DISPLAY_NAME) {
    return res
      .status(400)
      .json({ error: `displayName must be between ${MIN_DISPLAY_NAME} and ${MAX_DISPLAY_NAME} characters` });
  }
  if (hasDisallowedChars(nextName)) {
    return res.status(400).json({ error: "displayName contains invalid characters" });
  }

  try {
    const userRef = db.collection("users").doc(payload.userId);
    const snapshot = await userRef.get();
    if (!snapshot.exists) {
      return res.status(404).json({ error: "User not found" });
    }

    const existing = snapshot.data() as UserDoc;
    const updatedProfile = {
      ...(existing.profile ?? {}),
      displayName: nextName,
    };

    await userRef.set(
      {
        profile: updatedProfile,
      },
      { merge: true },
    );

    const updatedUser: UserDoc = {
      ...existing,
      profile: updatedProfile,
    };

    const sessionToken = createSessionToken(updatedUser);
    res.setHeader("Set-Cookie", buildSessionCookie(sessionToken));

    return res.json({
      authenticated: true,
      user: formatAuthUser(updatedUser),
    });
  } catch (error) {
    console.error("[auth] Failed to update profile", error);
    return res.status(500).json({ error: "Failed to update profile" });
  }
});

export default authRouter;
