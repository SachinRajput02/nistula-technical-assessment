/**
 * propertyContext.js
 * Static mock property data used to build the Claude system prompt.
 * In production this would be fetched from a database by property_id.
 */

const PROPERTY_CONTEXT = {
  "villa-b1": {
    name: "Villa B1",
    location: "Assagao, North Goa",
    bedrooms: 3,
    max_guests: 6,
    private_pool: true,
    check_in_time: "2:00 PM",
    check_out_time: "11:00 AM",
    base_rate_inr: 18000,
    base_rate_covers_guests: 4,
    extra_guest_charge_inr: 2000,
    wifi_password: "Nistula@2024",
    caretaker_hours: "8:00 AM to 10:00 PM",
    chef_on_call: true,
    chef_note: "Pre-booking required at least 24 hours in advance",
    availability: {
      "april-20-24-2026": "Available",
    },
    cancellation_policy: "Free cancellation up to 7 days before check-in. After that, 1 night charge applies.",
    house_rules: [
      "No smoking indoors",
      "Pets not allowed",
      "No loud music after 10 PM",
      "Guests must be registered at check-in",
    ],
  },
};

/**
 * Returns the property context string for a given property_id,
 * formatted for injection into a Claude system prompt.
 *
 * @param {string} propertyId
 * @returns {string} Formatted property details, or a fallback note
 */
function getPropertyContext(propertyId) {
  const prop = PROPERTY_CONTEXT[propertyId];

  if (!prop) {
    return `No property data found for property_id: "${propertyId}". Respond politely and ask the guest to confirm their property details.`;
  }

  return `
PROPERTY DETAILS:
- Name: ${prop.name}
- Location: ${prop.location}
- Bedrooms: ${prop.bedrooms} | Max guests: ${prop.max_guests}
- Private pool: ${prop.private_pool ? "Yes" : "No"}
- Check-in: ${prop.check_in_time} | Check-out: ${prop.check_out_time}
- Base rate: INR ${prop.base_rate_inr.toLocaleString("en-IN")} per night (covers up to ${prop.base_rate_covers_guests} guests)
- Extra guest charge: INR ${prop.extra_guest_charge_inr.toLocaleString("en-IN")} per night per additional guest
- WiFi password: ${prop.wifi_password}
- Caretaker available: ${prop.caretaker_hours}
- Chef on call: ${prop.chef_on_call ? "Yes" : "No"} (${prop.chef_note})
- Cancellation policy: ${prop.cancellation_policy}
- House rules: ${prop.house_rules.join("; ")}
- Known availability: ${Object.entries(prop.availability).map(([k, v]) => `${k}: ${v}`).join(", ")}
`.trim();
}

module.exports = { getPropertyContext };