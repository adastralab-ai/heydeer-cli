/** HeyDeer review API keys: the shape `requireReviewAPIKey` accepts on the server. */
const API_KEY_PATTERN = /^hdk_[A-Za-z0-9_-]{40,100}$/;

/** The key from `HEYDEER_API_KEY`, or undefined when it isn't set. */
export function findApiKey(): string | undefined {
  const key = process.env.HEYDEER_API_KEY?.trim();
  if (!key) return undefined;
  if (!API_KEY_PATTERN.test(key)) {
    throw new Error("HEYDEER_API_KEY isn't a HeyDeer API key. Keys start with hdk_.");
  }
  return key;
}
