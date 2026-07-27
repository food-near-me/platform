export { loadX402Config, isPaidResource, resourceUri, type X402Config } from "./config";
export { hasApiKeyBypass, hasPaidAuth } from "./auth";
export {
  buildPaymentChallenge,
  buildPaymentCompanion,
  buildPaymentRequirements,
  format402Message,
} from "./challenge";
export { buildPaymentRequiredBody, paymentRequiredResponse } from "./format402";
export {
  checkX402Access,
  evaluatePaidAccess,
  getClientIp,
  withPaymentSettlement,
  type PaidAccessOutcome,
  type X402AccessResult,
} from "./guard";
export { getFacilitator, MockFacilitator, type Facilitator } from "./facilitator";
export {
  buildMockPaymentPayload,
  decodePaymentHeader,
  decodePaymentResponseHeader,
  encodePaymentHeader,
  encodePaymentResponseHeader,
} from "./payment";
export type {
  PaymentPayload,
  PaymentRequirements,
  PaymentRequirementsResponse,
  SettlementResponse,
  X402Endpoint,
  X402ResourceName,
} from "./types";

/** Phase A name for the 402 body — now the canonical PaymentRequirementsResponse. */
export type { PaymentRequirementsResponse as PaymentRequiredBody } from "./types";
