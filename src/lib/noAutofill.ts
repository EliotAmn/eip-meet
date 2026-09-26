// Fields where we type other people's emails / names: tell browsers and
// password managers (1Password, LastPass, Bitwarden, Dashlane) not to autofill.
export const noAutofill = {
  autoComplete: 'off',
  'data-1p-ignore': true,
  'data-lpignore': 'true',
  'data-bwignore': true,
  'data-form-type': 'other',
} as const;
