import { Kafka, logLevel } from 'kafkajs';

const brokers = (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(',');
const username = process.env.KAFKA_USERNAME;
const password = process.env.KAFKA_PASSWORD;

const kafka = new Kafka({
  clientId: 'trading-competition',
  brokers,
  ...(username && password
    ? {
        ssl: true,
        sasl: { mechanism: 'scram-sha-256', username, password },
      }
    : {}),
  logLevel: logLevel.WARN,
  retry: { initialRetryTime: 300, retries: 10 },
});

export default kafka;

export const TOPICS = {
  MARKET_TICKS: 'market.ticks',
  ORDERS_SUBMITTED: 'orders.submitted',
  ORDERS_FILLED: 'orders.filled',
} as const;
