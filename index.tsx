/**
 * Main Application Entry Point
 * Modular route-based architecture
 */

import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";

// Import route modules
import health from "./routes/health.tsx";
import admin from "./routes/admin.tsx";
import tenants from "./routes/tenants.tsx";
import users from "./routes/users.tsx";
import plans from "./routes/plans.tsx";
import features from "./routes/features.tsx";
import usage from "./routes/usage.tsx";
import dashboard from "./routes/dashboard.tsx";
import integrations from "./routes/integrations.tsx";
import webhooks from "./routes/webhooks.tsx";
import compliance from "./routes/compliance.tsx";
import security from "./routes/security.tsx";
import settings from "./routes/settings.tsx";
import rooms from "./routes/rooms.tsx";
import notifications from "./routes/notifications.tsx";
import system from "./routes/system.tsx";
import audit from "./routes/audit.tsx";
import guests from "./routes/guests.tsx";
import reservations from "./routes/reservations.tsx";
import loyalty from "./routes/loyalty.tsx";
import availability from "./routes/availability.tsx";
import auth from "./routes/auth.tsx";
import developers from "./routes/developers.tsx";

const app = new Hono();

// Base path for all routes
const BASE_PATH = "/make-server-0bdba248";

// Enable CORS for all routes
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'x-shared-secret'],
  exposeHeaders: ['Content-Length', 'X-Request-Id'],
  maxAge: 86400,
  credentials: true,
}));

// Enable request logging
app.use('*', logger(console.log));

// Mount route modules
// Note: Routes in modules use paths relative to mount point
// e.g., tenants.get("/") mounted at /tenants becomes /tenants/
// e.g., tenants.get("/:id") mounted at /tenants becomes /tenants/:id
app.route(`${BASE_PATH}`, health);
app.route(`${BASE_PATH}/admin`, admin);
app.route(`${BASE_PATH}/tenants`, tenants);
app.route(`${BASE_PATH}/users`, users);
app.route(`${BASE_PATH}/plans`, plans);
app.route(`${BASE_PATH}/features`, features);
app.route(`${BASE_PATH}/usage`, usage);
app.route(`${BASE_PATH}/dashboard`, dashboard);
app.route(`${BASE_PATH}/integrations`, integrations);
app.route(`${BASE_PATH}/webhooks`, webhooks);
app.route(`${BASE_PATH}/compliance`, compliance);
app.route(`${BASE_PATH}/security`, security);
app.route(`${BASE_PATH}/settings`, settings);
app.route(`${BASE_PATH}/rooms`, rooms);
app.route(`${BASE_PATH}`, notifications); // notification-templates, etc. are defined in the router
app.route(`${BASE_PATH}/system`, system);
app.route(`${BASE_PATH}/status`, system);
app.route(`${BASE_PATH}`, system); // verify-database, diagnose-user, etc. are defined in the router
app.route(`${BASE_PATH}/audit-logs`, audit);
app.route(`${BASE_PATH}/api-keys`, audit);
app.route(`${BASE_PATH}/guests`, guests);
app.route(`${BASE_PATH}/reservations`, reservations);
app.route(`${BASE_PATH}`, loyalty); // campaigns, communications, loyalty-programs are defined in the router
app.route(`${BASE_PATH}/availability-rates`, availability);
app.route(`${BASE_PATH}/auth`, auth);
app.route(`${BASE_PATH}/developers`, developers);

// Serve the application
Deno.serve(app.fetch);

