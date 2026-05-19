import { Resend } from "resend";

const resendApiKey = process.env.RESEND_API_KEY;

export function getResendClient() {
  if (!resendApiKey) {
    throw new Error("Missing RESEND_API_KEY");
  }

  return new Resend(resendApiKey);
}
