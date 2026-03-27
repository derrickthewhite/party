# E2E Tests

This directory contains Playwright end-to-end tests that run against the live local Party server.

The suite boots the existing Node + PHP local host automatically, uses an isolated SQLite database under `.tmp/e2e/`, and creates isolated browser contexts so multiple users can be simulated at the same time without sharing session cookies.
