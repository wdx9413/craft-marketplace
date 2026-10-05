export type Launch = {
    command: string;
    args: string[];
    env?: NodeJS.ProcessEnv;
    timeoutMs?: number;
    maxBytes?: number;
};
/** One bounded MCP exchange with negotiated initialization and schema discovery. */
export declare function exchange(launch: Launch, method: "tools/list" | "tools/call", params?: Record<string, unknown>): Promise<any>;
