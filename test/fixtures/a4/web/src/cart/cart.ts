import { add, type Money } from "../../../shared/src/money.js";
export const cartTotal = (items: Money[]): Money => items.reduce(add, 0);
