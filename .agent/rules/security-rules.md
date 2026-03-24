# Security Best Practices

## 🛡️ Input & Data Protection
- **Validation**: All external input must be validated (Zod, Joi).
- **Sanitization**: Sanitize HTML inputs to prevent XSS.
- **Parameterized Queries**: Always use ORMs (Prisma) or parameterized queries to prevent SQLi.
- **Secrets**: Never hardcode API keys, passwords, or tokens. Use `.env` and secret managers.

## 🔑 Authentication & Authorization
- **JWT Best Practices**: Use short-lived tokens and secure cookie flags (HttpOnly, Secure).
- **RBAC/ABAC**: Verify permissions on the server-side for every request.
- **Rate Limiting**: Implement rate limiting on sensitive endpoints (Login, Reset Password).

## 📡 Networking
- **HTTPS**: Use secure protocols for all communications.
- **CORS**: Enforce strict CORS policies in production.
- **Headers**: Use `helmet` or similar to set secure HTTP headers (HSTS, CSP).

## 🧪 Verification
- **Security Scans**: Run `security_scan.py` regularly.
- **Dependency Audit**: Audit `package.json` for known vulnerabilities.
