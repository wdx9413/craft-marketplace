import { defineTool } from "@deepseek-ai/dsh-tools";
import { adapterTools } from "./adapter-tools.js";
export const name = "craft-adapter";
export const inject = ["tools"];
export function apply(ctx, config = {}) {
    for (const tool of adapterTools(config))
        ctx.tools.register(defineTool(tool));
}
