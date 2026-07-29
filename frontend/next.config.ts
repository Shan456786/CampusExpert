import type { NextConfig } from "next";
import { networkInterfaces } from "os";

// Opening the app from another device on the same network (e.g. a phone
// at http://192.168.1.23:3000) used to leave every button, link, and
// input dead with no visible error - found during a LAN-access
// investigation. Root cause: Next.js's dev server only accepts requests
// whose Origin matches the hostname it was started with (localhost by
// default) unless that origin is explicitly listed here - anything else
// fails the dev-only HMR websocket handshake, which in turn breaks
// hydration entirely, so React never attaches a single event handler and
// the page just sits there inert. This is a deliberate Next.js security
// feature (stops a malicious page on the internet from reaching your dev
// server via DNS rebinding), not a bug - allowedDevOrigins is the
// documented way to opt a specific origin back in for local testing.
//
// allowedDevOrigins only matches exact origin strings, not IP wildcards
// (e.g. "192.168.*.*" isn't valid) - and this machine's actual LAN IP
// isn't knowable in advance, since it depends on whatever network it's
// connected to. So instead of hardcoding one, this reads the real IPv4
// addresses off the machine's own network interfaces at dev-server
// startup and allows all of them - covers home wifi, campus wifi, a
// phone hotspot, etc. without ever needing manual edits here. Runs once,
// in Node, only when the dev config loads - never shipped to the browser.
function detectLanOrigins(): string[] {
  const origins: string[] = [];
  const interfaces = networkInterfaces();
  for (const addresses of Object.values(interfaces)) {
    for (const addr of addresses ?? []) {
      if (addr.family === "IPv4" && !addr.internal) {
        origins.push(addr.address);
      }
    }
  }
  return origins;
}

const nextConfig: NextConfig = {
  allowedDevOrigins: detectLanOrigins(),
};

export default nextConfig;
