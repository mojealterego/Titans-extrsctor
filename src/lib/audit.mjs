import { createHash } from 'node:crypto';

const signatures = Object.freeze({
  JWT: /ey[A-Za-z0-9_-]{8,}\.ey[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g,
  AWS_KEY_IDENTIFIER: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
  STRIPE_SECRET: /\b(?:sk_live|rk_live)_[A-Za-z0-9]{20,}\b/g,
  BEARER_TOKEN: /\bBearer\s+[A-Za-z0-9._~+/-]{16,}=*/gi,
  PRIVATE_KEY_HEADER: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g
});
export function maskSecrets(text) {
  let result = text;
  for (const [type, expression] of Object.entries(signatures)) {
    result = result.replace(new RegExp(expression.source, expression.flags), '[REDACTED_' + type + ']');
  }
  return result;
}
export function scanExposures(text, { maxFindings = 100 } = {}) {
  const findings = [];
  for (const [type, expression] of Object.entries(signatures)) {
    const regex = new RegExp(expression.source, expression.flags);
    let match;
    while ((match = regex.exec(text)) !== null) {
      findings.push({
        type,
        line: text.slice(0, match.index).split('\n').length,
        fingerprint: createHash('sha256').update(match[0]).digest('hex').slice(0, 12),
        severity: type === 'PRIVATE_KEY_HEADER' || type === 'STRIPE_SECRET' ? 'high' : 'review'
      });
      if (findings.length >= maxFindings) return findings;
    }
  }
  return findings;
}
export function assessHeaders(headers) {
  return [
    'content-security-policy', 'strict-transport-security',
    'x-content-type-options', 'referrer-policy'
  ].filter(name => !headers[name]).map(name => ({ type: 'MISSING_HEADER', name, severity: 'informational' }));
}
