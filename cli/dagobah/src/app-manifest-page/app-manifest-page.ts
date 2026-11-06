import type { AppManifest } from "../build-app-manifest/index.js";

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

const escapeHtml = (text: string): string => text.replace(/[&<>"']/g, (c) => ESCAPES[c]!);

/**
 * The page the local server shows: a form that posts the manifest to GitHub on load (the manifest flow takes a form
 * post, not a link), with a button for a browser that blocks the script.
 */
export function appManifestPage(action: string, manifest: AppManifest): string {
	return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Create ${escapeHtml(manifest.name)}</title></head>
<body>
<form id="form" method="post" action="${escapeHtml(action)}">
<input type="hidden" name="manifest" value="${escapeHtml(JSON.stringify(manifest))}">
<p>Sending the manifest to GitHub. If nothing happens, <button type="submit">continue</button>.</p>
</form>
<script>document.getElementById("form").submit();</script>
</body>
</html>
`;
}
