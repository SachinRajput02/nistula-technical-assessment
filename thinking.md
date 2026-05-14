Part 3 — Thinking Question

Scenario: 3am. A guest at Villa B1 messages on WhatsApp: "There is no hot water and we have guests arriving for breakfast in 4 hours. This is unacceptable. I want a refund for tonight."




Question A — The Immediate Response
The message sent right now:

Hi, I'm really sorry — no hot water at 3am with guests arriving in 4 hours is completely unacceptable. I've flagged this as an emergency with our team right now. Someone will contact you within 15 minutes with a resolution. We will make this right.

Why this wording: The guest has a hard deadline and is stressed. The reply doesn't brush off the refund ask or the deadline — it just holds off committing to something a human needs to decide. I didn't promise a refund — that decision needs a human — but "we will make this right" signals it is on the table. The 15-minute window sets a concrete expectation the team is now accountable to.





Question B — The System Design
Beyond sending the message, the platform does this immediately:

First, the message is escalated — not auto-sent. It goes to an urgent queue and the on-call person gets an SMS, not a Slack notification that sits unread until morning. If nobody acknowledges it in 15 minutes, the property manager gets alerted. At 30 minutes with still no response, it escalates further and that failure gets logged — because if nobody picks up a 3am emergency twice in a row, that's a process problem that needs to be visible. The agent who does pick it up sees the booking reference, check-in date, and the complaint history for Villa B1 before they say a word to the guest.





Question C — The Learning

Two months, three hot water complaints at the same property. This is a maintenance failure, not a communication problem.

What the system does with this pattern: A scheduled job queries complaints by type and property over a rolling 60-day window. When the same complaint type hits 3 at the same property, it auto-creates a maintenance ticket and notifies the property manager — not just the on-call agent.

What I would build: A property health dashboard that catches the pattern before a next guest has the same experience. For hot water specifically, the caretaker gets a checklist item to verify the geyser before every check-in, tracked in the system. If that check was skipped and a hot water complaint arrives, the failure is logged against the missed check — so the team can see exactly where the process broke down and shifting the team from reactive to preventive.