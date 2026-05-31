# Changelog

All notable changes to the Veya Node.js SDK will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - Initial Release

### Added
- Native Node.js SDK for the VeyaOS API.
- `VeyaClient` with built-in automatic retries and exponential backoff for transient network errors.
- `InvoicesResource` to programmatically create, retrieve, list, and cancel cryptocurrency invoices.
- `CustomersResource` to manage merchant customers and payment histories.
- `WebhooksResource` featuring military-grade cryptographic verification, defending against replay and timing attacks.
- First-class TypeScript definitions for strict compile-time safety.
- Comprehensive custom Error classes (`VeyaRateLimitError`, `VeyaValidationError`, etc.) for robust error handling.
- Internal API key redaction to prevent accidental logging of sensitive merchant keys.
