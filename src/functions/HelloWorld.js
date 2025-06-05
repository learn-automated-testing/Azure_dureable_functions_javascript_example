const { app } = require('@azure/functions');
const df = require('durable-functions');

const activityName = 'HelloWorld';

df.app.orchestration('HelloWorldOrchestrator', function* (context) {
    const outputs = [];
    outputs.push(yield context.df.callActivity(activityName, 'Tokyo'));
    outputs.push(yield context.df.callActivity(activityName, 'Seattle'));
    outputs.push(yield context.df.callActivity(activityName, 'Cairo'));

    return outputs;
});

df.app.activity(activityName, {
    handler: (input) => {
        return `Hello, ${input}`;
    },
});

app.http('HelloWorldHttpStart', {
    route: 'orchestrators/{orchestratorName}',
    extraInputs: [df.input.durableClient()],
    handler: async (request, context) => {
        const client = df.getClient(context);
        const body = await request.text();
        const instanceId = await client.startNew(request.params.orchestratorName, { input: body });

        context.log(`Started orchestration with ID = '${instanceId}'.`);

        return client.createCheckStatusResponse(request, instanceId);
    },
});

// New endpoint to get status by instance ID
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
    },
});