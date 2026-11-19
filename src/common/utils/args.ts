import args from "args";
import { version } from "../../../package.json";

// args exposes config at runtime, but its type declarations omit it.
const cli = args as typeof args & {
  config: { exit?: { version?: boolean } };
};

cli.showVersion = function () {
  console.log(version);
  if (this.config.exit?.version) {
    process.exit();
  }
};

export default args;
