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
        max_tokens: 8000,
        tools: [
          {
            type: "web_search_20250305",
            name: "web_search"
          }
        ],
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
1. Search the web for REAL hotels, restaurants, and activities at the destination(s)
2. Find actual prices and real booking/website URLs
3. Create a day-by-day itinerary
4. Track all costs to stay UNDER the $${maxBudget} limit
5. Consider location - group activities that are near each other on the same day

SEARCH FOR:
- Real hotels with actual nightly rates and booking links
- Real restaurants with price ranges and reservation/menu links  
- Real activities, tours, and attractions with ticket prices and booking links
- Consider transportation costs between locations

RESPOND WITH ONLY THIS JSON FORMAT:

{
  "tripSummary": {
    "destinations": "destination names",
    "totalDays": ${tripLength},
    "travelers": ${people},
    "rooms": ${roomsNeeded},
    "totalEstimatedCost": 0,
    "budgetRemaining": 0,
    "budgetLimit": ${maxBudget}
  },
  "hotels": [
    {
      "name": "Hotel Name",
      "location": "Address/Area",
      "pricePerNight": 150,
      "totalNights": 3,
      "totalCost": 450,
      "rating": "4.5/5",
      "highlights": ["Pool", "Free Breakfast"],
      "bookingUrl": "https://real-booking-url.com",
      "checkIn": "Day 1",
      "checkOut": "Day 4"
    }
  ],
  "dailyItinerary": [
    {
      "day": 1,
      "title": "Arrival & Explore Downtown",
      "date": "Day 1",
      "activities": [
        {
          "time": "2:00 PM",
          "name": "Check into Hotel",
          "description": "Check in and freshen up",
          "location": "Hotel Name",
          "cost": 0,
          "duration": "1 hour",
          "url": null
        },
        {
          "time": "4:00 PM", 
          "name": "Activity Name",
          "description": "What you'll do",
          "location": "Specific location",
          "cost": 25,
          "duration": "2 hours",
          "url": "https://real-url.com"
        }
      ],
      "meals": [
        {
          "type": "Dinner",
          "restaurant": "Restaurant Name",
          "cuisine": "Italian",
          "priceRange": "$$",
          "estimatedCost": 80,
          "location": "Address",
          "url": "https://restaurant-url.com"
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
    "Useful tip 1",
    "Useful tip 2"
  ]
}

CRITICAL RULES:
- Use ONLY real places found via web search with real URLs
- ALL costs must add up correctly
- Total MUST be under $${maxBudget}
- Group nearby attractions on the same day for efficiency
- Include a good mix of activities and rest time
- Consider the special requests: ${extraDetails || 'none specified'}
- Return ONLY valid JSON, no markdown, no explanation`
        }]
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Anthropic API error:', error);
      return res.status(response.status).json({ error: 'Failed to plan trip' });
    }

    const data = await response.json();
    
    let textContent = '';
    for (const item of data.content) {
      if (item.type === 'text') {
        textContent += item.text;
      }
    }

    console.log('Raw response length:', textContent.length);

    // Clean up response
    textContent = textContent.trim();
    textContent = textContent.replace(/```json\s*/gi, '');
    textContent = textContent.replace(/```\s*/gi, '');
    
    const firstBrace = textContent.indexOf('{');
    const lastBrace = textContent.lastIndexOf('}');
    
    if (firstBrace === -1 || lastBrace === -1) {
      console.error('No JSON found');
      return res.status(500).json({ error: 'Could not generate trip plan' });
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
