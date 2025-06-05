const { app } = require('@azure/functions');
const df = require('durable-functions');

app.http('GetOrchestrationStatus', {
    route: 'orchestrators/status/{instanceId}',
    extraInputs: [df.input.durableClient()],
    handler: async (request, context) => {
        const client = df.getClient(context);
        const instanceId = request.params.instanceId;
        
        const status = await client.getStatus(instanceId);
        if (!status) {
            return {
                status: 404,
                jsonBody: {
                    error: `No orchestration found with ID '${instanceId}'`
                }
            };
        }

        return {
            status: 200,
            jsonBody: status
        };
    }
}); 