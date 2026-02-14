/**
 * HTTP adapter for delegating pricing calculations to an external component.
 */
export class HttpPricingClient {
  /**
   * @param {{ baseUrl?: string, fetchImpl?: typeof fetch }} options
   */
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || process.env.PRICING_SERVICE_BASE_URL || "http://localhost:3010";
    this.fetchImpl = options.fetchImpl || fetch;
  }

  /**
   * Calls the external pricing endpoint and returns pricing details.
   */
  async calculate(input) {
    const response = await this.fetchImpl(`${this.baseUrl}/api/pricing/calculate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input)
    });

    if (!response.ok) {
      const error = await safeParseError(response);
      throw new Error(`Pricing service request failed: ${error}`);
    }

    return response.json();
  }
}

/**
 * Extracts a readable error message from non-success HTTP responses.
 */
async function safeParseError(response) {
  try {
    const payload = await response.json();
    return payload.error || `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}
