/**
 * normaliser.js
 * Converts any raw inbound webhook payload into the Nistula unified message schema.
 * This layer decouples the rest of the pipeline from source-specific field names
 * so adding a new channel in future only requires changing this file.
 */

const { v4: uuidv4 } = require("uuid");

/**
 * Normalise raw payload → unified schema.
 * query_type is left as null here; it is filled in by the classifier next.
 *
 * @param {object} raw - The raw request body
 * @returns {object} Normalised message object
 */
function normalise(raw) {
  return {
    message_id:   uuidv4(),
    source:       raw.source.trim().toLowerCase(),
    guest_name:   raw.guest_name.trim(),
    message_text: raw.message.trim(),
    timestamp:    new Date(raw.timestamp).toISOString(),
    booking_ref:  raw.booking_ref ? raw.booking_ref.trim() : null,
    property_id:  raw.property_id.trim().toLowerCase(),
    query_type:   null,          // filled by classifier
  };
}

module.exports = { normalise };