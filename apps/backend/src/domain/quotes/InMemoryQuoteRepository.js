export class InMemoryQuoteRepository {
  /**
   * In-memory quote store used by tests and local development.
   */
  constructor() {
    this.quotes = new Map();
  }

  /**
   * Persists a quote object and returns the stored value.
   */
  save(quote) {
    this.quotes.set(quote.id, quote);
    return quote;
  }

  /**
   * Returns a quote by id or null when not found.
   */
  getById(quoteId) {
    return this.quotes.get(quoteId) || null;
  }
}
