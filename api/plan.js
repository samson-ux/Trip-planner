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
    const maxBudget = budget * 0.8; // Stay within 80% of budget (20% margin)

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
          content: `Plan a detailed vacation with the following requirements:

TRIP DETAILS:
- Destination(s): ${destinations}
- Total Budget: $${budget} USD (YOU MUST STAY WITHIN $${maxBudget} - this is 80% of budget to leave a 20% safety margin)
- Number of Travelers: ${people} people
- Trip Length: ${tripLength} days
- Rooms Needed: ${roomsNeeded} room(s) (2 people per room)
${extraDetails ? `- Special Requests: ${extraDetails}` : ''}

YOUR TASK:
Create a realistic, detailed trip plan using your knowledge of:
- Real hotels in the area (use well-known hotel chains or popular local hotels with realistic prices)
- Real restaurants (use actual restaurant names that exist in the destination)
- Real attractions and activities (museums, landmarks, tours, etc.)
- Realistic pricing for the destination

IMPORTANT RULES:
1. ALL costs must add up correctly
2. Total MUST be under $${maxBudget}
3. Group nearby attractions on the same day for efficiency
4. Include a good mix of activities and rest time
5. Consider the special requests: ${extraDetails || 'none specified'}
6. Use realistic prices for the destination (research-level accuracy)

Respond with ONLY this JSON format:

{
  "tripSummary": {
    "destinations": "${destinations}",
    "totalDays": ${tripLength},
    "travelers": ${people},
    "rooms": ${roomsNeeded},
    "totalEstimatedCost": 0,
    "budgetRemaining": 0,
    "budgetLimit": ${maxBudget}
  },
  "hotels": [
    {
      "name": "Real Hotel Name",
      "location": "Address/Area",
      "pricePerNight": 150,
      "totalNights": ${tripLength - 1},
      "totalCost": 0,
      "rating": "4.5/5",
      "highlights": ["Pool", "Free Breakfast", "Central Location"],
      "checkIn": "Day 1",
      "checkOut": "Day ${tripLength}"
    }
  ],
  "dailyItinerary": [
    {
      "day": 1,
      "title": "Arrival & Explore",
      "activities": [
        {
          "time": "2:00 PM",
          "name": "Check into Hotel",
          "description": "Check in and freshen up",
          "location": "Hotel Name",
          "cost": 0,
          "duration": "1 hour"
        },
        {
          "time": "4:00 PM",
          "name": "Activity Name",
          "description": "What you'll do",
          "location": "Specific location",
          "cost": 25,
          "duration": "2 hours"
        }
      ],
      "meals": [
        {
          "type": "Dinner",
          "restaurant": "Real Restaurant Name",
          "cuisine": "Italian",
          "priceRange": "$$",
          "estimatedCost": 80,
          "location": "Area/Neighborhood"
        }
      ],
      "dayTotal": 0
    }
  ],
  "costBreakdown": {
    "accommodation": 0,
    "activities": 0,
    "meals": 0,
    "transportation": 0,
    "total": 0
  },
  "tips": [
    "Useful tip about the destination",
    "Money-saving tip",
    "Local customs or advice"
  ]
}

Make sure all numbers add up correctly. The total in costBreakdown must equal tripSummary.totalEstimatedCost.
Respond with ONLY valid JSON, no markdown, no explanation.`
        }],
        system: 'You are an expert travel planner. Create detailed, realistic trip itineraries using real hotels, restaurants, and attractions. Use accurate pricing based on your knowledge. Respond with ONLY valid JSON, no markdown or extra text. Ensure all costs add up correctly and stay within the budget limit.'
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Anthropic API error:', error);
      return res.status(response.status).json({ error: 'Failed to plan trip. Please try again.' });
    }

    const data = await response.json();
    
    let textContent = '';
    for (const item of data.content) {
      if (item.type === 'text') {
        textContent += item.text;
      }
    }

    // Clean up response
    textContent = textContent.trim();
    textContent = textContent.replace(/```json\s*/gi, '');
    textContent = textContent.replace(/```\s*/gi, '');
    
    const firstBrace = textContent.indexOf('{');
    const lastBrace = textContent.lastIndexOf('}');
    
    if (firstBrace === -1 || lastBrace === -1) {
      console.error('No JSON found');
      return res.status(500).json({ error: 'Could not generate trip plan. Please try again.' });
    }
    
    textContent = textContent.substring(firstBrace, lastBrace + 1);

    let parsed;
    try {
      parsed = JSON.parse(textContent);
    } catch (parseError) {
      console.error('JSON parse error:', parseError.message);
      return res.status(500).json({ error: 'Failed to parse trip data. Please try again.' });
    }

    return res.status(200).json(parsed);

  } catch (error) {
    console.error('Server error:', error);
    return res.status(500).json({ error: 'Server error. Please try again.' });
  }
}
