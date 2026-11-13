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

export { expect, type Page } from "@playwright/test";

/** Hosts that serve the analytics scripts or receive their hits. */
export const ANALYTICS_HOSTS = /(^|\.)(googletagmanager\.com|google-analytics\.com|parsely\.com)$/;

export const test = base.extend({
  context: async ({ context }, use) => {
    await context.route(
      (url) => ANALYTICS_HOSTS.test(url.hostname),
      (route) => route.fulfill({ status: 200, contentType: "application/javascript", body: "" }),
    );
    await use(context);
  },
});
