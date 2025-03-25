# Polynance SDK

The Polynance SDK is an aggregation layer designed for prediction markets, abstracting the complexity and differences between various prediction market protocols. It offers a unified interface for interacting with multiple prediction market platforms seamlessly.

## Supported Protocols

- Polymarket (`polymarket`)
- Limitless (`limitless`)
- TrueMarket (`truemarket`)

## Features

- Retrieve detailed event and market information
- Obtain ongoing prediction market events
- Access user comments related to specific events
- Fetch real-time order book and trade data
- Subscribe to real-time updates via Server-Sent Events (SSE)
- Generate candlestick data from market transactions

## Installation

```bash
npm install polynance_client
```

## Quick Start

### Initialization

```typescript
import { PolynanceClient } from 'polynance_client';

const client = new PolynanceClient();
```

### Fetching Event Data

```typescript
const event = await client.getEvent('limitless', 'eventId');
console.log(event);
```

### Getting Market Information

```typescript
const market = await client.getMarket('polymarket', 'marketId');
console.log(market);
```

### Subscribing to Real-time Market Updates (SSE)

```typescript
const subscription = client.subscribeFillEvents('truemarket', 'marketId', {
  onOpen: () => console.log('Connected to SSE'),
  onMessage: (data) => console.log('Received data:', data),
  onError: (error) => console.error('Error:', error),
});

// To close subscription:
subscription.close();
```

## Generating Candlestick Data

```typescript
import { generateCandlestickData } from 'polynance-sdk';

const candles = generateCandlestickData(fillEvents, intervalMillis, fromTime, toTime);
console.log(candles);
```

## API Reference

### Methods

- `getEvent(protocol, eventId)` - Fetch detailed information about a specific event.
- `getMarket(protocol, marketId)` - Retrieve detailed market data.
- `getOngoingEvents(protocol, page, limit)` - List ongoing prediction market events.
- `getEventComments(protocol, eventId)` - Get user comments for a specific event.
- `getOrderbook(protocol, marketId)` - Retrieve the order book for a market.
- `getOrderBookFilledEvents(protocol, marketId)` - Obtain historical fill events for order books.
- `subscribeFillEvents(protocol, id, handlers)` - Subscribe to real-time updates using SSE.

### Types

- `FillEventData`
- `PredictionMarketEvent`
- `PredictionMarket`
- `PredictionMarketComment`
- `OrderBookSummary`
- `Candle`

## Error Handling

All methods throw errors on failure. Ensure to handle exceptions appropriately in your implementation.

## Contributions

We welcome contributions! Please open an issue or submit a pull request.

## License

This SDK is licensed under the MIT License.

