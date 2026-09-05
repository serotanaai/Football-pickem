/**
 * What counts as a password here, in one place.
 *
 * The sign-up form, the reset form and the checklist all read these, so the
 * rules the user is ticking off are literally the rules being enforced rather
 * than a description of them that can drift.
 */
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 16;

export type PasswordRule = {
  id: string;
  label: string;
  met: boolean;
};

export function passwordRules(password: string): PasswordRule[] {
  return [
    {
      id: "length",
      label: `${PASSWORD_MIN}–${PASSWORD_MAX} characters`,
      met: password.length >= PASSWORD_MIN && password.length <= PASSWORD_MAX,
    },
    { id: "upper", label: "An uppercase letter", met: /[A-Z]/.test(password) },
    { id: "lower", label: "A lowercase letter", met: /[a-z]/.test(password) },
    { id: "number", label: "A number", met: /[0-9]/.test(password) },
    {
      id: "special",
      label: "A special character",
      met: /[^A-Za-z0-9\s]/.test(password),
    },
    // Empty is not "no spaces yet" — nothing is satisfied before you type.
    { id: "space", label: "No spaces", met: password.length > 0 && !/\s/.test(password) },
  ];
}

export function passwordIsValid(password: string): boolean {
  return passwordRules(password).every((rule) => rule.met);
}

/** Display names are unique, so they need bounds the database agrees with. */
export const NAME_MIN = 3;
export const NAME_MAX = 24;

export function nameProblem(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length < NAME_MIN) return `Display names need at least ${NAME_MIN} characters.`;
  if (trimmed.length > NAME_MAX) return `Display names are at most ${NAME_MAX} characters.`;
  return null;
}
