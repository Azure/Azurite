import rimraf = require("rimraf");
import { promisify } from "util";

export const rimrafAsync = promisify(rimraf);

export function minDate(date1: Date, date2: Date): Date {
  return date1 > date2 ? date2 : date1;
}
