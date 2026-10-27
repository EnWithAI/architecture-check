import { add } from "../../../shared/src/money.js";
import { charge } from "../payments/stripe.js";
export const createOrder = (): number => add(charge(), 1);
