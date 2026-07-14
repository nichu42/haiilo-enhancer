# Security Policy

We take the security and privacy of Haiilo Enhancer very seriously. Since the extension runs entirely locally in your browser and does not transmit data to external servers, the security model relies heavily on local browser security boundaries.

## Supported Versions

We actively support and provide security updates for the following versions of Haiilo Enhancer:

| Version | Supported |
| ------- | --------- |
| Latest  | ✅ Yes    |
| < Max   | ❌ No     |

Please ensure you are always running the latest version available on the Chrome Web Store or Firefox Add-ons repository.

## Our Security Commitments

1. **Zero External Data Transmission**: The extension does not collect, log, or send your data (including muted users, settings, and browsing content) to any external server. All state is stored locally within browser storage.
2. **Principle of Least Privilege**: Host permissions are requested only for the standard `*.haiilo.app` and `*.haiilo.com` domains. Custom organization domains require explicit opt-in and runtime permission requests initiated by the user.

## Reporting a Vulnerability

If you discover a security vulnerability in this project, please do not disclose it publicly via issue tracking. Instead, report it responsibly:

- **Email**: Please report the vulnerability to the project maintainer at `nichu42@42bit.email`.
- **Details**: Include a detailed description of the vulnerability, steps to reproduce, and any proof of concept or screenshots/videos that can help us verify and resolve the issue quickly.

We will acknowledge receipt of your vulnerability report within 48 hours and work with you to patch the issue and publish an updated version.
