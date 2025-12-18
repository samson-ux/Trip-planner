export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { destinations, budget, people, tripLength, extraDetails } = req.body;

    if (!destinations || !budget || !people || !tripLength) {
      return res.status(400).json({ error: 'Please fill in all required fields' });
    }

    const roomsNeeded = Math.ceil(people / 2);
    const maxBudget = budget * 0.95; // Can go up to 95% of budget
    const minBudget = budget * 0.90; // Must spend at least 90% of budget

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        messages: [{
          role: 'user',
          content: `Plan a detailed vacation:

TRIP DETAILS:
- Destination: ${destinations}
- Total Budget: $${budget}
- MUST SPEND: Between $${minBudget} and $${maxBudget} (90-95% of budget)
- Travelers: ${people} people
- Trip Length: ${tripLength} days
- Rooms Needed: ${roomsNeeded} (2 people per room)
${extraDetails ? `- Special Requests: ${extraDetails}` : ''}

CRITICAL BUDGET RULE:
You MUST spend between $${minBudget} and $${maxBudget}. 
DO NOT be under $${minBudget}!

To reach this budget, choose:
- LUXURY or HIGH-END hotels (4-5 star, prime locations)
- UPSCALE restaurants (fine dining, highly-rated spots)
- PREMIUM experiences (private tours, VIP access, unique activities)

HOW TO ALLOCATE (rough guide):
- Hotels: ~40-50% of budget ($${Math.round(budget * 0.45)})
- Meals: ~25-30% of budget ($${Math.round(budget * 0.27)})
- Activities: ~20-25% of budget ($${Math.round(budget * 0.22)})
- Transportation: ~5% of budget ($${Math.round(budget * 0.05)}) - local taxis/metro only

RESPOND WITH ONLY JSON:

{
  "tripSummary": {
    "destinations": "${destinations}",
    "totalDays": ${tripLength},
    "travelers": ${people},
    "rooms": ${roomsNeeded},
    "totalEstimatedCost": [MUST BE BETWEEN $${minBudget} AND $${maxBudget}],
    "budgetRemaining": [${budget} minus total],
    "budgetLimit": ${budget}
  },
  "hotels": [
    {
      "name": "Luxury Hotel Name",
      "location": "Prime Area",
      "pricePerNight": [high-end price],
      "totalNights": ${tripLength - 1},
      "totalCost": [pricePerNight × nights × ${roomsNeeded} rooms],
      "rating": "4.5/5",
      "highlights": ["Luxury Amenities", "Prime Location", "Excellent Service"],
      "checkIn": "Day 1",
      "checkOut": "Day ${tripLength}"
    }
  ],
  "dailyItinerary": [
    {
      "day": 1,
      "title": "Day Title",
      "activities": [
        {
          "time": "2:00 PM",
          "name": "Activity",
          "description": "Description",
          "location": "Location",
          "cost": [cost for ${people} people],
          "duration": "2 hours"
        }
      ],
      "meals": [
        {
          "type": "Dinner",
          "restaurant": "Upscale Restaurant Name",
          "cuisine": "Type",
          "priceRange": "$$$",
          "estimatedCost": [quality dining cost for ${people} people],
          "location": "Area"
        }
      ],
      "dayTotal": [SUM of this day's activities + meals]
    }
  ],
  "costBreakdown": {
    "accommodation": [~40-50% of budget],
    "activities": [~20-25% of budget],
    "meals": [~25-30% of budget],
    "transportation": [~5% of budget, local transport only],
    "total": [MUST BE BETWEEN $${minBudget} AND $${maxBudget}]
  },
  "tips": ["Tip 1", "Tip 2", "Tip 3"]
}`
        }],
        system: 'You are a LUXURY travel planner. You MUST spend 90-95% of the total budget. Choose high-end hotels, upscale restaurants, and premium experiences. DO NOT be under budget - upgrade everything to meet the minimum spend. Transportation is local only (taxis, metro). Respond with ONLY valid JSON.'
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('API error:', error);
      return res.status(response.status).json({ error: 'Failed to plan trip. Please try again.' });
    }

    const data = await response.json();
    
    let textContent = '';
    for (const item of data.content) {
      if (item.type === 'text') {
        textContent += item.text;
      }
    }

    textContent = textContent.trim();
    textContent = textContent.replace(/```json\s*/gi, '');
    textContent = textContent.replace(/```\s*/gi, '');
    
    const firstBrace = textContent.indexOf('{');
    const lastBrace = textContent.lastIndexOf('}');
    
    if (firstBrace === -1 || lastBrace === -1) {
      return res.status(500).json({ error: 'Could not generate trip plan.' });
    }
    
    textContent = textContent.substring(firstBrace, lastBrace + 1);

    let parsed;
    try {
      parsed = JSON.parse(textContent);
    } catch (parseError) {
      console.error('JSON parse error:', parseError.message);
      return res.status(500).json({ error: 'Failed to parse trip data. Please try again.' });
    }

    // FIX THE MATH on our end to ensure accuracy
    if (parsed.costBreakdown) {
      const { accommodation, activities, meals } = parsed.costBreakdown;
      let { transportation } = parsed.costBreakdown;
      
      // Cap transportation at ~5% of budget
      const maxTransport = Math.round(budget * 0.05);
      if (transportation > maxTransport) {
        transportation = maxTransport;
        parsed.costBreakdown.transportation = transportation;
      }
      
      const correctTotal = (accommodation || 0) + (activities || 0) + (meals || 0) + (transportation || 0);
      parsed.costBreakdown.total = correctTotal;
      
      if (parsed.tripSummary) {
        parsed.tripSummary.totalEstimatedCost = correctTotal;
        parsed.tripSummary.budgetRemaining = budget - correctTotal;
        parsed.tripSummary.budgetLimit = budget;
      }
    }

    // Fix daily totals
    if (parsed.dailyItinerary) {
      for (const day of parsed.dailyItinerary) {
        let daySum = 0;
        if (day.activities) {
          for (const act of day.activities) {
            daySum += (act.cost || 0);
          }
        }
        if (day.meals) {
          for (const meal of day.meals) {
            daySum += (meal.estimatedCost || 0);
          }
        }
        day.dayTotal = daySum;
      }
    }

    return res.status(200).json(parsed);

  } catch (error) {
    console.error('Server error:', error);
    return res.status(500).json({ error: 'Server error. Please try again.' });
  }
}
