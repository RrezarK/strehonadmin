/**
 * Health Check Routes
 */

import { Hono } from "npm:hono";

const health = new Hono();

// Health check endpoint
health.get("/health", (c) => {
  return c.json({ 
    status: "ok", 
    timestamp: new Date().toISOString(),
    version: "2.0.0",
    features: {
      reservations: true,
      roomCategories: true,
      rooms: true,
      availabilityRates: true
    }
  });
});

export default health;

