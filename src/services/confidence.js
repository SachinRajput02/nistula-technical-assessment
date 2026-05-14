/**
 * confidence.js
 * Computes a confidence score (0–1) for a drafted AI reply and determines the action.
 *
 * SCORING MODEL (five independent signals):
 *   Signal 1 — Not a complaint          weight: 0.30
 *   Signal 2 — Classifier confidence    weight: 0.25
 *   Signal 3 — Field completeness       weight: 0.20
 *   Signal 4 — Reply length             weight: 0.15
 *   Signal 5 — Source reliability       weight: 0.10
 *
 * ACTION THRESHOLDS:
 *   score >= 0.85              → auto_send
 *   score 0.60 – 0.84         → agent_review
 *   score < 0.60 OR complaint → escalate
 *
 * Complaints always → escalate. Score is also capped at 0.55 for complaints
 * so the number and action are visually consistent.
 */

const SOURCE_RELIABILITY = {
  direct:      1.0,
  whatsapp:    1.0,
  booking_com: 0.9,
  airbnb:      0.9,
  instagram:   0.7,
};

function computeConfidence({ normalised, classifier_score, drafted_reply }) {
  const isComplaint = normalised.query_type === "complaint";

  // Signal 1
  const s1_not_complaint = isComplaint ? 0.0 : 0.30;

  // Signal 2
  const s2_classifier = classifier_score * 0.25;

  // Signal 3
  let fieldScore = 0.10;
  if (normalised.booking_ref) fieldScore += 0.05;
  if (normalised.property_id) fieldScore += 0.05;
  const s3_fields = Math.min(fieldScore, 0.20);

  // Signal 4
  const replyLen = drafted_reply.length;
  let s4_length;
  if (replyLen < 60)        s4_length = 0.05;
  else if (replyLen <= 500) s4_length = 0.15;
  else                      s4_length = 0.10;

  // Signal 5
  const sourceRel = SOURCE_RELIABILITY[normalised.source] ?? 0.7;
  const s5_source = sourceRel * 0.10;

  // Total
  const raw_score = s1_not_complaint + s2_classifier + s3_fields + s4_length + s5_source;
  let confidence_score = Math.min(parseFloat(raw_score.toFixed(2)), 1.0);

  // Breakdown (declared before action block so always in scope)
  const score_breakdown = {
    not_complaint:       parseFloat(s1_not_complaint.toFixed(2)),
    classifier_strength: parseFloat(s2_classifier.toFixed(2)),
    field_completeness:  parseFloat(s3_fields.toFixed(2)),
    reply_length:        parseFloat(s4_length.toFixed(2)),
    source_reliability:  parseFloat(s5_source.toFixed(2)),
    total:               confidence_score,
  };

  // Action
  let action;
  if (isComplaint) {
    action = "escalate";
    // Cap score at 0.55 so number is consistent with escalate action
    if (confidence_score >= 0.60) {
      confidence_score = 0.55;
      score_breakdown.total = 0.55;
      score_breakdown.complaint_cap_applied = true;
    }
  } else if (confidence_score < 0.60) {
    action = "escalate";
  } else if (confidence_score >= 0.85) {
    action = "auto_send";
  } else {
    action = "agent_review";
  }

  return { confidence_score, action, score_breakdown };
}

module.exports = { computeConfidence };