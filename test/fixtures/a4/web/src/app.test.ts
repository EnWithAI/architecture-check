import { add } from "../../shared/src/money.js";
import { app } from "./app.js";
export const check = (): number => add(app(), 0);
