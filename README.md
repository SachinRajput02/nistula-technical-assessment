# Nistula Guest Message Handler

This is my submission for the Nistula Summer Technology Internship 2026.

The system receives a guest message from any channel (WhatsApp, Airbnb, Booking.com, Instagram, or Direct), figures out what the guest is asking, drafts a reply using Claude, scores how confident it is in that reply, and returns everything in one response.

---

## How It Works

Every inbound message goes through five steps in sequence:

```
POST /webhook/message
        │
        ▼
   1. Validate        →  Are all required fields present? Is the source valid?
        │
        ▼
   2. Normalise       →  Add a UUID. Rename fields. Standardise into one schema.
        │
        ▼
   3. Classify        →  What is the guest actually asking? (availability, complaint, etc.)
        │
        ▼
   4. Claude API      →  Build a prompt with property context. Get a drafted reply.
        │
        ▼
   5. Score + Return  →  How confident are we? What action should we take?
```

---

## Project Structure

```
src/
├── index.js                    # Starts the Express server
├── routes/
│   └── webhook.js              # Orchestrates the five-step pipeline
├── services/
│   ├── normaliser.js           # Converts raw payload → unified schema
│   ├── classifier.js           # Keyword rules → query_type
│   ├── claudeService.js        # Builds Claude prompt and calls the API
│   └── confidence.js           # Scores the reply and decides the action
├── config/
│   └── propertyContext.js      # Villa B1 property data used in the prompt
└── middleware/
    └── validateRequest.js      # Rejects requests with missing or invalid fields
```

---

## Setup

**Requirements:** Node.js 18+

```bash
# 1. Install dependencies
npm install

# 2. Create your environment file
cp .env.example .env
```

Open `.env` and add your Anthropic API key:

```
ANTHROPIC_API_KEY=your_key_here
PORT=3000
```

```bash
# 3. Start the server
npm start

# Or with auto-reload during development
npm run dev
```

Server runs at `http://localhost:3000`

---

## The Endpoint

**POST** `/webhook/message`

**Request:**

```json
{
  "source": "whatsapp",
  "guest_name": "Rahul Sharma",
  "message": "Is the villa available from April 20 to 24? What is the rate for 2 adults?",
  "timestamp": "2026-05-05T10:30:00Z",
  "booking_ref": "NIS-2024-0891",
  "property_id": "villa-b1"
}
```

`source` must be one of: `whatsapp`, `booking_com`, `airbnb`, `instagram`, `direct`

`booking_ref` is optional. All other fields are required.

**Response:**

```json
{
  "message_id": "1a8f83e6-1135-402d-ace8-9f47b5c8defd",
  "query_type": "pre_sales_pricing",
  "drafted_reply": "Hi Rahul, Yes, Villa B1 is available from April 20–24...",
  "confidence_score": 0.98,
  "action": "auto_send"
}
```

---

## Query Types

The classifier maps every message to one of six types using keyword rules:

| Type | What it means |
|---|---|
| `pre_sales_availability` | Guest asking if dates are free |
| `pre_sales_pricing` | Guest asking about rates or costs |
| `post_sales_checkin` | Guest asking about check-in time, WiFi, directions |
| `special_request` | Early check-in, chef, airport transfer |
| `complaint` | Something is broken or the guest is unhappy |
| `general_enquiry` | Pets, parking, pool, nearby places |

Rules run in priority order — complaints are checked first so they are never misclassified.

---

## Confidence Scoring

I wanted the confidence score to reflect something real — not just a fixed number, but a combination of signals that actually affect how reliable the drafted reply is likely to be.

The score is a weighted sum of five signals:

| Signal | Weight | What it measures |
|---|---|---|
| Message is not a complaint | 0.30 | Complaints carry financial and emotional stakes — they should always have a human in the loop |
| Classifier matched strongly | 0.25 | A clear keyword match means the intent was unambiguous and Claude had a well-defined task |
| All fields present | 0.20 | booking_ref and property_id give Claude real context. Missing fields mean Claude is working with less |
| Reply length is reasonable | 0.15 | Very short replies usually mean Claude hedged. Very long replies often over-explain uncertainty |
| Source channel is structured | 0.10 | WhatsApp and Direct messages tend to be cleaner text. Instagram messages can be fragmented |

**Score → Action mapping:**

| Score | Action |
|---|---|
| 0.85 and above | `auto_send` — reply goes straight to the guest |
| 0.60 to 0.84 | `agent_review` — a human checks before sending |
| Below 0.60 or any complaint | `escalate` — routed to a team member immediately |

Complaints always escalate regardless of score. To keep the output consistent, complaint scores are also capped at 0.55 so the number matches the action.

---

---

## Why I Built It This Way

I used keyword rules for classification instead of calling the AI to classify — 
it is faster, cheaper, fully predictable, and easy for another developer to 
read and extend. If a new query type needs to be added, you just add a rule. 
No prompt tuning required.

Complaints always escalate regardless of the confidence score. A complaint can 
involve a refund, an operational failure, or an unhappy guest who might leave a 
bad review. No amount of classifier confidence makes it safe to auto-send a reply 
on that.

The confidence score combines five independent signals instead of one because no 
single signal is enough. A WhatsApp message with a clear keyword match can still 
be a complaint. A high classifier score on a message with no booking reference 
still means Claude had less context to work with. The weighted sum catches 
combinations that a single rule would miss.

## Test Examples

Three curl commands to verify all three actions:

**Test 1 — Availability query (auto_send expected)**
```bash

curl -X POST http://localhost:3000/webhook/message \
  -H "Content-Type: application/json" \
  -d '{"source":"whatsapp","guest_name":"Rahul Sharma","message":"Is the villa available from April 20 to 24? What is the rate for 2 adults?","timestamp":"2026-05-05T10:30:00Z","booking_ref":"NIS-2024-0891","property_id":"villa-b1"}'
  
```

**Test 2 — Check-in info (auto_send expected)**
```bash
curl -X POST http://localhost:3000/webhook/message \
  -H "Content-Type: application/json" \
  -d '{"source":"booking_com","guest_name":"Priya Patel","message":"What time is check-in? Can you also send me the WiFi password?","timestamp":"2026-05-06T14:00:00Z","booking_ref":"NIS-2024-0902","property_id":"villa-b1"}'
```

**Test 3 — Complaint (escalate expected)**
```bash
curl -X POST http://localhost:3000/webhook/message \
  -H "Content-Type: application/json" \
  -d '{"source":"direct","guest_name":"Ankit Mehta","message":"The AC in the master bedroom is not working. This is completely unacceptable. I want a refund for tonight.","timestamp":"2026-05-07T03:12:00Z","property_id":"villa-b1"}'
```

---

## Error Handling

| Situation | HTTP Status | Response |
|---|---|---|
| Missing required fields | 400 | `{ error, missing_fields }` |
| Invalid source channel | 400 | `{ error, received, valid_sources }` |
| Claude API failure | 502 | `{ error: "Claude API error", details }` |
| Anything else | 500 | `{ error, details }` |

---

## Health Check

```bash
curl http://localhost:3000/health
```

---

## Dependencies

| Package | Why |
|---|---|
| `express` | HTTP server |
| `@anthropic-ai/sdk` | Claude API client |
| `uuid` | Generates the message_id |
| `dotenv` | Loads the API key from .env |
| `nodemon` | Dev auto-reload |
