/**
 * validateRequest.js
 * Middleware to validate the inbound webhook payload.
 * Rejects early with a clear error if required fields are missing or invalid.
 */

const VALID_SOURCES = ["whatsapp", "booking_com", "airbnb", "instagram", "direct"];

function validateRequest(req, res, next) {
  const { source, guest_name, message, timestamp, property_id } = req.body;

  const missing = [];

  if (!source)      missing.push("source");
  if (!guest_name)  missing.push("guest_name");
  if (!message)     missing.push("message");
  if (!timestamp)   missing.push("timestamp");
  if (!property_id) missing.push("property_id");

  if (missing.length > 0) {
    return res.status(400).json({
      error: "Missing required fields",
      missing_fields: missing,
    });
  }

  if (!VALID_SOURCES.includes(source)) {
    return res.status(400).json({
      error: "Invalid source channel",
      received: source,
      valid_sources: VALID_SOURCES,
    });
  }

  if (typeof message !== "string" || message.trim().length === 0) {
    return res.status(400).json({ error: "Message must be a non-empty string" });
  }

  // Validate timestamp is parseable ISO 8601
  const parsedDate = new Date(timestamp);
  if (isNaN(parsedDate.getTime())) {
    return res.status(400).json({ error: "Invalid timestamp format. Use ISO 8601 (e.g. 2026-05-05T10:30:00Z)" });
  }

  next();
}

module.exports = validateRequest;