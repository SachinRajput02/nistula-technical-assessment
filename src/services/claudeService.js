/**
 * claudeService.js
 * Builds the system + user prompt and calls the Claude API.
 * Returns the drafted reply text.
 *
 * Design decisions:
 * - System prompt sets Claude's role as a hospitality concierge, not a generic assistant.
 * - The property context and query_type are injected so Claude has everything it needs
 *   to draft a fully accurate, on-brand reply without hallucinating rates or policies.
 * - We use a low temperature equivalent by being very specific in the prompt — the SDK
 *   doesn't expose temperature in the same way, so instruction clarity is the lever.
 */

const Anthropic = require("@anthropic-ai/sdk");
const { getPropertyContext } = require("../config/propertyContext");

const client = new Anthropic({ apiKey:process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514";

/**
 * Build the Claude system prompt combining the role definition and property context.
 * @param {string} propertyId
 * @param {string} queryType
 * @returns {string}
 */
function buildSystemPrompt(propertyId, queryType) {
  const propertyContext = getPropertyContext(propertyId);

  return `
You are a warm, professional guest-relations concierge for Nistula, a luxury villa rental company in Goa, India.

Your job is to draft a helpful, accurate, and friendly reply to a guest message on behalf of the Nistula team.

GUIDELINES:
- Be warm but professional. Use the guest's first name once at the start.
- Be concise. No unnecessary filler. No corporate jargon.
- Answer only what is asked. Do not volunteer unrelated information.
- If you cannot answer something from the property data provided, say you will check and get back shortly — never guess.
- For complaints, acknowledge the issue with empathy first, then describe next steps. Do not promise refunds directly.
- Always sign off as: "Warm regards, Nistula Team"
- Do NOT use markdown formatting. Plain text only.
- Reply length: 3–6 sentences for most queries. Complaints may be slightly longer.

QUERY TYPE: ${queryType}
(Use this to calibrate the tone and focus of your reply.)

${propertyContext}
`.trim();
}

/**
 * Build the user message to send to Claude.
 * @param {object} normalised - The normalised message schema
 * @returns {string}
 */
function buildUserPrompt(normalised) {
  return `
Guest name: ${normalised.guest_name}
Source channel: ${normalised.source}
Booking reference: ${normalised.booking_ref || "Not provided"}
Message received: "${normalised.message_text}"

Draft a reply to this guest message.
`.trim();
}

/**
 * Call the Claude API and return the drafted reply.
 *
 * @param {object} normalised - Normalised + classified message
 * @returns {Promise<string>} The drafted reply text
 */
async function getDraftedReply(normalised) {
  const systemPrompt = buildSystemPrompt(normalised.property_id, normalised.query_type);
  const userPrompt = buildUserPrompt(normalised);

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 512,
    system: systemPrompt,
    messages: [
      { role: "user", content: userPrompt },
    ],
  });

  // Extract text from the first content block
  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock) {
    throw new Error("Claude returned no text content");
  }

  return textBlock.text.trim();
}

module.exports = { getDraftedReply };