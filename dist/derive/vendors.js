// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * Vendor SDK table: npm packages whose import means the code talks to a third-party system. Extendable with the
 * `external_sdks` config key. Matching is by exact package name or a `prefix/*` pattern.
 */
/** Built-in package patterns → vendor display name. */
export const VENDOR_SDKS = {
    stripe: "Stripe",
    "@stripe/*": "Stripe",
    "aws-sdk": "AWS",
    "@aws-sdk/*": "AWS",
    "@google-cloud/*": "Google Cloud",
    firebase: "Firebase",
    "firebase-admin": "Firebase",
    "@azure/*": "Azure",
    twilio: "Twilio",
    "@sendgrid/*": "SendGrid",
    openai: "OpenAI",
    "@anthropic-ai/sdk": "Anthropic",
    "@slack/*": "Slack",
    "@sentry/*": "Sentry",
    "@supabase/supabase-js": "Supabase",
    "@octokit/*": "GitHub",
    auth0: "Auth0",
    "@auth0/*": "Auth0",
    "@clerk/*": "Clerk",
    resend: "Resend",
    algoliasearch: "Algolia",
    "@pinecone-database/pinecone": "Pinecone",
    "posthog-node": "PostHog",
    "posthog-js": "PostHog",
    "dd-trace": "Datadog",
    "@datadog/*": "Datadog",
    mixpanel: "Mixpanel",
    "@paypal/*": "PayPal",
};
/** Package name of an import specifier (`@scope/name` or `name`), or null for relative/absolute specifiers. */
export function packageOf(specifier) {
    if (specifier.startsWith(".") || specifier.startsWith("/") || specifier.includes(":"))
        return null;
    const parts = specifier.split("/");
    if (specifier.startsWith("@"))
        return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : null;
    return parts[0] || null;
}
/** True when a package matches a pattern (exact, or `prefix/*`). */
export function packageMatches(pkg, pattern) {
    return pattern.endsWith("/*") ? pkg.startsWith(pattern.slice(0, -1)) : pkg === pattern;
}
/** Vendor of a package, consulting the config table first, or null. */
export function vendorOf(pkg, extra) {
    for (const table of [extra, VENDOR_SDKS]) {
        const exact = table[pkg];
        if (exact !== undefined)
            return exact;
        const patterns = Object.keys(table)
            .filter((p) => p.endsWith("/*"))
            .sort();
        for (const p of patterns)
            if (packageMatches(pkg, p))
                return table[p];
    }
    return null;
}
