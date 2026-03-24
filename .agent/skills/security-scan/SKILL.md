# AgentShield - Advanced Security Auditing

## 🎯 Goal
Provide a separate, high-confidence security audit layer to detect vulnerabilities and malicious code.

## 🛠️ Instructions
1.  **Deep Scan**: Use `security_scan.py` and `dependency_analyzer.py` on every major change.
2.  **Heuristic Analysis**: Scan for suspicious patterns (e.g., data exfiltration, obfuscated logic).
3.  **Audit Trail**: Maintain a log of security reviews and findings.
4.  **Blocking**: Flag any code that violates critical security rules (defined in `security-rules.md`).

## 🏁 Workflow
1.  **Trigger**: Run audit on PR/Commit or before deployment.
2.  **Scan**: Execute automated vulnerability scanners.
3.  **Manual Check**: Verify high-risk components (Auth, Data Layer).
