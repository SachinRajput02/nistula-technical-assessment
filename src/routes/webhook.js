/**
 * webhook.js
 * POST /webhook/message
 *
 * Orchestrates the full guest message handling pipeline:
 *   Validate → Normalise → Classify → Claude API → Score → Respond
 */

const express = require("express");
const router = express.Router();

const validateRequest = require("../middleware/validateRequest");
const { normalise }       = require("../services/normaliser");
const { classify }        = require("../services/classifier");
const { getDraftedReply } = require("../services/claudeService");
const { computeConfidence } = require("../services/confidence");

/**
 * POST /webhook/message
 * Main entry point for all inbound guest messages.
 */
router.post("/message", validateRequest, async (req, res) => {
  const requestStart = Date.now();

  try {
    // ── STEP 1: Already validated by middleware ───────────────────────────
    console.log(`\n[WEBHOOK] Inbound message from source: "${req.body.source}"`);

    // ── STEP 2: Normalise ─────────────────────────────────────────────────
    const normalised = normalise(req.body);
    console.log(`[NORMALISE] message_id: ${normalised.message_id}`);

    // ── STEP 3: Classify ──────────────────────────────────────────────────
    const { query_type, classifier_score } = classify(normalised.message_text);
    normalised.query_type = query_type;
    console.log(`[CLASSIFY] query_type: ${query_type} (classifier_score: ${classifier_score})`);

    // ── STEP 4: Claude API ────────────────────────────────────────────────
    console.log(`[CLAUDE] Sending to Claude API...`);
    const drafted_reply = await getDraftedReply(normalised);
    console.log(`[CLAUDE] Reply received (${drafted_reply.length} chars)`);

    // ── STEP 5: Confidence scoring ────────────────────────────────────────
    const { confidence_score, action, score_breakdown } = computeConfidence({
      normalised,
      classifier_score,
      drafted_reply,
    });
    console.log(`[SCORE] confidence: ${confidence_score} → action: ${action}`);

    // ── STEP 6: Respond ───────────────────────────────────────────────────
    const elapsed = Date.now() - requestStart;
    console.log(`[DONE] Responded in ${elapsed}ms\n`);

    return res.status(200).json({
      message_id:       normalised.message_id,
      query_type:       normalised.query_type,
      drafted_reply,
      confidence_score,
      action,
      // Optional debug fields — remove in production if preferred
      _debug: {
        elapsed_ms:    elapsed,
        score_breakdown,
        source:        normalised.source,
        guest_name:    normalised.guest_name,
        property_id:   normalised.property_id,
        booking_ref:   normalised.booking_ref,
      },
    });

  } catch (err) {
    console.error("[ERROR] Pipeline failure:", err.message);

    // Distinguish Claude API errors from internal errors
    if (err.status && err.status >= 400) {
      return res.status(502).json({
        error: "Claude API error",
        details: err.message,
      });
    }

    return res.status(500).json({
      error: "Internal server error",
      details: err.message,
    });
  }
});

module.exports = router;