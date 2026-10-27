/**
 * The source of the Worker that carries Sentry's alerts into a Discord channel.
 *
 * Sentry's free plan cannot post to Discord itself, and what an internal integration sends is Sentry's own JSON, not the
 * shape Discord takes. This Worker sits between the two: it checks the request really came from Sentry (the
 * `Sentry-Hook-Signature` header is a hex HMAC-SHA256 of the body under the integration's client secret), turns an issue
 * alert into a Discord embed, and posts it to the channel's webhook.
 *
 * It is a single ES module with no imports, because that is what `Workers.deployScript` uploads. Both secrets arrive as
 * bindings and are never echoed: `SENTRY_CLIENT_SECRET` and `DISCORD_WEBHOOK_URL`. The text below avoids backticks and
 * `${`, so it can sit in a template literal unchanged.
 */
export const SENTRY_RELAY_WORKER_SOURCE = `
const COLORS = { fatal: 0x8b0000, error: 0xe5484d, warning: 0xf5a524, info: 0x3e63dd, debug: 0x889096 };

function clip(text, max) {
  const s = String(text == null ? "" : text);
  return s.length > max ? s.slice(0, max - 1) + "\\u2026" : s;
}

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function sign(secret, text) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text)));
}

function sameText(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Sentry signs JSON.stringify(body), which is the body as sent; the re-serialised form covers a proxy that re-spaced it.
async function verified(secret, raw, signature) {
  if (!secret || !signature) return false;
  if (sameText(await sign(secret, raw), signature)) return true;
  try {
    return sameText(await sign(secret, JSON.stringify(JSON.parse(raw))), signature);
  } catch (e) {
    return false;
  }
}

function tagValue(event, name) {
  const tags = Array.isArray(event.tags) ? event.tags : [];
  for (const tag of tags) {
    if (Array.isArray(tag) && tag[0] === name) return tag[1];
  }
  return undefined;
}

// An issue alert (Sentry-Hook-Resource: event_alert) as a Discord message. Nothing in it can ping anyone.
function format(resource, payload) {
  if (resource !== "event_alert" || !payload || !payload.data || !payload.data.event) return null;
  const event = payload.data.event;
  const level = String(event.level || "error").toLowerCase();
  const fields = [];
  const environment = event.environment || tagValue(event, "environment");
  if (environment) fields.push({ name: "Environment", value: clip(environment, 1024), inline: true });
  fields.push({ name: "Level", value: level, inline: true });
  const project = event.project_name || tagValue(event, "project") || event.project;
  if (project) fields.push({ name: "Project", value: clip(project, 1024), inline: true });
  if (payload.data.triggered_rule) fields.push({ name: "Rule", value: clip(payload.data.triggered_rule, 1024), inline: false });
  const title = event.title || event.message || "Error";
  const embed = {
    title: clip(title, 256),
    description: clip(event.culprit || "", 4096) || undefined,
    color: COLORS[level] || COLORS.error,
    fields: fields,
    timestamp: event.datetime || undefined,
  };
  if (event.web_url) embed.url = event.web_url;
  return { username: "Sentry", allowed_mentions: { parse: [] }, embeds: [embed] };
}

export default {
  async fetch(request, env) {
    if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
    const raw = await request.text();
    if (!(await verified(env.SENTRY_CLIENT_SECRET, raw, request.headers.get("sentry-hook-signature")))) {
      return new Response("Unauthorized", { status: 401 });
    }
    let payload;
    try {
      payload = JSON.parse(raw);
    } catch (e) {
      return new Response("Bad Request", { status: 400 });
    }
    const message = format(request.headers.get("sentry-hook-resource"), payload);
    // A resource this relay does not carry is acknowledged, so Sentry does not retry it.
    if (!message) return new Response(null, { status: 202 });
    if (!env.DISCORD_WEBHOOK_URL) return new Response("Not Configured", { status: 500 });
    const res = await fetch(env.DISCORD_WEBHOOK_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(message),
    });
    return new Response(null, { status: res.ok ? 204 : 502 });
  },
};
`;
