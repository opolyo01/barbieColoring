import kafka, { TOPICS } from './client';
import { PriceTick, Order } from '../types';

type TickHandler = (tick: PriceTick) => void;
type FilledHandler = (order: Order) => void;

export async function startConsumers(
  onTick: TickHandler,
  onFilled: FilledHandler,
): Promise<void> {
  const tickConsumer = kafka.consumer({ groupId: 'trading-tick-broadcaster', allowAutoTopicCreation: true });
  const fillConsumer = kafka.consumer({ groupId: 'trading-fill-handler', allowAutoTopicCreation: true });

  await tickConsumer.connect();
  await tickConsumer.subscribe({ topic: TOPICS.MARKET_TICKS, fromBeginning: false });
  await tickConsumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) return;
      try {
        const tick: PriceTick = JSON.parse(message.value.toString());
        onTick(tick);
      } catch {
        // malformed message — skip
      }
    },
  });

  await fillConsumer.connect();
  await fillConsumer.subscribe({ topic: TOPICS.ORDERS_FILLED, fromBeginning: false });
  await fillConsumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) return;
      try {
        const order: Order = JSON.parse(message.value.toString());
        onFilled(order);
      } catch {
        // malformed message — skip
      }
    },
  });
}
