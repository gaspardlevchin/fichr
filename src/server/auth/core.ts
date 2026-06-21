import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 7;
export const MIN_SESSION_SECRET_LENGTH = 32;

type PrivateBetaDevLoginEnvironment = {
  allowedEmails?: string;
  devEmail?: string;
  devLoginEnabled?: string;
  environment?: string;
  sessionSecret?: string;
};

export type PrivateBetaDevLoginConfiguration =
  | {
      configured: true;
      devEmail: string;
    }
  | {
      configured: false;
      reason:
        | "disabled"
        | "invalid_session_secret"
        | "missing_allowed_emails"
        | "missing_dev_email"
        | "production";
    };

export class AuthenticationError extends Error {
  constructor(message = "Authentication required") {
    super(message);
    this.name = "AuthenticationError";
  }
}

export class AuthenticationConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthenticationConfigurationError";
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function parseAllowedEmails(value: string | undefined): Set<string> {
  return new Set(
    (value ?? "")
      .split(",")
      .map(normalizeEmail)
      .filter(Boolean)
  );
}

export function isEmailAllowed(
  email: string,
  configuredEmails = process.env.PRIVATE_BETA_ALLOWED_EMAILS
): boolean {
  return parseAllowedEmails(configuredEmails).has(normalizeEmail(email));
}

export function isDevLoginEnabled(
  environment: string | undefined = process.env.NODE_ENV,
  configuredValue: string | undefined = process.env.AUTH_DEV_LOGIN_ENABLED
): boolean {
  return environment === "development" && configuredValue === "true";
}

export function getPrivateBetaDevLoginConfiguration(
  input: PrivateBetaDevLoginEnvironment = {}
): PrivateBetaDevLoginConfiguration {
  const environment = input.environment ?? process.env.NODE_ENV;
  const devLoginEnabled =
    input.devLoginEnabled ?? process.env.AUTH_DEV_LOGIN_ENABLED;

  if (environment === "production") {
    return { configured: false, reason: "production" };
  }

  if (!isDevLoginEnabled(environment, devLoginEnabled)) {
    return { configured: false, reason: "disabled" };
  }

  const devEmail = normalizeEmail(
    input.devEmail ?? process.env.PRIVATE_BETA_DEV_EMAIL ?? ""
  );

  if (!devEmail) {
    return { configured: false, reason: "missing_dev_email" };
  }

  const sessionSecret =
    input.sessionSecret ?? process.env.AUTH_SESSION_SECRET ?? "";

  if (sessionSecret.length < MIN_SESSION_SECRET_LENGTH) {
    return { configured: false, reason: "invalid_session_secret" };
  }

  const allowedEmails =
    input.allowedEmails ?? process.env.PRIVATE_BETA_ALLOWED_EMAILS;

  if (!isEmailAllowed(devEmail, allowedEmails)) {
    return { configured: false, reason: "missing_allowed_emails" };
  }

  return { configured: true, devEmail };
}

export function getPrivateBetaDevLoginConfigurationMessage(
  configuration: PrivateBetaDevLoginConfiguration
): string {
  if (configuration.configured) {
    return "";
  }

  if (configuration.reason === "invalid_session_secret") {
    return `La connexion bêta n’est pas configurée : le secret de session doit contenir au moins ${MIN_SESSION_SECRET_LENGTH} caractères.`;
  }

  if (configuration.reason === "missing_dev_email") {
    return "La connexion bêta n’est pas configurée : l’adresse email locale est manquante.";
  }

  if (configuration.reason === "missing_allowed_emails") {
    return "La connexion bêta n’est pas configurée : l’adresse locale doit appartenir à l’allowlist.";
  }

  return "La connexion locale n’est pas disponible sur cet environnement.";
}

export function assertDevLoginEmailAllowed(email: string): string {
  const configuration = getPrivateBetaDevLoginConfiguration();

  if (!configuration.configured) {
    const message = getPrivateBetaDevLoginConfigurationMessage(configuration);

    if (
      configuration.reason === "disabled" ||
      configuration.reason === "production"
    ) {
      throw new AuthenticationError(message);
    }

    throw new AuthenticationConfigurationError(message);
  }

  const normalizedEmail = normalizeEmail(email);

  if (normalizedEmail !== configuration.devEmail) {
    throw new AuthenticationError("Cette adresse n’est pas autorisée.");
  }

  return normalizedEmail;
}

export function getSessionSecret(
  configuredSecret = process.env.AUTH_SESSION_SECRET
): string {
  if (
    !configuredSecret ||
    configuredSecret.length < MIN_SESSION_SECRET_LENGTH
  ) {
    throw new AuthenticationConfigurationError(
      `AUTH_SESSION_SECRET doit contenir au moins ${MIN_SESSION_SECRET_LENGTH} caractères.`
    );
  }

  return configuredSecret;
}

export function createSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(
  token: string,
  secret = getSessionSecret()
): string {
  return createHmac("sha256", secret).update(token).digest("hex");
}

export function sessionTokenHashesMatch(
  token: string,
  expectedHash: string,
  secret = getSessionSecret()
): boolean {
  const actual = Buffer.from(hashSessionToken(token, secret), "hex");
  const expected = Buffer.from(expectedHash, "hex");

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function getSessionCookieOptions(environment = process.env.NODE_ENV) {
  return {
    httpOnly: true,
    maxAge: SESSION_DURATION_SECONDS,
    path: "/",
    sameSite: "lax" as const,
    secure: environment === "production"
  };
}
