import { type AdapterConfig } from "./adapter-tools.ts";
export declare const name = "craft-adapter";
export declare const inject: string[];
export declare function apply(ctx: {
    tools: {
        register(tool: unknown): void;
    };
}, config?: AdapterConfig): void;
