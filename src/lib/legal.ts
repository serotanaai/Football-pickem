/**
 * The revision of the agreements a signup is consenting to.
 *
 * Recorded against the account at signup, so "they agreed" can be answered
 * with *what* they agreed to rather than just a boolean. Bump it whenever the
 * terms or the privacy policy change in a way that alters what somebody signed
 * up to — a wording tidy is not that, a new category of email is.
 */
export const LEGAL_VERSION = "2026-09-08";

/** Where the agreements live. Both documents are on one page, under anchors. */
export const TERMS_HREF = "/legal#terms";
export const PRIVACY_HREF = "/legal#privacy";
export const EMAIL_POLICY_HREF = "/legal#email";
