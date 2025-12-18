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
    const maxBudget = budget * 0.8;

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
- Budget Limit: $${maxBudget} (MUST stay under this - it's 80% of their $${budget} total budget)
- Travelers: ${people} people
- Trip Length: ${tripLength} days
- Rooms Needed: ${roomsNeeded} (2 people per room)
${extraDetails ? `- Special Requests: ${extraDetails}` : ''}

CRITICAL MATH RULES:
1. Calculate hotel: pricePerNight × totalNights × numberOfRooms = accommodation total
2. Add up ALL activity costs from ALL days = activities total  
3. Add up ALL meal costs from ALL days = meals total
4. Add transportation estimate = transportation total
5. accommodation + activities + meals + transportation = TOTAL (must match exactly!)
6. Each day's dayTotal = sum of that day's activities costs + meals costs

RESPOND WITH ONLY JSON:

{
  "tripSummary": {
    "destinations": "${destinations}",
    "totalDays": ${tripLength},
    "travelers": ${people},
    "rooms": ${roomsNeeded},
    "totalEstimatedCost": [CALCULATED TOTAL],
    "budgetRemaining": [${maxBudget} minus total],
    "budgetLimit": ${maxBudget}
  },
  "hotels": [
    {
      "name": "Hotel Name",
      "location": "Area",
      "pricePerNight": [NUMBER],
      "totalNights": ${tripLength - 1},
      "totalCost": [pricePerNight × nights × ${roomsNeeded} rooms],
      "rating": "4/5",
      "highlights": ["Feature 1", "Feature 2"],
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
          "cost": [NUMBER - cost for all ${people} people],
          "duration": "2 hours"
        }
      ],
      "meals": [
        {
          "type": "Dinner",
          "restaurant": "Restaurant Name",
          "cuisine": "Type",
          "priceRange": "$$",
          "estimatedCost": [NUMBER - cost for all ${people} people],
          "location": "Area"
        }
      ],
      "dayTotal": [SUM of this day's activity costs + meal costs]
    }
  ],
  "costBreakdown": {
    "accommodation": [EXACT hotel totalCost],
    "activities": [SUM of ALL activities from ALL days],
    "meals": [SUM of ALL meals from ALL days],
    "transportation": [estimate for local transport],
    "total": [MUST EQUAL accommodation + activities + meals + transportation]
  },
  "tips": ["Tip 1", "Tip 2", "Tip 3"]
}

VERIFY YOUR MATH BEFORE RESPONDING. The costBreakdown.total MUST equal the sum of its parts.`
        }],
        system: 'You are a travel planner. Use real hotel names, real restaurants, real attractions with realistic prices. CRITICAL: Your math must be correct. Double-check that costBreakdown.total = accommodation + activities + meals + transportation. Respond with ONLY valid JSON.'
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
      const { accommodation, activities, meals, transportation } = parsed.costBreakdown;
      const correctTotal = (accommodation || 0) + (activities || 0) + (meals || 0) + (transportation || 0);
      parsed.costBreakdown.total = correctTotal;
      
      if (parsed.tripSummary) {
        parsed.tripSummary.totalEstimatedCost = correctTotal;
        parsed.tripSummary.budgetRemaining = maxBudget - correctTotal;
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
