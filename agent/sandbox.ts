import { DefaultSandbox, defineSandbox } from "eve/sandbox";
import { JustBashSandbox } from "eve/sandbox/just-bash";

// Scout never runs commands, so the sandbox exists for one reason: eve stages the photos
// shoppers attach under /workspace/attachments and reads them back for the model call.
// On Vercel, eve's default is Vercel Sandbox. Off Vercel, skip the Docker and microsandbox
// probes and use the pure-JavaScript sandbox, which needs nothing installed on the machine.
export const environment = process.env.VERCEL ? DefaultSandbox.environment() : JustBashSandbox.environment();

export default defineSandbox(() => environment.open());
