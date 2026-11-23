// Pakistani mobile number normalisation (blueprint section 4.1).

import { parsePhoneNumberFromString } from "libphonenumber-js/max";
import { err, ok, type Result } from "./result";

// Accepts 03XXXXXXXXX, 3XXXXXXXXX, 923XXXXXXXXX, +923XXXXXXXXX, 00923XXXXXXXXX.
// Returns E.164 (+923XXXXXXXXX). Only mobile numbers are accepted.
export function normalizePkMobile(input: string): Result<string, "INVALID_PHONE"> {
  let value = input.trim().replace(/[\s\-().]/g, "");
  if (value.startsWith("0092")) value = `+${value.slice(2)}`;
  else if (/^92\d{10}$/.test(value)) value = `+${value}`;

  const parsed = parsePhoneNumberFromString(value, "PK");
  if (!parsed || parsed.country !== "PK" || !parsed.isValid()) return err("INVALID_PHONE");
  if (parsed.getType() !== "MOBILE") return err("INVALID_PHONE");
  return ok(parsed.number);
}
