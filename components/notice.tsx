export function Notice({
  children,
  error = false
}: {
  children: React.ReactNode;
  error?: boolean;
}) {
  return (
    <div
      role={error ? "alert" : "status"}
      className={`rounded-xl border px-4 py-3 text-sm leading-relaxed ${error ? "border-rose-200 bg-rose-50 text-rose-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}
    >
      {children}
    </div>
  );
}
export const requestErrors: Record<string, string> = {
  rate_limited:
    "Please wait a minute before requesting another email. You can request up to five links per hour.",
  send_failed: "We couldn’t send your email right now. Please try again in a minute.",
  invalid_input: "Please check your name and email address.",
  invalid_email: "Please enter a valid email address.",
  invalid_token: "This link is incomplete. Request a fresh link to continue.",
  invalid_or_expired:
    "This link has expired, has already been used, or your membership conditions have changed. Request a fresh link to continue.",
  unavailable: "We couldn’t complete that request right now. Please try again.",
  address_unmatched:
    "We couldn’t find a single matching address. Check the street, city, state, and ZIP code, then try again. Contact your community manager if the address is new or missing.",
  geocoder_unavailable: "Address screening is temporarily unavailable. Please try again shortly.",
  invalid_address: "Enter a complete US street address, city, two-letter state, and ZIP code.",
  community_not_found: "That community could not be found. Choose a community below."
};
