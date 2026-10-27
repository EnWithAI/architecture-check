import { createOrder } from "./orders/service.js";
import { charge } from "./payments/stripe.js";
export const listOrders = (): number[] => [createOrder(), charge()];
