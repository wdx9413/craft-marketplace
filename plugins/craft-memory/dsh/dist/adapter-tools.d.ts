export type AdapterConfig = {
    product?: string;
    npxCommand?: string;
    packageSpec?: string;
    dataDir?: string;
    bundlePath?: string;
};
type ToolArgs = {
    tool: string;
    arguments_json?: string;
};
export declare function adapterTools(config?: AdapterConfig, moduleUrl?: string): ({
    name: string;
    description: string;
    parameters: {
        tool?: undefined;
        arguments_json?: undefined;
    };
    output: {
        schema: {
            type: string;
        };
        render: (_args: unknown, value: unknown) => {
            type: string;
            text: string;
        }[];
    };
    execute: () => Promise<any>;
} | {
    name: string;
    description: string;
    parameters: {
        tool: {
            type: string;
            required: boolean;
            description: string;
        };
        arguments_json: {
            type: string;
            required: boolean;
            description: string;
        };
    };
    output: {
        schema: {
            type: string;
        };
        render: (_args: unknown, value: unknown) => {
            type: string;
            text: string;
        }[];
    };
    execute: (args: ToolArgs) => Promise<any>;
})[];
export {};
