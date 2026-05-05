import { Producer } from 'kafkajs';
import kafka, { TOPICS } from './client';
import { PriceTick, Order } from '../types';

let producer: Producer | null = null;
let connecting: Promise<Producer> | null = null;

export async function getProducer(): Promise<Producer> {
  if (producer) return producer;
  if (!connecting) {
    connecting = (async () => {
      const p = kafka.producer({ allowAutoTopicCreation: true });
      await p.connect();
      producer = p;
      connecting = null;
      return p;
    })();
  }
  return connecting;
}

export async function publishTick(tick: PriceTick): Promise<void> {
  const p = await getProducer();
  await p.send({
    topic: TOPICS.MARKET_TICKS,
    messages: [{ key: tick.symbol, value: JSON.stringify(tick) }],
  });
}

export async function publishOrderSubmitted(order: Order): Promise<void> {
  const p = await getProducer();
  await p.send({
    topic: TOPICS.ORDERS_SUBMITTED,
    messages: [{ key: order.id, value: JSON.stringify(order) }],
  });
}

export async function publishOrderFilled(
  order: Order,
  fillPrice: number,
): Promise<void> {
  const p = await getProducer();
  await p.send({
    topic: TOPICS.ORDERS_FILLED,
    messages: [{ key: order.id, value: JSON.stringify({ ...order, fill_price: fillPrice }) }],
  });
}

export async function disconnectProducer(): Promise<void> {
  if (producer) {
    await producer.disconnect();
    producer = null;
    connecting = null;
  }
}
