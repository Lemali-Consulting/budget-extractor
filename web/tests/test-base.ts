/**
 * The Playwright `test` every spec uses: the stock one, with Public Source's
 * analytics answered locally.
 *
 * Every built page carries the Google Analytics and Parse.ly tags. Test runs
 * must not count as readers in Public Source's numbers, and must not depend on
 * those services being reachable, so their scripts are answered here with an
 * empty body and nothing leaves the machine.
 */
import { test as base } from "@playwright/test";
import { ABOUT_INTRO_SEEN_KEY } from "../src/lib/about-intro";

export { expect, type Page } from "@playwright/test";

/** Hosts that serve the analytics scripts or receive their hits. */
export const ANALYTICS_HOSTS = /(^|\.)(googletagmanager\.com|google-analytics\.com|parsely\.com)$/;

export const test = base.extend<{ aboutIntroSeen: boolean }>({
  /**
   * Whether the browser has already been shown the first-visit About popup.
   * True by default, so every other test sees the page a returning reader
   * does; the popup's own tests set it false to start as a first-time reader.
   */
  aboutIntroSeen: [true, { option: true }],
  context: async ({ context, aboutIntroSeen }, use) => {
    await context.route(
      (url) => ANALYTICS_HOSTS.test(url.hostname),
      (route) => route.fulfill({ status: 200, contentType: "application/javascript", body: "" }),
    );
    if (aboutIntroSeen) {
      await context.addInitScript((key) => {
        try {
          localStorage.setItem(key, "1");
        } catch {
          // Pages without storage (about:blank) have no popup to suppress.
        }
      }, ABOUT_INTRO_SEEN_KEY);
    }
    await use(context);
  },
});
