const { test, expect } = require("@playwright/test");

const SUPABASE_URL = "https://hywcpnoqqhxvujnimhxl.supabase.co";
const SYNTHETIC_USER_ID = "b0e0b001-1111-4111-8111-000000000001";
const SYNTHETIC_CAMPUS_ID = "b0e0c002-2222-4222-8222-000000000002";
const SYNTHETIC_POST_ID = "b0e0c003-3333-4333-8333-000000000003";

function jsonResponse(body, status = 200) {
  return {
    status,
    contentType: "application/json",
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "apikey, authorization, x-client-info, content-type, prefer, accept-profile, content-profile, x-supabase-api-version",
      "access-control-allow-methods": "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS",
      "access-control-max-age": "86400",
      "cache-control": "no-store",
      vary: "Origin, Access-Control-Request-Headers",
    },
    body: JSON.stringify(body),
  };
}

const syntheticUser = {
  id: SYNTHETIC_USER_ID,
  aud: "authenticated",
  role: "authenticated",
  email: "lost-found-student@example.invalid",
  email_confirmed_at: "2026-10-01T10:00:00.000Z",
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: { display_name: "Synthetic Test Student" },
  created_at: "2026-10-01T09:00:00.000Z",
  updated_at: "2026-10-01T10:00:00.000Z",
};

test("verified synthetic student can open Lost & Found and submit a post for moderation", async ({ page }) => {
  const capturedPostPayloads = [];
  const requestLog = [];
  const accessToken = "synthetic-test-access-token-not-a-real-credential";
  const session = {
    access_token: accessToken,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: "synthetic-test-refresh-token",
    user: syntheticUser,
  };

  // Stub the staging Supabase hostname with a synthetic-only fixture. This test
  // executes the actual frontend auth, routing, composer and submit handlers
  // without writing test records to a real campus database.
  await page.route(SUPABASE_URL + "/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method().toUpperCase();
    requestLog.push({ method, path: url.pathname, search: url.search });

    if (method === "OPTIONS") {
      await route.fulfill({
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-headers": "apikey, authorization, x-client-info, content-type, prefer, accept-profile, content-profile, x-supabase-api-version",
          "access-control-allow-methods": "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS",
          "access-control-max-age": "86400",
          vary: "Origin, Access-Control-Request-Headers",
        },
        body: "",
      });
      return;
    }

    if (url.pathname === "/auth/v1/token" && url.searchParams.get("grant_type") === "password" && method === "POST") {
      const credentials = request.postDataJSON();
      if (credentials?.email !== syntheticUser.email || !credentials?.password) {
        await route.fulfill(jsonResponse({ message: "Invalid synthetic test credentials." }, 400));
        return;
      }
      await route.fulfill(jsonResponse(session));
      return;
    }

    if (url.pathname === "/auth/v1/user" && method === "GET") {
      await route.fulfill(jsonResponse(syntheticUser));
      return;
    }

    if (url.pathname.startsWith("/rest/v1/rpc/")) {
      const rpc = url.pathname.split("/").pop();
      const payload = request.postDataJSON?.() || {};
      if (rpc === "get_my_campus_context") {
        await route.fulfill(jsonResponse([{
          university_id: SYNTHETIC_CAMPUS_ID,
          university_name: "Synthetic Test University",
          state: "Test State",
          verification_status: "verified",
          campus_role: "student",
          membership_status: "active",
        }]));
        return;
      }
      if (rpc === "get_my_community_profile") {
        await route.fulfill(jsonResponse({
          username: "synthetic_student",
          profile_status: "active",
        }));
        return;
      }
      if (rpc === "create_campus_social_post") {
        capturedPostPayloads.push(payload);
        // The real function returns the new post ID. The fixture intentionally
        // does not create a database row or publish a post.
        await route.fulfill(jsonResponse(SYNTHETIC_POST_ID));
        return;
      }
      await route.fulfill(jsonResponse([]));
      return;
    }

    if (url.pathname === "/rest/v1/profiles" && method === "GET") {
      await route.fulfill(jsonResponse({
        id: SYNTHETIC_USER_ID,
        role: "student",
        requested_role: null,
        verification_status: "verified",
        display_name: "Synthetic Test Student",
        avatar_path: null,
      }));
      return;
    }

    if (url.pathname === "/rest/v1/community_posts" && method === "GET") {
      await route.fulfill(jsonResponse([]));
      return;
    }

    if (url.pathname.startsWith("/rest/v1/") && method === "GET") {
      const acceptsObject = (request.headers()["accept"] || "").includes("application/vnd.pgrst.object+json");
      await route.fulfill(jsonResponse(acceptsObject ? {} : []));
      return;
    }

    if (url.pathname.startsWith("/rest/v1/") && ["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
      await route.fulfill(jsonResponse({}));
      return;
    }

    await route.fulfill(jsonResponse({ message: "No synthetic test fixture exists for this endpoint." }, 501));
  });

  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/index.html", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#login-screen")).toBeVisible();
  await page.locator("#auth-email").fill(syntheticUser.email);
  await page.locator("#auth-password").fill("Synthetic-Test-Password-Only");
  await page.locator("#auth-submit").click();

  await expect(page.locator("#workspace")).toBeVisible({ timeout: 15000 });
  await expect(page.locator("#lost-found-nav")).toBeVisible();
  await expect(page.locator("#login-screen")).toBeHidden();

  // First sign-in deliberately opens the welcome tour as a modal; finish it
  // the same way a new student would before interacting with the sidebar.
  const welcomeTour = page.locator("#campus-welcome-tour");
  if (await welcomeTour.isVisible()) {
    await page.locator("#campus-tour-finish").click();
    await expect(welcomeTour).toBeHidden();
  }

  await page.locator("#lost-found-nav").click();
  await expect(page.locator("#page-community")).toBeVisible();
  await expect(page.locator("#community-post-type")).toHaveValue("lost_found");
  await expect(page.locator("#community-post-message")).toContainText(
    "Do not post private contact details or sensitive personal information"
  );
  await expect(page.locator("#community-feed-status")).toContainText("published post", { timeout: 10000 });

  await page.locator("#community-post-title-input").fill("Synthetic Lost & Found test item");
  await page.locator("#community-post-location").fill("General library lobby");
  await page.locator("#community-post-body").fill(
    "Synthetic test description: a blue notebook found near the general library lobby."
  );
  await page.locator("#community-post-submit").click();

  await expect(page.locator("#community-post-message")).toContainText(
    "Your post will appear to other students after moderation",
    { timeout: 10000 }
  );
  expect(capturedPostPayloads).toHaveLength(1);
  expect(capturedPostPayloads[0]).toEqual({
    p_post_type: "lost_found",
    p_title: "Synthetic Lost & Found test item",
    p_body: "Synthetic test description: a blue notebook found near the general library lobby.",
    p_location: "General library lobby",
  });
  expect(requestLog.some((item) => item.path === "/rest/v1/rpc/create_campus_social_post")).toBe(true);
  expect(pageErrors, "the Lost & Found flow should not throw browser runtime errors").toEqual([]);
});
