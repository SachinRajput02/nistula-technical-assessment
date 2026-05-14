/**
 * classifier.js
 * Rule-based keyword classifier that maps a guest message to one of six query types.
 *
 * Design decision: keyword rules run in priority order (complaints first, then
 * specific intents). The first rule whose keywords match wins. This keeps the
 * logic transparent and easy to audit/extend without a trained model.
 *
 * Each rule has:
 *   - type:     the query_type string to assign
 *   - keywords: array of lowercase substrings; ANY match triggers the rule
 *   - score:    classifier confidence contribution (used by confidence.js)
 */

const RULES = [
  {
    type: "complaint",
    score: 1.0,
    keywords: [
      "not working", "broken", "unacceptable", "refund", "unhappy",
      "not happy", "complain", "issue", "problem", "disgusting",
      "dirty", "awful", "terrible", "worst", "no hot water",
      "no water", "no electricity", "power cut", "no ac", "ac not",
      "leak", "bug", "cockroach", "pest",
    ],
  },
  {
    type: "post_sales_checkin",
    score: 1.0,
    keywords: [
      "check-in time", "check in time", "checkin time", "check out time",
      "checkout time", "check-out time", "wifi", "wi-fi", "password",
      "wi fi", "internet", "how do i get in", "key", "access code",
      "door code", "arrival", "directions", "address", "how to reach",
      "caretaker", "contact number",
    ],
  },
  {
    type: "special_request",
    score: 0.9,
    keywords: [
      "early check", "late check", "late checkout", "airport",
      "transfer", "pickup", "cab", "taxi", "cook", "chef",
      "birthday", "anniversary", "decoration", "flower", "cake",
      "surprise", "arrange", "extra bed", "cot", "baby",
    ],
  },
  {
    type: "pre_sales_pricing",
    score: 0.9,
    keywords: [
      "rate", "price", "cost", "how much", "pricing", "charges",
      "per night", "total", "quote", "budget", "fee", "tariff",
      "discount", "offer", "deal", "2 adults", "3 adults", "4 adults",
      "5 adults", "6 adults", "guest charge",
    ],
  },
  {
    type: "pre_sales_availability",
    score: 0.9,
    keywords: [
      "available", "availability", "book", "booking", "dates",
      "from", "to", "april", "may", "june", "july", "august",
      "september", "october", "november", "december", "january",
      "february", "march", "nights", "days", "slot", "open",
      "free", "vacant", "can we stay", "can i book",
    ],
  },
  {
    type: "general_enquiry",
    score: 0.7,
    keywords: [
      "pet","allow","dog", "cat", "parking", "pool", "swim", "bbq",
      "barbecue", "smoking", "smoke", "alcohol", "party",
      "noise", "children", "kids", "infant", "gym", "spa",
      "beach", "near", "distance", "market", "restaurant",
      "food", "nearby", "activities",
    ],
  },
];

/**
 * Classify a message text into a query_type.
 *
 * @param {string} text - The guest message text (lowercased internally)
 * @returns {{ query_type: string, classifier_score: number }}
 */
function classify(text) {
  const lower = text.toLowerCase();

  for (const rule of RULES) {
    const matched = rule.keywords.some((kw) => lower.includes(kw));
    if (matched) {
      return {
        query_type: rule.type,
        classifier_score: rule.score,
      };
    }
  }

  // Default fallback — low classifier confidence
  return {
    query_type: "general_enquiry",
    classifier_score: 0.5,
  };
}

module.exports = { classify };