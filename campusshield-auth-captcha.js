/* CampusShield AI — staging-only Turnstile authentication challenge. */
(() => {
  "use strict";
  const SITE_KEY = "0x4AAAAAAF6tOY7MqWYcC3h8";
  const CONTAINER_ID = "campusshield-auth-captcha";
  const STATUS_ID = "campusshield-captcha-message";
  let widgetId = null;
  let captchaToken = "";

  function setStatus(message, isError = false) {
    const status = document.getElementById(STATUS_ID);
    if (!status) return;
    status.textContent = message;
    status.hidden = !message;
    status.classList.toggle("is-error", Boolean(isError));
  }

  function render() {
    const container = document.getElementById(CONTAINER_ID);
    if (!container || widgetId !== null) return widgetId !== null;
    if (!window.turnstile || typeof window.turnstile.render !== "function") {
      setStatus("Security verification could not load. Refresh the page and try again.", true);
      return false;
    }
    try {
      widgetId = window.turnstile.render(container, {
        sitekey: SITE_KEY,
        theme: "auto",
        callback(token) {
          captchaToken = String(token || "");
          setStatus(captchaToken ? "Security check complete." : "", false);
        },
        "expired-callback"() {
          captchaToken = "";
          setStatus("Your security check expired. Complete it again.", true);
        },
        "timeout-callback"() {
          captchaToken = "";
          setStatus("The security check timed out. Complete it again.", true);
        },
        "error-callback"() {
          captchaToken = "";
          setStatus("The security check failed to load. Refresh the challenge.", true);
        }
      });
      return widgetId !== null && widgetId !== undefined;
    } catch (_error) {
      widgetId = null;
      setStatus("Security verification could not start. Refresh the page and try again.", true);
      return false;
    }
  }

  function getToken() {
    if (!render()) throw new Error("Security verification is unavailable. Refresh the page and try again.");
    if (!captchaToken) throw new Error("Complete the CampusShield security check before continuing.");
    return captchaToken;
  }

  function reset() {
    captchaToken = "";
    if (widgetId !== null && window.turnstile && typeof window.turnstile.reset === "function") {
      try { window.turnstile.reset(widgetId); } catch (_error) {}
    }
    setStatus("", false);
  }

  function setVisible(visible) {
    const field = document.getElementById("campusshield-auth-captcha-field");
    if (!field) return;
    field.hidden = !visible;
    if (visible) render();
    else reset();
  }

  window.CampusShieldCaptcha = Object.freeze({ getToken, reset, setVisible });
  render();
})();
