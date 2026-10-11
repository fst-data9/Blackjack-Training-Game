import { randomBytes } from 'node:crypto';

export function adSenseNonce(config) {
  return config.enabled ? randomBytes(16).toString('base64') : undefined;
}

export function withScriptNonce(html, nonce) {
  if (!nonce) return html;
  return html.replace(/<script\b/g, `<script nonce="${nonce}"`);
}

export function contentSecurityDirectives(config, production) {
  const directives = {
    defaultSrc: ["'self'"],
    baseUri: ["'self'"],
    connectSrc: ["'self'", 'https://accounts.google.com', 'https://challenges.cloudflare.com', 'https://cloudflareinsights.com/cdn-cgi/rum'],
    fontSrc: ["'self'", 'data:'],
    formAction: ["'self'"],
    frameAncestors: ["'none'"],
    frameSrc: ["'self'", 'https://accounts.google.com', 'https://challenges.cloudflare.com'],
    imgSrc: ["'self'", 'data:', 'https://*.googleusercontent.com'],
    objectSrc: ["'none'"],
    scriptSrc: ["'self'", 'https://accounts.google.com', 'https://challenges.cloudflare.com', 'https://static.cloudflareinsights.com/beacon.min.js'],
    styleSrc: ["'self'", "'unsafe-inline'", 'https://accounts.google.com'],
    upgradeInsecureRequests: production ? [] : null,
  };
  if (config.enabled) {
    // Google supports nonce-based strict CSP rather than a rolling ad-domain
    // allowlist. HTTPS ad frames/images/connections may use changing domains.
    // https://support.google.com/adsense/answer/16283098
    directives.scriptSrc = [(_req, res) => `'nonce-${res.locals.adSenseNonce}'`, "'strict-dynamic'", "'unsafe-inline'", "'unsafe-eval'", 'https:', 'http:'];
    for (const directive of ['connectSrc', 'frameSrc', 'imgSrc']) directives[directive].push('https:');
  }
  return directives;
}
