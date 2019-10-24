import rimraf = require("rimraf");
import { promisify } from "util";

export const rimrafAsync = promisify(rimraf);
