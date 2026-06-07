# Security Policy

## Overview

The Veya SDK (`veya-node`) is the official Node.js client library for the Veya payment platform. We take the security of this package and the merchants who depend on it extremely seriously.

This document explains which versions are supported, how to report a vulnerability responsibly, and what you can expect from us when you do.

---

## Supported Versions

The following versions of `veya-node` are currently receiving security updates:

| Version | Supported          | Notes                        |
|---------|--------------------|------------------------------|
| >= 1.0.0| ✅ Fully supported | Current stable release       |
| < 1.0.0 | ❌ Not supported   | Pre-release versions only    |

We strongly recommend always running the latest patch version within your current major version.

```bash
# Check your current version
npm list veya-node

# Update to latest patch
npm update veya-node
```

---

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues, pull requests, or discussions.**

Public disclosure of a security vulnerability before a fix is available puts every merchant using Veya at risk. We ask that you give us the opportunity to investigate and release a fix before any public disclosure.

### How to Report

Send your report directly to our security team:

```text
Email:          support@veyaos.xyz
Response Time:  Within 24 hours
```

### What to Include in Your Report

Please provide as much of the following as possible to help us reproduce and understand the issue:

1. **Description of the vulnerability**
   - What is the nature of the issue?
   - What component is affected? (e.g., `client.ts`, `webhooks.ts`)
2. **Steps to reproduce**
   - Exact code or commands to trigger the issue
   - Minimal reproduction case if possible
3. **Impact assessment**
   - What could an attacker achieve by exploiting this?
   - Who is affected? (merchants, end customers, the platform)
4. **Environment details**
   - `veya-node` version
   - Node.js version
   - Operating system
5. **Suggested fix (optional)**
   - If you have identified a fix, we welcome the suggestion

---

## Disclosure Policy

We follow a **coordinated disclosure** model:

1. You report privately to `support@veyaos.xyz`
2. We investigate and develop a fix
3. We release the patched version
4. We publish a GitHub Security Advisory
5. Full public disclosure occurs

We aim to release security patches within **14 days** of confirmed vulnerability reports. For critical severity issues, we target **48 hours**.

**We ask that you:**
- ✅ Give us reasonable time to investigate and fix
- ✅ Avoid accessing or modifying other users' data
- ✅ Act in good faith throughout the process
- ✅ Notify us before any public disclosure

**Please do not:**
- ❌ Exploit the vulnerability beyond what is needed to demonstrate the issue
- ❌ Perform denial of service testing
- ❌ Perform social engineering against Veya staff

---

## Security Design of This Package

We believe in transparency about how this SDK is built and what security controls are in place.

### Network Access

This SDK makes HTTPS requests to the Veya API (`https://veyaos.xyz/api/v1`). All network communication:
- Uses HTTPS exclusively (TLS 1.2 minimum).
- Never makes requests to any domain other than the configured `baseUrl` (default: `veyaos.xyz`).
- Never exfiltrates credentials or environment variables to third-party services.
- Never downloads or executes remote code.

### API Key Protection

Your API key is protected within the SDK:
- Never logged or printed to console.
- Hidden from `JSON.stringify()` via `toJSON()` overrides.
- Hidden from `util.inspect()` via custom inspect symbols.
- Never appears in error messages or stack traces.
- Never transmitted to any server other than `veyaos.xyz`.

### Webhook Security

The SDK's webhook verification system:
- Uses HMAC-SHA256 for signature verification.
- Uses constant-time comparison (`crypto.timingSafeEqual`) to prevent timing attacks.
- Enforces a 5-minute replay attack window.
- Rejects future timestamps (clock manipulation).

### Zero External Dependencies

`veya-node` has **zero runtime dependencies**. It uses only Node.js built-in modules (`https`, `http`, `crypto`). This eliminates the entire class of transitive dependency supply chain attacks.

---

## Security Best Practices for Merchants

When integrating `veya-node`, please follow these practices:

### API Key Security

```javascript
// ✅ Correct: Load from environment variables
const veya = new Veya({
  apiKey: process.env.VEYA_API_KEY
});

// ❌ Never: Hardcode in source code
const veya = new Veya({
  apiKey: 'vk_live_xxxxxxxxxxxx'
});
```

### Webhook Security

```javascript
// ✅ Always verify webhook signatures
app.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  try {
    const event = veya.webhooks.verify(
      req.body,
      req.headers['x-veya-signature']
    );
    // Safe to process
  } catch (err) {
    // Reject — never fulfill orders on failed verification
    return res.sendStatus(400);
  }
});
```

---

## Vulnerability Severity Definitions

| Severity | Description | Target Fix Time |
|----------|-------------|-----------------|
| **Critical** | Remote code execution, credential theft, complete authentication bypass | 48 hours |
| **High** | Significant data exposure, authentication weakness, payment manipulation | 72 hours |
| **Medium** | Limited data exposure, security control bypass with preconditions | 7 days |
| **Low** | Minor information disclosure, defense-in-depth weakness | 14 days |
| **Informational** | Best practice suggestions, theoretical risks | Next release |

---

## Contact

- **Security & Support:** `support@veyaos.xyz`
- **Bugs/Feature Requests:** [GitHub Issues](https://github.com/VeyaOS/veya-node/issues)

*Last Updated: June 2026*
*Version: 1.0.1*
