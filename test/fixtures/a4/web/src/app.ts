import { listOrders } from "../../api/src/index.js";
import { cartTotal } from "./cart/cart.js";
import type { Money } from "../../shared/src/money.js";
import React from "react";
export const app = (): Money => (React ? cartTotal(listOrders()) : 0);
