const appCache = require('../main/mars');

let Sentry = null;
let Tracing = null;

try {
  Sentry = require("@sentry/node");
  Tracing = require("@sentry/tracing");
} catch (e) {
  Sentry = null;
  Tracing = null;
  console.warn(e.message);
}

class SentryErrorHandler {
  sentryInstance = null;
  isConsoleMessageShown = false;

  getSentry() {
    const sentrySettings = (appCache.settings || {}).SentrySettings || {};
    const dsn = sentrySettings.backendDsn;
    if (!dsn && !this.isConsoleMessageShown) {
      console.warn('No sentry DSN provided. Add it to "SentrySettings" setting as "backendDsn" field to be able to track errors via Sentry');
      this.isConsoleMessageShown = true; // avoid showing the message every time
    }

    if (Sentry && dsn && !this.sentryInstance) {
      Sentry.init({
        dsn: dsn,
        // Set tracesSampleRate to 1.0 to capture 100%
        // of transactions for performance monitoring.
        // We recommend adjusting this value in production
        tracesSampleRate: 1.0,
      });

      this.sentryInstance = Sentry;
    }

    return this.sentryInstance;
  };
}

module.exports = new SentryErrorHandler();
