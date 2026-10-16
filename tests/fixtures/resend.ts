// Public synthetic fixture, only used with the loopback E2E database/server.
export const testResendSecret = `whsec_${Buffer.from("synthetic-signing-secret-32-bytes!").toString("base64")}`;
