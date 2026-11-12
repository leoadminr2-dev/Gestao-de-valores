import {assignNumbers, DrawError} from "./draw-allocation.mjs";

const EXPECTED_ORIGIN = "https://headless-fzouiqsvegf-leoadminr2-140a.wix-site-host.com";

export function createDrawRoute({pool, readBody, json, enabled, turnstileSecret}) {
  return async (req, res, url) => {
    if (url.pathname !== "/api/draw/allocate") return false;
    const origin = String(req.headers.origin || "");
    if (origin !== EXPECTED_ORIGIN) {
      json(res, 403, {error: "invalid_origin"});
      return true;
    }
    res.setHeader("Access-Control-Allow-Origin", EXPECTED_ORIGIN);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return true;
    }
    if (req.method !== "POST") {
      json(res, 405, {error: "method_not_allowed"});
      return true;
    }
    // Fail closed until legal approval, migration, old-number import,
    // antifraud/captcha configuration, and server tests are complete.
    if (!enabled) {
      json(res, 423, {error: "registration_closed"});
      return true;
    }
    if (!turnstileSecret) {
      json(res, 503, {error: "captcha_not_configured"});
      return true;
    }
    let payload;
    try {
      const raw = await readBody(req);
      payload = JSON.parse(raw.toString("utf8"));
    } catch {
      json(res, 400, {error: "invalid_json"});
      return true;
    }
    const captchaToken = String(payload?.captchaToken || "");
    if (!captchaToken || captchaToken.length > 4096) {
      json(res, 400, {error: "captcha_missing"});
      return true;
    }
    try {
      const challenge = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
        method: "POST",
        body: new URLSearchParams({
          secret: turnstileSecret,
          response: captchaToken,
          remoteip: String(req.headers["cf-connecting-ip"] || "").slice(0, 45)
        }),
        signal: AbortSignal.timeout(10000)
      });
      if (!challenge.ok) throw new Error("captcha_verification_unavailable");
      const result = await challenge.json();
      if (!result.success) {
        json(res, 403, {error: "captcha_invalid"});
        return true;
      }
      const receipt = await assignNumbers(pool, payload);
      json(res, 201, {ok: true, receipt});
      return true;
    } catch (error) {
      const domainError = error instanceof DrawError;
      if (!domainError) console.error("DRAW_ASSIGNMENT_ERROR", String(error.code || error.message).slice(0, 80));
      json(res, domainError ? error.status : 503, {
        error: domainError ? error.code : "temporarily_unavailable",
        message: domainError ? error.message : "Não foi possível confirmar. Nenhum cadastro parcial será exibido."
      });
      return true;
    }
  };
}
