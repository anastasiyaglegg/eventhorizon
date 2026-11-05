import event from "../data/event.json";
import { analysisInputSchema } from "./contract";

export const seededInput = analysisInputSchema.parse(event);
